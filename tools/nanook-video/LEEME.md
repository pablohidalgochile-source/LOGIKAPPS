# NANOOK VIDEO — versión 2, beta portable

Herramienta local para descargar audio y video público de YouTube, gestionar una cola y trabajar con archivos en el taller de mejora. El paquete trae la interfaz y el servidor; no es una `.app` autónoma y no incluye videos, historial ni programas de terceros.

## Requisitos

- **Node.js 22.13 o posterior**, descargable en [nodejs.org](https://nodejs.org/en/download/). Se usa también como motor JavaScript de yt-dlp; [EJS requiere Node 22 como mínimo](https://github.com/yt-dlp/yt-dlp/wiki/EJS#node).
- **Python 3.10 o posterior**, descargable en [python.org](https://www.python.org/downloads/macos/), para preparar el motor propio de yt-dlp.
- **ffmpeg y ffprobe** para unir pistas, convertir formatos y analizar archivos del taller. Consulta [ffmpeg.org](https://ffmpeg.org/download.html). Si ya utilizas Homebrew, puedes instalar ambos con `brew install ffmpeg`.
- Navegador actualizado, conexión a Internet para consultar YouTube y suficiente espacio libre para tus archivos.

La app no instala Node, Python, ffmpeg ni servicios del sistema automáticamente.

## Preparar una vez y abrir

1. Descomprime el pack. Conserva la carpeta completa **NANOOK-VIDEO** en una ubicación donde puedas guardar archivos, por ejemplo Documentos.
2. Instala los requisitos anteriores.
3. Ejecuta **Preparar NANOOK VIDEO.command**. Crea `.runtime/venv` dentro de esta carpeta e instala `yt-dlp[default]>=2026.5.16`, incluidos sus componentes EJS. Requiere Internet. Comprueba también la presencia de ffmpeg y ffprobe.
4. Ejecuta **Abrir NANOOK VIDEO.command**. Se abre una dirección local, normalmente `http://127.0.0.1:4317`, o un puerto libre hasta el 4326.

Mantén Terminal abierto mientras usas la app. Pulsa **Control+C** para detenerla. El lanzador solo abre esta copia: no redirige a una app permanente instalada ni crea LaunchAgents. Si esta misma carpeta ya está abierta, vuelve a su ventana local.

**Abrir no instala dependencias.** Si la pantalla indica que falta el motor, ejecuta la preparación o revisa los requisitos. En LOGIKAPPS conecta **Abrir NANOOK VIDEO.command** como lanzador `.command`. Si macOS bloquea el archivo descargado, consulta [la guía de Apple](https://support.apple.com/es-cl/102445); no desactives sus protecciones.

Preparación equivalente desde Terminal, dentro de esta carpeta:

```bash
python3 -m venv .runtime/venv
.runtime/venv/bin/python3 -m pip install -r requirements.txt
```

Para abrir después: `node launcher.mjs`. Para iniciar sin abrir automáticamente el navegador: `node launcher.mjs --no-open`. No hacen falta paquetes npm para ejecutar esta herramienta.

## Descargar y guardar

Pega un enlace público individual de YouTube o Shorts, analiza los formatos y elige video, audio o pistas separadas. **Calidad original** conserva los formatos disponibles; **MP4 compatible** busca H.264/AAC y puede limitar la resolución. La app no garantiza que todos los videos o resoluciones estén disponibles.

Puedes cancelar trabajos y reintentar errores. Los archivos se guardan en `downloads/`; el historial está en `.data/jobs.json`, dentro de esta copia. No incluye playlists, contenido privado, compras, inicio de sesión ni cookies del navegador. Usa únicamente contenido para el que tengas permiso.

## Taller e IA

Puedes importar archivos propios y trabajar con formatos, ajustes de audio, resolución y muestras de comparación usando ffmpeg/ffprobe. No sobrescribe el original importado: crea otra copia y necesita espacio adicional.

**El motor de IA Real-ESRGAN y sus modelos no están incluidos en este pack.** La función de IA permanece no disponible mientras no exista un motor compatible y verificado. El taller estándar de ffmpeg sigue disponible; este paquete no promete IA lista ni descarga modelos al abrir. FLAC y el escalado no recuperan por sí solos la calidad perdida de la fuente.

## Mantenimiento y datos

Para actualizar voluntariamente el motor de descarga, cierra la app y ejecuta desde esta carpeta:

```bash
.runtime/venv/bin/python3 -m pip install --upgrade 'yt-dlp[default]'
```

No se actualiza en segundo plano. Puedes especificar ejecutables propios mediante `YTDLP_PATH`, `FFMPEG_PATH` y `FFPROBE_PATH`; `PORT` permite elegir otro puerto base. La configuración normal usa rutas relativas dentro de esta carpeta o programas de tu `PATH`.

El servidor escucha solo en `127.0.0.1` y exige un token local para las acciones de escritura. No ofrece acceso desde otros computadores. Las solicitudes a YouTube se realizan al analizar o descargar; los archivos y el historial se guardan en tu Mac. Conserva `downloads/` y `.data/` cuando actualices o muevas tu copia.

## Verificación y límites de esta entrega

`npm test` ejecuta las pruebas locales de formatos, selección y opciones de mejora sin descargar audio o video. Esta copia se verifica con arranque en una carpeta temporal, estado vacío y lectura de la interfaz y salud local. No se probaron nuevas descargas, compras, captura de audio ni modelos IA al preparar este pack. La disponibilidad de YouTube y las versiones futuras de yt-dlp pueden cambiar.
