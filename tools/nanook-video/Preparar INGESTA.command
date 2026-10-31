#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v python3 >/dev/null || { print "Instala Python 3 primero."; exit 1; }
python3 -m venv .runtime/venv
.runtime/venv/bin/python3 -m pip install -r requirements.txt
print "Extractor preparado. Instala FFmpeg/ffprobe y abre Abrir INGESTA.command."
