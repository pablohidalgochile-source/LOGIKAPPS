#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[[ -x .venv/bin/python ]] || { echo "Ejecuta Preparar Contrapista.command primero."; exit 1; }
exec .venv/bin/python app.py
