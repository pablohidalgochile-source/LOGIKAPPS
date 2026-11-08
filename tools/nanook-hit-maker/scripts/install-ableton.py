"""Install only our reviewed Control Surface into the detected User Library."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import time

ROOT = Path(__file__).resolve().parents[1]


def install(library, bridge_root):
    library = Path(library).expanduser().resolve()
    if not library.is_dir():raise ValueError('No existe esa biblioteca de usuario de Ableton.')
    dest = library / 'Remote Scripts/NanookHitMaker'
    source = ROOT / 'ableton_bridge/NanookHitMaker'
    if dest.exists():
        backup = ROOT / 'data/ableton/installation-backups' / str(time.time_ns())
        backup.parent.mkdir(parents=True, exist_ok=True);shutil.copytree(dest, backup)
    dest.mkdir(parents=True, exist_ok=True)
    files = []
    for name in ('__init__.py', 'engine.py'):
        shutil.copyfile(source / name, dest / name)
        files.append({'file': name, 'sha256': hashlib.sha256((dest / name).read_bytes()).hexdigest()})
    (dest / 'config.json').write_text(json.dumps({'bridgeRoot': str(Path(bridge_root).resolve())}, indent=2)+'\n')
    receipt = {'installedAt': time.time(), 'destination': str(dest), 'version': '0.7.1', 'files': files}
    target = ROOT / 'data/ableton/installation.json';target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(receipt, indent=2)+'\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--user-library', type=Path, default=Path.home() / 'Music/Ableton/User Library')
    args = parser.parse_args()
    print(json.dumps(install(args.user_library, ROOT / 'data/ableton'), ensure_ascii=False, indent=2))
