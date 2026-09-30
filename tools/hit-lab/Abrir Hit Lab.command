#!/bin/zsh
set -e
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.13/bin:$PATH"
if ! command -v python3 >/dev/null; then
  echo "Instala Python 3.10 o posterior desde python.org y vuelve a abrir este acceso."
  read "?Pulsa Enter para cerrar."
  exit 1
fi
python3 launcher.py
