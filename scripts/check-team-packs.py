#!/usr/bin/env python3
"""Regression checks against the exact Lab ZIP delivered to another Mac."""
from pathlib import Path
import json, re, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile

ROOT = Path(__file__).resolve().parent.parent
release = json.loads((ROOT/'release.json').read_text())
filename = next(p['file'] for p in release['packs'] if p['id'] == 'lab')
with tempfile.TemporaryDirectory(prefix='logikapps-team-') as temporary:
    target = Path(temporary)
    with zipfile.ZipFile(ROOT/'dist'/filename) as archive:
        archive.extractall(target)
    pack = next(target.iterdir())
    page = (pack/'NANOOKEY/index.html').read_text()
    assert 'NANOOKEY · DJ Brain' in page and 'Prototipo público' in page
    assert not re.search(r'/Users/|/Volumes/|@gmail|TAMY SELECTION|Sala Master|Bar Loreto|31\.655|67\.924', page)
    data = json.loads(re.search(r'window.NK_DATA = (\{.*?\});', page, re.S).group(1))
    assert data['sources'] == data['history'] == []
    assert all(t['title'].startswith('Pista demo ') for t in data['sampleTracks'])
    app = pack/'Estudio-Multicam'
    config = json.loads((app/'launcher-config.json').read_text())
    config['port'] = 0  # The OS chooses a free loopback port in this test copy.
    (app/'launcher-config.json').write_text(json.dumps(config))
    logpath = target/'server.log'
    with logpath.open('wb') as log:
        process = subprocess.Popen([sys.executable, str(app/'launcher.py'), '--no-open'], cwd=app, stdout=log, stderr=subprocess.STDOUT)
    try:
        base = None
        # A cold Python child on a shared Intel runner can take longer to start.
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            match = re.search(r'http://127\.0\.0\.1:\d+', logpath.read_text())
            if match:
                base = match.group(); break
            assert process.poll() is None, logpath.read_text()
            time.sleep(.1)
        assert base, 'Launcher did not become ready: '+logpath.read_text()
        for route in ['cam-fiesta', 'muro', 'moderador', 'cam', 'estudio', 'programa', 'switch']:
            with urllib.request.urlopen(base+'/'+route+'?sala=DEMO', timeout=3) as response:
                assert response.status == 200 and b'<!DOCTYPE html>' in response.read()[:100]
        for route in ['/.env', '/server/token', '/%2e%2e/LEEME.md']:
            try:
                urllib.request.urlopen(base+route, timeout=3)
                raise AssertionError('Unexpected public file: '+route)
            except urllib.error.HTTPError as error:
                assert error.code == 404
        try:
            urllib.request.urlopen(urllib.request.Request(base+'/', headers={'Host':'untrusted.example'}), timeout=3)
            raise AssertionError('Foreign Host accepted')
        except urllib.error.HTTPError as error:
            assert error.code == 403
    finally:
        process.terminate(); process.wait(timeout=5)
print('Team pack checked: synthetic NANOOKEY data, seven Multicam routes, private files and Host restrictions.')
