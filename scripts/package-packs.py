#!/usr/bin/env python3
"""Build public packs from reviewed allowlists, never from personal directories."""
from __future__ import annotations
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BANNED_PARTS = {'.git', 'node_modules', '__pycache__', '.venv', '.DS_Store', 'biblioteca', 'downloads'}
SECRET = re.compile(rb'/Users/|/home/|(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')

def allowlist(source: Path):
    value = json.loads((source / 'public-files.json').read_text())
    files = value['files'] if isinstance(value, dict) else value
    assert isinstance(files, list) and files and len(files) == len(set(files)), 'Invalid allowlist'
    return files

def read_public(source: Path, relative: str):
    path = PurePosixPath(relative)
    assert not path.is_absolute() and all(p not in {'..', '.'} | BANNED_PARTS for p in path.parts), f'Forbidden path: {relative}'
    assert not any(p.startswith('.env') and p != '.env.example' for p in path.parts), f'Environment file: {relative}'
    file = source.joinpath(*path.parts)
    assert file.is_file() and not any(p.is_symlink() for p in [file, *file.parents] if p != ROOT.parent), f'Non-regular file: {relative}'
    assert source.resolve() in file.resolve().parents, f'Path outside source: {relative}'
    data = file.read_bytes()
    assert not SECRET.search(data), f'Privacy check failed in: {relative}'
    return data

def package(name, sources):
    stream = io.BytesIO()
    prefix = name.removesuffix('-0.1.0-beta.zip')
    names = set()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for source, subfolder, files in sources:
            for relative in sorted(files):
                data = read_public(source, relative)
                member = '/'.join(filter(None, [prefix, subfolder, relative]))
                assert member not in names, f'Duplicate member: {member}'
                names.add(member)
                entry = zipfile.ZipInfo(member, (1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                mode = 0o755 if relative.endswith('.command') else 0o644
                entry.external_attr = (stat.S_IFREG | mode) << 16
                output.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    data = stream.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    destination = ROOT / 'dist' / name
    destination.parent.mkdir(exist_ok=True)
    if destination.exists() and destination.read_bytes() != data:
        old = destination.read_bytes()
        backup = destination.parent / 'previous' / (destination.stem + '-' + hashlib.sha256(old).hexdigest()[:16] + '.zip')
        backup.parent.mkdir(exist_ok=True)
        if backup.exists(): assert backup.read_bytes() == old
        else: backup.write_bytes(old)
    temp = destination.with_suffix('.zip.tmp')
    temp.write_bytes(data)
    temp.replace(destination)
    destination.with_suffix('.zip.sha256').write_text(f'{digest}  {name}\n')
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == names
    print(f'{name}: {len(names)} files, {len(data)} bytes, SHA256 {digest}')

def main():
    dj = ROOT / 'packs/dj'
    sources = [(dj, '', ['EMPIEZA-AQUI.html', 'pack.json'])]
    # Surco already has a reviewed explicit source list used for its standalone ZIP.
    import importlib.util
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('surco', ROOT / 'scripts/package-surco.py')
    surco = importlib.util.module_from_spec(spec); spec.loader.exec_module(surco)
    sources.append((ROOT / 'tools/surco', 'Surco', list(surco.FILES)))
    for folder, target in [('trackhunt','TRACKHUNT'), ('nanook-video','NANOOK-VIDEO'), ('vj-lab','VJ-LAB'), ('hit-lab','Hit-Lab')]:
        source = ROOT / 'tools' / folder
        sources.append((source, target, allowlist(source)))
    package('LOGIKAPPS-Pack-DJ-0.1.0-beta.zip', sources)
    frate = ROOT / 'packs/fraternidad'
    package('LOGIKAPPS-Pack-Fraternidad-0.1.0-beta.zip', [(frate, '', allowlist(frate))])

if __name__ == '__main__':
    main()
