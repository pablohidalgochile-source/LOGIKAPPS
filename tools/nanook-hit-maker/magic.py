"""MAGIC proposals: bounded musical context, explicit review and atomic application."""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import threading
from uuid import uuid4

from store import atomic, now, Conflict, music_signature, text, finite

ROOT = Path(__file__).resolve().parent
ACTIVE = {'queued', 'running'}
CREATIVE = ('title', 'idea', 'lyrics', 'style', 'exclude')
VOCALS = ['Dúo masculino', 'Dúo femenino', 'Dúo mixto', 'Voz masculina', 'Voz femenina', 'Coro / grupo', 'Instrumental']


def clipped(value, limit):
    return value[:limit] if isinstance(value, str) else ''


def signature(p):
    return hashlib.sha256(json.dumps([music_signature(p), {k: p.get(k) for k in (*CREATIVE, 'chords')}],
                                    sort_keys=True, allow_nan=False).encode()).hexdigest()


def musical_context(p):
    """Only whitelisted musical data. No assets, filesystem paths or audio bytes."""
    bpm = p['bpm']
    parts = []
    for part in p['parts']:
        notes = sorted(part['notes'], key=lambda n: n['start'])
        sample = notes[:16]
        parts.append({'name': clipped(part['name'], 100), 'role': clipped(part['key'], 60),
                      'status': 'revisada por el usuario' if part.get('reviewed') else 'candidata sin revisar',
                      'noteCount': len(notes), 'sample': [
                          {'midi': n['pitch'], 'beat': round(n['start'] * bpm / 60, 3),
                           'beats': round(n['duration'] * bpm / 60, 3)} for n in sample],
                      'intervals': [b['pitch'] - a['pitch'] for a, b in zip(sample, sample[1:])],
                      'sampling': 'Primeros 16 ataques como máximo; resumen parcial, no partitura completa.'})
    sections = []
    for s in p.get('structure', [])[:16]:
        if not isinstance(s, dict):
            continue
        sections.append({k: clipped(s[k], 100) if isinstance(s[k], str) else s[k]
                         for k in ('name', 'time', 'bar', 'start', 'end') if k in s and isinstance(s[k], (str, int, float))})
    analysis = p.get('analysis') or {}
    key = analysis.get('key') or {}
    if not isinstance(key, dict):
        key = {}
    chords = [{'name': clipped(c.get('name'), 30),
               **{k: c[k] for k in ('start', 'end') if finite(c.get(k), 0, 1800)}}
              for c in analysis.get('chords', [])[:16] if isinstance(c, dict)]
    return {'title': clipped(p['title'], 200), 'projectTempo': bpm, 'durationSeconds': p['duration'],
            'key': clipped(p.get('key'), 100),
            'keyStatus': 'candidata de Contrapista' if key.get('name') == p.get('key') else 'dirección del proyecto',
            'explicitChords': clipped(p.get('chords'), 500),
            'idea': clipped(p.get('idea'), 3000), 'currentLyrics': clipped(p.get('lyrics'), 5000),
            'currentStyle': clipped(p.get('style'), 1000), 'currentExclude': clipped(p.get('exclude'), 400),
            'parts': parts, 'sections': sections, 'sectionStatus': 'Estructura compartida; las detecciones de Contrapista son candidatas.',
            'analysis': {'available': bool(analysis), 'tempoSource': clipped(analysis.get('tempo_source'), 100),
                         'keyCandidate': clipped(key.get('name'), 100), 'alternativeKey': clipped(key.get('alternative'), 100),
                         'keyEvidence': clipped(key.get('evidence'), 300), 'chordCandidates': chords},
            'limits': 'Solo resumen textual. Notas sin revisar y análisis son estimaciones. No se envía audio. Las decisiones explícitas prevalecen.'}


