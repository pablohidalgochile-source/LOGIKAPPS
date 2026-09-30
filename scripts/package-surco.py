#!/usr/bin/env python3
"""Create the portable Surco beta from an explicit list, never a user's library."""
from __future__ import annotations

import hashlib
import io
from pathlib import Path
import re
import stat
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tools" / "surco"
FILENAME = "Surco-0.1.0-beta.zip"
FILES = (
    "Abrir Surco.command",
    "LEEME.md",
    "launcher.py",
    "requirements.txt",
    "server.py",
    "static/app.js",
    "static/index.html",
    "static/style.css",
)


def build_archive() -> bytes:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for relative in FILES:
            source = SOURCE / relative
            if source.is_symlink() or not source.is_file():
                raise SystemExit(f"Missing or non-regular source: {relative}")
            if SOURCE.resolve() not in source.resolve().parents:
                raise SystemExit(f"Source escapes the package directory: {relative}")
            data = source.read_bytes()
            text = data.decode("utf-8")
            # Report only the filename, never the matching secret or local path.
            if re.search(r"/Users/|/home/|(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", text):
                raise SystemExit(f"Privacy check failed: {relative}")
            info = zipfile.ZipInfo("Surco/" + relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            mode = 0o755 if relative.endswith(".command") else 0o644
            info.external_attr = (stat.S_IFREG | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return archive.getvalue()


def main() -> None:
    content = build_archive()
    digest = hashlib.sha256(content).hexdigest()
    destination = ROOT / "dist" / FILENAME
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.read_bytes() != content:
        previous = destination.parent / "previous" / f"Surco-0.1.0-beta-{hashlib.sha256(destination.read_bytes()).hexdigest()[:16]}.zip"
        previous.parent.mkdir(parents=True, exist_ok=True)
        if previous.exists() and previous.read_bytes() != destination.read_bytes():
            raise SystemExit("Previous archive collision; files were preserved.")
        if not previous.exists():
            previous.write_bytes(destination.read_bytes())
    if not destination.exists() or destination.read_bytes() != content:
        temporary = destination.with_suffix(".zip.tmp")
        temporary.write_bytes(content)
        temporary.replace(destination)
    destination.with_suffix(".zip.sha256").write_text(f"{digest}  {FILENAME}\n", encoding="utf-8")
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None or tuple(archive.namelist()) != tuple("Surco/" + name for name in FILES):
            raise SystemExit("The archive failed validation.")
    print(f"Prepared {destination.relative_to(ROOT)}: {len(FILES)} source files, {len(content)} bytes")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
