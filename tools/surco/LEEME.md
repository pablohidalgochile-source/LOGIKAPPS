# Surco 0.1.0 — beta portable para Mac

Surco es una herramienta local para organizar audio, explorar enlaces de Bandcamp, SoundCloud, hearthis.at y Jamendo, y guardar grabaciones de una pestaña de Chrome. Este ZIP contiene el código de la herramienta y su interfaz: **no es una aplicación .app autónoma** y no incluye Python, yt-dlp, ffmpeg, música ni una biblioteca de ejemplo.

## Preparar este Mac una vez

1. Instala **Python 3.10 o posterior** si todavía no lo tienes. Puedes obtenerlo en [python.org](https://www.python.org/downloads/macos/).
2. Descomprime el ZIP y mueve la carpeta **Surco** a un lugar donde puedas guardar archivos, por ejemplo Documentos. Conserva toda la carpeta junta.
3. Abre Terminal en esa carpeta y prepara un entorno propio para Surco:

```bash
python3 --version
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
```

El requisito Python es CPython 3.10 o posterior. `requirements.txt` solicita `yt-dlp>=2026.5.16`. La instalación de dependencias requiere Internet y solo se realiza cuando ejecutas ese comando; Surco no instala ni actualiza programas automáticamente. [yt-dlp publica sus requisitos y documentación](https://github.com/yt-dlp/yt-dlp#dependencies).

**ffmpeg es opcional.** Se necesita para unir algunas descargas de audio por fragmentos y para convertir grabaciones a MP3 o FLAC. Debe ser el ejecutable ffmpeg, no un paquete Python del mismo nombre. Puedes consultar [ffmpeg.org](https://ffmpeg.org/download.html); si ya usas Homebrew, puedes instalarlo tú con `brew install ffmpeg`. Sin ffmpeg, Surco permite guardar descargas directas disponibles y el original WebM de una grabación.

Para grabar el audio de una pestaña, usa **Google Chrome actualizado**. Otros navegadores pueden servir para ver la biblioteca o explorar enlaces, pero esta beta no garantiza captura de audio de pestaña en ellos.

## Abrir y conectar con LOGIKAPPS

Haz doble clic en **Abrir Surco.command**. El lanzador utiliza `.venv/bin/python3` cuando existe; en caso contrario intenta usar `python3` ya instalado. Abre Chrome si lo encuentra o tu navegador predeterminado. La dirección es local, `http://127.0.0.1:8765`, o el primer puerto libre hasta el 8774.

Mantén la ventana de Terminal abierta mientras usas Surco. Para detenerlo, vuelve a ella y pulsa **Control + C**. No se instala un servicio permanente.

En LOGIKAPPS, agrega un acceso del tipo **Lanzador .command** y elige el archivo **Abrir Surco.command** dentro de la carpeta descomprimida. Si llegas desde Explorar, utiliza la opción de conectar el lanzador cuando aparezca. LOGIKAPPS pedirá confirmación antes de ejecutarlo. No conectes el ZIP: primero debes descomprimirlo y preparar los requisitos.

Si macOS bloquea el lanzador descargado, consulta [Abrir apps de forma segura en el Mac](https://support.apple.com/es-cl/102445). No desactives las protecciones de macOS ni borres la cuarentena para forzar la apertura. El ZIP conserva el permiso ejecutable del lanzador; si una herramienta de descompresión lo pierde, revisa el código y los permisos del archivo. También puedes ejecutar la fuente que hayas revisado desde su carpeta, sin cambiar las protecciones del sistema:

```bash
.venv/bin/python3 launcher.py
```

La captura de pestaña requiere una selección explícita en Chrome: elige la pestaña y activa **Compartir audio de la pestaña**. Si macOS pide permiso de captura para Chrome, revísalo en Ajustes del Sistema → Privacidad y seguridad. No pide acceso al micrófono. Consulta los [controles de captura de Chrome](https://developer.chrome.com/docs/web-platform/screen-sharing-controls/).

## Usar la herramienta

- **Desde un enlace:** pega una canción, álbum o lista concreta de las plataformas indicadas y explora los formatos disponibles. Un perfil completo no sirve como canción. Algunas publicaciones, formatos o descargas pueden no estar disponibles.
- **Grabar una pestaña:** comparte el audio de una pestaña de Chrome, inicia y detén la grabación y guárdala. La grabación tarda lo mismo que la reproducción y no divide canciones automáticamente.
- **Biblioteca:** los archivos nuevos se guardan por artista y álbum en `biblioteca/`, dentro de esta carpeta. El índice es `biblioteca/index.json`. Conserva la carpeta biblioteca completa cuando muevas o actualices Surco.

Solo usa contenido para el que tengas los permisos necesarios. Poder reproducirlo no concede derechos de redistribución. Surco no inicia sesiones, no extrae cookies ni elude DRM. Una descarga o grabación mantiene las limitaciones de la fuente; convertir a FLAC no recupera calidad perdida. Límite de esta beta: 512 MB por archivo.

## Privacidad y alcance de esta entrega

El servidor escucha únicamente en `127.0.0.1`, comprueba el origen de las solicitudes y genera un token local temporal para operaciones de escritura. No publica tu biblioteca en Internet. Explorar o descargar enlaces sí conecta con las plataformas de origen. La captura y conversión se realizan en tu Mac.

Esta distribución excluye cualquier biblioteca previa, registros, cachés, credenciales, entornos de Python o historial del creador. Para pruebas o un destino alternativo se admite la variable `SURCO_LIBRARY`; si no la configuras, se usa la biblioteca de esta carpeta.

Se verificaron la compilación de los archivos Python, el arranque en un directorio temporal, la respuesta local de estado y los recursos de la interfaz. **En la preparación de este ZIP no se probaron nuevas descargas ni captura de audio.** La disponibilidad de las plataformas depende también de yt-dlp y puede cambiar. Esta beta no es un producto oficial de esas plataformas.
