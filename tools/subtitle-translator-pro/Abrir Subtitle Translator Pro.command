#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null || { print "Necesitas Node.js 22.13 o posterior."; exit 1; }
exec node launcher.mjs
