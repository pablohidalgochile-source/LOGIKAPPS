#!/usr/bin/env python3
"""Check release archives, guides, native inputs and catalogue links."""
from pathlib import Path, PurePosixPath
import json, zipfile, re, hashlib, subprocess, importlib.util, sys
ROOT = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('packager', ROOT/'scripts/package-packs.py')
packager = importlib.util.module_from_spec(spec); spec.loader.exec_module(packager)
script = "const fs=require('fs'),vm=require('vm'),s={window:{}};for(const p of ['packs','discover','interests'])vm.runInNewContext(fs.readFileSync('web/'+p+'-catalog.js','utf8'),s);process.stdout.write(JSON.stringify(s.window));"
catalog = json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT))
release = 'https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/'
expected = {'dj':6,'fraternidad':5,'design':2,'ia':3}
assert {p['id']:len(p['tools']) for p in catalog['LOGIKAPPS_PACKS']} == expected
entries = catalog['LOGIKAPPS_DISCOVER'] + [t for p in catalog['LOGIKAPPS_PACKS'] for t in p['tools']]
for item in catalog['LOGIKAPPS_PACKS'] + entries:
    if item.get('kind') == 'download' or 'tools' in item:
        assert item['url'].startswith(release)
        assert (ROOT/'dist'/item['url'].removeprefix(release)).is_file(), item['name']
    if item.get('kind') == 'web': assert item['url'].startswith('https://')
for folder in ['design','ia']:
    source = ROOT/'packs'/folder
    review = json.loads((source/'binary-review.json').read_text())
    packager.read_public(source,review['file'])
for p in catalog['LOGIKAPPS_PACKS']:
    archive = ROOT/'dist'/p['url'].removeprefix(release)
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == archive.with_suffix('.zip.sha256').read_text().split()[0]
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        names=set(z.namelist()); prefix=next(iter(names)).split('/')[0]
        manifest=json.loads(z.read(prefix+'/pack.json'))
        assert manifest['id'] == p['id'] and len(manifest['tools']) == expected[p['id']]
        assert prefix+'/'+manifest['guide'] in names
        for info in z.infolist():
            data=z.read(info)
            assert not packager.SECRET.search(data),info.filename
            if info.filename.endswith('.command'): assert info.external_attr >> 16 & 0o111
            if PurePosixPath(info.filename).name not in {'GUIA.html', 'EMPIEZA-AQUI.html', 'GUIA-OBS.html'}: continue
            for ref in re.findall(r'(?:src|href)=["\']([^"\']+)',data.decode()):
                if ref.startswith(('#','https:','http:','data:','mailto:')): continue
                target=PurePosixPath(info.filename).parent/ref.split('#')[0].split('?')[0]
                assert str(target) in names, f'Missing guide resource {info.filename}: {ref}'
print('Release verified: 4 packs, 16 entries, exact download names, guides, nested apps, executable modes and SHA-256.')
