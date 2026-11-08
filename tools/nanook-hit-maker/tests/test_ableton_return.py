from copy import deepcopy
import json
from pathlib import Path
import threading
import time
from types import SimpleNamespace as NS
import unittest

import test_ableton as fixtures
from ableton import channel_parts, sections_for
from ableton_return import event_delta
from store import Conflict, atomic

engine = fixtures.engine


class ReturnTests(unittest.TestCase):
    setUp = fixtures.AbletonTests.setUp
    tearDown = fixtures.AbletonTests.tearDown
    command = fixtures.AbletonTests.command
    deliver = fixtures.AbletonTests.deliver

    def link(self):
        command = self.command();self.song = fixtures.Song(self.target)
        result = self.deliver(self.song, command)
        path = self.manager.queue / (command['jobId']+'.json');job = json.loads(path.read_text())
        job.update(result);atomic(path, job)
        atomic(self.manager.root/'heartbeat.json', {**self.heartbeat, 'version': '0.5.0', 'bindings': [self.p['id']]})
        self.midi = engine.owned(self.song, self.p['id'])[command['tracks'][0]['id']]
        return command

    def capture(self):
        p = self.store.load(self.p['id'])
        j = self.manager.returns.start(p['id'], {**self.body, 'expectedRevision': p['revision']})
        path = self.manager.queue/(j['id']+'.json');job = json.loads(path.read_text())
        data = engine.read_song(self.song, job['command'], 'test-session')
        job.update(state='ready', returnData=data, finishedAt=time.time());atomic(path, job)
        self.assertIsNone(self.manager.current(p['id']).get('preview'))
        return job

    def apply(self, job, **options):
        def native():
            deadline = time.monotonic()+3
            while time.monotonic()<deadline:
                for file in self.manager.queue.glob('*.json'):
                    j = json.loads(file.read_text())
                    if j.get('command', {}).get('action') != 'verify-read' or j['state'] != 'queued':continue
                    try:
                        capture = engine.read_song(self.song, j['command'], 'test-session')
                        if capture['captureHash'] != j['command']['captureHash']:raise ValueError('Live cambió después de la vista previa.')
                        j.update(state='complete')
                    except Exception as e:j.update(state='error', error=str(e))
                    atomic(file,j);return
                time.sleep(.01)
        t = threading.Thread(target=native, daemon=True);t.start()
        try:
            p = self.store.load(self.p['id'])
            return self.manager.returns.apply(p['id'], job['id'], {'expectedRevision':p['revision'], 'notes':True, 'structure':True, **options})
        finally:t.join(.2)

    def test_live_notes_and_locator_return_preserves_creative_fields_assets_history_and_backup(self):
        self.link();self.midi.arrangement_clips[0].notes[0].pitch = 38
        self.song.cue_points[1].name = 'Coro ampliado '+engine.tag(self.p['id'],'cue')
        self.song.cue_points[1].time += 1
        local = self.store.save(self.p['id'], {'lyrics':'Mi letra conservada', 'idea':'Una idea'}, self.p['revision'])
        job = self.capture();preview = self.manager.returns.current(self.p['id'])['preview']
        self.assertEqual(preview['suggestedSource'], 'locators');self.assertFalse(preview['parts'][0]['conflict'])
        before = engine.snapshot(self.song, self.p['id']);p = self.apply(job)
        self.assertEqual(engine.snapshot(self.song, p['id']), before)
        self.assertEqual(p['parts'][0]['notes'][0]['pitch'],38);self.assertFalse(p['parts'][0]['reviewed'])
        self.assertEqual(p['structure'][1]['name'],'Coro ampliado');self.assertEqual(p['lyrics'], local['lyrics'])
        self.assertEqual(p['assets'],local['assets']);self.assertEqual(p['revision'],local['revision']+1)
        self.assertEqual(len(self.store.history(p['id'])), p['revision'])
        self.assertEqual(self.apply(job)['revision'],p['revision'])
        backup = self.root/'backup.zip';self.store.backup(p['id'], backup)
        restored = self.store.restore(backup)
        self.assertEqual(restored['parts'],p['parts']);self.assertEqual(restored['ableton_returns'],p['ableton_returns'])
        self.assertEqual(restored['assets'],p['assets'])
        again = self.manager.returns.plan(p,self.capture()['returnData'])
        self.assertEqual(again['suggestedSource'],'locators');self.assertFalse(any(row['changed'] for row in again['parts']))

    def test_conflicting_local_note_requires_explicit_live_choice(self):
        self.link();self.midi.arrangement_clips[0].notes[0].pitch = 38
        notes = deepcopy(self.p['parts']);notes[0]['notes'][0]['pitch'] = 40
        self.store.save(self.p['id'], {'parts':notes}, self.p['revision'])
        job = self.capture()
        self.assertTrue(self.manager.returns.current(self.p['id'])['preview']['parts'][0]['conflict'])
        with self.assertRaises(Conflict):self.apply(job)
        self.assertEqual(self.store.load(self.p['id'])['parts'][0]['notes'][0]['pitch'],40)
        self.assertEqual(self.apply(job, resolveConflicts='live')['parts'][0]['notes'][0]['pitch'],38)

    def test_unpublished_local_notes_survive_repeated_reads_and_later_conflict(self):
        self.link();notes = deepcopy(self.p['parts']);notes[0]['notes'][0]['pitch'] = 40
        self.store.save(self.p['id'], {'parts':notes}, self.p['revision'])
        first = self.apply(self.capture());self.assertEqual(first['parts'][0]['notes'][0]['pitch'],40)
        second = self.apply(self.capture());self.assertEqual(second['parts'][0]['notes'][0]['pitch'],40)
        self.midi.arrangement_clips[0].notes[0].pitch = 38;self.capture()
        self.assertTrue(self.manager.returns.current(self.p['id'])['preview']['parts'][0]['conflict'])

    def test_two_different_structure_edits_require_source_and_keep_alternative_pending(self):
        self.link();structure = engine.owned(self.song,self.p['id'])['structure']
        structure.arrangement_clips[1].name = 'Puente'
        self.song.cue_points[1].name = 'Estribillo '+engine.tag(self.p['id'],'cue')
        job = self.capture();self.assertIsNone(self.manager.returns.current(self.p['id'])['preview']['suggestedSource'])
        with self.assertRaisesRegex(Conflict,'Elige'):self.apply(job)
        p = self.apply(job, structureSource='clips');self.assertEqual(p['structure'][1]['name'],'Puente')
        next_read = self.capture();preview = self.manager.returns.current(p['id'])['preview']
        self.assertTrue(preview['structures']['locators']['changed'])
        p = self.apply(next_read, structureSource='locators');self.assertEqual(p['structure'][1]['name'],'Estribillo')

    def test_capture_freshness_and_revision_conflict_prevent_writes(self):
        self.link();self.midi.arrangement_clips[0].notes[0].pitch = 38;job = self.capture()
        self.midi.arrangement_clips[0].notes[0].pitch = 39
        with self.assertRaisesRegex(Conflict,'Live cambió'):self.apply(job)
        self.assertEqual(self.store.load(self.p['id'])['revision'], self.p['revision'])
        self.store.save(self.p['id'], {'idea':'Otra edición'},self.p['revision'])
        with self.assertRaises(Conflict):
            self.manager.returns.apply(self.p['id'],job['id'],{'expectedRevision':self.p['revision'],'notes':True})

    def test_trimmed_loops_polyphony_muted_notes_and_clip_offsets(self):
        clip = fixtures.Clip(8,10);clip.loop_start = 0;clip.loop_end = 4;clip.looping = True;clip.start_marker = 2
        fixtures.write_notes(clip, [{'pitch':p,'beat':b,'beats':1,'velocity':100} for p,b in [(60,0),(64,0),(67,2)]])
        warning = set();events = engine.flattened_notes(clip,warning)
        self.assertEqual([(n['pitch'],n['beat']) for n in events], [(67,8),(60,10),(64,10),(67,12),(60,14),(64,14),(67,16)])
        self.assertTrue(warning);clip.looping = False;clip.end_marker = 4
        self.assertEqual([(n['pitch'],n['beat']) for n in engine.flattened_notes(clip,set())], [(67,8)])
        clip.notes[-1].mute = True;self.assertEqual(engine.flattened_notes(clip,set()),[])
        clip.notes[-1].mute = False;clip.notes[-1].duration = 3;clip.looping = True
        with self.assertRaisesRegex(ValueError,'Consolida'):engine.flattened_notes(clip,set())

    def test_live_precision_uses_native_ancestor_and_counts_only_musical_edits(self):
        self.link();self.midi.arrangement_clips[0].notes[0].start_time = .00006
        path = engine.binding_path(self.target,self.p['id']);binding = json.loads(path.read_text())
        binding.update(liveNoteHashes=engine.music_hashes(self.song,self.p['id']),snapshotHash=engine.digest(engine.snapshot(self.song,self.p['id'])))
        atomic(path,binding)
        self.capture();part = self.manager.returns.current(self.p['id'])['preview']['parts'][0]
        self.assertFalse(part['changed']);self.assertEqual(part['added'],0)
        added,removed = event_delta([[29,16.4437,1.3316,78],[36,56.3609,1.3935,78]],
                                    [[30,16.4437,1.3316,78],[36,56.3608,1.3935,78]])
        self.assertEqual(added,[[30,16.4437,1.3316,78]]);self.assertEqual(removed,1)

    def test_native_read_rejects_wrong_set_tempo_automation_and_missing_tags_without_mutation(self):
        self.link();job = self.capture();command = job['command'];before = engine.snapshot(self.song,self.p['id'])
        with self.assertRaises(ValueError):engine.read_song(self.song,{**command,'targetSession':'otra'},'test-session')
        self.song.master_track.mixer_device.song_tempo.automation_state = 1
        with self.assertRaisesRegex(ValueError,'automatización'):engine.read_song(self.song,command,'test-session')
        self.song.master_track.mixer_device.song_tempo.automation_state = 0;self.song.tempo += 1
        with self.assertRaisesRegex(ValueError,'BPM'):engine.read_song(self.song,command,'test-session')
        self.song.tempo -= 1;self.assertEqual(engine.snapshot(self.song,self.p['id']),before)
        self.midi.name = 'Sin etiqueta'
        with self.assertRaisesRegex(ValueError,'etiquetas'):engine.read_song(self.song,command,'test-session')

    def test_empty_part_deletion_and_explicit_structure_gaps_keep_stable_identity(self):
        self.link();channel = next(iter(channel_parts(self.p)))
        self.midi.arrangement_clips[0].notes = []
        structure = engine.owned(self.song,self.p['id'])['structure'];structure.arrangement_clips[0].end_time = 1
        p = self.apply(self.capture(),structureSource='clips')
        self.assertEqual(p['parts'][0]['notes'],[]);self.assertEqual(next(iter(channel_parts(p))),channel)
        self.assertEqual(sections_for(p)[0]['beats'],1)
        self.assertFalse(self.manager.returns.current(p['id']).get('previewError'))
        preview = self.manager.returns.plan(p,self.capture()['returnData'])
        self.assertFalse(preview['parts'][0]['changed']);self.assertFalse(preview['structures']['clips']['changed'])


if __name__ == '__main__':unittest.main()
