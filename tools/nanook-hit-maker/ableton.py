"""NANOOK → Live: explicit transfers over a durable local file queue."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import shutil
import threading
import time
from uuid import uuid4

from store import atomic, Conflict, ID, finite

ROOT = Path(__file__).resolve().parent
LIBRARY = Path.home() / 'Music/Ableton/User Library'


def hash_json(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, allow_nan=False).encode()).hexdigest()


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        while chunk := f.read(1024 * 1024):digest.update(chunk)
    return digest.hexdigest()


def sections_for(p):
    seconds = []
    for s in p['structure']:
        start = s.get('time', s.get('start')) if isinstance(s, dict) else None
        if not finite(start, 0, p['duration']) and isinstance(s, dict) and finite(s.get('bar'), 1, 10000):
            start = (s['bar'] - 1) * 4 * 60 / p['bpm']
        if finite(start, 0, max(0, p['duration'] - .001)):
            seconds.append((round(start, 6), (str(s.get('name') or s.get('label') or 'Sección')[:100], s.get('end'))))
    seconds = sorted(dict(seconds).items())
    if (not seconds or seconds[0][0] > .001) and not p.get('ableton_structure'):
        seconds.insert(0, (0, ('Inicio', None)))
    output = []
    for i, (start, (name, end)) in enumerate(seconds):
        next_start = seconds[i+1][0] if i+1 < len(seconds) else p['duration']
        end = min(end, next_start) if finite(end, start + .000001, p['duration']) else next_start
        output.append({'name': name, 'beat': start * p['bpm'] / 60, 'beats': (end-start) * p['bpm'] / 60})
    return output


def channel_parts(p):
    """Stable identities, including an emptied part returned from Live."""
    found = {};seen = {}
    for part in p['parts']:
        if not part['notes'] and not part.get('abletonChannel'):continue
        occurrence = seen.get(part['key'], 0);seen[part['key']] = occurrence + 1
        channel = part.get('abletonChannel') or 'm-' + hash_json([part['key'], occurrence])[:12]
        if not re.fullmatch('m-[a-f0-9]{12}', channel) or channel in found:
            raise ValueError('La identidad de una parte vinculada es inválida o está duplicada.')
        found[channel] = part
    return found


class AbletonManager:
    def __init__(self, store):
        self.store = store
        self.root = store.root.parent / 'ableton'
        self.queue = self.root / 'queue';self.queue.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        from audio_sync import AudioSync
        self.audio = AudioSync(self)
        from ableton_return import AbletonReturn
        self.returns = AbletonReturn(self)
        from ableton_auto import AbletonAuto
        self.auto = AbletonAuto(self)

    def status(self):
        try:
            state = json.loads((self.root / 'heartbeat.json').read_text())
        except (OSError, ValueError):
            state = {}
        state['connected'] = 0 <= time.time() - state.get('timestamp', 0) < 7
        state['installed'] = (LIBRARY / 'Remote Scripts/NanookHitMaker/config.json').is_file()
        return state

    def public(self, job):
        return {k: deepcopy(v) for k, v in job.items() if k not in {'command', 'cueActions', 'returnData'}}

    def jobs(self):
        jobs = [];state = self.status()
        for f in self.queue.glob('*.json'):
            try:
                j = json.loads(f.read_text())
                if j['state'] == 'queued' and time.time() > j['expiresAt']:
                    j.update(state='expired', error='Live no recibió la solicitud a tiempo. Vuelve a intentarlo.');atomic(f, j)
                if j['state'] in {'running', 'locators', 'verifying', 'verifying-sync'} and state.get('connected') and state.get('session') != j['command']['targetSession']:
                    j.update(state='interrupted', error='Live se reinició durante la operación. Revisa el Set antes de reintentar.');atomic(f, j)
                jobs.append(j)
            except (KeyError, ValueError, OSError):continue
        return jobs

    def require_idle(self):
        if any(j['state'] in {'queued', 'running', 'locators', 'verifying', 'verifying-sync', 'applying'} for j in self.jobs()):
            raise Conflict('Hay una operación pendiente con Live. Espera su resultado antes de iniciar otra.')

    def current(self, project_id):
        self.store.load(project_id)
        with self.lock:
            jobs = [j for j in self.jobs() if j['projectId'] == project_id and not j['command'].get('action')]
            return self.public(max(jobs, key=lambda j: j['createdAt'])) if jobs else None

    def preview(self, project_id):
        p = self.store.load(project_id)
        latest = p.get('analysis_run', {}).get('id')
        audio = []
        for a in p['assets']:
            if not a['mime'].startswith('audio/'):continue
            default = a.get('role') == 'analysis-stem' and (not latest or a.get('jobId') == latest) and not a['name'].startswith(('A -', 'Bajo sintetizado'))
            audio.append({'id': a['id'], 'name': a['name'], 'role': a.get('role', ''), 'default': default})
        if audio and not any(a['default'] for a in audio):
            audio[0]['default'] = True
        return {'revision': p['revision'], 'bpm': p['bpm'], 'duration': p['duration'],
                'notes': sum(len(x['notes']) for x in p['parts']),
                'parts': [{'name': x['name'], 'notes': len(x['notes'])} for x in p['parts']],
                'sections': sections_for(p) if p['duration'] > 0 else [], 'audio': audio}

    def start(self, project_id, body):
        with self.lock, self.store.lock:
            p = self.store.load(project_id)
            if body.get('expectedRevision') != p['revision']:
                raise Conflict('El proyecto cambió. Guarda o recarga antes de enviar a Live.')
            state = self.status()
            if not state['connected']:
                raise Conflict('Ableton no está conectado. Activa NanookHitMaker en sus superficies de control.')
            if state.get('session') != body.get('targetSession') or state.get('setPath') != body.get('targetPath'):
                raise Conflict('Cambió el Set de destino. Revisa la conexión antes de enviar.')
            if state.get('playing') or state.get('recording'):
                raise Conflict('Detén Live antes de enviar o actualizar la canción.')
            target = Path(state.get('setPath') or '')
            if not target.is_absolute() or target.suffix.lower() != '.als' or not target.is_file():
                raise ValueError('Guarda el Set de Ableton una vez antes de enviar. Las muestras quedarán en su carpeta Samples/NANOOK.')
            if p['duration'] <= 0:
                raise ValueError('Añade notas o analiza una canción antes de enviar.')
            self.current(project_id)
            self.require_idle()
            selected = body.get('assetIds', [])
            if not isinstance(selected, list) or len(selected) != len(set(selected)):
                raise ValueError('Selecciona los audios que quieres enviar.')
            assets = {a['id']: a for a in p['assets'] if a['mime'].startswith('audio/')}
            if any(x not in assets for x in selected):
                raise ValueError('El audio seleccionado no pertenece a esta canción.')
            folder = target.resolve().parent / 'Samples/NANOOK' / project_id
            tracks = []
            for identity, part in channel_parts(p).items():
                tracks.append({'id': identity, 'name': part['name'] + ' · MIDI', 'kind': 'midi', 'muted': bool(selected),
                               'notes': [{'pitch': n['pitch'], 'beat': n['start'] * p['bpm'] / 60,
                                          'beats': n['duration'] * p['bpm'] / 60,
                                          'velocity': max(1, min(127, round(n['amplitude'] * 127)))} for n in part['notes']]})
            # Copy immutable media into the actual Ableton project, never link to scratch analysis output.
            seen_audio = {}
            for asset_id in selected:
                a = assets[asset_id]
                src = self.store.folder(project_id) / 'assets' / a['file']
                if not src.is_file() or file_hash(src) != a['sha256']:
                    raise ValueError('Falta una muestra o no coincide su integridad. Restaura el respaldo antes de enviar.')
                dst = folder / (a['sha256'] + src.suffix)
                dst.parent.mkdir(parents=True, exist_ok=True)
                if not dst.is_file() or dst.stat().st_size != a['size'] or file_hash(dst) != a['sha256']:
                    temp = dst.with_suffix('.copying');shutil.copyfile(src, temp);temp.replace(dst)
                ordinal = seen_audio.get(a['name'], 0);seen_audio[a['name']] = ordinal + 1
                tracks.append({'id': 'a-' + hash_json([a['name'], ordinal])[:12], 'name': a['name'],
                               'kind': 'audio', 'file': str(dst), 'muted': a.get('role') in {'reference', 'analysis-reconstruction'} or a['name'].startswith(('A -', 'Bajo sintetizado'))})
            sections = sections_for(p)
            tracks.append({'id': 'structure', 'name': 'Estructura · ' + p['title'], 'kind': 'structure', 'muted': True})
            identifier = uuid4().hex
            source_hash = hash_json({'bpm': p['bpm'], 'tracks': tracks, 'sections': sections})
            command = {'format': 'nanook-live-transfer', 'version': 1, 'jobId': identifier, 'projectId': project_id,
                       'sourceRevision': p['revision'], 'sourceHash': source_hash, 'targetPath': str(target),
                       'targetSession': state['session'], 'setTempo': body.get('setTempo') is True,
                       'replaceLive': body.get('replaceLive') is True, 'bpm': p['bpm'], 'lengthBeats': p['duration'] * p['bpm'] / 60,
                       'tracks': tracks, 'sections': sections}
            sync = p.get('ableton_sync', {})
            if sync.get('setPath') == str(target):command['acceptedReadHash'] = sync.get('acceptedReadHash')
            job = {'id': identifier, 'projectId': project_id, 'sourceRevision': p['revision'], 'state': 'queued',
                   'createdAt': time.time(), 'expiresAt': time.time() + 30, 'setName': state.get('setName'),
                   'targetPath': str(target), 'sourceHash': source_hash, 'command': command}
            atomic(self.queue / (identifier + '.json'), job)
            return self.public(job)
