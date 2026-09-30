# Verificación de la beta 0.3.0

Comprobación local del 30 de septiembre de 2026 en un Mac Apple Silicon.

- **64 comprobaciones nativas:** almacenamiento, validación, actualizaciones de bibliotecas existentes, exportación, restauración con copia previa y conservación de datos ante errores.
- **29 pruebas de interfaz:** formularios, búsqueda, favoritos, ideas, textos y rutas, límites, emojis, importación y fallos de almacenamiento.
- **Interfaz real:** se montó el DMG en modo de lectura, se copió su app a una carpeta temporal y se verificó la firma. En esa app se verificaron las tres fichas de Explorar y sus enlaces HTTP(S), la separación del catálogo y la biblioteca personal, crear y editar un acceso, favorito, búsqueda, crear y vincular una idea, quitar el acceso conservando la idea, editarla y borrarla. La prueba usó una biblioteca temporal.
- **Compatibilidad de datos:** las pruebas incluyen bibliotecas 0.2 vacías y existentes; conservan favoritos, notas e ideas vinculadas sin reescribir el archivo al iniciar.
- **Paquete:** contiene arm64 y x86_64, declara macOS 13 como mínimo, incluye la biblioteca personal vacía y el catálogo público de Explorar separado y su ejecutable no contiene rutas del equipo de compilación.
- **Instalador:** integridad comprobada con `hdiutil` y SHA-256. La reutilización de la misma compilación conservó el archivo y su hash.

- **FRATV:** 11 pruebas de texto, campos, temporizador, controles y referencias a archivos; guía y cuenta regresiva verificadas en navegador. Se comprobó que el contador avanza. No se realizó una transmisión en OBS.
- **Surco:** compilación Python y arranque aislado con biblioteca temporal, respuesta de estado, cuatro rutas de interfaz y controles de Host/Origin/token. No se descargó ni grabó audio durante esta preparación. Los archivos del ZIP coinciden con la selección explícita de fuentes.

Las ejecuciones remotas y sus resultados se pueden consultar en [GitHub Actions](https://github.com/pablohidalgochile-source/LOGIKAPPS/actions/workflows/check.yml). La prueba gráfica local se informa por separado; no se presenta como una prueba de escritorio en los runners.

## Límites

Estas pruebas no certifican todas las operaciones de las aplicaciones que cada persona agregue, ni todas las versiones de macOS. La prueba visual local se realizó en Apple Silicon; el ejecutable Intel se comprueba por separado en CI. El lanzamiento de una herramienta depende también de su instalación y permisos.

La app tiene firma ad-hoc; el contenedor DMG no tiene firma propia y la descarga no está notarizada por Apple. La verificación de integridad no equivale a superar Gatekeeper. Consulta [Instalación](INSTALACION.md).
