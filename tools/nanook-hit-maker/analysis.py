"""Durable, local background analyses managed by the NANOOK server."""
from copy import deepcopy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
from uuid import uuid4

from store import atomic, now, music_signature, Conflict, ID, finite

ROOT = Path(__file__).resolve().parent
INSTALLED = Path(os.environ.get('NANOOK_CONTRAPISTA_DIR', str(ROOT.parent / 'Contrapista')))
ACTIVE = {'queued', 'running'}


class AnalysisManager:
    def __init__(self, store, worker=None):
        self.store = store
        self.root = store.root.parent / 'jobs'
        self.root.mkdir(parents=True, exist_ok=True)
        self.runtime = store.root.parent / 'runtime'
        self.worker = Path(worker or ROOT / 'analysis_worker.py')
        self.lock = threading.RLock()
        self.jobs = {}
        self.processes = {}
        self.threads = []
        self.active = None
        self.closed = False
        for path in self.root.glob('*/job.json'):
            try:
                job = json.loads(path.read_text())
                if not ID.fullmatch(job['id']) or job['id'] != path.parent.name:
                    continue
                if job['state'] in ACTIVE:
                    job.update(state='interrupted', stage='El servidor se cerró. Puedes volver a analizar el audio guardado.')
                    atomic(path, job)
                self.jobs[job['id']] = job
            except (ValueError, KeyError, OSError):
                continue

    @property
    def ai_python(self):
        return Path(os.environ.get('NANOOK_AI_PYTHON', str(INSTALLED / '.venv-ai/bin/python')))

    def capabilities(self):
        model = INSTALLED / '.models/hub/checkpoints/955717e8-8726e21a.th'
        basic = next((INSTALLED / '.venv-ai/lib').glob('python*/site-packages/basic_pitch/saved_models/**/*.onnx'), None)
        demucs = model.is_file() or (self.runtime / 'models/hub/checkpoints' / model.name).is_file()
        pitch = bool(basic and basic.is_file()) or (self.runtime / 'basic-pitch.onnx').is_file()
        fast = bool(importlib.util.find_spec('numpy') and shutil.which('ffmpeg'))
        return {'fast': fast, 'ai': fast and self.ai_python.is_file() and demucs and pitch,
                'demucs': demucs, 'basic_pitch': pitch, 'engineVersion': '0.3',
                'maxSeconds': 1800, 'activeJob': self.active}

    def environment(self, quality):
        env = os.environ.copy()
        temp = self.runtime / 'tmp';temp.mkdir(parents=True, exist_ok=True)
        env.update(PYTHONDONTWRITEBYTECODE='1', TMPDIR=str(temp), NUMBA_CACHE_DIR=str(self.runtime / 'numba'),
                   TORCH_HOME=str(self.runtime / 'models'), NANOOK_AI_PYTHON=str(self.ai_python),
                   NANOOK_BASIC_PITCH_MODEL=str(self.runtime / 'basic-pitch.onnx'))
        if quality == 'ai':
            checkpoint = '955717e8-8726e21a.th'
            dest = self.runtime / 'models/hub/checkpoints' / checkpoint
            sources = [(INSTALLED / '.models/hub/checkpoints' / checkpoint, dest)]
            basic = next((INSTALLED / '.venv-ai/lib').glob('python*/site-packages/basic_pitch/saved_models/**/*.onnx'), None)
            sources.append((basic, self.runtime / 'basic-pitch.onnx'))
            for src, dst in sources:
                if dst.is_file():
                    continue
                if not src or not src.is_file():
                    raise ValueError('Faltan modelos locales. Elige análisis rápido o revisa el entorno de Contrapista.')
                dst.parent.mkdir(parents=True, exist_ok=True)
                staging = dst.with_suffix('.copying')
                shutil.copyfile(src, staging);staging.replace(dst)
        return env

    def public(self, job):
        return {k: deepcopy(v) for k, v in job.items() if k != 'baseline'}

    def current(self, project_id):
        self.store.load(project_id)
        with self.lock:
            jobs = [j for j in self.jobs.values() if j['projectId'] == project_id]
            return self.public(max(jobs, key=lambda j: j['createdAt'])) if jobs else None

    def get(self, project_id, identifier):
        if not isinstance(identifier, str) or not ID.fullmatch(identifier):
            raise ValueError('Identificador de análisis inválido.')
        job = self.jobs.get(identifier)
        if not job or job['projectId'] != project_id:
            raise FileNotFoundError()
        return job

    def update(self, identifier, **values):
        with self.lock:
            job = self.jobs[identifier]
            if 'percent' in values:
                values['percent'] = max(job['percent'], min(100, int(values['percent'])))
            job.update(**values, updatedAt=now())
            atomic(self.root / identifier / 'job.json', job)
            return self.public(job)

    def start(self, project_id, body):
        with self.lock, self.store.lock:
            if self.closed:
                raise ValueError('El servidor se está cerrando.')
            if self.active:
                raise Conflict('Ya hay un análisis en curso. Puedes seguir editando mientras termina.')
            p = self.store.load(project_id)
            if body.get('expectedRevision') != p['revision']:
                raise Conflict('El proyecto cambió. Guarda o recarga antes de analizar.')
            old = self.current(project_id)
            if old and old['state'] == 'ready':
                raise Conflict('Hay un resultado listo. Aplícalo o descártalo antes de iniciar otro análisis.')
            asset = next((a for a in p['assets'] if a['id'] == body.get('assetId') and a['mime'].startswith('audio/')), None)
            if not asset:
                raise ValueError('Elige un archivo de audio de esta canción.')
            quality, source = body.get('quality', 'ai'), body.get('source', 'mix')
            if quality not in {'fast', 'ai'} or source not in {'mix', 'bass', 'drums', 'melody', 'voice', 'stem'}:
                raise ValueError('Modo de análisis no permitido.')
            if not self.capabilities()[quality]:
                raise ValueError('Ese motor local no está disponible. Revisa el estado o elige el análisis rápido.')
            bpm = body.get('bpm')
            if bpm is not None and not finite(bpm, 40, 240):
                raise ValueError('El tempo manual debe estar entre 40 y 240 BPM.')
            identifier = uuid4().hex
            job = {'id': identifier, 'projectId': project_id, 'assetId': asset['id'], 'assetName': asset['name'],
                   'state': 'queued', 'stage': 'Preparando análisis local', 'percent': 0,
                   'source': source, 'quality': quality, 'bpm': bpm, 'baseline': music_signature(p),
                   'createdAt': now(), 'updatedAt': now(), 'baseRevision': p['revision'], 'needsReview': False}
            self.jobs[identifier] = job
            atomic(self.root / identifier / 'job.json', job)
            self.active = identifier
            thread = threading.Thread(target=self.run, args=(identifier, self.store.folder(project_id) / 'assets' / asset['file']), daemon=True)
            self.threads.append(thread);thread.start()
            return self.public(job)

    def run(self, identifier, audio):
        try:
            job = self.jobs[identifier]
            env = self.environment(job['quality'])
            folder = self.root / identifier
            args = [sys.executable, str(self.worker), str(audio), str(folder / 'output'),
                    '--quality', job['quality'], '--source', job['source'], '--name', job['assetName']]
            if job['bpm'] is not None:
                args += ['--bpm', str(job['bpm'])]
            with (folder / 'worker.log').open('w') as errors:
                with self.lock:
                    if self.jobs[identifier]['state'] == 'cancelled':
                        return
                    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=errors, text=True,
                                            env=env, start_new_session=True, cwd=ROOT)
                    self.processes[identifier] = proc
                    self.update(identifier, state='running', stage='Leyendo audio', percent=1)
                failure = None
                for line in proc.stdout:
                    try:
                        message = json.loads(line)
                    except ValueError:
                        continue
                    with self.lock:
                        if self.jobs[identifier]['state'] == 'cancelled':
                            continue
                        if 'error' in message:
                            failure = str(message['error'])[:1200]
                        if 'stage' in message:
                            self.update(identifier, stage=str(message['stage'])[:300], percent=min(99, message.get('percent', 0)))
                code = proc.wait()
                proc.stdout.close()
            with self.lock:
                if self.jobs[identifier]['state'] == 'cancelled':
                    return
                if code or not (folder / 'output/Informe.json').is_file():
                    raise ValueError(failure or 'El análisis no pudo completarse. Tu audio y el proyecto están conservados.')
                current = self.store.load(job['projectId'])
                self.update(identifier, state='ready', stage='Análisis listo', percent=100,
                            needsReview=music_signature(current) != job['baseline'])
        except Exception as error:
            with self.lock:
                if self.jobs[identifier]['state'] != 'cancelled':
                    self.update(identifier, state='error', stage='No se pudo completar el análisis',
                                error=str(error) if isinstance(error, ValueError) else 'El motor local falló. Puedes reintentarlo con el audio conservado.')
        finally:
            with self.lock:
                self.processes.pop(identifier, None)
                if self.active == identifier:
                    self.active = None

    def apply(self, project_id, identifier, body):
        with self.lock:
            job = self.get(project_id, identifier)
            if job['state'] == 'complete':
                return self.store.load(project_id)
            if job['state'] != 'ready':
                raise Conflict('El análisis todavía no está listo para aplicar.')
            try:
                p = self.store.apply_analysis(project_id, self.root / identifier / 'output', job,
                                              body.get('expectedRevision'), body.get('force') is True)
            except Conflict:
                self.update(identifier, needsReview=True)
                raise
            except (ValueError, KeyError, FileNotFoundError) as error:
                self.update(identifier, state='error', stage='El resultado no pudo incorporarse; proyecto conservado', error=str(error))
                raise
            self.update(identifier, state='complete', stage='Resultados incorporados a la canción', appliedRevision=p['revision'])
            # The project now owns every deliverable; scratch output can go.
            shutil.rmtree(self.root / identifier / 'output', ignore_errors=True)
            return p

    def cancel(self, project_id, identifier):
        with self.lock:
            job = self.get(project_id, identifier)
            if job['state'] in {'complete', 'error', 'interrupted', 'cancelled'}:
                return self.public(job)
            self.update(identifier, state='cancelled', stage='Análisis cancelado; audio y proyecto conservados')
            proc = self.processes.get(identifier)
            if proc and proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
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
