#!/bin/bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_macos
check_sources
[[ -d "$APP_PATH" ]] || fail "Primero ejecuta scripts/build-macos.sh."
BINARY="$APP_PATH/Contents/MacOS/LOGIKAPPS"
xcrun lipo "$BINARY" -verify_arch arm64 x86_64
/usr/bin/codesign --verify --deep --strict "$APP_PATH"
INFO="$APP_PATH/Contents/Resources/build-info.json"
[[ "$(/usr/bin/plutil -extract version raw -o - "$INFO")" == "$VERSION" ]] || fail "Versión incorrecta."
[[ "$(/usr/bin/plutil -extract minimumMacOS raw -o - "$INFO")" == "$MIN_MACOS" ]] || fail "macOS mínimo incorrecto."
[[ "$(/usr/bin/plutil -extract architecture raw -o - "$INFO")" == universal ]] || fail "Metadatos de arquitectura incorrectos."
# The compiler may embed #file and diagnostics; reject developer checkout paths.
if /usr/bin/strings "$BINARY" | /usr/bin/grep -E '/Users/|/home/|/Volumes/|/private/tmp/|/private/var/folders/' > /dev/null; then
    fail "El ejecutable contiene rutas absolutas locales; revisa su compilación."
fi
CATALOG_CONTENT="$(tr -d '[:space:]' < "$APP_PATH/Contents/Resources/catalog.json")"
[[ "$CATALOG_CONTENT" == '[]' ]] || fail "La distribución debe iniciar la biblioteca personal vacía (catalog.json=[])."
DISCOVER_CATALOG="$APP_PATH/Contents/Resources/web/discover-catalog.js"
[[ -s "$DISCOVER_CATALOG" ]] || fail "Falta el catálogo público separado de Explorar."
/usr/bin/cmp -s "$PROJECT_ROOT/web/discover-catalog.js" "$DISCOVER_CATALOG" || fail "El catálogo Explorar del paquete no coincide con las fuentes; recompila."
printf 'Paquete verificado: universal, versión %s, macOS %s+, biblioteca personal vacía, Explorar incluido y sin rutas personales.\n' "$VERSION" "$MIN_MACOS"
