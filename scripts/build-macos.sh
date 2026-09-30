#!/bin/bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_macos
check_sources
SWIFTC="$(xcrun --find swiftc)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
BUILD_ID="$(compute_build_id)"
mkdir -p "$BUILD_DIR"

if [[ -d "$APP_PATH" && -f "$APP_PATH/Contents/Resources/build-info.json" ]]; then
    PREVIOUS_ID="$(/usr/bin/plutil -extract buildID raw -o - "$APP_PATH/Contents/Resources/build-info.json" 2>/dev/null || true)"
    if [[ "$PREVIOUS_ID" == "$BUILD_ID" ]] && /usr/bin/codesign --verify --deep --strict "$APP_PATH" 2>/dev/null && xcrun lipo "$APP_PATH/Contents/MacOS/LOGIKAPPS" -verify_arch arm64 x86_64; then
        printf 'Compilación universal vigente: %s\n' "$APP_PATH"
        exit 0
    fi
fi

STAGING_DIR="$(mktemp -d "$BUILD_DIR/bundle.XXXXXX")"
STAGED_APP="$STAGING_DIR/LOGIKAPPS.app"
CONTENTS="$STAGED_APP/Contents"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"
trap 'printf "Carpeta de diagnóstico conservada: %s\n" "$STAGING_DIR" >&2' ERR

printf 'Preparando LOGIKAPPS %s, universal para Apple Silicon e Intel…\n' "$VERSION"
cd "$PROJECT_ROOT"
# Always pass relative source paths. Prefix mapping also protects compiler literals.
# The checked main.swift ensures this Bash 3.2 array is never empty.
SWIFT_SOURCES=(native/*.swift)
for ARCH in arm64 x86_64; do
    "$SWIFTC" -O -sdk "$SDK_PATH" -target "$ARCH-apple-macosx$MIN_MACOS" \
        -file-prefix-map "$PROJECT_ROOT=." -debug-prefix-map "$PROJECT_ROOT=." \
        -file-compilation-dir . -framework Cocoa -framework WebKit \
        "${SWIFT_SOURCES[@]}" -o "$STAGING_DIR/LOGIKAPPS-$ARCH"
done
xcrun lipo -create "$STAGING_DIR/LOGIKAPPS-arm64" "$STAGING_DIR/LOGIKAPPS-x86_64" -output "$CONTENTS/MacOS/LOGIKAPPS"
xcrun lipo "$CONTENTS/MacOS/LOGIKAPPS" -verify_arch arm64 x86_64
/usr/bin/ditto --norsrc --noextattr web "$CONTENTS/Resources/web"
/bin/cp catalog.json "$CONTENTS/Resources/catalog.json"
/bin/cp scripts/assets/LOGIKAPPS.icns "$CONTENTS/Resources/LOGIKAPPS.icns"

cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>CFBundleDevelopmentRegion</key><string>es</string>
    <key>CFBundleExecutable</key><string>LOGIKAPPS</string>
    <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
    <key>CFBundleName</key><string>LOGIKAPPS</string>
    <key>CFBundleDisplayName</key><string>LOGIKAPPS</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>CFBundleVersion</key><string>2</string>
    <key>CFBundleIconFile</key><string>LOGIKAPPS</string>
    <key>LSMinimumSystemVersion</key><string>$MIN_MACOS</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSPrincipalClass</key><string>NSApplication</string>
    <key>NSSupportsAutomaticTermination</key><false/>
    <key>NSSupportsSuddenTermination</key><false/>
</dict></plist>
PLIST
SIGNATURE='ad-hoc'
NOTARIZATION='not-requested'
[[ -z "$SIGN_IDENTITY" ]] || SIGNATURE='developer-id'
[[ -z "$NOTARY_PROFILE" ]] || NOTARIZATION='see-distribution-metadata'
printf '{"version":"%s","buildID":"%s","architecture":"universal","architectures":["arm64","x86_64"],"minimumMacOS":"%s","signature":"%s","notarization":"%s"}\n' \
    "$VERSION" "$BUILD_ID" "$MIN_MACOS" "$SIGNATURE" "$NOTARIZATION" > "$CONTENTS/Resources/build-info.json"
/usr/bin/plutil -lint "$CONTENTS/Info.plist" >/dev/null
/usr/bin/plutil -convert xml1 -o /dev/null "$CONTENTS/Resources/build-info.json"
if [[ -n "$SIGN_IDENTITY" ]]; then
    /usr/bin/codesign --sign "$SIGN_IDENTITY" --options runtime --timestamp "$STAGED_APP"
else
    /usr/bin/codesign --sign - --timestamp=none "$STAGED_APP"
fi
/usr/bin/codesign --verify --deep --strict "$STAGED_APP"

if [[ -e "$APP_PATH" ]]; then
    EXISTING_BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Contents/Info.plist" 2>/dev/null || true)"
    [[ "$EXISTING_BUNDLE_ID" == "$BUNDLE_ID" ]] || fail "La ruta de salida contiene una app ajena. Se conserva: $APP_PATH"
    mkdir -p "$BUILD_DIR/previous"
    /bin/mv "$APP_PATH" "$BUILD_DIR/previous/LOGIKAPPS-$(date +%Y%m%d-%H%M%S)-$$.app"
fi
/bin/mv "$STAGED_APP" "$APP_PATH"
printf 'App universal preparada; firma %s verificada: %s\n' "$SIGNATURE" "$APP_PATH"
printf 'No se ha instalado ni abierto la app.\n'
