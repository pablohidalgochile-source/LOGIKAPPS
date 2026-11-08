"""Project storage and portable handoffs. Standard library only."""
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
import hashlib
import json
import math
import os
import re
import shutil
import tempfile
import threading
import zipfile
from uuid import uuid4

FORMAT = 'nanook-hit-maker-project'
MAX_JSON = 12 * 1024 * 1024
MAX_ARCHIVE = 2 * 1024**3
ID = re.compile(r'^[a-f0-9]{32}$')
ANALYSIS_FIELDS = ('parts', 'bpm', 'duration', 'key', 'structure', 'analysis', 'hits')


def music_signature(project):
    return hashlib.sha256(json.dumps({k: project.get(k) for k in ANALYSIS_FIELDS},
                                    sort_keys=True, allow_nan=False).encode()).hexdigest()


class Conflict(ValueError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def finite(x, low, high):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and low <= x <= high


def text(x, limit, label):
    if not isinstance(x, str) or len(x) > limit:
        raise ValueError(f'{label}: texto inválido o demasiado largo.')
    return x


def validate(p):
    if not isinstance(p, dict) or p.get('format') != FORMAT or p.get('version') != 1:
        raise ValueError('El archivo no es un proyecto NANOOK HIT MAKER versión 1.')
    if not ID.fullmatch(p.get('id', '')):
        raise ValueError('Identificador de proyecto inválido.')
    if not text(p.get('title'), 200, 'Título').strip():
        raise ValueError('Escribe un título para el proyecto.')
    if not finite(p.get('bpm'), 40, 240) or not finite(p.get('duration'), 0, 1800):
        raise ValueError('Tempo o duración fuera de rango (máximo 30 minutos).')
    if not isinstance(p.get('revision'), int) or p['revision'] < 1:
        raise ValueError('Revisión inválida.')
    for field in ['key', 'chords', 'idea', 'lyrics', 'style', 'exclude']:
        text(p.get(field, ''), 20000, field)
    parts = p.get('parts', [])
    if not isinstance(parts, list) or len(parts) > 24:
        raise ValueError('Demasiadas partes musicales.')
    count = 0
    for part in parts:
        if not isinstance(part, dict):
            raise ValueError('Parte musical inválida.')
        text(part.get('key'), 100, 'Parte')
        text(part.get('name'), 200, 'Instrumento')
        notes = part.get('notes')
        if not isinstance(notes, list):
            raise ValueError('Lista de notas inválida.')
        count += len(notes)
        if count > 100000:
            raise ValueError('El proyecto supera 100.000 notas.')
        for n in notes:
            if not isinstance(n, dict) or not all(finite(n.get(k), *r) for k, r in
                    [('start', (0, 1800)), ('duration', (.001, 1800)), ('pitch', (0, 127)), ('amplitude', (0, 1))]):
                raise ValueError('Hay notas fuera de rango.')
            if int(n['pitch']) != n['pitch'] or n['start'] + n['duration'] > p['duration'] + .05:
                raise ValueError('Una nota supera la duración del proyecto.')
    if not isinstance(p.get('assets', []), list) or len(p['assets']) > 100:
        raise ValueError('Lista de archivos inválida.')
    for a in p['assets']:
        if not isinstance(a, dict) or not ID.fullmatch(a.get('id', '')) or not re.fullmatch(r'[a-f0-9]{32}\.[a-z0-9]{1,8}', a.get('file', '')):
            raise ValueError('Archivo adjunto inválido.')
        text(a.get('name'), 250, 'Nombre de archivo')
        if not finite(a.get('size'), 0, MAX_ARCHIVE):
            raise ValueError('Tamaño de archivo inválido.')
    for field in ['imports', 'structure']:
        if not isinstance(p.get(field, []), list) or len(p[field]) > 200:
            raise ValueError('Estructura de proyecto inválida.')
    if len(json.dumps(p, allow_nan=False).encode()) > MAX_JSON:
        raise ValueError('El proyecto supera el tamaño de metadatos permitido.')
    if 'audio_tracks' in p:
        from audio_sync import validate_tracks
        validate_tracks(p['audio_tracks'], {a['id']: a for a in p['assets']})
    return p


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
    try:
        with tmp.open('w', encoding='utf-8') as f:
            json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def sha256_file(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as source:
        while chunk:=source.read(1024**2):digest.update(chunk)
    return digest.hexdigest()


def checked_archive(z):
    infos = z.infolist()
    if len(infos) > 2000 or sum(i.file_size for i in infos) > MAX_ARCHIVE:
        raise ValueError('El paquete supera 2 GB o contiene demasiados archivos.')
    names = set()
    for i in infos:
        name = i.filename
        p = PurePosixPath(name)
        if (name in names or '\\' in name or p.is_absolute() or '..' in p.parts
                or ':' in name or i.flag_bits & 1 or (i.external_attr >> 16) & 0o170000 == 0o120000):
            raise ValueError('El paquete contiene rutas o entradas no permitidas.')
        names.add(name)
    return infos


def read_json_entry(z, name):
    if z.getinfo(name).file_size > MAX_JSON:
        raise ValueError('Los metadatos del paquete son demasiado grandes.')
    return json.loads(z.read(name))


def contrapista_project(report, title):
    if not isinstance(report, dict) or not finite(report.get('bpm'), 40, 240) or not finite(report.get('duration_s'), .001, 1800):
        raise ValueError('Informe de Contrapista inválido.')
    tracks = [('bass', 'Bajo', report.get('notes', [])), ('drums', 'Batería candidata', report.get('drum_notes', [])),
              ('other', 'Acordes candidatos', report.get('chord_notes', []))]
    tracks += [('vocals' if 'voz' in str(k).lower() else 'other', str(k), v) for k, v in report.get('extra_midi', {}).items()]
    parts = []
    for key, name, notes in tracks:
        if notes:
            parts.append({'key': key, 'name': name, 'source': 'contrapista', 'reviewed': False,
                          'notes': [{'pitch': n['pitch'], 'start': n['start'], 'duration': n.get('duration', n.get('end', n['start']) - n['start']),
                                     'amplitude': n.get('velocity', 90) / 127} for n in notes]})
    return {'title': title, 'bpm': report['bpm'], 'duration': report['duration_s'], 'parts': parts,
            'key': report.get('key', {}).get('name', '') if isinstance(report.get('key'), dict) else str(report.get('key') or ''),
            'structure': report.get('sections', []),
            'imports': [{'module': 'Contrapista', 'at': now(), 'raw': report}], 'analysis': report}


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def folder(self, identifier):
        if not isinstance(identifier, str) or not ID.fullmatch(identifier):
            raise ValueError('Identificador inválido.')
        return self.root / identifier

    def load(self, identifier):
        with self.lock:
            return validate(json.loads((self.folder(identifier) / 'project.json').read_text()))

    def list(self):
        result = []
        with self.lock:
            for p in self.root.glob('*/project.json'):
                try:
                    x = self.load(p.parent.name)
                    result.append({k: x[k] for k in ['id', 'title', 'bpm', 'key', 'duration', 'revision', 'updatedAt']})
                except (ValueError, KeyError, OSError):
                    continue
        return sorted(result, key=lambda x: x['updatedAt'], reverse=True)

    def create(self, fields=None):
        with self.lock:
            identifier = uuid4().hex
            p = {'format': FORMAT, 'version': 1, 'id': identifier, 'revision': 1, 'title': 'Mi próxima canción',
                 'bpm': 120, 'duration': 0, 'key': '', 'chords': '', 'idea': '', 'lyrics': '', 'style': '',
                 'exclude': '', 'parts': [], 'assets': [], 'structure': [], 'imports': [], 'createdAt': now(), 'updatedAt': now()}
            if fields:
                p.update({k: v for k, v in fields.items() if k not in ['id', 'revision', 'createdAt', 'updatedAt', 'assets', 'format', 'version']})
            validate(p)
            atomic(self.folder(identifier) / 'project.json', p)
            return p

    def save(self, identifier, patch, expected, prepared=None):
        with self.lock:
            old = self.load(identifier)
            if expected != old['revision']:
                raise Conflict('Este proyecto cambió en otra pestaña. Recárgalo antes de guardar; tu edición sigue en pantalla.')
            p = deepcopy(old)
            protected = {'id', 'revision', 'createdAt', 'updatedAt', 'format', 'version', 'assets'}
            p.update({k: v for k, v in patch.items() if k not in protected})
            if prepared is not None:p['assets'] = deepcopy(prepared[0])
            p.update(revision=old['revision'] + 1, updatedAt=now())
            validate(p)
            moved=[]
            try:
                for source,a in (prepared[1] if prepared else []):
                    destination=self.folder(identifier)/'assets'/a['file'];destination.parent.mkdir(exist_ok=True)
                    if destination.exists():raise ValueError('La versión de audio ya existe; no se sobrescribió.')
                    shutil.copyfile(source,destination);moved.append(destination)
                    if sha256_file(destination)!=a['sha256']:raise ValueError('La muestra no coincide con su versión preparada.')
                atomic(self.folder(identifier) / 'history' / f"{old['revision']:06}.json", old)
                atomic(self.folder(identifier) / 'project.json', p)
            except Exception:
                for path in moved:path.unlink(missing_ok=True)
                raise
            return p

    def add_asset(self, identifier, source, name, mime='application/octet-stream', metadata=None, expected=None):
        with self.lock:
            old = self.load(identifier)
            if expected != old['revision']:
                raise Conflict('El proyecto cambió. Recárgalo antes de adjuntar el archivo.')
            token = uuid4().hex
            ext = Path(name).suffix.lower().lstrip('.')
            if not re.fullmatch('[a-z0-9]{1,8}', ext):
                ext = 'bin'
            filename = token + '.' + ext
            dest = self.folder(identifier) / 'assets' / filename
            dest.parent.mkdir(exist_ok=True)
            digest = hashlib.sha256()
            with Path(source).open('rb') as src, dest.open('wb') as out:
                while chunk := src.read(1024 * 1024):
                    digest.update(chunk)
                    out.write(chunk)
            a = {'id': token, 'file': filename, 'name': Path(name).name[:250], 'size': dest.stat().st_size,
                 'mime': mime, 'sha256': digest.hexdigest(), **(metadata or {})}
            old['assets'].append(a)
            # Asset mutation has its own atomic revision, with the same conflict discipline.
            previous = self.load(identifier)
            old.update(revision=previous['revision'] + 1, updatedAt=now())
            try:
                validate(old)
                atomic(self.folder(identifier) / 'history' / f"{previous['revision']:06}.json", previous)
                atomic(self.folder(identifier) / 'project.json', old)
            except Exception:
                dest.unlink(missing_ok=True)
                raise
            return old

    def history(self, identifier):
        with self.lock:
            current = self.load(identifier)
            versions = [json.loads(p.read_text()) for p in sorted((self.folder(identifier) / 'history').glob('*.json'))]
            versions.append(current)
            return [{'revision': p['revision'], 'title': p['title'], 'updatedAt': p['updatedAt'],
                     'source':p.get('sync_event',{}).get('source') if p.get('sync_event',{}).get('revision')==p['revision'] else None} for p in reversed(versions)]

    def revert(self, identifier, revision, expected):
        with self.lock:
            if not isinstance(revision, int) or revision < 1:
                raise ValueError('Revisión inválida.')
            past = validate(json.loads((self.folder(identifier) / 'history' / f'{revision:06}.json').read_text()))
            if 'audio_tracks' not in past:
                current=self.load(identifier)
                if 'audio_tracks' in current:
                    past['audio_tracks']=current['audio_tracks']
                    needed={c['assetId'] for t in current['audio_tracks'] for c in t['clips']}|{t['previewAssetId'] for t in current['audio_tracks'] if t.get('previewAssetId')}
                    present={a['id'] for a in past['assets']}
                    past['assets'] += [a for a in current['assets'] if a['id'] in needed and a['id'] not in present]
            past['sync_event']={'source':f'Historial · recuperación de revisión {revision}','revision':self.load(identifier)['revision']+1}
            return self.save(identifier, past, expected, (past['assets'], []))

    def backup(self, identifier, destination):
        with self.lock:
            folder = self.folder(identifier)
            self.load(identifier)
            with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as z:
                for path in sorted(folder.rglob('*')):
                    if path.is_file():
                        z.write(path, path.relative_to(folder).as_posix())

    def restore(self, source):
        with self.lock, zipfile.ZipFile(source) as z:
            infos = checked_archive(z)
            project = validate(read_json_entry(z, 'project.json'))
            original_id = project['id']
            revisions = {i.filename: validate(read_json_entry(z, i.filename)) for i in infos
                         if re.fullmatch(r'history/[0-9]{6}\.json', i.filename)}
            all_assets = {a['file']: a for p in [project, *revisions.values()] for a in p['assets']}
            allowed = {'project.json', *revisions.keys(), *('assets/' + n for n in all_assets)}
            if any(not i.is_dir() and i.filename not in allowed for i in infos):
                raise ValueError('El respaldo contiene archivos ajenos al formato de proyecto.')
            identifier = uuid4().hex
            with tempfile.TemporaryDirectory(dir=self.root) as tmp:
                stage = Path(tmp)
                for filename, a in all_assets.items():
                    member = 'assets/' + filename
                    if z.getinfo(member).file_size != a['size']:
                        raise ValueError('El tamaño de un archivo no coincide con el respaldo.')
                    dst = stage / member
                    dst.parent.mkdir(exist_ok=True)
                    digest = hashlib.sha256()
                    with z.open(member) as src, dst.open('wb') as out:
                        while chunk := src.read(1024 * 1024):
                            digest.update(chunk); out.write(chunk)
                    if digest.hexdigest() != a.get('sha256'):
                        raise ValueError('La integridad de un archivo no coincide con el respaldo.')
                for name, p in {'project.json': project, **revisions}.items():
                    p['restoredFrom'] = original_id
                    p['id'] = identifier
                    if name == 'project.json':
                        p['updatedAt'] = now()
                    atomic(stage / name, p)
                shutil.move(str(stage), self.folder(identifier))
            return self.load(identifier)

    def import_contrapista(self, source, title='Reconstrucción de Contrapista'):
        with self.lock, zipfile.ZipFile(source) as z:
            checked_archive(z)
            report = read_json_entry(z, 'Informe.json')
            fields = contrapista_project(report, title)
            # Validate all musical data before creating any project.
            probe = {'format': FORMAT, 'version': 1, 'id': uuid4().hex, 'revision': 1, 'assets': [], **fields}
            validate(probe)
            p = self.create(fields)
            try:
                for name in dict.fromkeys(report.get('audio_files', {}).values()):
                    member = 'Samples/' + name
                    if member not in z.namelist():
                        raise ValueError('Falta un stem citado en Informe.json.')
                    with tempfile.NamedTemporaryFile() as tmp:
                        with z.open(member) as src:
                            shutil.copyfileobj(src, tmp)
                        tmp.flush()
                        p = self.add_asset(p['id'], tmp.name, name, 'audio/wav', {'role': 'contrapista'}, p['revision'])
                p = self.add_asset(p['id'], source, 'Contrapista.zip', 'application/zip', {'role': 'ableton-original'}, p['revision'])
                return p
            except Exception:
                shutil.rmtree(self.folder(p['id']), ignore_errors=True)
                raise

    def apply_analysis(self, identifier, output, job, expected, force=False):
        """Attach one completed worker result in a single project revision.

        Files from older analyses remain available to the history and backups.
        Metadata edited during inference is merged into the current project.
        """
        with self.lock:
            current = self.load(identifier)
            if any(i.get('jobId') == job['id'] for i in current['imports']):
                return current
            if current['revision'] != expected:
                raise Conflict('El proyecto cambió. Guarda o recarga antes de aplicar el análisis.')
            if not force and music_signature(current) != job['baseline']:
                raise Conflict('La música cambió durante el análisis. El resultado está guardado; puedes aplicarlo conservando una versión de tus cambios.')
            output = Path(output).resolve()
            report = json.loads((output / 'Informe.json').read_text())
            fields = contrapista_project(report, current['title'])
            paths = [(str(Path('Samples') / name), name, 'audio/wav', 'analysis-stem')
                     for name in dict.fromkeys(report.get('audio_files', {}).values())]
            if (output / 'B - Reconstruccion.wav').is_file():
                paths.append(('B - Reconstruccion.wav', 'B - Reconstrucción.wav', 'audio/wav', 'analysis-reconstruction'))
            paths.append(('Contrapista.zip', 'Contrapista.zip', 'application/zip', 'ableton-original'))
            candidate = deepcopy(current)
            for key in ('parts', 'bpm', 'duration', 'key', 'structure', 'analysis'):
                candidate[key] = fields[key]
            candidate.pop('hits', None)
            candidate['analysis_run'] = {'id': job['id'], 'sourceAsset': job['assetId'], 'quality': job['quality'],
                                         'source': job['source'], 'engineVersion': '0.3', 'completedAt': now()}
            candidate['imports'].append({'module': 'Contrapista integrado', 'jobId': job['id'], 'at': now(), 'raw': report})
            prepared = []
            for relative, name, mime, role in paths:
                source = (output / relative).resolve()
                if not source.is_relative_to(output) or not source.is_file():
                    raise ValueError('El motor no entregó todos los archivos del análisis.')
                token = uuid4().hex
                filename = token + source.suffix.lower()
                a = {'id': token, 'file': filename, 'name': name, 'mime': mime, 'role': role,
                     'jobId': job['id'], 'size': source.stat().st_size, 'duration': report['duration_s']}
                prepared.append((source, a))
                candidate['assets'].append(a)
            candidate.update(revision=current['revision'] + 1, updatedAt=now())
            validate(candidate)
            # Stage all copies outside the project before exposing any result.
            with tempfile.TemporaryDirectory(dir=self.root) as stage:
                stage = Path(stage)
                for source, a in prepared:
                    digest = hashlib.sha256()
                    with source.open('rb') as src, (stage / a['file']).open('wb') as dst:
                        while chunk := src.read(1024 * 1024):
                            digest.update(chunk); dst.write(chunk)
                    a['sha256'] = digest.hexdigest()
                folder = self.folder(identifier)
                (folder / 'assets').mkdir(exist_ok=True)
                moved = []
                try:
                    for _, a in prepared:
                        destination = folder / 'assets' / a['file']
                        (stage / a['file']).replace(destination)
                        moved.append(destination)
                    atomic(folder / 'history' / f"{current['revision']:06}.json", current)
                    atomic(folder / 'project.json', candidate)
                except Exception:
                    for path in moved:
                        path.unlink(missing_ok=True)
                    raise
            return candidate