def prepare(p, body):
    task = body.get('task', 'complete')
    if task not in {'complete', 'ideas', 'lyrics', 'prompts'}:
        raise ValueError('Elige qué quieres crear con MAGIC.')
    bpm = body.get('bpm')
    if not isinstance(bpm, int) or isinstance(bpm, bool) or not 40 <= bpm <= 220:
        raise ValueError('MAGIC necesita un tempo entero entre 40 y 220 BPM para la propuesta. El tempo de tu partitura se conserva.')
    instruction = text(body.get('instruction', ''), 2000, 'Dirección').strip()
    if len(instruction) < 12:
        raise ValueError('Describe tu dirección creativa con al menos 12 caracteres.')
    vocals, language = body.get('vocals', 'Voz masculina'), body.get('language', 'Español')
    if vocals not in VOCALS or language not in {'Español', 'Inglés', 'Spanglish'}:
        raise ValueError('Voz o idioma no permitido.')
    recipe = text(body.get('recipeId', ''), 80, 'Receta')
    settings = dict(task=task, bpm=bpm, instruction=instruction, vocals=vocals, language=language, recipeId=recipe)
    context = musical_context(p)
    brief = {'idea': instruction, 'inspiration': clipped(p.get('idea'), 2000), 'bpm': bpm,
             'vocals': vocals, 'language': language, 'recipeId': recipe,
             'withLyrics': task in {'complete', 'lyrics'} and vocals != 'Instrumental',
             'lyricsIdea': instruction[:1000] + '\nIdea del proyecto: ' + clipped(p.get('idea'), 900),
             'advanced': {'enabled': True, 'key': '' if context['keyStatus'] == 'candidata de Contrapista' else clipped(p.get('key'), 80), 'scale': '',
                          'chords': clipped(p.get('chords'), 500), 'groove': '', 'arrangement': '', 'instruments': []}}
    return settings, {'brief': brief, 'context': context}


