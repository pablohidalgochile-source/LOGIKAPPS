#!/usr/bin/env python3
"""Package only reviewed public FRATV resources; no editor state or project data."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'tools' / 'fratv-obs'
OUTPUT = ROOT / 'dist' / 'FRATV-OBS-Pack-0.1.0-beta.zip'


def package():
    files = sorted(p for p in SOURCE.rglob('*') if p.is_file())
    assert files, 'Missing FRATV resources'
    for path in files:
        assert not path.is_symlink(), 'Do not publish symlinks'
        assert path.suffix in {'.txt', '.html', '.js', '.css', '.svg'}, path.name
        assert not any(part.startswith('.') for part in path.relative_to(SOURCE).parts)
        assert b'/Users/' not in path.read_bytes(), path.name
    OUTPUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUTPUT, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            name = 'FRATV-OBS-Pack/' + path.relative_to(SOURCE).as_posix()
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 30, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    OUTPUT.with_suffix('.zip.sha256').write_text(f'{digest}  {OUTPUT.name}\n')
    print(f'{OUTPUT.name}: {len(files)} files, {OUTPUT.stat().st_size} bytes, SHA-256 {digest}')


if __name__ == '__main__':
    package()
