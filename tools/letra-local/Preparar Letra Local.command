#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[[ "$(uname -m)" == arm64 ]] || { echo "El motor MLX requiere Apple Silicon."; exit 1; }
command -v ffmpeg >/dev/null || { echo "Instala FFmpeg antes de preparar Whisper."; exit 1; }
python3 -m venv .whisper-env
.whisper-env/bin/python -m pip install 'mlx-whisper==0.4.3' 'demucs==4.0.1' 'scipy>=1.11'
.whisper-env/bin/python preparar-modelos.py
echo "Modelos preparados. Descomprime Letra Local.zip aquí y conserva transcribe.py junto a la app."