class MagicManager:
    def __init__(self, store, worker=None):
        self.store = store
        self.root = store.root.parent / 'magic'
        self.root.mkdir(parents=True, exist_ok=True)
        self.worker = Path(worker or ROOT / 'magic_worker.mjs')
        self.node = shutil.which('node') or '/opt/homebrew/bin/node'
        self.lock = threading.RLock()
        self.jobs, self.processes, self.threads = {}, {}, []
        self.active, self.closed = None, False
        for path in self.root.glob('*/job.json'):
            try:
                j = json.loads(path.read_text())
                if j['id'] != path.parent.name:
                    continue
                if j['state'] in ACTIVE:
                    j.update(state='interrupted', error='Se cerró el servidor. Puedes crear otra propuesta; no se reintenta automáticamente.')
                    atomic(path, j)
                self.jobs[j['id']] = j
            except (ValueError, KeyError, OSError):
                continue

    def capabilities(self):
        try:
            r = subprocess.run([self.node, str(self.worker), '--status'], capture_output=True, text=True, timeout=10)
            data = json.loads(r.stdout)
            return {k: data[k] for k in ('configured', 'model', 'knowledgeVersion')}
        except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
            return {'configured': False, 'model': None, 'knowledgeVersion': None}

    def public(self, job):
        p = self.store.load(job['projectId'])
        return {**{k: deepcopy(v) for k, v in job.items() if k not in {'baseline', 'input'}},
                'stale': signature(p) != job['baseline'] if job['state'] == 'ready' else False}

    def current(self, project_id):
        self.store.load(project_id)
        with self.lock:
            jobs = [j for j in self.jobs.values() if j['projectId'] == project_id]
            return self.public(max(jobs, key=lambda j: j['createdAt'])) if jobs else None

    def get(self, project_id, identifier):
        job = self.jobs.get(identifier)
        if not job or job['projectId'] != project_id:
            raise FileNotFoundError()
        return job

    def update(self, identifier, **values):
        job = self.jobs[identifier]
        job.update(**values, updatedAt=now())
        atomic(self.root / identifier / 'job.json', job)
        return self.public(job)

    def start(self, project_id, body):
        with self.lock, self.store.lock:
            if self.closed or self.active:
                raise Conflict('MAGIC ya está generando una propuesta. Puedes seguir trabajando mientras termina.')
            p = self.store.load(project_id)
            if p['revision'] != body.get('expectedRevision'):
                raise Conflict('El proyecto cambió. Guarda o recarga antes de generar.')
            old = self.current(project_id)
            if old and old['state'] == 'ready':
                raise Conflict('Revisa o descarta la propuesta anterior antes de generar otra.')
            if len(p.get('magic_history', [])) >= 50:
                raise ValueError('Este proyecto ya tiene 50 propuestas. Crea otro proyecto para seguir generando.')
            settings, payload = prepare(p, body)
            if not self.capabilities()['configured']:
                raise ValueError('No está disponible la conexión autorizada de MAGIC. Revisa su configuración local.')
            identifier = uuid4().hex
            job = dict(id=identifier, projectId=project_id, state='queued', createdAt=now(), updatedAt=now(),
                       sourceRevision=p['revision'], baseline=signature(p), settings=settings, input=payload)
            self.jobs[identifier] = job
            self.active = identifier
            self.update(identifier)
            thread = threading.Thread(target=self.run, args=(identifier,), daemon=True)
            self.threads.append(thread)
            thread.start()
            return self.public(job)

    def run(self, identifier):
        try:
            with self.lock:
                job = self.jobs[identifier]
                if job['state'] == 'cancelled':
                    return
                proc = subprocess.Popen([self.node, str(self.worker)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, text=True, cwd=ROOT, start_new_session=True)
                self.processes[identifier] = proc
                self.update(identifier, state='running')
            try:
                stdout, _ = proc.communicate(json.dumps(job['input'], ensure_ascii=False, allow_nan=False), timeout=125)
            except subprocess.TimeoutExpired:
                proc.kill();proc.communicate()
                raise ValueError('La generación tardó demasiado. Tu proyecto sigue guardado.')
            with self.lock:
                if job['state'] == 'cancelled':
                    return
                result = json.loads(stdout)
                if proc.returncode or 'error' in result or not isinstance(result.get('proposal'), dict):
                    raise ValueError(result.get('error', 'MAGIC no pudo completar la propuesta.'))
                self.update(identifier, state='ready', result=result)
        except Exception as error:
            with self.lock:
                if self.jobs[identifier]['state'] != 'cancelled':
                    # Worker only returns controlled errors; OS/decoder exceptions are never exposed.
                    message = str(error)[:500] if type(error) is ValueError else 'No se pudo completar la propuesta. Tu proyecto se conserva.'
                    self.update(identifier, state='error', error=message)
        finally:
            with self.lock:
                self.processes.pop(identifier, None)
                if self.active == identifier:
                    self.active = None

    def apply(self, project_id, identifier, body):
        with self.lock, self.store.lock:
            job = self.get(project_id, identifier)
            p = self.store.load(project_id)
            # Survives a crash after the atomic save and before updating job state.
            if any(x.get('generationId') == identifier for x in p.get('magic_history', [])):
                return p
            if job['state'] != 'ready':
                raise Conflict('La propuesta no está lista para aplicar.')
            if p['revision'] != body.get('expectedRevision'):
                raise Conflict('El proyecto cambió. Recarga antes de aplicar la propuesta.')
            if signature(p) != job['baseline'] and body.get('allowStale') is not True:
                raise Conflict('La música o el texto cambiaron desde la generación. Revisa la propuesta antes de aplicarla al proyecto actual.')
            fields = body.get('fields')
            if not isinstance(fields, list) or not fields or any(f not in CREATIVE for f in fields) or len(set(fields)) != len(fields):
                raise ValueError('Selecciona los campos que quieres incorporar.')
            index = body.get('variantIndex', 0)
            if type(index) is not int or not 0 <= index <= 2:
                raise ValueError('Elige una de las tres alternativas.')
            result = job['result'];proposal = result['proposal'];variant = proposal['variants'][index]
            values = {'title': proposal['title'], 'idea': proposal['summary'] + '\n\nGancho: ' + proposal['hook'],
                      'lyrics': proposal['lyrics'], 'style': variant['style'], 'exclude': variant['exclude']}
            log = p.get('magic_history', [])
            if len(log) >= 50:
                raise ValueError('Este proyecto ya tiene 50 propuestas. Crea otro proyecto para seguir generando.')
            entry = {'generationId': identifier, 'at': now(), 'sourceRevision': job['sourceRevision'],
                     'settings': job['settings'], 'context': job['input']['context'], 'proposal': proposal,
                     'model': result['model'], 'knowledgeVersion': result['knowledgeVersion'],
                     'variantIndex': index, 'fields': fields, 'usedAfterChanges': signature(p) != job['baseline']}
            patch = {f: values[f] for f in fields}
            patch.update(magic={'brief': result['brief'], 'proposal': proposal, 'variantIndex': index,
                                'generationId': identifier}, magic_history=[*log, entry])
            saved = self.store.save(project_id, patch, p['revision'])
            self.update(identifier, state='complete', appliedRevision=saved['revision'])
            return saved

    def cancel(self, project_id, identifier):
        with self.lock:
            job = self.get(project_id, identifier)
            if job['state'] not in {*ACTIVE, 'ready'}:
                return self.public(job)
            self.update(identifier, state='cancelled')
            proc = self.processes.get(identifier)
            if proc and proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            return self.public(job)

    def close(self):
        with self.lock:
            self.closed = True
            active = [j for j in self.jobs.values() if j['state'] in ACTIVE]
        for job in active:
            self.cancel(job['projectId'], job['id'])
        for thread in self.threads:
            thread.join(timeout=4)
