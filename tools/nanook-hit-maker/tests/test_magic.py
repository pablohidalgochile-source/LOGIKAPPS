from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import Store, Conflict, atomic
from magic import MagicManager, musical_context, prepare, signature

PROPOSAL = {'title': 'Luz que vuelve', 'summary': 'Un motivo que abre una nueva etapa.', 'tempo': 124,
            'tonality': 'La menor', 'hook': 'Tres notas ascendentes con una respuesta corta.',
            'lyrics': '[Chorus]\nVuelve la luz sobre el mar', 'direction': 'Entra el bajo tras la primera frase.',
            'variants': [{'id': i, 'label': label, 'description': 'Una instrumentación distinta.',
                          'style': 'Warm intimate pop, 124 BPM. A short piano motif with clear vocal space.',
                          'exclude': 'festival drops'} for i, label in zip(['balanced', 'club', 'melodic'], ['Piano cercano', 'Cuerdas suaves', 'Banda acústica'])],
            'tips': ['Revisa las notas candidatas antes de fijar la armonía.']}


class MagicTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = Store(self.root / 'projects')
        self.p = self.store.create({'title': 'Referencia sintética', 'bpm': 123.87, 'duration': 10,
                                   'idea': 'Un pop luminoso de regreso a casa.', 'key': 'La menor',
                                   'lyrics': 'Letra aprobada', 'style': 'Producción aprobada',
                                   'parts': [{'key': 'melody', 'name': 'Melodía', 'reviewed': True,
                                              'notes': [{'pitch': 60 + i % 5, 'start': i / 4, 'duration': .2, 'amplitude': .8} for i in range(30)]}],
                                   'analysis': {'key': {'name': 'La menor', 'alternative': 'Do mayor', 'evidence': 'Candidata'},
                                                'chords': [{'name': 'Am', 'start': 0, 'end': 2}], 'privatePath': '/secret/file.wav'}})
        # Provider-free process exercises the actual persistence and job lifecycle.
        self.worker = self.root / 'worker.mjs'
        self.worker.write_text("if(process.argv.includes('--status'))console.log(JSON.stringify({configured:true,model:'test-provider',knowledgeVersion:'test'}));else{let raw='';for await(const c of process.stdin)raw+=c;const input=JSON.parse(raw);await new Promise(r=>setTimeout(r,120));console.log(JSON.stringify({proposal:" + json.dumps(PROPOSAL) + ",brief:input.brief,model:'test-provider',knowledgeVersion:'test'}));}")
        self.manager = MagicManager(self.store, self.worker)
        self.body = dict(expectedRevision=self.p['revision'], instruction='Un pop luminoso con un coro breve de regreso a casa.',
                         bpm=124, task='complete', vocals='Voz femenina', language='Español', recipeId='')

    def tearDown(self):
        self.manager.close()
        self.tmp.cleanup()

    def ready(self):
        job = self.manager.start(self.p['id'], self.body)
        for _ in range(150):
            job = self.manager.current(self.p['id'])
            if job['state'] not in {'queued', 'running'}:
                break
            time.sleep(.02)
        self.assertEqual(job['state'], 'ready', job)
        return job

    def test_context_is_bounded_and_excludes_assets_and_internal_analysis(self):
        p = deepcopy(self.p);p['assets'] = [{'name': '/secret/master.wav', 'bytes': 'PRIVATE'}]
        c = musical_context(p)
        self.assertEqual(len(c['parts'][0]['sample']), 16)
        self.assertEqual(c['parts'][0]['noteCount'], 30)
        self.assertEqual(c['parts'][0]['status'], 'revisada por el usuario')
        self.assertEqual(c['parts'][0]['intervals'][0], 1)
        self.assertIn('Candidata', c['analysis']['keyEvidence'])
        self.assertEqual(c['keyStatus'], 'candidata de Contrapista')
        self.assertNotIn('/secret', json.dumps(c));self.assertNotIn('PRIVATE', json.dumps(c))

    def test_proposal_tempo_is_explicit_and_does_not_round_the_score(self):
        _, payload = prepare(self.p, self.body)
        self.assertEqual(payload['brief']['bpm'], 124)
        self.assertEqual(payload['context']['projectTempo'], 123.87)
        self.assertEqual(payload['brief']['advanced']['key'], '')
        with self.assertRaises(ValueError):
            prepare(self.p, {**self.body, 'bpm': 123.87})
        with self.assertRaises(ValueError):
            prepare(self.p, {**self.body, 'instruction': 'corta'})

    def test_generation_is_review_only_then_selective_idempotent_apply(self):
        job = self.ready()
        self.assertEqual(self.store.load(self.p['id']), self.p)
        body = dict(expectedRevision=self.p['revision'], fields=['idea', 'style'], variantIndex=1)
        saved = self.manager.apply(self.p['id'], job['id'], body)
        self.assertEqual(saved['parts'], self.p['parts']);self.assertEqual(saved['bpm'], 123.87)
        self.assertEqual(saved['lyrics'], 'Letra aprobada');self.assertEqual(saved['title'], self.p['title'])
        self.assertEqual(saved['magic']['variantIndex'], 1)
        self.assertEqual(len(saved['magic_history']), 1)
        self.assertEqual(self.manager.apply(self.p['id'], job['id'], body)['revision'], saved['revision'])
        old = self.store.revert(self.p['id'], 1, saved['revision'])
        self.assertEqual(old['idea'], self.p['idea'])

    def test_changed_text_requires_explicit_review_and_preserves_other_fields(self):
        job = self.ready()
        updated = self.store.save(self.p['id'], {'lyrics': 'Nueva letra manual'}, self.p['revision'])
        body = dict(expectedRevision=updated['revision'], fields=['style'], variantIndex=0)
        with self.assertRaises(Conflict):
            self.manager.apply(self.p['id'], job['id'], body)
        self.assertTrue(self.manager.current(self.p['id'])['stale'])
        saved = self.manager.apply(self.p['id'], job['id'], {**body, 'allowStale': True})
        self.assertEqual(saved['lyrics'], 'Nueva letra manual')
        self.assertTrue(saved['magic_history'][0]['usedAfterChanges'])

    def test_rejects_unknown_apply_fields_and_obsolete_revision(self):
        job = self.ready()
        for body in [dict(expectedRevision=1, fields=['parts']), dict(expectedRevision=0, fields=['lyrics']),
                     dict(expectedRevision=1, fields=['lyrics'], variantIndex=True)]:
            with self.assertRaises((ValueError, Conflict)):
                self.manager.apply(self.p['id'], job['id'], body)
        self.assertEqual(self.store.load(self.p['id']), self.p)

    def test_pending_job_recovers_and_accepted_proposal_travels_in_backup(self):
        job = self.ready()
        recovered = MagicManager(self.store, self.worker)
        self.assertEqual(recovered.current(self.p['id'])['state'], 'ready')
        saved = recovered.apply(self.p['id'], job['id'], dict(expectedRevision=1, fields=['lyrics']))
        bundle = self.root / 'backup.zip';self.store.backup(self.p['id'], bundle)
        restored = self.store.restore(bundle)
        self.assertEqual(restored['magic_history'], saved['magic_history'])
        self.assertEqual(restored['magic']['proposal']['lyrics'], PROPOSAL['lyrics'])
        recovered.close()

    def test_cancel_and_interrupted_startup_never_autogenerate(self):
        job = self.manager.start(self.p['id'], self.body)
        self.assertEqual(self.manager.cancel(self.p['id'], job['id'])['state'], 'cancelled')
        for t in self.manager.threads:t.join(timeout=3)
        self.assertEqual(self.store.load(self.p['id']), self.p)
        old = self.manager.jobs[job['id']];old['state'] = 'running'
        atomic(self.manager.root / job['id'] / 'job.json', old)
        recovered = MagicManager(self.store, self.worker)
        self.assertEqual(recovered.current(self.p['id'])['state'], 'interrupted')
        self.assertIsNone(recovered.active);recovered.close()

    def test_single_active_job_and_pending_review_prevent_duplicate_charges(self):
        job = self.ready()
        with self.assertRaises(Conflict):
            self.manager.start(self.p['id'], self.body)
        self.manager.cancel(self.p['id'], job['id'])
        for t in self.manager.threads:t.join(timeout=3)
        second = self.manager.start(self.p['id'], self.body)
        with self.assertRaises(Conflict):
            self.manager.start(self.p['id'], self.body)
        self.manager.cancel(self.p['id'], second['id'])
