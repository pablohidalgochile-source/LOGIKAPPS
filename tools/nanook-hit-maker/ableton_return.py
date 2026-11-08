"""Read/review/merge Live captures. Musical edits happen only in Store.save."""
from copy import deepcopy
import json
from pathlib import Path
import time
from uuid import uuid4

from ableton import channel_parts, hash_json, sections_for
from store import atomic, Conflict, finite


def note_rows(notes, bpm=None):
    rows = []
    for n in notes:
        beat = n['start'] * bpm / 60 if bpm else n['beat']
        beats = n['duration'] * bpm / 60 if bpm else n['beats']
        velocity = max(1, min(127, round(n['amplitude'] * 127))) if bpm else n['velocity']
        if type(n['pitch']) is not int or not 0 <= n['pitch'] <= 127 or not finite(beat, 0, 7200) or not finite(beats, .000001, 7200) or not finite(velocity, 1, 127):
            raise ValueError('La captura contiene una nota fuera del intervalo permitido.')
        rows.append([n['pitch'], round(beat, 4), round(beats, 4), round(velocity)])
    return sorted(rows)


def section_rows(sections):
    rows = []
    if not isinstance(sections, list) or len(sections) > 200:
        raise ValueError('La estructura supera 200 secciones.')
    for s in sections:
        if not isinstance(s.get('name'), str) or not finite(s.get('beat'), 0, 7200) or not finite(s.get('beats'), .000001, 7200):
            raise ValueError('La estructura contiene tiempos inválidos.')
        rows.append([s['name'][:100], round(s['beat'], 4), round(s['beats'], 4)])
    rows.sort(key=lambda s:s[1])
    if any(a[1]+a[2] > b[1]+.0002 for a,b in zip(rows,rows[1:])):
        raise ValueError('Las secciones están superpuestas.')
    return rows


def differs(local, remote, base_local, base_remote):
    changed = remote != base_remote
    conflict = changed and local != base_local and local != remote
    return changed, conflict


def event_delta(local, remote):
    """Ignore Live's sub-tick storage rounding in the human-facing event counts."""
    i = j = removed = 0;added = []
    while i < len(local) and j < len(remote):
        a,b = local[i],remote[j]
        if a[0] == b[0] and a[3] == b[3] and abs(a[1]-b[1]) <= .00011 and abs(a[2]-b[2]) <= .00011:
            i += 1;j += 1
        elif a < b:removed += 1;i += 1
        else:added.append(b);j += 1
    removed += len(local)-i;added.extend(remote[j:])
    return added,removed


