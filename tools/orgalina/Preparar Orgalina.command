#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v npm >/dev/null || { print "Instala Node.js con npm."; exit 1; }
print "Preparando dependencias de Orgalina; requiere Internet."
npm ci --no-audit --no-fund
npm run build
print "Preparación terminada. Ahora abre Abrir Orgalina.command."
