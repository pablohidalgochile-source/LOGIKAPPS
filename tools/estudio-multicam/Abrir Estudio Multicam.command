#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v python3 >/dev/null || { print "Necesitas Python 3. Consulta LEEME.md."; exit 1; }
exec python3 launcher.py