class AbletonReturn:
    def __init__(self, manager):
        self.manager = manager;self.store = manager.store;self.queue = manager.queue
        # Never replay a half-finished merge after a server restart.
        for file in self.queue.glob('*.json'):
            try:
                job = json.loads(file.read_text())
                if job.get('state') != 'applying':continue
                p = self.store.load(job['projectId'])
                receipt = next((r for r in p.get('ableton_returns', []) if r['id'] == job['id']), None)
                job.update(state='complete' if receipt else 'ready')
                if receipt:job['appliedRevision'] = receipt['revision']
                atomic(file, job)
            except (OSError, ValueError, KeyError):continue

    def read_job(self, project_id, identifier):
        from store import ID
        if not ID.fullmatch(identifier):raise ValueError('Lectura inválida.')
        job = json.loads((self.queue / (identifier + '.json')).read_text())
        if job['projectId'] != project_id or job['command'].get('action') != 'read':raise ValueError('La lectura pertenece a otra canción.')
        return job

    def start(self, project_id, body):
        m = self.manager
        with m.lock, self.store.lock:
            p = self.store.load(project_id);live = m.status()
            if p['revision'] != body.get('expectedRevision'):raise Conflict('Guarda o recarga el proyecto antes de leer Live.')
            if not live['connected'] or live.get('version', '0') < '0.5.0':
                raise Conflict('La lectura necesita el puente 0.5. Reinicia Live después de actualizar NanookHitMaker.')
            if body.get('targetSession') != live.get('session') or body.get('targetPath') != live.get('setPath'):
                raise Conflict('El Set o la conexión cambiaron. Actualiza la conexión.')
            if project_id not in live.get('bindings', []):raise Conflict('Este Set no está vinculado a esta canción. Envía primero desde NANOOK.')
            if live.get('playing') or live.get('recording'):raise Conflict('Detén Live antes de leer la canción.')
            m.require_idle()
            identifier = uuid4().hex
            job = {'id': identifier, 'projectId': project_id, 'state': 'queued', 'createdAt': time.time(),
                'expiresAt': time.time()+30, 'sourceRevision': p['revision'], 'setName': live.get('setName'),
                'targetPath': live.get('setPath'), 'command': {'format': 'nanook-live-read', 'version': 1,
                'action': 'read', 'projectId': project_id, 'targetPath': live.get('setPath'),
                'targetSession': live['session'], 'projectBpm': p['bpm']}}
            atomic(self.queue / (identifier+'.json'), job)
            return m.public(job)

    def baseline(self, p, capture):
        old = p.get('ableton_sync', {})
        binding = capture['binding']
        if old.get('setPath') == capture['setPath'] and old.get('bindingJobId') == binding['jobId']:
            return deepcopy(old)
        rev = binding['sourceRevision']
        try:
            common = p if rev == p['revision'] else json.loads((self.store.folder(p['id']) / 'history' / f'{rev:06}.json').read_text())
        except (OSError, ValueError):
            raise Conflict('Falta la revisión compartida con Live. Recupera un respaldo con su historial antes de recibir.')
        notes = {channel: {'projectHash': hash_json(note_rows(part['notes'], common['bpm'])),
                          'liveHash': binding.get('liveNoteHashes', {}).get(channel) or hash_json(note_rows(part['notes'], common['bpm'])),
                          'key': part['key'], 'name': part['name']}
                 for channel, part in channel_parts(common).items()}
        sections = section_rows(sections_for(common))
        return {'setPath': capture['setPath'], 'bindingJobId': binding['jobId'], 'notesBase': notes,
                'projectStructureHash': hash_json(sections), 'liveStructureBase':
                    {k:section_rows(v) for k,v in binding['liveStructures'].items()} if binding.get('liveStructures') else {'clips': sections, 'locators': sections}}

    def plan(self, p, capture):
        if abs(p['bpm']-capture['bpm']) > .001:raise Conflict('El tempo de NANOOK cambió desde la lectura. Iguala los BPM y vuelve a leer.')
        base = self.baseline(p, capture);parts = channel_parts(p);rows = [];native = {}
        if len(capture['parts']) > 24 or sum(len(part['notes']) for part in capture['parts']) > 100000:
            raise ValueError('La captura supera el límite de partes o notas.')
        for part in capture['parts']:
            channel = part['id']
            if channel not in base['notesBase'] and not part['notes']:continue  # retired linked track
            if channel in native or channel not in base['notesBase']:
                raise Conflict('Hay una pista MIDI vinculada desconocida o duplicada. Recibe únicamente las pistas enviadas desde NANOOK.')
            native[channel] = part
            before = base['notesBase'][channel];local = parts.get(channel)
            local_hash = hash_json(note_rows(local['notes'], p['bpm'])) if local else hash_json(None)
            remote_hash = hash_json(note_rows(part['notes']))
            changed, conflict = differs(local_hash, remote_hash, before['projectHash'], before['liveHash'])
            local_notes = note_rows(local['notes'], p['bpm']) if local else []
            remote_notes = note_rows(part['notes'])
            new_events,removed = event_delta(local_notes,remote_notes)
            rows.append({'id': channel, 'name': local['name'] if local else before['name'],
                'localCount': len(local_notes), 'liveCount': len(remote_notes), 'changed': changed, 'conflict': conflict,
                'localChanged': local_hash != before['projectHash'], 'localHash': local_hash, 'liveHash': remote_hash,
                'added': len(new_events) if changed else 0, 'removed': removed if changed else 0,
                'examples': new_events[:4] if changed else []})
        if not set(base['notesBase']).issubset(native):raise Conflict('Faltan pistas MIDI vinculadas; no se trataron como notas borradas.')
        candidates = {};local_sections = section_rows(sections_for(p));local_hash = hash_json(local_sections)
        for source in ('clips', 'locators'):
            try:
                remote = section_rows(capture['structures'][source])
                if any((s[1]+s[2])*60/p['bpm'] > 1800.001 for s in remote):raise ValueError('La estructura supera 30 minutos.')
                changed, conflict = differs(local_hash, hash_json(remote), base['projectStructureHash'], hash_json(base['liveStructureBase'][source]))
                candidates[source] = {'rows': remote, 'changed': changed, 'conflict': conflict}
            except ValueError as e:candidates[source] = {'error': str(e)}
        clips, locators = candidates['clips'], candidates['locators']
        if clips.get('error') or locators.get('error'):
            suggested = 'locators' if clips.get('error') and not locators.get('error') else 'clips' if not clips.get('error') else None
        elif clips['rows'] == locators['rows']:suggested = base.get('lastStructureSource', 'clips')
        elif clips['changed'] and locators['changed']:suggested = None
        elif locators['changed']:suggested = 'locators'
        elif clips['changed']:suggested = 'clips'
        else:suggested = base.get('lastStructureSource', 'clips')
        return {'revision': p['revision'], 'parts': rows, 'structures': candidates, 'suggestedSource': suggested,
                'warnings': capture.get('warnings', []), 'base': base, 'native': native, 'localStructureHash': local_hash,
                'audio': self.manager.audio.plan(p,capture)}

    def current(self, project_id):
        p = self.store.load(project_id)
        with self.manager.lock:
            jobs = [j for j in self.manager.jobs() if j['projectId'] == project_id and j['command'].get('action') == 'read']
            if not jobs:return None
            job = max(jobs, key=lambda j:j['createdAt']);result = self.manager.public(job)
            if job['state'] == 'ready':
                try:
                    plan = self.plan(p, job['returnData'])
                    result['preview'] = {k:v for k,v in plan.items() if k not in {'base', 'native', 'localStructureHash'}}
                except (ValueError, Conflict) as e:result['previewError'] = str(e)
            return result

    def verify(self, job):
        identifier = uuid4().hex;path = self.queue / (identifier+'.json')
        command = {**job['command'], 'action': 'verify-read', 'captureHash': job['returnData']['captureHash']}
        probe = {'id': identifier, 'projectId': job['projectId'], 'state': 'queued', 'createdAt': time.time(),
                 'expiresAt': time.time()+6, 'command': command}
        atomic(path, probe)
        deadline = time.monotonic()+8
        while time.monotonic() < deadline:
            state = json.loads(path.read_text())
            if state['state'] == 'complete':return
            if state['state'] in {'error', 'expired', 'interrupted'}:raise Conflict(state.get('error', 'No se confirmó la lectura.'))
            time.sleep(.1)
        raise Conflict('Live no confirmó que la vista previa siga vigente. Vuelve a leer antes de aplicar.')

    def apply(self, project_id, identifier, body):
        m = self.manager
        with m.lock:
            job = self.read_job(project_id, identifier);p = self.store.load(project_id)
            if any(r['id'] == identifier for r in p.get('ableton_returns', [])):return p
            if job['state'] != 'ready':raise Conflict('La lectura todavía no está lista para aplicar.')
            if p['revision'] != body.get('expectedRevision'):raise Conflict('El proyecto cambió. Recarga y revisa la lectura antes de aplicar.')
            notes, structure = body.get('notes') is True, body.get('structure') is True
            audio = body.get('audio') is True
            if not notes and not structure:raise ValueError('Elige notas, estructura o ambas.')
            plan = self.plan(p, job['returnData'])
            source = body.get('structureSource', 'auto')
            if source == 'auto':source = plan['suggestedSource']
            if structure and source not in {'clips', 'locators'}:raise Conflict('Los clips y los localizadores difieren. Elige qué estructura recibir.')
            candidate = plan['structures'].get(source, {})
            if structure and candidate.get('error'):raise ValueError(candidate['error'])
            conflicts = [r['name'] for r in plan['parts'] if notes and r['conflict']]
            if structure and candidate['conflict']:conflicts.append('Estructura')
            if audio:conflicts.extend('Audio: '+r['name'] for r in plan['audio']['rows'] if r['conflict'])
            if conflicts and body.get('resolveConflicts') != 'live':
                raise Conflict('Cambios en ambos lados: '+', '.join(conflicts)+'. Revisa y elige conservar la versión de Live para esas partes.')
            m.require_idle();job['state'] = 'applying';atomic(self.queue/(identifier+'.json'), job)
            try:
                self.verify(job)
                with self.store.lock:
                    # Optimistic check again after the read-only Live handshake.
                    fresh = self.store.load(project_id)
                    if fresh['revision'] != p['revision']:raise Conflict('NANOOK cambió durante la comprobación. Revisa otra vez antes de aplicar.')
                    parts = deepcopy(p['parts']);local_parts = channel_parts({'parts': parts});base = plan['base'];changed_notes = False
                    if notes:
                        for row in plan['parts']:
                            channel = row['id'];before = base['notesBase'][channel];part = local_parts.get(channel)
                            if row['changed']:
                                if part is None:
                                    part = {'key': before['key'], 'name': before['name'], 'notes': []};parts.append(part)
                                part['notes'] = [{'pitch': n['pitch'], 'start': n['beat']*60/p['bpm'],
                                    'duration': n['beats']*60/p['bpm'], 'amplitude': n['velocity']/127}
                                    for n in plan['native'][channel]['notes']]
                                part.update(source='ableton', reviewed=False);changed_notes = True
                            if part is not None:part['abletonChannel'] = channel
                            # Keep the common ancestor when NANOOK has unpublished local edits.
                            if row['changed'] or row['localHash'] == row['liveHash']:
                                before.update(projectHash=row['liveHash'], liveHash=row['liveHash'])
                    patch = {'parts': parts};duration = p['duration']
                    if structure:
                        if candidate['changed']:
                            patch['structure'] = [{'name': name, 'time': at*60/p['bpm'], 'start': at*60/p['bpm'],
                                'end': (at+length)*60/p['bpm'], 'bar': at/4+1, 'source': 'ableton'} for name,at,length in candidate['rows']]
                            patch['ableton_structure'] = True
                        if candidate['changed'] or plan['localStructureHash'] == hash_json(candidate['rows']):
                            base['projectStructureHash'] = hash_json(candidate['rows'])
                            base['liveStructureBase'][source] = candidate['rows']
                            for k,v in plan['structures'].items():
                                if v.get('rows') == candidate['rows']:base['liveStructureBase'][k] = candidate['rows']
                        base['lastStructureSource'] = source
                    for part in parts:
                        for n in part['notes']:duration = max(duration, n['start']+n['duration'])
                    for s in patch.get('structure', []):duration = max(duration, s['end'])
                    duration = max(duration, job['returnData']['lengthBeats']*60/p['bpm'])
                    patch['duration'] = duration
                    if changed_notes:patch['hits'] = None
                    base.pop('acceptedReadHash', None)
                    if notes and structure and not job['returnData'].get('audioChanged') and not plan['warnings'] and all(not r['localChanged'] or r['changed'] for r in plan['parts']) and plan['structures']['clips'].get('rows') == candidate['rows'] == plan['structures']['locators'].get('rows'):
                        base['acceptedReadHash'] = job['returnData']['snapshotHash']
                    base.update(lastReadId=identifier, capturedAt=job['finishedAt'])
                    patch['ableton_sync'] = base
                    receipt = {'id': identifier, 'revision': p['revision']+1, 'at': time.time(), 'setName': job['returnData']['setName'],
                        'setPath': job['returnData']['setPath'], 'captureHash': job['returnData']['captureHash'],
                        'notes': notes, 'structure': structure, 'structureSource': source if structure else None,
                        'resolvedConflicts': conflicts, 'warnings': plan['warnings']}
                    patch['ableton_returns'] = (p.get('ableton_returns', [])+[receipt])[-100:]
                    if job.get('automatic'):
                        receipt['automatic']=True
                        patch['sync_event']={'source':'Ableton · sincronización automática','revision':p['revision']+1,'at':time.time()}
                    prepared=None;stage=None
                    if audio:
                        remote={r['id']:plan['audio']['native'][r['id']] for r in plan['audio']['rows'] if r['changed']}
                        if remote:patch,prepared,stage=m.audio.prepare(p,patch,remote)
                    try:result = self.store.save(project_id, patch, p['revision'],prepared)
                    finally:
                        if stage:
                            import shutil
                            shutil.rmtree(stage,ignore_errors=True)
                    if audio:m.audio.accept(result,job['returnData'],plan['audio']['rows'])
                job.update(state='complete', appliedRevision=result['revision'], appliedAt=time.time())
                atomic(self.queue/(identifier+'.json'), job)
                return result
            except Exception:
                job['state'] = 'ready';atomic(self.queue/(identifier+'.json'), job);raise
