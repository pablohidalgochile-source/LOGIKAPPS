#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
python3.11 -m venv .venv-ai
.venv-ai/bin/python -m pip install -r requirements-ai.txt
.venv-ai/bin/python -m pip install --no-deps 'basic-pitch==0.4.0'
.venv-ai/bin/python preparar-modelos.py
