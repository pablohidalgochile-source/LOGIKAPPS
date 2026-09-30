#!/bin/bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_macos
"$PROJECT_ROOT/scripts/build-macos.sh"
"$PROJECT_ROOT/scripts/check-package.sh"
/usr/bin/codesign --verify --deep --strict "$APP_PATH"
BUILD_INFO="$APP_PATH/Contents/Resources/build-info.json"
BUILD_ID="$(/usr/bin/plutil -extract buildID raw -o - "$BUILD_INFO")"
SIGNATURE="$(/usr/bin/plutil -extract signature raw -o - "$BUILD_INFO")"
DIST_DIR="$PROJECT_ROOT/dist"
FILENAME="LOGIKAPPS-$VERSION-macos-universal.dmg"
DMG_PATH="$DIST_DIR/$FILENAME"
METADATA="$DMG_PATH.metadata.json"
mkdir -p "$DIST_DIR"

if [[ -f "$DMG_PATH" && -f "$METADATA" && -f "$DMG_PATH.sha256" ]]; then
    PREVIOUS_ID="$(/usr/bin/plutil -extract buildID raw -o - "$METADATA" 2>/dev/null || true)"
    if [[ "$PREVIOUS_ID" == "$BUILD_ID" ]] && (cd "$DIST_DIR" && shasum -a 256 -c "$FILENAME.sha256" >/dev/null) && /usr/bin/hdiutil verify "$DMG_PATH" >/dev/null 2>&1; then
        if [[ -z "$NOTARY_PROFILE" ]] || xcrun stapler validate "$DMG_PATH" >/dev/null 2>&1; then
            printf 'Instalador universal vigente: %s\n' "$DMG_PATH"
            exit 0
        fi
    fi
fi

STAGING_DIR="$(mktemp -d "$BUILD_DIR/dmg.XXXXXX")"
CONTENTS="$STAGING_DIR/contenido"
TEMP_DMG="$STAGING_DIR/$FILENAME"
mkdir -p "$CONTENTS"
/usr/bin/ditto --norsrc --noextattr "$APP_PATH" "$CONTENTS/LOGIKAPPS.app"
/bin/ln -s /Applications "$CONTENTS/Applications"
cat > "$CONTENTS/LEEME.txt" <<README
LOGIKAPPS $VERSION — beta para macOS 13 o posterior (Apple Silicon e Intel)

1. Arrastra LOGIKAPPS a Applications (Aplicaciones).
2. Abre LOGIKAPPS desde Aplicaciones.
3. En el Dock: menú del icono > Opciones > Mantener en el Dock.

También puedes copiarla a ~/Applications para instalarla solo para tu usuario.
Explorar muestra el catálogo público incluido en esta versión.
Mis apps empieza vacío: agrega tus apps, sitios y carpetas desde la app.
Al actualizar se conservan tu biblioteca, ideas y favoritos. Cierra y vuelve a
abrir LOGIKAPPS para ver Explorar en la nueva versión. Su catálogo se actualiza
instalando nuevas versiones de LOGIKAPPS; no se descarga automáticamente.
LOGIKAPPS no incluye rutas privadas ni datos personales de su creador.
Las herramientas conectadas conservan sus propios requisitos y licencias.

Estado de firma de la app: $SIGNATURE.
El archivo externo $FILENAME.metadata.json declara el resultado de notarización.
La beta ad-hoc no tiene certificación Developer ID ni notarización de Apple.
Si macOS impide abrirla, consulta la explicación oficial de Apple:
https://support.apple.com/es-cl/102445
No es necesario desactivar las protecciones de macOS.
README
/usr/bin/hdiutil create -volname "LOGIKAPPS" -srcfolder "$CONTENTS" -format UDZO -fs HFS+ "$TEMP_DMG"
NOTARIZATION='not-requested'
DMG_SIGNATURE='unsigned'
if [[ -n "$SIGN_IDENTITY" ]]; then
    /usr/bin/codesign --sign "$SIGN_IDENTITY" --timestamp "$TEMP_DMG"
    /usr/bin/codesign --verify --strict "$TEMP_DMG"
    DMG_SIGNATURE='developer-id'
fi
if [[ -n "$NOTARY_PROFILE" ]]; then
    # Credentials live in the developer's Keychain profile, never in this project.
    xcrun notarytool submit "$TEMP_DMG" --keychain-profile "$NOTARY_PROFILE" --wait --output-format json > "$STAGING_DIR/notary-result.json"
    STATUS="$(/usr/bin/plutil -extract status raw -o - "$STAGING_DIR/notary-result.json")"
    [[ "$STATUS" == 'Accepted' ]] || fail "Apple no aceptó esta entrega; consulta $STAGING_DIR/notary-result.json."
    xcrun stapler staple "$TEMP_DMG"
    xcrun stapler validate "$TEMP_DMG"
    NOTARIZATION='accepted-and-stapled'
fi
/usr/bin/hdiutil verify "$TEMP_DMG"
printf '{"version":"%s","buildID":"%s","file":"%s","architecture":"universal","architectures":["arm64","x86_64"],"minimumMacOS":"%s","signature":"%s","signatureScope":"application","diskImageSignature":"%s","notarization":"%s","bundledCatalog":"empty-personal-library","discoverCatalog":"bundled-static"}\n' \
    "$VERSION" "$BUILD_ID" "$FILENAME" "$MIN_MACOS" "$SIGNATURE" "$DMG_SIGNATURE" "$NOTARIZATION" > "$STAGING_DIR/$FILENAME.metadata.json"
/usr/bin/plutil -convert xml1 -o /dev/null "$STAGING_DIR/$FILENAME.metadata.json"
if [[ -e "$DMG_PATH" ]]; then
    PREVIOUS_DIR="$DIST_DIR/previous/$(date +%Y%m%d-%H%M%S)-$$"
    mkdir -p "$PREVIOUS_DIR"
    for PREVIOUS in "$DMG_PATH" "$METADATA" "$DMG_PATH.sha256"; do
        [[ ! -e "$PREVIOUS" ]] || /bin/mv "$PREVIOUS" "$PREVIOUS_DIR/"
    done
fi
/bin/mv "$TEMP_DMG" "$DMG_PATH"
/bin/mv "$STAGING_DIR/$FILENAME.metadata.json" "$METADATA"
(cd "$DIST_DIR" && shasum -a 256 "$FILENAME" > "$FILENAME.sha256")
printf 'DMG universal verificado (%s; notarización %s): %s\n' "$SIGNATURE" "$NOTARIZATION" "$DMG_PATH"
printf 'No se ha instalado ni abierto la app.\n'
