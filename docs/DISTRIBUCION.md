# Compilación y distribución de LOGIKAPPS

## Estado de la beta 0.2.0

La entrega pública es un DMG universal para macOS 13 o posterior, con ejecutables arm64 y x86_64. El catálogo incluido es `[]`; no contiene las herramientas, rutas o datos personales del autor. La configuración de cada persona se crea al usar la app.

Sin variables de firma, el build usa firma **ad-hoc**, sin Developer ID y sin notarización. La verificación local de `codesign` no equivale a la aceptación de Gatekeeper. Los metadatos de la app y el archivo `.dmg.metadata.json` declaran el estado real de firma y del envío a Apple.

## Verificar una entrega

Desde la raíz del proyecto, en macOS:

```bash
node --test tests/frontend.test.cjs
/bin/bash scripts/build-macos.sh
.build/LOGIKAPPS.app/Contents/MacOS/LOGIKAPPS --self-test
/bin/bash scripts/check-package.sh
/bin/bash scripts/create-dmg.sh
cd dist
shasum -a 256 -c LOGIKAPPS-0.2.0-macos-universal.dmg.sha256
```

La compilación comprueba que existan los archivos necesarios y que el icono corresponda al SVG. Compila ambas arquitecturas, las reúne con `lipo` y verifica la firma. `check-package.sh` comprueba versión, macOS mínimo, arquitecturas, catálogo vacío y ausencia de rutas personales de compilación en el ejecutable.

El identificador `buildID` usa hashes de archivos con rutas relativas, la versión del compilador y SDK y el modo de firma. El mismo contenido y las mismas herramientas reutilizan la app y el DMG ya verificados. Esto no promete DMG idénticos byte por byte entre máquinas: el sistema de archivos del instalador y las firmas pueden incorporar metadatos. Las versiones anteriores se conservan en `.build/previous/` y `dist/previous/` cuando cambia el contenido.

## Comprobar la ventana real

Esta prueba requiere una sesión gráfica de macOS iniciada. No cuenta como superada si se omite en un servidor sin escritorio. Usa una carpeta temporal separada de los datos personales:

```bash
LOGIKAPPS_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/logikapps-ui.XXXXXX")"
LOGIKAPPS_DATA_DIR="$LOGIKAPPS_TEST_DIR" \
  .build/LOGIKAPPS.app/Contents/MacOS/LOGIKAPPS --ui-smoke-test
```

Comprueba el resultado JSON y el código de salida. Además, antes de publicar, abre el DMG, copia la app a una ubicación de prueba y recorre agregar/editar/eliminar un acceso, favoritos e ideas. Prueba una app instalada, una carpeta y una web conocida. No incluyas capturas ni respaldos con datos personales en el repositorio.

## CI de GitHub

`.github/workflows/check.yml` se ejecuta en push, pull request y a pedido. Usa runners macOS 15 Apple Silicon e Intel, ejecuta pruebas JavaScript y nativas, compila el universal, valida el paquete y adjunta el DMG y sus metadatos como artefactos de la ejecución durante 14 días. Solo solicita `contents: read`, no conserva credenciales del checkout, no recibe secretos de firma y no publica Releases automáticamente.

La prueba gráfica anterior se realiza localmente y se informa por separado. Los artefactos de Actions sirven para revisión; para colegas utiliza una Release pública, cuyo enlace no exige acceso a una ejecución autenticada. La beta se publica como **prerelease** con etiqueta `v0.2.0-beta.1` y se enlaza por su etiqueta, porque `/releases/latest` puede excluir las versiones preliminares.

Las acciones están fijadas por SHA a versiones verificadas en sus repositorios oficiales: [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node 7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) y [upload-artifact 7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1). La matriz usa las [etiquetas de runners documentadas por GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Firma Developer ID y notarización opcionales

Este camino requiere un certificado **Developer ID Application** válido ya instalado en el llavero y un perfil de `notarytool` ya configurado por el distribuidor. No guardes certificados, contraseñas ni perfiles en Git. Usa el nombre completo de tu identidad y el nombre del perfil, por ejemplo:

```bash
LOGIKAPPS_SIGN_IDENTITY='Developer ID Application: Tu Organización (TEAMID)' \
LOGIKAPPS_NOTARY_PROFILE='perfil-notarizacion' \
  /bin/bash scripts/create-dmg.sh
```

La app se firma con hardened runtime y sello de tiempo; el DMG también se firma. El script envía el DMG a Apple, espera `Accepted`, adjunta el ticket al DMG con `stapler` y valida el resultado antes de moverlo a `dist/`. El perfil del llavero no se copia al instalador ni al repositorio. El recibo del envío queda solo en la carpeta temporal de `.build/` y no se sube a Actions. Los metadatos públicos indican `accepted-and-stapled` únicamente después de verificar el ticket del DMG; no afirman que haya un ticket adjunto por separado a la app interior.

Si se configura solo `LOGIKAPPS_SIGN_IDENTITY`, la entrega queda firmada Developer ID pero **sin notarizar**. Si se configura solo `LOGIKAPPS_NOTARY_PROFILE`, el script se detiene para evitar una promesa falsa. Este repositorio no automatiza la obtención de credenciales ni modifica las protecciones de macOS.

Consulta la guía oficial de Apple: [Personalizar el proceso de notarización](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow) y [Abrir apps de forma segura](https://support.apple.com/es-cl/102445).

## Actualizar el icono

El icono ICNS incluido permite compilar en CI sin arrancar WebKit. Su hash de origen corresponde a `web/assets/logo-symbol.svg`. Si cambia el SVG, en una sesión gráfica de macOS ejecuta:

```bash
/bin/bash scripts/render-icon.sh
```

Incluye en el mismo commit el SVG, `scripts/assets/LOGIKAPPS.icns` y `scripts/assets/icon-source.sha256`. El helper no forma parte de la app distribuida.
