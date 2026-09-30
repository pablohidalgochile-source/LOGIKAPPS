#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null 2>&1 || { print -u2 'Instala Node.js 22.13 o posterior y vuelve a preparar TRACKHUNT.'; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || (a===22&&b<13)){console.error("TRACKHUNT necesita Node.js 22.13 o posterior.");process.exit(1)}'
command -v npm >/dev/null 2>&1 || { print -u2 'Falta npm. Instala Node.js con su gestor npm.'; exit 1; }
print 'Preparando dependencias propias de TRACKHUNT (requiere Internet)…'
npm ci --no-audit --no-fund
npm run build
print 'TRACKHUNT listo. Abre Abrir TRACKHUNT.command; la preparación no se repite al abrir.'
