#!/bin/bash
# Sourced by the macOS scripts; compatible with the system Bash 3.2.
export LC_ALL=C
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/.build"
APP_PATH="$BUILD_DIR/LOGIKAPPS.app"
VERSION="0.3.0"
MIN_MACOS="13.0"
BUNDLE_ID="cl.logikapps.desktop"
SIGN_IDENTITY="${LOGIKAPPS_SIGN_IDENTITY:-}"
NOTARY_PROFILE="${LOGIKAPPS_NOTARY_PROFILE:-}"

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
require_macos() {
    [[ "$(uname -s)" == "Darwin" ]] || fail "Esta tarea requiere macOS."
    command -v xcrun >/dev/null || fail "Instala las herramientas de desarrollo de Apple."
    [[ -z "$NOTARY_PROFILE" || -n "$SIGN_IDENTITY" ]] || fail "La notarización requiere LOGIKAPPS_SIGN_IDENTITY (Developer ID Application)."
    if [[ -n "$SIGN_IDENTITY" && "$SIGN_IDENTITY" != "Developer ID Application: "* ]]; then
        fail "Usa el nombre completo de una identidad Developer ID Application válida."
    fi
}

check_sources() {
    cd "$PROJECT_ROOT"
    for INPUT in native/main.swift native/AppDelegate.swift native/StateStore.swift native/SelfTests.swift native/WebKitSmokeTest.swift web/index.html web/app.js web/state.js web/catalog.js web/discover-catalog.js web/styles.css web/assets/logo-symbol.svg catalog.json scripts/assets/LOGIKAPPS.icns scripts/assets/icon-source.sha256; do
        [[ -s "$INPUT" ]] || fail "Falta un archivo necesario o está vacío: $INPUT"
    done
    /usr/bin/shasum -a 256 -c scripts/assets/icon-source.sha256 >/dev/null || fail "El SVG cambió: regenera el icono con scripts/render-icon.sh."
    /usr/bin/plutil -convert xml1 -o /dev/null catalog.json || fail "catalog.json no es JSON válido."
}

# Hashes depend on relative filenames, contents, SDK/compiler and signing mode.
# The checkout's absolute path and the user's name never form part of buildID.
compute_build_id() {
    (
        cd "$PROJECT_ROOT"
        {
            printf '%s\n' "$VERSION" "$MIN_MACOS" 'arm64 x86_64'
            "$SWIFTC" --version
            xcrun --sdk macosx --show-sdk-version
            printf '%s\n' "$SIGN_IDENTITY" | shasum -a 256 | awk '{print $1}'
            if [[ -n "$NOTARY_PROFILE" ]]; then printf 'notary-requested\n'; else printf 'notary-not-requested\n'; fi
            find native web scripts -type f ! -name '.DS_Store' -print | LC_ALL=C sort | while IFS= read -r INPUT; do shasum -a 256 "$INPUT"; done
            shasum -a 256 catalog.json
        } | shasum -a 256 | awk '{print $1}'
    )
}
