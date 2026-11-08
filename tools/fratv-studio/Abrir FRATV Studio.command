#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec /bin/bash app/ABRIR-EDITOR-Y-OBS.command
