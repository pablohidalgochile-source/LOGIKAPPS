# NANOOKEY · DJ Brain público

Incluye el mismo prototipo visual DJ Brain y el escáner local. Los datos de ejemplo son ficticios: no se distribuyen bibliotecas, rutas, historiales, cuentas ni música de otra persona.

## Abrir y agregar a Mis apps

1. Instala Python 3 desde python.org si no lo tienes. Para ver el prototipo necesitas internet: carga React, Babel y otros recursos de sus CDN públicos.
2. Descomprime el pack completo en una carpeta permanente. Abre `Abrir NANOOKEY.command`. Mantén esa ventana abierta mientras lo usas; Control+C detiene el servidor.
3. En LOGIKAPPS → Packs de apps → Laboratorio → NANOOKEY → Conectar lanzador, elige ese mismo archivo y guarda. Si ya tienes NANOOKEY, edita su acceso para elegir el nuevo lanzador en lugar de crear otra ficha.
4. Para explorar, usa los datos ficticios. Para importar un resultado propio, usa el ZIP generado por el escáner. No necesitas una cuenta para la demo.

## Escáner opcional

Ejecuta `python3 nanookey_local_scanner.py --help` y usa tus propias carpetas, una importación Serato autorizada y una carpeta de salida nueva. `mutagen` es opcional para metadatos. El escaneo es local y no modifica los archivos musicales. No se ejecuta automáticamente al abrir el prototipo.

## Límites

La app completa sigue en desarrollo. Varias pantallas y botones son maquetas; las propuestas IA y conexiones del panel Ajustes no representan servicios conectados. La identificación de audio con AudD es opcional y requiere tu propia cuenta: al ejecutarla con una clave, envía fragmentos de audio al proveedor según sus condiciones. No se comprobó esa operación en esta entrega.

Los datos importados se guardan en este navegador y dirección local. Exporta una copia antes de sustituir el pack o cambiar de puerto/navegador. Consulta las condiciones actuales de los proveedores; no se incluyen claves ni cuotas pagadas.
