#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
python3 -m venv .venv
.venv/bin/python -m pip install "numpy>=2,<3"
command -v ffmpeg >/dev/null || { echo "Falta FFmpeg."; exit 1; }
