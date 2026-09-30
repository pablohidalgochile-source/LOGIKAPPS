# Compilación y distribución de LOGIKAPPS

## Estado de la beta 0.4.0

El paquete se prepara como DMG universal para macOS 13 o posterior, con ejecutables arm64 y x86_64. La publicación de la beta `v0.4.0-beta.1` es un paso posterior: estos archivos no confirman que ya exista una descarga pública.

`catalog.json` sigue siendo `[]`: inicia una biblioteca personal vacía. `web/discover-catalog.js` contiene **Explorar** y `web/packs-catalog.js` contiene **Packs de apps**, con sus herramientas, guías resumidas y enlaces de descarga. Ambos son catálogos públicos estáticos separados de los accesos, rutas, ideas y favoritos personales. Con una biblioteca vacía se abre Packs de apps; las bibliotecas existentes se conservan. Cambiar los catálogos requiere compilar y distribuir una nueva versión; no hay actualización remota ni instalación de herramientas en segundo plano.

Sin variables de firma, la app usa firma **ad-hoc** y el contenedor DMG queda sin firma propia, sin Developer ID y sin notarización. La verificación local de `codesign` no equivale a la aceptación de Gatekeeper. Los metadatos de la app y el archivo `.dmg.metadata.json` declaran el estado real: `signature` se refiere a la app, `diskImageSignature` al contenedor y `notarization` al envío a Apple.

## Verificar una entrega

Desde la raíz del proyecto, en macOS:

```bash
node --test tests/*.test.cjs
python3 scripts/package-surco.py
python3 scripts/package-fratv.py
python3 scripts/package-packs.py
/bin/bash scripts/build-macos.sh
.build/LOGIKAPPS.app/Contents/MacOS/LOGIKAPPS --self-test
/bin/bash scripts/check-package.sh
/bin/bash scripts/create-dmg.sh
cd dist
shasum -a 256 -c LOGIKAPPS-0.4.0-macos-universal.dmg.sha256
shasum -a 256 -c LOGIKAPPS-Pack-DJ-0.1.0-beta.zip.sha256
shasum -a 256 -c LOGIKAPPS-Pack-Fraternidad-0.1.0-beta.zip.sha256
```

La compilación comprueba que existan los archivos necesarios, incluidos `web/discover-catalog.js` y `web/packs-catalog.js`, y que el icono corresponda al SVG. Compila ambas arquitecturas, las reúne con `lipo` y verifica la firma. `check-package.sh` comprueba versión, macOS mínimo, arquitecturas, biblioteca personal vacía, presencia de los catálogos Explorar y Packs de apps y coincidencia con sus fuentes, además de la ausencia de rutas personales de compilación en el ejecutable. Los metadatos del DMG distinguen la biblioteca personal inicial vacía de los catálogos públicos incluidos.

El identificador `buildID` usa hashes de archivos con rutas relativas, la versión del compilador y SDK y el modo de firma. El mismo contenido y las mismas herramientas reutilizan la app y el DMG ya verificados. Esto no promete DMG idénticos byte por byte entre máquinas: el sistema de archivos del instalador y las firmas pueden incorporar metadatos. Las versiones anteriores se conservan en `.build/previous/` y `dist/previous/` cuando cambia el contenido.

## Comprobar la ventana real

Esta prueba requiere una sesión gráfica de macOS iniciada. No cuenta como superada si se omite en un servidor sin escritorio. Usa una carpeta temporal separada de los datos personales:

```bash
LOGIKAPPS_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/logikapps-ui.XXXXXX")"
LOGIKAPPS_DATA_DIR="$LOGIKAPPS_TEST_DIR" \
  .build/LOGIKAPPS.app/Contents/MacOS/LOGIKAPPS --ui-smoke-test
```

Comprueba el resultado JSON y el código de salida. Además, antes de publicar, abre el DMG, copia la app a una ubicación de prueba y comprueba que aparezcan los dos packs, que cada uno muestre sus cinco herramientas y que Mis apps siga separada. Revisa también Explorar. Comprueba los enlaces de descarga después de subir sus archivos a la Release. Prueba también la actualización desde una biblioteca temporal vacía y otra con accesos, favoritos e ideas; deben conservarse. Recorre agregar/editar/eliminar un acceso y abrir una app instalada, una carpeta y una web conocida. No incluyas capturas ni respaldos con datos personales en el repositorio.

## CI de GitHub

`.github/workflows/check.yml` se ejecuta en push, pull request y a pedido. Usa runners macOS 15 Apple Silicon e Intel, ejecuta las pruebas JavaScript de `tests/*.test.cjs` y las nativas. En un paso separado comprueba NANOOK VIDEO, VJ/LAB y Hit Lab sin instalar dependencias. TRACKHUNT se comprueba localmente con sus dependencias preparadas. El workflow prepara los ZIP individuales de Surco y FRATV y los packs DJ y Fraternidad mediante `scripts/package-packs.py`, compila el universal y valida el paquete. Adjunta el DMG, sus metadatos, los cuatro ZIP y sus sumas de comprobación como artefactos de la ejecución durante 14 días. Solo solicita `contents: read`, no conserva credenciales del checkout, no recibe secretos de firma y no publica Releases automáticamente.

Los ZIP se publican por separado del DMG:

- `LOGIKAPPS-Pack-DJ-0.1.0-beta.zip`: cinco herramientas, sus lanzadores y `EMPIEZA-AQUI.html`. Requiere preparar Python, Node.js o componentes de audio/video según el LEEME o LEER-PRIMERO de cada herramienta. No instala dependencias automáticamente.
- `LOGIKAPPS-Pack-Fraternidad-0.1.0-beta.zip`: `GUIA.html`, manifiesto y cinco accesos `.webloc` a los servicios oficiales. No incluye código privado, credenciales ni permisos de uso.
- `Surco-0.1.0-beta.zip`: descarga individual de Surco y su LEEME.
- `FRATV-OBS-Pack-0.1.0-beta.zip`: gráficas HTML para OBS y su guía.

`package-packs.py` usa listas explícitas de archivos revisados. Rechaza rutas ajenas, enlaces simbólicos, archivos de entorno privados y patrones conocidos de secretos o rutas personales. Estos controles acompañan la revisión del contenido; no sustituyen la inspección antes de publicar. Las fuentes de los packs no se obtienen de carpetas personales durante la compilación.

Las fichas deben enlazar nombres exactos de archivos publicados. Las descargas individuales existentes pueden conservar enlaces a la Release anterior; comprueba también que sigan disponibles. Para `v0.4.0-beta.1`, sube los cuatro ZIP y sus SHA-256 junto al DMG y sus archivos de verificación antes de anunciar la entrega.

La prueba gráfica anterior se realiza localmente y se informa por separado. Los artefactos de Actions sirven para revisión; para colegas utiliza una Release pública, cuyo enlace no exige acceso a una ejecución autenticada. La publicación prevista es una **prerelease** con etiqueta `v0.4.0-beta.1`. Una vez publicada, se enlaza por su etiqueta porque `/releases/latest` puede excluir las versiones preliminares. Verifica los archivos y sus enlaces antes de anunciar la descarga.

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
