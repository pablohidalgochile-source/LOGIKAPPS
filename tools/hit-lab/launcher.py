#!/usr/bin/env python3
"""Serve this pack's static site on loopback only. Python 3.10+."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import urllib.parse
import webbrowser

APP_ID = 'hit-lab'
APP_NAME = 'DJ NANOOK Hit Lab'
ROOT = Path(__file__).resolve().parent / 'site'


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get('Host') not in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}:
            self.send_error(403, 'Acceso local solamente')
            return
        if urllib.parse.urlsplit(self.path).path == '/__health':
            data = json.dumps({'app': APP_ID, 'version': '0.1.0-beta', 'mode': 'static-local'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_HEAD(self):
        if self.headers.get('Host') not in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}:
            self.send_error(403, 'Acceso local solamente')
            return
        super().do_HEAD()

    def list_directory(self, _path):
        self.send_error(404, 'No hay una página en esta ubicación')
        return None

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()

    def log_message(self, *_args):
        pass


def main():
    if sys.version_info < (3, 10):
        raise SystemExit('Se necesita Python 3.10 o posterior.')
    parser = argparse.ArgumentParser(description=APP_NAME + ' · edición local')
    parser.add_argument('--no-browser', action='store_true', help='No abrir el navegador automáticamente')
    parser.add_argument('--port', type=int, default=0, help='Puerto local; 0 elige uno libre automáticamente')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('El puerto debe estar entre 0 y 65535.')
    if not (ROOT / 'index.html').is_file():
        raise SystemExit('Falta site/index.html. Descarga y extrae el pack completo.')
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT))) as server:
        url = f'http://127.0.0.1:{server.server_port}/'
        print(f'{APP_NAME} · {url}', flush=True)
        print('Mantén esta ventana abierta. Control+C cierra la app local.', flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nApp local cerrada.', flush=True)


if __name__ == '__main__':
    main()
