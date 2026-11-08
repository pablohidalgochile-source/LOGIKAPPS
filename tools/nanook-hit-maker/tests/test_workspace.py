import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import zipfile
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import Store, Conflict, contrapista_project
from server import make_server


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = Store(self.root / 'projects')
        self.project = self.store.create({'title': 'Canción ácida'})

    def tearDown(self):
        self.tmp.cleanup()

    def test_revision_conflict_preserves_saved_changes(self):
        p = self.project
        updated = self.store.save(p['id'], {'lyrics': 'Texto aprobado'}, p['revision'])
        with self.assertRaises(Conflict):
            self.store.save(p['id'], {'lyrics': 'Pestaña antigua'}, p['revision'])
        self.assertEqual(self.store.load(p['id'])['lyrics'], 'Texto aprobado')
        recovered = self.store.revert(p['id'], 1, updated['revision'])
        self.assertEqual(recovered['revision'], 3)
        self.assertEqual(len(self.store.history(p['id'])), 3)
        self.assertEqual(self.store.history(p['id'])[1]['revision'], 2)

    def test_invalid_notes_do_not_create_revision(self):
        with self.assertRaises(ValueError):
            self.store.save(self.project['id'], {'duration': 1, 'parts': [{'key': 'melody', 'name': 'Melodía', 'notes':
                [{'start': .9, 'duration': 1, 'pitch': 60, 'amplitude': .8}]}]}, 1)
        self.assertEqual(self.store.load(self.project['id'])['revision'], 1)

    def test_portable_backup_retains_assets_history_and_unicode(self):
        source = self.root / 'referencia.wav';source.write_bytes(b'RIFF' + bytes(range(256)) * 20)
        p = self.store.add_asset(self.project['id'], source, 'Referencia original.wav', 'audio/wav', expected=1)
        p = self.store.save(p['id'], {'lyrics': 'Neón, corazón y compás'}, p['revision'])
        bundle = self.root / 'export.zip';self.store.backup(p['id'], bundle)
        restored = self.store.restore(bundle)
        self.assertNotEqual(restored['id'], p['id'])
        self.assertEqual(restored['lyrics'], p['lyrics'])
        a = restored['assets'][0]
        self.assertEqual((self.store.folder(restored['id']) / 'assets' / a['file']).read_bytes(), source.read_bytes())
        self.assertEqual(len(self.store.history(restored['id'])), 3)
        self.assertEqual(restored['restoredFrom'], p['id'])
        self.assertEqual(self.store.load(p['id'])['revision'], p['revision'])

    def test_backup_rejects_path_escape_and_tampering(self):
        bundle = self.root / 'bad.zip'
        with zipfile.ZipFile(bundle, 'w') as z:
            z.writestr('../escape.txt', 'bad')
            z.writestr('project.json', json.dumps(self.project))
        with self.assertRaises(ValueError):
            self.store.restore(bundle)
        self.assertFalse((self.root / 'escape.txt').exists())
        source = self.root / 'a.wav';source.write_bytes(b'123')
        p = self.store.add_asset(self.project['id'], source, 'a.wav', expected=1)
        with zipfile.ZipFile(bundle, 'w') as z:
            z.writestr('project.json', json.dumps(p))
            z.writestr('assets/' + p['assets'][0]['file'], b'456')
        with self.assertRaisesRegex(ValueError, 'integridad'):
            self.store.restore(bundle)
        self.assertEqual(len(self.store.list()), 1)

    def test_contrapista_end_times_and_polyphony_are_retained(self):
        report = {'bpm': 124, 'duration_s': 2, 'notes': [{'start': .5, 'end': 1.2, 'pitch': 36, 'velocity': 80}],
                  'drum_notes': [{'start': .5, 'end': .57, 'pitch': 36, 'velocity': 127}],
                  'extra_midi': {'Voz': [{'start': 0, 'end': .4, 'pitch': 72, 'velocity': 90}]},
                  'chord_notes': [{'start': 0, 'end': 1, 'pitch': n, 'velocity': 70} for n in [60, 64, 67]],
                  'key': {'name': 'Do mayor'}, 'audio_files': {'Original': 'original.wav'}, 'sections': []}
        bundle = self.root / 'contrapista.zip'
        with zipfile.ZipFile(bundle, 'w') as z:
            z.writestr('Informe.json', json.dumps(report))
            z.writestr('Samples/original.wav', b'RIFF-test')
        p = self.store.import_contrapista(bundle, 'Prueba musical')
        self.assertAlmostEqual(p['parts'][0]['notes'][0]['duration'], .7)
        self.assertEqual(p['parts'][1]['key'], 'drums')
        self.assertEqual(len(p['parts'][2]['notes']), 3)
        self.assertEqual(p['parts'][3]['key'], 'vocals')
        self.assertEqual(p['key'], 'Do mayor')
        self.assertEqual(len(p['assets']), 2)
        self.assertEqual(p['imports'][0]['raw'], report)

    def test_missing_contrapista_stem_rolls_back(self):
        bundle = self.root / 'incomplete.zip'
        with zipfile.ZipFile(bundle, 'w') as z:
            z.writestr('Informe.json', json.dumps({'bpm': 120, 'duration_s': 1, 'audio_files': {'Original': 'missing.wav'}}))
        with self.assertRaises(ValueError):
            self.store.import_contrapista(bundle)
        self.assertEqual(len(self.store.list()), 1)


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = make_server(0, Path(self.tmp.name) / 'projects')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True);self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()

    def post(self, path, data, headers=None):
        return urlopen(Request(self.url + path, data=json.dumps(data).encode(), headers={'X-Nanook': '1', **(headers or {})}))

    def test_local_create_save_backup_restore(self):
        with self.post('/api/projects', {'title': 'HTTP canción'}) as r:
            p = json.load(r)
        with self.post('/api/projects/' + p['id'], {'expectedRevision': 1, 'project': {'style': 'Electro urbano'}}) as r:
            updated = json.load(r)
        self.assertEqual(updated['revision'], 2)
        with urlopen(self.url + '/api/projects/' + p['id'] + '/backup') as r:
            archive = r.read()
        with urlopen(Request(self.url + '/api/restore', data=archive, headers={'X-Nanook': '1'})) as r:
            restored = json.load(r)
        self.assertEqual(restored['style'], 'Electro urbano')
        self.assertNotEqual(restored['id'], p['id'])

    def test_cross_origin_mutation_rejected(self):
        with self.assertRaises(HTTPError) as error:
            self.post('/api/projects', {}, {'Origin': 'https://example.com'})
        self.assertEqual(error.exception.code, 403)
        self.assertEqual(self.server.store.list(), [])

    def test_audio_upload_duration_and_seek_range(self):
        with self.post('/api/projects', {'title': 'Audio de prueba'}) as r:
            p = json.load(r)
        audio = io.BytesIO()
        with wave.open(audio, 'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b'\0\0' * 8000)
        raw = audio.getvalue()
        with urlopen(Request(self.url + '/api/projects/' + p['id'] + '/assets?revision=1&name=referencia.wav',
                             data=raw, headers={'X-Nanook': '1'})) as r:
            p = json.load(r)
        self.assertEqual(p['assets'][0]['duration'], 1)
        url = self.url + '/api/projects/' + p['id'] + '/assets/' + p['assets'][0]['id']
        with urlopen(Request(url, headers={'Range': 'bytes=0-15'})) as r:
            self.assertEqual(r.status, 206)
            self.assertEqual(r.read(), raw[:16])

    def test_analysis_http_delivers_to_the_same_project(self):
        from test_analysis import WORKER
        worker = Path(self.tmp.name) / 'worker.py';worker.write_text(WORKER)
        self.server.analysis.worker = worker
        p = self.server.store.create({'title': 'Análisis por HTTP', 'lyrics': 'Conservar letra'})
        audio = Path(self.tmp.name) / 'audio.wav';audio.write_bytes(b'RIFF-test')
        p = self.server.store.add_asset(p['id'], audio, 'audio.wav', 'audio/wav', expected=p['revision'])
        with self.post('/api/projects/' + p['id'] + '/analysis', {'assetId': p['assets'][0]['id'], 'quality': 'fast', 'expectedRevision': p['revision']}) as r:
            self.assertEqual(r.status, 202);job = json.load(r)
        for _ in range(100):
            with urlopen(self.url + '/api/projects/' + p['id'] + '/analysis') as r:current = json.load(r)
            if current['state'] not in ['queued', 'running']:break
            time.sleep(.03)
        self.assertEqual(current['state'], 'ready')
        with self.post('/api/projects/' + p['id'] + '/analysis/' + job['id'] + '/apply', {'expectedRevision': p['revision']}) as r:
            applied = json.load(r)
        self.assertEqual(applied['id'], p['id']);self.assertEqual(applied['lyrics'], p['lyrics'])
        self.assertTrue(applied['parts']);self.assertEqual(len(applied['assets']), 3)

    def test_analysis_start_rejects_stale_revision_and_foreign_asset(self):
        p = self.server.store.create({'title': 'Revisión'})
        with self.assertRaises(HTTPError) as error:
            self.post('/api/projects/' + p['id'] + '/analysis', {'assetId': 'a'*32, 'quality': 'fast', 'expectedRevision': 0})
        self.assertEqual(error.exception.code, 409)
        with self.assertRaises(HTTPError) as error:
            self.post('/api/projects/' + p['id'] + '/analysis', {'assetId': 'a'*32, 'quality': 'fast', 'expectedRevision': p['revision']})
        self.assertEqual(error.exception.code, 400)
        self.assertIsNone(self.server.analysis.current(p['id']))


if __name__ == '__main__':
    unittest.main()
