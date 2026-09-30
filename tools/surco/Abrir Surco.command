#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -x '.venv/bin/python3' ]]; then
    SURCO_PYTHON='.venv/bin/python3'
elif command -v python3 >/dev/null 2>&1; then
    SURCO_PYTHON="$(command -v python3)"
else
    print -u2 'Surco necesita Python 3.10 o posterior. Consulta LEEME.md para prepararlo.'
    exit 1
fi
exec "$SURCO_PYTHON" launcher.py
