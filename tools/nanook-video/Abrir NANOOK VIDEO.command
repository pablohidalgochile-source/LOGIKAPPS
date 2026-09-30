#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null 2>&1 || { print -u2 'Falta Node.js 22.13 o posterior. Consulta LEEME.md.'; exit 1; }
exec node launcher.mjs
