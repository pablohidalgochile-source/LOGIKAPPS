#!/usr/bin/env python3
"""Verify the allowlisted pack after copying it outside this repository."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent


def main():
    files = json.loads((ROOT / 'public-files.json').read_text())
    assert isinstance(files, list) and len(files) == len(set(files))
    assert all(not Path(name).is_absolute() and '..' not in Path(name).parts for name in files)
    assert not any(part in {'node_modules', '.git', '.env', '__pycache__', '.venv', '.wrangler', '.openai'} for name in files for part in Path(name).parts)
    assert not any(name.endswith('.map') for name in files)
    with tempfile.TemporaryDirectory(prefix='logikapps-static-pack-') as temp:
        copied = Path(temp)
        for name in files:
            source = ROOT / name
            assert source.is_file() and not source.is_symlink(), name
            out = copied / name
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, out)
        process = subprocess.Popen([sys.executable, str(copied / 'launcher.py'), '--no-browser'], cwd=copied, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            line = process.stdout.readline()
            found = re.search(r'http://127\.0\.0\.1:(\d+)/', line)
            assert found, 'No local startup URL: ' + line
            base = found.group(0)
            def get(path):
                with urllib.request.urlopen(base + path, timeout=5) as response:
                    return response.read()
            health = json.loads(get('__health'))
            assert health['mode'] == 'static-local'
            html = get('').decode()
            assets = re.findall(r'(?:src|href)="([^\"]+\.(?:js|css))"', html)
            assert len(assets) >= 2
            for asset in assets:
                assert not asset.startswith(('http:', 'https:', '/'))
                assert get(asset), asset
            for forbidden in ['package.json', 'launcher.py', 'src/App.tsx', '.env', '../package.json']:
                try:
                    get(forbidden)
                    raise AssertionError('Exposed source file: ' + forbidden)
                except urllib.error.HTTPError as error:
                    assert error.code == 404
            request = urllib.request.Request(base, headers={'Host': 'example.com'})
            try:
                urllib.request.urlopen(request, timeout=5)
                raise AssertionError('Accepted nonlocal Host')
            except urllib.error.HTTPError as error:
                assert error.code == 403
            print(json.dumps({'ok': True, 'app': health['app'], 'allowlistedFiles': len(files), 'staticAssets': len(assets), 'checks': ['portable-copy-outside-repository', 'python-only-startup', 'http-assets', 'source-not-served', 'local-host-only', 'no-runtime-dependencies-or-source-maps']}, ensure_ascii=False))
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == '__main__':
    main()
