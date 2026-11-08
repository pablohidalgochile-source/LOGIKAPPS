#!/bin/bash
set -e
cd "$(dirname "$0")"
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node 22.18 o posterior. Revisa LEEME-PRIMERO.md; no se instaló nada."
  exit 1
fi
node herramientas/preparar.mjs .
