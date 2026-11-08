"""NANOOK HIT MAKER: local workspace with explicitly requested MAGIC proposals."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
from urllib.parse import parse_qs, unquote, urlsplit
import webbrowser
import zipfile

from store import Store, Conflict, MAX_JSON
from analysis import AnalysisManager
from magic import MagicManager, musical_context
from ableton import AbletonManager

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
HANDOFFS = ROOT.parent.parent / 'logikapps-continuidad/apps/nanuk-hit-maker/handoffs'


class Handler(BaseHTTPRequestHandler):
    def authorized(self, mutation=False):
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in allowed:
            return False
        origin = self.headers.get('Origin')
        return not mutation or (self.headers.get('X-Nanook') == '1' and
                                (origin is None or origin in {'http://' + h for h in allowed}))

    def reply(self, status, obj):
        raw = json.dumps(obj, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def file(self, path, mime=None, download=None):
        if not path.is_file():
            raise FileNotFoundError()
        size = path.stat().st_size
        start, end, status = 0, size - 1, 200
        header = self.headers.get('Range')
        if header:
            m = re.fullmatch(r'bytes=(\d*)-(\d*)', header)
            if not m or not (m[1] or m[2]):
                self.send_error(416); return
            start = int(m[1]) if m[1] else max(0, size - int(m[2]))
            end = min(size - 1, int(m[2])) if m[1] and m[2] else size - 1
            if not 0 <= start <= end < size:
                self.send_error(416); return
            status = 206
        self.send_response(status)
        self.send_header('Content-Type', mime or mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(max(0, end - start + 1)))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        if download:
            self.send_header('Content-Disposition', f'attachment; filename="{download}"')
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        with path.open('rb') as src:
            src.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = src.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= MAX_JSON:
            raise ValueError('Solicitud JSON demasiado grande o vacía.')
        data = json.loads(self.rfile.read(length))
        if not isinstance(data, dict):
            raise ValueError('Se esperaba un objeto JSON.')
        return data

    def receive(self, maximum):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= maximum:
            raise ValueError('El archivo está vacío o supera el límite permitido.')
        tmp = tempfile.NamedTemporaryFile(dir=self.server.temp_dir, delete=False)
        try:
            remaining = length
            while remaining:
                chunk = self.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError('La transferencia se interrumpió.')
                tmp.write(chunk); remaining -= len(chunk)
            tmp.close()
            return Path(tmp.name)
        except Exception:
            tmp.close(); Path(tmp.name).unlink(missing_ok=True); raise

    def handle_error(self, error):
        if isinstance(error, (BrokenPipeError, ConnectionResetError)):
            return
        if isinstance(error, Conflict):
            self.reply(409, {'error': str(error)})
        elif isinstance(error, FileNotFoundError):
            self.reply(404, {'error': 'No encontré ese proyecto o archivo.'})
        elif isinstance(error, (ValueError, KeyError, TypeError, zipfile.BadZipFile)):
            self.reply(400, {'error': str(error) if isinstance(error, ValueError) else 'El archivo no tiene el formato esperado.'})
        else:
            print(f'Error local: {error!r}', flush=True)
            self.reply(500, {'error': 'No se pudo completar la operación. Revisa la terminal; tus proyectos se conservan.'})

    def do_GET(self):
        if not self.authorized():
            self.reply(403, {'error': 'Acceso local no permitido.'}); return
        try:
            path = unquote(urlsplit(self.path).path)
            if path == '/api/projects':
                self.reply(200, self.server.store.list()); return
            if path == '/api/analysis/capabilities':
                self.reply(200, self.server.analysis.capabilities()); return
            if path == '/api/magic/capabilities':
                self.reply(200, self.server.magic.capabilities()); return
            if path == '/api/ableton/status':
                self.reply(200, self.server.ableton.status()); return
            if path == '/api/modules':
                modules = []
                for key, label, link in [('javita', 'JAVITA', 'https://nanook-score-studio.nanook.chatgpt.site'),
                                         ('magic-music-prompt', 'MAGIC MUSIC PROMPT', 'https://nanook-suno-bridge.nanook.chatgpt.site'),
                                         ('contrapista', 'Contrapista', 'http://127.0.0.1:8765/')]:
                    p = HANDOFFS / (key + '.json')
                    modules.append({'id': key, 'label': label, 'handoff': p.is_file(), 'url': link, 'integrated': key in {'contrapista', 'magic-music-prompt'}})
                self.reply(200, modules); return
            match = re.fullmatch(r'/api/projects/([a-f0-9]{32})(?:/(.*))?', path)
            if match:
                identifier, action = match.groups()
                store = self.server.store
                if action is None:
                    self.reply(200, store.load(identifier)); return
                if action == 'history':
                    self.reply(200, store.history(identifier)); return
                if action == 'analysis':
                    self.reply(200, self.server.analysis.current(identifier)); return
                if action == 'magic':
                    self.reply(200, self.server.magic.current(identifier)); return
                if action == 'magic-context':
                    self.reply(200, musical_context(store.load(identifier))); return
                if action == 'ableton':
                    self.reply(200, self.server.ableton.current(identifier)); return
                if action == 'ableton-preview':
                    self.reply(200, self.server.ableton.preview(identifier)); return
                if action == 'ableton-return':
                    self.reply(200, self.server.ableton.returns.current(identifier)); return
                if action == 'ableton-auto':
                    self.reply(200, self.server.ableton.auto.status(identifier)); return
                if action == 'backup':
                    with tempfile.NamedTemporaryFile(suffix='.zip', dir=self.server.temp_dir) as tmp:
                        store.backup(identifier, tmp.name)
                        self.file(Path(tmp.name), 'application/zip', 'NANOOK-proyecto.zip')
                    return
                asset = re.fullmatch(r'assets/([a-f0-9]{32})', action)
                if asset:
                    p = store.load(identifier)
                    a = next((x for x in p['assets'] if x['id'] == asset[1]), None)
                    if not a:
                        raise FileNotFoundError()
                    self.file(store.folder(identifier) / 'assets' / a['file'], a['mime'])
                    return
            rel = path.lstrip('/') or 'index.html'
            target = (PUBLIC / rel).resolve()
            if not target.is_relative_to(PUBLIC.resolve()):
                raise FileNotFoundError()
            self.file(target)
        except Exception as error:
            self.handle_error(error)

    def do_POST(self):
        if not self.authorized(mutation=True):
            self.reply(403, {'error': 'Solicitud local no permitida.'}); return
        upload = None
        try:
            url = urlsplit(self.path)
            path = url.path
            query = parse_qs(url.query)
            store = self.server.store
            if path == '/api/projects':
                body = self.read_json()
                self.reply(201, store.create({'title': body.get('title', 'Mi próxima canción')})); return
            if path == '/api/ableton/open':
                self.read_json()
                subprocess.run(['open', '-a', '/Applications/Ableton Live 12 Suite.app'], check=True)
                self.reply(200, {'opened': True}); return
            if path in ['/api/restore', '/api/import/contrapista']:
                upload = self.receive(2 * 1024**3)
                result = store.restore(upload) if path == '/api/restore' else store.import_contrapista(upload, query.get('title', ['Reconstrucción de Contrapista'])[0])
                self.reply(201, result); return
            match = re.fullmatch(r'/api/projects/([a-f0-9]{32})(?:/(.*))?', path)
            if not match:
                self.reply(404, {'error': 'Ruta no disponible.'}); return
            identifier, action = match.groups()
            if action is None:
                body = self.read_json()
                self.reply(200, store.save(identifier, body.get('project', {}), body.get('expectedRevision'))); return
            if action == 'revert':
                body = self.read_json()
                self.reply(200, store.revert(identifier, body.get('revision'), body.get('expectedRevision'))); return
            if action == 'analysis':
                self.reply(202, self.server.analysis.start(identifier, self.read_json())); return
            if action == 'magic':
                self.reply(202, self.server.magic.start(identifier, self.read_json())); return
            if action == 'ableton':
                self.reply(202, self.server.ableton.start(identifier, self.read_json())); return
            if action == 'ableton-return':
                self.reply(202, self.server.ableton.returns.start(identifier, self.read_json())); return
            if action == 'ableton-auto':
                self.reply(200, self.server.ableton.auto.configure(identifier,self.read_json())); return
            if action == 'ableton-auto/editor':
                self.reply(200, self.server.ableton.auto.editor(identifier,self.read_json())); return
            if action == 'ableton-auto/save':
                self.reply(200, self.server.ableton.auto.save_editor(identifier,self.read_json())); return
            if action == 'ableton-auto/resolve':
                self.reply(200, self.server.ableton.auto.resolve(identifier,self.read_json())); return
            live_read = re.fullmatch(r'ableton-return/([a-f0-9]{32})/apply', action or '')
            if live_read:
                self.reply(200, self.server.ableton.returns.apply(identifier, live_read[1], self.read_json())); return
            magic_job = re.fullmatch(r'magic/([a-f0-9]{32})/(apply|cancel)', action or '')
            if magic_job:
                body = self.read_json()
                result = (self.server.magic.apply(identifier, magic_job[1], body) if magic_job[2] == 'apply'
                          else self.server.magic.cancel(identifier, magic_job[1]))
                self.reply(200, result); return
            job = re.fullmatch(r'analysis/([a-f0-9]{32})/(apply|cancel)', action or '')
            if job:
                body = self.read_json()
                result = (self.server.analysis.apply(identifier, job[1], body) if job[2] == 'apply'
                          else self.server.analysis.cancel(identifier, job[1]))
                self.reply(200, result); return
            if action == 'assets':
                expected = int(query.get('revision', ['0'])[0])
                current = store.load(identifier)
                if current['revision'] != expected:
                    raise Conflict('El proyecto cambió. Recárgalo antes de adjuntar audio.')
                name = query.get('name', ['audio.wav'])[0]
                if Path(name).suffix.lower() not in ['.wav', '.aif', '.aiff', '.flac', '.mp3', '.m4a', '.aac', '.ogg']:
                    raise ValueError('Selecciona un archivo de audio compatible.')
                upload = self.receive(1024**3)
                probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,sample_rate,channels', '-of', 'json', str(upload)],
                                       capture_output=True, text=True, timeout=45)
                if probe.returncode:
                    raise ValueError('No pude leer ese archivo como audio.')
                info = json.loads(probe.stdout)
                duration = float(info.get('format', {}).get('duration', 'nan'))
                if not 1 <= duration <= 1800 or not any(s.get('codec_type') == 'audio' for s in info.get('streams', [])):
                    raise ValueError('El audio debe durar entre 1 segundo y 30 minutos.')
                self.reply(201, store.add_asset(identifier, upload, name, mimetypes.guess_type(name)[0] or 'audio/wav',
                                              {'role': 'reference', 'duration': duration}, expected)); return
            self.reply(404, {'error': 'Ruta no disponible.'})
        except Exception as error:
            self.handle_error(error)
        finally:
            if upload:
                upload.unlink(missing_ok=True)


class WorkspaceServer(ThreadingHTTPServer):
    def server_close(self):
        if hasattr(self,'ableton'):self.ableton.auto.close()
        if hasattr(self, 'analysis'):
            self.analysis.close()
        if hasattr(self, 'magic'):
            self.magic.close()
        super().server_close()


def make_server(port=8771, data=None):
    server = WorkspaceServer(('127.0.0.1', port), Handler)
    server.store = Store(data or ROOT / 'data/projects')
    server.temp_dir = server.store.root.parent / 'tmp'
    server.temp_dir.mkdir(parents=True, exist_ok=True)
    server.analysis = AnalysisManager(server.store)
    server.magic = MagicManager(server.store)
    server.ableton = AbletonManager(server.store)
    server.ableton.auto.start_worker()
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8771)
    parser.add_argument('--data', type=Path)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    def stop_server(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, stop_server)
    server = make_server(args.port, args.data)
    print(f'NANOOK HIT MAKER · http://127.0.0.1:{server.server_port}/', flush=True)
    if not args.no_browser:
        webbrowser.open(f'http://127.0.0.1:{server.server_port}/')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
