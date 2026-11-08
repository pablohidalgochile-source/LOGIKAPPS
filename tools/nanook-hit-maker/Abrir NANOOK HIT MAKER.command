#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[[ -x .venv/bin/python ]] || { echo "Ejecuta Preparar NANOOK HIT MAKER.command primero."; exit 1; }
exec .venv/bin/python server.py
