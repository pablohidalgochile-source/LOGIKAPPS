from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
import wave

import test_ableton_auto as auto_fixture
engine=auto_fixture.engine
from store import Store


class AudioTests(unittest.TestCase):
    command=auto_fixture.AutoTests.command;deliver=auto_fixture.AutoTests.deliver;setUp=auto_fixture.AutoTests.setUp;tearDown=auto_fixture.AutoTests.tearDown
    publish=auto_fixture.AutoTests.publish;publish_heartbeat=auto_fixture.AutoTests.publish_heartbeat;native=auto_fixture.AutoTests.native
    settle=auto_fixture.AutoTests.settle;drain=auto_fixture.AutoTests.drain

    def audio(self):return next(t for k,t in engine.owned(self.song,self.p['id']).items() if k.startswith('a-'))

    def edit(self,change):
        p=self.store.load(self.p['id']);draft=deepcopy(p);change(draft)
        return self.manager.auto.save_editor(p['id'],{'clientId':'c'*32,'expectedRevision':p['revision'],'project':draft})['project']

    def test_local_position_trim_gain_and_pitch_reach_only_the_audio_track(self):
        midi=self.bass.arrangement_clips[0];note=midi.notes[0];audio=self.audio();devices=audio.devices;volume=audio.volume
        p=self.edit(lambda p:p['audio_tracks'][0]['clips'][0].update(start=.5,offset=.25,duration=2,gainDb=-6,pitch=3))
        self.settle();self.drain();c=audio.arrangement_clips[0]
        self.assertAlmostEqual(c.start_time*60/self.song.tempo,.5);self.assertAlmostEqual(c.loop_start,.25)
        self.assertAlmostEqual((c.end_time-c.start_time)*60/self.song.tempo,2);self.assertAlmostEqual(engine.gain_db(c),-6,places=1);self.assertEqual(c.pitch_coarse,3)
        self.assertIs(self.bass.arrangement_clips[0],midi);self.assertIs(midi.notes[0],note);self.assertIs(audio.devices,devices);self.assertEqual(audio.volume,volume)
        revision=self.store.load(p['id'])['revision'];self.settle();self.assertEqual(self.store.load(p['id'])['revision'],revision)

    def test_live_audio_changes_create_one_revision_and_edited_listening_asset(self):
        c=self.audio().arrangement_clips[0];c.start_time=1;c.loop_start=.5;c.loop_end=3;c.pitch_coarse=2;c.gain=(60-9)/84
        revision=self.store.load(self.p['id'])['revision'];self.settle();p=self.store.load(self.p['id']);t=p['audio_tracks'][0];clip=t['clips'][0]
        self.assertEqual(p['revision'],revision+1);self.assertEqual(clip['gainDb'],-9);self.assertEqual(clip['pitch'],2);self.assertEqual(clip['offset'],.5)
        self.assertIn(t['previewAssetId'],{a['id'] for a in p['assets']});self.assertNotEqual(t['previewAssetId'],clip['assetId'])
        self.settle();self.assertEqual(self.store.load(p['id'])['revision'],p['revision'])

    def test_external_file_overwrite_creates_immutable_version_and_history(self):
        before=self.store.load(self.p['id']);old_id=before['audio_tracks'][0]['clips'][0]['assetId'];old_asset=next(a for a in before['assets'] if a['id']==old_id)
        old_bytes=(self.store.folder(before['id'])/'assets'/old_asset['file']).read_bytes();source=Path(self.audio().arrangement_clips[0].file_path)
        with wave.open(str(source),'wb') as f:f.setparams((1,2,8000,0,'NONE','not compressed'));f.writeframes(b'\x01\x00'*32000)
        self.audio().arrangement_clips[0].loop_start=4.162503941529394e-8
        self.settle();p=self.store.load(before['id']);new_id=p['audio_tracks'][0]['clips'][0]['assetId']
        self.assertNotEqual(new_id,old_id);self.assertEqual((self.store.folder(p['id'])/'assets'/old_asset['file']).read_bytes(),old_bytes)
        past=json.loads((self.store.folder(p['id'])/'history'/f"{before['revision']:06}.json").read_text());self.assertEqual(past['audio_tracks'][0]['clips'][0]['assetId'],old_id)

    def test_audio_conflict_keeps_both_versions_and_explicit_nanook_choice(self):
        self.audio().arrangement_clips[0].gain=(60-9)/84
        p=self.edit(lambda p:p['audio_tracks'][0]['clips'][0].update(gainDb=-6));self.settle();state=self.manager.auto.status(p['id'])
        self.assertEqual(state['state'],'conflict');self.assertIn('Audio:',state['conflicts'][0])
        self.manager.auto.resolve(p['id'],{'choice':'nanook','expectedRevision':p['revision'],'captureHash':state['captureHash']});self.drain()
        self.assertAlmostEqual(engine.gain_db(self.audio().arrangement_clips[0]),-6,places=1)
        versions=[json.loads(f.read_text()) for f in (self.store.folder(p['id'])/'history').glob('*.json')]
        self.assertTrue(any(v.get('audio_tracks',[{'clips':[]}])[0]['clips'] and v['audio_tracks'][0]['clips'][0]['gainDb']==-9 for v in versions if v.get('audio_tracks')))

    def test_new_stem_is_added_without_recreating_existing_native_clips(self):
        original=self.audio().arrangement_clips[0]
        def change(p):
            t=deepcopy(p['audio_tracks'][0]);t.update(id='a-123456789abc',name='Segunda capa');p['audio_tracks'].append(t)
        p=self.edit(change);self.settle();self.drain()
        self.assertIn('a-123456789abc',engine.owned(self.song,p['id']));self.assertIs(self.audio().arrangement_clips[0],original)
        self.assertEqual(self.manager.auto.status(p['id'])['state'],'synced')

    def test_retired_clips_restore_with_history_audio_and_portable_backup(self):
        before=self.store.load(self.p['id']);self.edit(lambda p:p['audio_tracks'][0].update(clips=[]));self.settle();self.drain();current=self.store.load(before['id'])
        self.assertFalse(self.audio().arrangement_clips);self.store.revert(before['id'],before['revision'],current['revision']);self.settle();self.drain()
        p=self.store.load(before['id']);self.assertEqual(len(self.audio().arrangement_clips),1)
        backup=self.root/'audio.zip';self.store.backup(p['id'],backup)
        with tempfile.TemporaryDirectory() as tmp:
            other=Store(Path(tmp)/'projects');restored=other.restore(backup)
            self.assertEqual(restored['audio_tracks'],p['audio_tracks']);self.assertEqual(restored['assets'],p['assets'])

    def test_warp_is_reported_without_claiming_audio_is_synchronized(self):
        c=self.audio().arrangement_clips[0];c.warping=True;revision=self.store.load(self.p['id'])['revision'];self.settle()
        self.assertEqual(self.manager.auto.status(self.p['id'])['state'],'unsupported');self.assertEqual(self.store.load(self.p['id'])['revision'],revision);self.assertTrue(c.warping)

    def test_stale_queued_audio_does_not_overwrite_new_live_edit(self):
        self.pump_paused=True;p=self.edit(lambda p:p['audio_tracks'][0]['clips'][0].update(gainDb=-6));self.settle();pending=self.manager.auto.states[p['id']]['pending']
        self.audio().arrangement_clips[0].gain=(60-9)/84;self.pump_paused=False;self.drain()
        self.assertEqual(json.loads((self.manager.queue/(pending+'.json')).read_text())['state'],'superseded');self.assertEqual(self.manager.auto.status(p['id'])['state'],'conflict')

    def test_readonly_damaged_source_fails_before_project_commit(self):
        p=self.store.load(self.p['id']);draft=deepcopy(p);draft['audio_tracks'][0]['clips'][0]['offset']=10
        with self.assertRaises(ValueError):self.manager.auto.save_editor(p['id'],{'clientId':'c'*32,'expectedRevision':p['revision'],'project':draft})
        self.assertEqual(self.store.load(p['id'])['revision'],p['revision'])
        self.assertFalse(list(self.manager.root.glob('audio-*/*')))

    def test_audio_and_note_changes_in_different_components_merge(self):
        self.bass.arrangement_clips[0].notes[0].pitch=39
        p=self.edit(lambda p:p['audio_tracks'][0]['clips'][0].update(gainDb=-6));self.settle();self.drain()
        result=self.store.load(p['id']);self.assertEqual(result['parts'][0]['notes'][0]['pitch'],39);self.assertEqual(result['audio_tracks'][0]['clips'][0]['gainDb'],-6)
        self.assertEqual(engine.gain_db(self.audio().arrangement_clips[0]),-6)

    def test_native_amplitude_gain_can_increase_above_unity(self):
        import math
        from test_ableton import AudioClip
        class AmplitudeClip(AudioClip):
            @property
            def gain_display_string(self):return str(round(20*math.log10(self.gain),1))+' dB' if self.gain else '-inf dB'
        c=self.audio().arrangement_clips[0];c.__class__=AmplitudeClip;c.gain=1
        self.edit(lambda p:p['audio_tracks'][0]['clips'][0].update(gainDb=6));self.settle();self.drain()
        self.assertEqual(engine.gain_db(c),6);self.assertGreater(c.gain,1)

    def test_latest_analysis_replaces_stem_media_automatically(self):
        self.edit(lambda p:p['audio_tracks'][0].update(stemOrigin='analysis',stemName='Bajo.wav'));self.settle()
        path=self.root/'nuevo.wav'
        with wave.open(str(path),'wb') as f:f.setparams((1,2,8000,0,'NONE','not compressed'));f.writeframes(b'\x02\x00'*16000)
        p=self.store.load(self.p['id']);p=self.store.add_asset(p['id'],path,'Bajo.wav','audio/wav',{'role':'analysis-stem','jobId':'nuevo','duration':2},p['revision'])
        asset=p['assets'][-1];self.store.save(p['id'],{'analysis_run':{'id':'nuevo'}},p['revision']);self.settle();self.drain()
        result=self.store.load(p['id']);self.assertEqual(result['audio_tracks'][0]['clips'][0]['assetId'],asset['id'])
        self.assertEqual(Path(self.audio().arrangement_clips[0].file_path).stem,asset['sha256'])

    def test_versions_predating_audio_editor_keep_current_audio_when_recovered(self):
        p=self.edit(lambda p:p['audio_tracks'][0]['clips'][0].update(gainDb=-6));self.settle();self.drain()
        result=self.store.revert(p['id'],1,self.store.load(p['id'])['revision'])
        self.assertEqual(result['audio_tracks'],p['audio_tracks'])
        self.assertTrue({c['assetId'] for t in result['audio_tracks'] for c in t['clips']}<={a['id'] for a in result['assets']})


if __name__=='__main__':unittest.main()
