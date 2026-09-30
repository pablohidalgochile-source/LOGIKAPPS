#!/bin/bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_macos
cd "$PROJECT_ROOT"
[[ -s web/assets/logo-symbol.svg ]] || fail "Falta web/assets/logo-symbol.svg."
mkdir -p "$BUILD_DIR" scripts/assets
ICON_TEMP="$(mktemp -d "$BUILD_DIR/icon.XXXXXX")"
xcrun swiftc -O -framework Cocoa -framework WebKit scripts/render-icon.swift -o "$ICON_TEMP/render-icon"
"$ICON_TEMP/render-icon" web/assets/logo-symbol.svg "$ICON_TEMP/LOGIKAPPS.iconset"
/usr/bin/iconutil --convert icns --output scripts/assets/LOGIKAPPS.icns "$ICON_TEMP/LOGIKAPPS.iconset"
/usr/bin/shasum -a 256 web/assets/logo-symbol.svg > scripts/assets/icon-source.sha256
printf 'Icono actualizado. Incluye scripts/assets en el mismo commit que el SVG.\n'
