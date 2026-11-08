#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
command -v ffmpeg >/dev/null || { echo "Falta FFmpeg. Instálalo antes de analizar."; exit 1; }
