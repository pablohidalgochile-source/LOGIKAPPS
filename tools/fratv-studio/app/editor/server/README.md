# Servicio local de producción

`server.mjs` combina el manifiesto FRATV y el catálogo separado de Fraternidad.
Los archivos originales no se reemplazan. El exportador valida la ruta exacta de
cada recurso y admite PNG, MOV ProRes con alfa, MP4 y HTML para OBS.

## Control de relojes

Los recursos de Fraternidad declaran `liveMode` en su manifiesto. Inicio, cuenta
regresiva y pausa usan cuenta regresiva; «En vivo» comienza como cronómetro.
`live-client.js` espera el runtime de la gráfica antes de mostrarla, consulta el
estado compartido cada medio segundo y dibuja el tiempo entre consultas.
Pausar el reloj no pausa la animación. Recargar o cambiar de formato no reinicia
un canal existente. Si se pierde la conexión, la fuente se oculta.

Los elementos con `data-clock-format="short"` muestran `mm:ss` y añaden las horas
cuando corresponda. Los HTML históricos mantienen su formato anterior.
Los relojes se exportan como fuente viva y PNG de referencia, con una advertencia
si se solicitó video; un MOV o MP4 no puede responder al control de OBS.

## Paquete portátil y tipografías

El ZIP contiene recursos HTML/CSS/JS, ambos manifiestos, logos de marca locales,
configuración y estado de relojes, servidor y dock. `portable.mjs` se ejecuta
con Node, sin dependencias del editor. Usa el puerto 8796 por defecto; la variable
`FRATV_PORT` permite otro puerto. El valor 0 reserva uno libre para las pruebas.

**Las fuentes de Google Fonts todavía requieren conexión.** Se conservan los
presets Manrope, Instrument Sans e Inter y su configuración en el recurso y en
las URLs; no se descargaron ni incrustaron los binarios tipográficos en el ZIP.
Los logos de marca locales sí viajan en el paquete. Los logos externos conservan
sus URLs. No se debe presentar este paquete como completamente autónomo sin red.

## Comprobaciones

Desde `editor/`, `npm run test:server` comprueba estado, persistencia, validación,
cola, cancelación, ZIP y arranque real del servidor portátil. La prueba adicional
`node server/fraternidad-browser.mjs` inicia un servicio aislado, usa Chrome,
exporta archivos reales, descarga y extrae el ZIP y vuelve a abrir sus fuentes.
Necesita las dependencias de `../scripts/`, Chrome, ffmpeg, ffprobe y unzip.
Guarda informes y archivos en una carpeta temporal indicada al terminar.

En la verificación del 31 de octubre de 2026 pasaron siete pruebas del servidor
y seis comprobaciones de producción Fraternidad. Se comprobó que la tipografía
editorial estaba realmente cargada en el paquete extraído. Estas pruebas no
acreditan rendimiento de GPU ni funcionamiento dentro de la aplicación nativa
OBS; esa validación operacional se realiza por separado.
