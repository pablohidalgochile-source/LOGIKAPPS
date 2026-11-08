#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd app/scripts
npm ci --no-audit --no-fund
cd ../editor
npm ci --no-audit --no-fund
npm run build
printf "Preparación terminada. Vuelve a la carpeta del pack y abre Abrir FRATV Studio.command.\n"
