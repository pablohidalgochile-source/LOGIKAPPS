import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from analysis import AnalysisManager
from store import Store, Conflict, atomic, music_signature

WORKER = '''
import sys,json,time
from pathlib import Path
out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
for n in [5,40,20,90]:
 print(json.dumps({'stage':'Etapa '+str(n),'percent':n}),flush=True)
 time.sleep(.12)
 if 'slow.wav' in sys.argv:time.sleep(10)
report={'bpm':120,'duration_s':2,'notes':[{'pitch':48,'start':0,'end':1,'velocity':80}],
 'audio_files':{'Original':'Original.wav'},'sections':[],'key':{'name':'Do mayor'},'warnings':[]}
(out/'Samples').mkdir();(out/'Samples/Original.wav').write_bytes(b'RIFF-local-result')
(out/'Contrapista.zip').write_bytes(b'local-set-package')
(out/'Informe.json').write_text(json.dumps(report))
print(json.dumps({'percent':100,'stage':'Listo','result':True}),flush=True)
'''


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = Store(self.root / 'projects')
        self.worker = self.root / 'worker.py';self.worker.write_text(WORKER)
        p = self.store.create({'title': 'Mi canción', 'lyrics': 'Letra original'})
        source = self.root / 'audio.wav';source.write_bytes(b'RIFF-input')
        self.p = self.store.add_asset(p['id'], source, 'audio.wav', 'audio/wav', expected=p['revision'])
        self.manager = AnalysisManager(self.store, self.worker)

    def tearDown(self):
        self.manager.close();self.tmp.cleanup()

    def start(self):
        return self.manager.start(self.p['id'], {'assetId': self.p['assets'][0]['id'], 'quality': 'fast', 'source': 'mix', 'expectedRevision': self.p['revision']})

    def wait(self, state='ready'):
        deadline = time.monotonic() + 6
        observed = []
        while time.monotonic() < deadline:
            job = self.manager.current(self.p['id']);observed.append(job['percent'])
            if job['state'] in {state, 'error'}:
                self.assertEqual(job['state'], state, job)
                self.assertEqual(observed, sorted(observed))
                return job
            time.sleep(.03)
        self.fail('El worker de prueba no terminó')

    def test_direct_analysis_applies_atomically_and_preserves_new_lyrics(self):
        self.start()
        edited = self.store.save(self.p['id'], {'lyrics': 'Letra cambiada durante el análisis'}, self.p['revision'])
        job = self.wait()
        self.assertFalse(job['needsReview'])
        applied = self.manager.apply(self.p['id'], job['id'], {'expectedRevision': edited['revision']})
        self.assertEqual(applied['id'], self.p['id'])
        self.assertEqual(applied['lyrics'], edited['lyrics'])
        self.assertEqual(applied['parts'][0]['notes'][0]['pitch'], 48)
        self.assertEqual(applied['revision'], edited['revision'] + 1)
        self.assertEqual(len(applied['assets']), 3)
        self.assertEqual(self.manager.current(self.p['id'])['state'], 'complete')
        repeated = self.manager.apply(self.p['id'], job['id'], {'expectedRevision': edited['revision']})
        self.assertEqual(repeated['revision'], applied['revision'])
        self.assertEqual(len(repeated['assets']), 3)
        backup = self.root / 'analysis-backup.zip';self.store.backup(applied['id'], backup)
        restored = self.store.restore(backup)
        self.assertEqual(restored['parts'], applied['parts'])
        self.assertEqual(restored['analysis_run']['id'], job['id'])
        self.assertEqual(restored['assets'], applied['assets'])

    def test_concurrent_musical_changes_require_explicit_application(self):
        self.start()
        edited = self.store.save(self.p['id'], {'bpm': 135, 'key': 'Fa menor'}, self.p['revision'])
        job = self.wait()
        self.assertTrue(job['needsReview'])
        with self.assertRaises(Conflict):
            self.manager.apply(self.p['id'], job['id'], {'expectedRevision': edited['revision']})
        self.assertEqual(self.store.load(self.p['id'])['bpm'], 135)
        applied = self.manager.apply(self.p['id'], job['id'], {'expectedRevision': edited['revision'], 'force': True})
        self.assertEqual(applied['bpm'], 120)
        past = json.loads((self.store.folder(self.p['id']) / 'history' / f"{edited['revision']:06}.json").read_text())
        self.assertEqual(past['bpm'], 135)

    def test_one_job_at_a_time_cancellation_preserves_input(self):
        self.p['assets'][0]['name'] = 'slow.wav'
        path = self.store.folder(self.p['id']) / 'project.json';atomic(path, self.p)
        job = self.start()
        with self.assertRaises(Conflict):self.start()
        cancelled = self.manager.cancel(self.p['id'], job['id'])
        self.assertEqual(cancelled['state'], 'cancelled')
        self.assertEqual(self.store.load(self.p['id'])['revision'], self.p['revision'])
        a = self.p['assets'][0]
        self.assertEqual((self.store.folder(self.p['id'])/'assets'/a['file']).read_bytes(), b'RIFF-input')

    def test_restart_recovers_ready_results_and_marks_interrupted_jobs(self):
        job = self.start();self.wait();self.manager.close()
        resumed = AnalysisManager(self.store, self.worker)
        self.assertEqual(resumed.current(self.p['id'])['state'], 'ready')
        applied = resumed.apply(self.p['id'], job['id'], {'expectedRevision': self.p['revision']})
        self.assertTrue(applied['parts']);resumed.close()
        raw = {**job, 'state': 'running', 'baseline': music_signature(self.p)}
        atomic(self.root/'jobs'/job['id']/'job.json', raw)
        recovered = AnalysisManager(self.store, self.worker)
        self.assertEqual(recovered.current(self.p['id'])['state'], 'interrupted');recovered.close()

    def test_missing_output_keeps_original_project_and_assets(self):
        job = self.start();self.wait()
        (self.root/'jobs'/job['id']/'output/Samples/Original.wav').unlink()
        with self.assertRaises(ValueError):
            self.manager.apply(self.p['id'], job['id'], {'expectedRevision': self.p['revision']})
        p = self.store.load(self.p['id'])
        self.assertEqual(p['revision'], self.p['revision']);self.assertEqual(len(p['assets']),1)


if __name__ == '__main__':unittest.main()
