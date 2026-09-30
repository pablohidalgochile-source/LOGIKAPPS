#!/usr/bin/env python3
"""Start one local instance, open Chrome and keep the server attached to Terminal."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
LIBRARY = Path(os.environ.get('SURCO_LIBRARY', str(ROOT / 'biblioteca'))).resolve()
BASE_PORT = 8765


def surco_at(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/status', timeout=1) as response:
            data = json.load(response)
            return data.get('directory') == str(LIBRARY) and bool(data.get('token'))
    except Exception:
        return False


def open_browser(url):
    chrome = Path('/Applications/Google Chrome.app')
    if chrome.exists():
        subprocess.run(['open', '-a', str(chrome), url], check=False)
    else:
        webbrowser.open(url)


def main():
    if sys.version_info < (3, 10):
        raise SystemExit('Surco necesita Python 3.10 o posterior. Consulta LEEME.md antes de abrirlo.')
    port = BASE_PORT
    for candidate in range(BASE_PORT, BASE_PORT + 10):
        if surco_at(candidate):
            open_browser(f'http://127.0.0.1:{candidate}')
            print('Surco ya estaba abierto. Puedes cerrar esta ventana.')
            return
    for candidate in range(BASE_PORT, BASE_PORT + 10):
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', candidate))
                port = candidate
                break
            except OSError:
                continue
    else:
        raise SystemExit('Los puertos locales están ocupados. Cierra una instancia anterior de Surco y vuelve a abrir.')
    process = subprocess.Popen([sys.executable, str(ROOT / 'server.py'), '--port', str(port)], cwd=ROOT)
    try:
        for _ in range(60):
            if process.poll() is not None:
                raise SystemExit('No se pudo iniciar Surco. Revisa el mensaje anterior.')
            if surco_at(port):
                open_browser(f'http://127.0.0.1:{port}')
                print('\nDeja esta ventana abierta mientras usas Surco. Para cerrar: Control + C.\n', flush=True)
                process.wait()
                return
            time.sleep(0.2)
        raise SystemExit('Surco tardó demasiado en iniciar.')
    except KeyboardInterrupt:
        print('\nCerrando Surco…')
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == '__main__':
    main()
