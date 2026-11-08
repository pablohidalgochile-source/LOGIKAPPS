from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace as NS
import unittest
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ableton import AbletonManager
from store import Store, Conflict, atomic
spec = importlib.util.spec_from_file_location('native_engine', ROOT / 'ableton_bridge/NanookHitMaker/engine.py')
engine = importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)


class Clip:
    def __init__(self, start, length, audio=None):
        self.name = '';self.start_time = start;self.end_time = start + length;self.length = length
        self.loop_start = 0;self.loop_end = length;self.looping = False;self.is_midi_clip = audio is None
        self.file_path = audio;self.warping = False;self.pitch_coarse = 0;self.pitch_fine = 0;self.gain = 1
        self.notes = []

    def get_notes_extended(self, *_):return self.notes
    def get_all_notes_extended(self):return self.notes
    def apply_note_modifications(self, notes):
        if notes is not self.notes:raise TypeError('Live requires its native note vector unchanged.')
    def remove_notes_by_id(self, ids):self.notes=[n for n in self.notes if n.note_id not in ids]


class AudioClip:
    def __init__(self,start,path,song):
        self.song=song;self.start_time=start;self.file_path=path;self.name='';self.is_midi_clip=False
        self.warping=False;self.looping=False;self.muted=False;self.has_envelopes=False
        self.pitch_coarse=0;self.pitch_fine=0;self.gain=60/84;self.loop_start=0
        with wave.open(str(path),'rb') as f:self.loop_end=f.getnframes()/f.getframerate()
    @property
    def gain_display_string(self):return str(round(self.gain*84-60,1))+' dB'
    @property
    def end_time(self):return self.start_time+(self.loop_end-self.loop_start)/2**((self.pitch_coarse+self.pitch_fine/100)/12)*self.song.tempo/60
    @property
    def length(self):return self.end_time-self.start_time
    @property
    def start_marker(self):return self.loop_start
    @property
    def end_marker(self):return self.loop_end


class Track:
    def __init__(self, name='Productor', midi=True):
        self.name = name;self.arrangement_clips = [];self.midi = midi;self.is_frozen = False
        self.mute = False;self.devices = ['Mi instrumento'];self.volume = .7;self.color = 0

    def create_midi_clip(self, start, length):self.arrangement_clips.append(Clip(start, length))
    def create_audio_clip(self, path, start):self.arrangement_clips.append(AudioClip(start,path,getattr(self,'song',None)))
    def delete_clip(self, clip):self.arrangement_clips.remove(clip)


class Song:
    def __init__(self, path):
        self.file_path = str(path);self.name = 'Set de prueba';self.tempo = 120
        self.signature_numerator = 4;self.signature_denominator = 4;self.tracks = [Track()]
        self.cue_points = [];self.current_song_time = 5;self.is_playing = False;self.record_mode = False
        self.session_record = False;self.is_ableton_link_enabled = False;self.tempo_follower_enabled = False
        self.undo_steps = 0
        self.master_track = NS(mixer_device=NS(song_tempo=NS(automation_state=0)))

    def begin_undo_step(self):self.undo_steps += 1
    def end_undo_step(self):pass
    def create_midi_track(self, _):self.tracks.append(Track(midi=True))
    def create_audio_track(self, _):
        t=Track(midi=False);t.song=self;self.tracks.append(t)
    def set_or_delete_cue(self):
        old = next((c for c in self.cue_points if c.time == self.current_song_time), None)
        if old:self.cue_points.remove(old)
        else:self.cue_points.append(NS(time=self.current_song_time, name=''))


def write_notes(clip, notes):
    clip.notes = [NS(pitch=n['pitch'], start_time=n['beat'], duration=n['beats'], velocity=n['velocity'],
                     mute=False, probability=1, velocity_deviation=0,note_id=i+1) for i,n in enumerate(notes)]


class AbletonTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory();self.root = Path(self.tmp.name)
        self.store = Store(self.root / 'data/projects');self.manager = AbletonManager(self.store)
        self.p = self.store.create({'title': 'Umbral de prueba', 'bpm': 123.87, 'duration': 4,
            'parts': [{'key': 'bass', 'name': 'Bajo', 'reviewed': True, 'notes':
                       [{'pitch': n, 'start': 0, 'duration': 1, 'amplitude': .8} for n in [36, 43]]}],
            'structure': [{'name': 'Intro', 'time': 0}, {'name': 'Coro', 'time': 2}]})
        wav = self.root / 'stem.wav'
        with wave.open(str(wav),'wb') as f:f.setparams((1,2,8000,0,'NONE','not compressed'));f.writeframes(b'\x00\x00'*32000)
        self.p = self.store.add_asset(self.p['id'], wav, 'Bajo.wav', 'audio/wav', expected=1)
        self.target = self.root / 'Ableton Project/Test.als';self.target.parent.mkdir();self.target.write_bytes(b'test')
        self.heartbeat = {'timestamp': time.time(), 'session': 'test-session', 'setPath': str(self.target),
                          'setName': 'Set de prueba', 'tempo': 120, 'playing': False, 'recording': False}
        atomic(self.manager.root / 'heartbeat.json', self.heartbeat)
        self.body = {'expectedRevision': self.p['revision'], 'targetSession': 'test-session', 'targetPath': str(self.target),
                     'assetIds': [self.p['assets'][0]['id']], 'setTempo': True}

    def tearDown(self):self.tmp.cleanup()

    def command(self):
        job = self.manager.start(self.p['id'], self.body)
        return json.loads((self.manager.queue / (job['id'] + '.json')).read_text())['command']

    def deliver(self, song, command):
        provisional = engine.apply(song, command, 'test-session', write_notes)
        for _ in range(2000):
            if provisional['state'] != 'locators':break
            engine.cue_step(song, command, provisional, 'test-session')
        return engine.finish(song, command, provisional) if provisional['state'] == 'verifying' else provisional

    def test_media_is_copied_into_live_project_and_structure_uses_project_tempo(self):
        c = self.command()
        stem = next(t for t in c['tracks'] if t['kind'] == 'audio')
        self.assertTrue(Path(stem['file']).is_relative_to(self.target.resolve().parent / 'Samples/NANOOK'))
        self.assertEqual(Path(stem['file']).read_bytes(), (self.root/'stem.wav').read_bytes())
        self.assertEqual(c['sections'][1]['beat'], 2 * 123.87 / 60)
        self.assertEqual(c['tracks'][0]['notes'][0]['pitch'], 36)
        self.assertEqual(c['tracks'][0]['notes'][1]['beat'], 0)
        self.assertEqual(self.store.load(self.p['id']), self.p)

    def test_first_send_and_update_preserve_producer_tracks_devices_and_mix(self):
        c = self.command();song = Song(self.target);producer = song.tracks[0]
        result = self.deliver(song, c)
        self.assertEqual(result['midiNotes'], 2);self.assertEqual(result['audioClips'], 1);self.assertEqual(result['sections'], 2)
        self.assertIs(song.tracks[0], producer);self.assertEqual(song.current_song_time, 5)
        midi = engine.owned(song, self.p['id'])[c['tracks'][0]['id']]
        midi.devices = ['Operator editado'];midi.volume = .42;midi.mute = False
        c = deepcopy(c);c['jobId'] = 'b'*32;c['tracks'][0]['notes'][0]['pitch'] = 38
        self.deliver(song, c)
        self.assertEqual(len(song.tracks), 4);self.assertIs(song.tracks[0], producer)
        self.assertEqual(midi.devices, ['Operator editado']);self.assertEqual(midi.volume, .42);self.assertFalse(midi.mute)
        self.assertEqual(midi.arrangement_clips[0].notes[0].pitch, 38)
        self.assertEqual(len(song.cue_points), 2)

    def test_native_edit_conflict_requires_explicit_replacement(self):
        c = self.command();song = Song(self.target);self.deliver(song, c)
        midi = engine.owned(song, self.p['id'])[c['tracks'][0]['id']]
        midi.arrangement_clips[0].notes[0].pitch = 44
        c = deepcopy(c);c['jobId'] = 'c'*32
        before = engine.snapshot(song, self.p['id'])
        self.assertEqual(self.deliver(song, c)['state'], 'conflict')
        self.assertEqual(engine.snapshot(song, self.p['id']), before)
        c['replaceLive'] = True
        self.assertEqual(self.deliver(song, c)['state'], 'complete')
        self.assertEqual(midi.arrangement_clips[0].notes[0].pitch, 36)

    def test_repeated_job_is_idempotent_and_cue_collisions_keep_user_marker(self):
        c = self.command();song = Song(self.target);song.cue_points.append(NS(name='Mi marcador', time=0))
        result = self.deliver(song, c);self.assertEqual(result['skippedCueCollisions'], 1)
        self.assertIn('Mi marcador', [x.name for x in song.cue_points])
        self.assertTrue(self.deliver(song, c)['duplicate']);self.assertEqual(song.undo_steps, 1)

    def test_wrong_set_playing_frozen_and_external_media_are_rejected_before_mutation(self):
        c = self.command();song = Song(self.target)
        for field, value in [('targetPath', str(self.root/'other.als')), ('targetSession', 'other')]:
            with self.assertRaises(ValueError):self.deliver(song, {**c, field: value})
        song.is_playing = True
        with self.assertRaises(ValueError):self.deliver(song, c)
        song.is_playing = False
        bad = deepcopy(c);next(t for t in bad['tracks'] if t['kind']=='audio')['file'] = str(self.target)
        with self.assertRaises(ValueError):self.deliver(song, bad)
        self.assertEqual(song.undo_steps, 0);self.assertEqual(len(song.tracks), 1)
        self.deliver(song, c)
        midi = engine.owned(song, self.p['id'])[c['tracks'][0]['id']]
        midi.is_frozen = True;c = deepcopy(c);c['jobId'] = 'd'*32
        with self.assertRaises(ValueError):self.deliver(song, c)
        midi.is_frozen = False;midi.name = 'Mi nombre sin etiqueta NHM';c['replaceLive'] = True
        with self.assertRaisesRegex(ValueError, 'etiquetas'):self.deliver(song, c)
        self.assertEqual(len(song.tracks), 4)

    def test_wrong_revision_foreign_asset_stale_connection_and_duplicate_queue_are_rejected(self):
        for patch in [{'expectedRevision': 0}, {'assetIds': ['f'*32]}, {'targetSession': 'other'}]:
            with self.assertRaises((ValueError, Conflict)):self.manager.start(self.p['id'], {**self.body, **patch})
        self.command()
        with self.assertRaises(Conflict):self.manager.start(self.p['id'], self.body)
        atomic(self.manager.root / 'heartbeat.json', {**self.heartbeat, 'timestamp': 0})
        with self.assertRaises(Conflict):self.manager.start(self.p['id'], self.body)

    def test_native_readback_failure_never_reports_success_or_creates_binding(self):
        c = self.command();song = Song(self.target)
        provisional = engine.apply(song, c, 'test-session', lambda clip, notes: None)
        with self.assertRaises(ValueError):engine.finish(song, c, provisional)
        self.assertFalse(engine.binding_path(self.target, self.p['id']).exists())

    def test_expired_and_interrupted_jobs_do_not_automatically_run_again(self):
        c = self.command();file = self.manager.queue / (c['jobId']+'.json');job = json.loads(file.read_text())
        job['expiresAt'] = 0;atomic(file, job)
        self.assertEqual(self.manager.current(self.p['id'])['state'], 'expired')
        job.update(state='running');atomic(file, job)
        atomic(self.manager.root / 'heartbeat.json', {**self.heartbeat, 'session': 'new-session'})
        self.assertEqual(self.manager.current(self.p['id'])['state'], 'interrupted')

    def test_reanalysis_selects_only_the_latest_stems_by_default(self):
        source = self.root / 'stem.wav'
        p = self.store.add_asset(self.p['id'], source, '01 - Percusion.wav', 'audio/wav',
                                 {'role': 'analysis-stem', 'jobId': 'old'}, expected=self.p['revision'])
        old = p['assets'][-1]['id']
        p = self.store.add_asset(self.p['id'], source, '01 - Percusion.wav', 'audio/wav',
                                 {'role': 'analysis-stem', 'jobId': 'new'}, expected=p['revision'])
        latest = p['assets'][-1]['id']
        self.store.save(p['id'], {'analysis_run': {'id': 'new'}}, p['revision'])
        selected = [a['id'] for a in self.manager.preview(p['id'])['audio'] if a['default']]
        self.assertEqual(selected, [latest]);self.assertNotIn(old, selected)
