# TRACKHUNT — beta portable

TRACKHUNT ayuda a identificar una canción y encontrar versiones, remixes y enlaces. Incluye la herramienta **Sets → Deezer**, que convierte una lista de canciones en enlaces exportables. No descarga audio ni trae una colección musical.

## Preparación inicial

Requiere **Node.js 22.13 o posterior con npm** y conexión a Internet. Puedes instalar Node desde [nodejs.org](https://nodejs.org/en/download/). Después:

1. Descomprime el pack y mueve la carpeta completa **TRACKHUNT** a una ubicación donde puedas escribir, por ejemplo Documentos.
2. Ejecuta **Preparar TRACKHUNT.command**. Descarga las dependencias definidas en `package-lock.json` y compila la interfaz en esa carpeta.
3. Cuando termine, ejecuta **Abrir TRACKHUNT.command**.

La preparación equivale a `npm ci --no-audit --no-fund` y `npm run build`. Solo se ejecuta cuando tú abres el preparador. **Abrir TRACKHUNT.command no instala ni actualiza dependencias**: si faltan, te indica que prepares la herramienta.

Se abre en el navegador con una dirección `http://127.0.0.1:4318` o el primer puerto libre hasta el 4327. Mantén Terminal abierto mientras la usas. Para detenerla, pulsa **Control+C** en esa ventana. No instala servicios ni se abre al iniciar el Mac.

En LOGIKAPPS conecta **Abrir TRACKHUNT.command** como lanzador `.command`. Mantén las demás carpetas del paquete junto al lanzador. Si macOS bloquea un archivo descargado, consulta [las instrucciones de apertura segura de Apple](https://support.apple.com/es-cl/102445); no desactives las protecciones del sistema.

Desde Terminal puedes usar `node launcher.mjs`; `node launcher.mjs --no-open` inicia el servidor sin abrir otra ventana de navegador. No publiques este servidor local en Internet.

## Qué funciona sin claves propias

- Buscar el nombre de una canción en el catálogo público de Apple.
- Leer título y metadatos públicos de enlaces de YouTube o SoundCloud. Esto no reconoce el audio de un minuto concreto de un set.
- Confirmar manualmente título y artista, abrir búsquedas en SoundCloud y Bandcamp y exportar enlaces seleccionados a CSV.
- Usar **Sets → Deezer** con una tracklist manual o metadatos públicos disponibles y exportar enlaces a TXT, CSV, M3U o JSON. La exportación no descarga música ni necesita OAuth.

Estas consultas requieren Internet y dependen de la disponibilidad de cada plataforma. Si una fuente no responde o falta una conexión, la app lo indica; no inventa resultados. La selección de enlaces dura la sesión: exporta lo que quieras conservar.

## Conexiones opcionales

La app se entrega sin credenciales. Puedes copiar `.env.example` a `.env.local` y completar solo las conexiones propias que necesites; reinicia después. No compartas `.env.local` ni lo incluyas en un pack.

- `BRAVE_SEARCH_API_KEY`: consulta automática del índice web de remixes en Bandcamp y SoundCloud. Sin ella se ofrecen enlaces de búsqueda externa; eso no significa que no existan remixes.
- `SOUNDCLOUD_CLIENT_ID` y `SOUNDCLOUD_CLIENT_SECRET`: alternativa para consultar directamente el catálogo de SoundCloud.
- `AUDD_API_TOKEN`: reconocimiento de audio con tu cuenta AudD. Al usar **Audio**, se envía a AudD un fragmento WAV de hasta 12 segundos; no es reconocimiento local. Sin token propio, esta versión intenta el modo público de evaluación `test`, sujeto a disponibilidad y cuota del proveedor. Puedes omitirlo y escribir la canción manualmente.
- Las variables `DEEZER_*` corresponden a una integración OAuth opcional. No hacen falta para la búsqueda pública ni para exportar enlaces. Si la configuras, el callback registrado debe coincidir con la dirección y el puerto utilizados.

La app no crea cuentas ni configura claves por ti. Revisa condiciones y cuotas de los proveedores antes de activar conexiones propias.

## Contenido y privacidad

Este paquete contiene fuentes, archivos de dependencias, recursos de interfaz y pruebas. No incluye `node_modules`, compilaciones del Mac del creador, bibliotecas, claves, registros ni datos privados. La interfaz no requiere Sites, Cloudflare, una cuenta ChatGPT ni una base de datos: esta copia se adapta al servidor local de [vinext](https://github.com/cloudflare/vinext).

El preparador crea `node_modules/`, `dist/` y posibles cachés locales. Son reconstruibles. Los archivos `.env.local` o exportaciones personales deben conservarse aparte y no publicarse. Para actualizar, usa una copia nueva y vuelve a preparar sus dependencias; no copies `node_modules` entre Macs.

## Verificación

`npm test` ejecuta pruebas del modelo y de las conexiones usando respuestas controladas. Para esta copia se verifica además una instalación limpia, la compilación y el arranque local aislado. No se configuraron claves ni se descargó música durante la preparación del pack. Las funciones que requieren proveedores reales o sus cuotas se comprueban con las cuentas de cada usuario al utilizarlas.
