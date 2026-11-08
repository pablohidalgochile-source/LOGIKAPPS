#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v python3 >/dev/null || { echo "Instala Python 3 para abrir esta edición local."; exit 1; }
exec python3 launcher.py
