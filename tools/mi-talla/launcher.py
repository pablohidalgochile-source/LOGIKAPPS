#!/usr/bin/env python3
"""Loopback-only static launcher. Content comes from launcher-config.json."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json, os, sys, webbrowser

ROOT = Path(__file__).resolve().parent
config = json.loads((ROOT/'launcher-config.json').read_text())
directory = (ROOT/config.get('directory','.')).resolve()
assert directory == ROOT or ROOT in directory.parents
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(directory),**kwargs)
    def allowed(self):
        if self.headers.get('Host') not in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}:
            self.send_error(403); return False
        parts=Path(unquote(urlsplit(self.path).path)).parts
        if any(p.startswith('.') or p in {'node_modules','data','downloads'} for p in parts):
            self.send_error(404); return False
        return True
    def do_GET(self):
        if self.allowed(): super().do_GET()
    def do_HEAD(self):
        if self.allowed(): super().do_HEAD()
    def list_directory(self,path): self.send_error(404); return None
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        super().end_headers()

server=None
for port in range(config['port'],config['port']+10):
    try: server=ThreadingHTTPServer(('127.0.0.1',port),Handler);break
    except OSError: continue
if server is None: raise SystemExit('No hay un puerto disponible. Cierra otra copia de esta herramienta.')
url=f'http://127.0.0.1:{server.server_port}/'+config.get('page','index.html')
print(config['name']+' · '+url+'\nMantén Terminal abierto. Para terminar: Control+C.',flush=True)
if '--no-open' not in sys.argv: webbrowser.open(url)
try: server.serve_forever()
except KeyboardInterrupt: pass
finally: server.server_close()
