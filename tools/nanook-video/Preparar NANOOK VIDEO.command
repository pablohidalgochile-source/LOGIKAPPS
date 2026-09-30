#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null 2>&1 || { print -u2 'Instala Node.js 22.13 o posterior. Consulta LEEME.md.'; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || (a===22&&b<13)){console.error("NANOOK VIDEO necesita Node.js 22.13 o posterior.");process.exit(1)}'
command -v python3 >/dev/null 2>&1 || { print -u2 'Instala Python 3.10 o posterior. Consulta LEEME.md.'; exit 1; }
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else "Se necesita Python 3.10 o posterior.")'
print 'Preparando el motor propio de NANOOK VIDEO (requiere Internet)…'
if [[ ! -x .runtime/venv/bin/python3 ]]; then python3 -m venv .runtime/venv; fi
.runtime/venv/bin/python3 -m pip install -r requirements.txt
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  print -u2 'Faltan ffmpeg o ffprobe. Instálalos según LEEME.md; no se instalan automáticamente.'
  exit 1
fi
print 'Motor preparado. Abre Abrir NANOOK VIDEO.command. No se instaló inicio automático.'
