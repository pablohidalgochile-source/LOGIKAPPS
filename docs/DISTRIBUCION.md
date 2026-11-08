# Compilación y distribución de LOGIKAPPS 0.7.0

La release es `v0.7.0-beta.1`. El DMG universal funciona en macOS 13+, Apple Silicon e Intel. `release.json` enumera los ocho packs y los archivos publicados. El catálogo personal incluido es vacío; Explorar y Packs son catálogos públicos estáticos. No hay actualización remota automática.

## Verificación local

```bash
node --test tests/*.test.cjs
python3 scripts/package-surco.py
python3 scripts/package-fratv.py
python3 scripts/package-packs.py
python3 scripts/check-packs.py
/bin/bash scripts/build-macos.sh
.build/LOGIKAPPS.app/Contents/MacOS/LOGIKAPPS --self-test
/bin/bash scripts/check-package.sh
/bin/bash scripts/create-dmg.sh
```

Las listas public-files.json delimitan cada fuente. El empaquetador rechaza enlaces simbólicos, entornos privados, datos y patrones de secretos o rutas personales. Los ZIP nativos de entrada tienen hashes de cada miembro: Teatina y FrateIA conservan las entradas revisadas; Elephant se reconstruye con scripts/build-elephant.sh y su ZIP revisado queda en packs/design. Los modelos y motores opcionales de IA no están incluidos.

TRACKHUNT usa SQLite local, sin D1 ni credenciales Cloudflare. Su número portable es 0.2.0 beta; no se confunde con el contador de publicaciones del sitio web. Tras npm ci y npm run build en tools/trackhunt, ejecuta npm test. Orgalina, Mi Talla y Club Santa Cruz tienen pruebas propias. Subtitle Translator Pro se prepara con build --no-lint, conservando la comprobación TypeScript; su proyecto original no aporta configuración ESLint autónoma.

## Ventana real y recuperación

En una sesión gráfica, usa LOGIKAPPS_DATA_DIR dentro de una carpeta temporal separada. Ejecuta --ui-smoke-test, --ui-smoke-test --embedded-startup, --ui-smoke-test --simulate-file-load-failure y --ui-startup-error-test. Comprueban los ocho packs y 37 fichas, logos, puente nativo, edición, conservación de datos y recuperación. No se ejecutan contra la biblioteca personal.

La alternativa incorpora scripts, estilos e imágenes confirmadas desde el bundle, con CSP nonce sin red. Si no puede arrancar, aparece una pantalla nativa de recuperación y diagnóstico sin datos privados. La prueba local no sustituye una prueba física en el Mac que reportó la ventana negra.

## Publicación

GitHub Actions compila y comprueba macOS Apple Silicon e Intel. Además valida los packs, las pruebas de interfaz y las herramientas DJ sin dependencias externas. Las pruebas gráficas se realizan localmente porque requieren sesión de escritorio. El workflow no publica releases automáticamente.

Publica el DMG, sus metadatos y SHA-256; los ocho packs de release.json y sus SHA-256; las descargas individuales de Surco y FRATV. Verifica cada enlace después de subir los archivos. Usa la etiqueta explícita de la prerelease; releases/latest puede omitir betas.

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
