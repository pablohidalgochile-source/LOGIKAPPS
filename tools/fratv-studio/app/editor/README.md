# FRATV Overlay Studio · 0.2.0

Editor y preparación local de programas, actualizado el 31 de octubre de 2026.
Conserva los 18 HTML originales y suma 17 recursos propios de Fraternidad.
Incluye proyectos, episodios, importación, exportación y control de relojes para
fuentes de navegador en OBS. Los tres pilotos Fraternidad fueron aprobados por
el usuario; sus seis referencias se conservan separadas de FRATV.

## Abrir

En `editor/`:

```bash
npm install
npm run dev
```

Abre http://127.0.0.1:5178. El servicio escucha solo en este computador.
Necesitas Node 22.18+, Chrome, ffmpeg e `zip`. Para renderizar, instala también
las dependencias de `../scripts/` con `npm install`. Google Fonts y los logos
remotos necesitan conexión.


Para encender el editor y las fuentes de tu colección de OBS con un solo doble
clic, abre **`../ABRIR-EDITOR-Y-OBS.command`**. Comprueba Node 22.18+ y las
dependencias instaladas, reutiliza los servicios correctos de los puertos 5178
y 8790 y abre el editor y OBS. Si el build está al día usa `preview` con la API;
si falta o está desactualizado usa desarrollo. No instala ni compila al arrancar.

Mantén su ventana abierta mientras transmites. Control + C detiene únicamente
los servicios que haya iniciado esa ventana; los servicios reutilizados conservan
su ventana original. No modifica colecciones ni fuentes de OBS. El dock general
es http://127.0.0.1:5178/live-control?grupo=fraternidad. Requiere Python 3 si
necesita iniciar el servidor de recursos de las escenas existentes en 8790.

`../ABRIR-EDITOR-Y-OBS.command --comprobar` verifica los servicios sin abrir apps
ni iniciar procesos. `--sin-abrir` inicia o reutiliza los servicios sin abrir el
navegador ni OBS. Para actualizar una compilación puedes ejecutar `npm run build`
una vez; el lanzador también funciona sin ella.

## Preparar un programa

1. Abre **Programa y proyectos**. Crea un proyecto o duplica un episodio anterior.
2. En **Plantilla**, elige las piezas que siempre usa ese programa. Puedes guardar
   selecciones propias; hay ejemplos de entrevista, conversación, coproducción y
   dos plantillas exclusivas de Fraternidad.
3. Completa **Episodio**: nombre, fecha, conductor, invitados/cargos, temas y
   auspiciadores. También puedes importar un brief.
4. Pulsa **Preparar todas las piezas**. Cada persona recibe su placa. Revisa las
   piezas en el selector del episodio o desde el panel. Puedes ajustar cada una.
5. Pulsa **Exportar** y elige pieza actual, programa completo o biblioteca.

Volver a preparar reemplaza las piezas y ajustes manuales después de confirmarlo.
Los ajustes de reloj se trasladan a las nuevas piezas equivalentes y se depuran
las configuraciones que ya no corresponden al programa.
Los textos demasiado largos se advierten antes y se ajustan al límite del recurso.
Los logos de auspiciadores se asignan al revisar sus piezas, no se inventan.

## Guardado e importador general

El editor guarda automáticamente en **este navegador y este origen local**.
Al recargar recupera el proyecto actualizado más recientemente. Se admiten hasta
30 proyectos locales; si el almacenamiento falla, se muestra un error y puedes
respaldar el proyecto. Un guardado corrupto no se reemplaza silenciosamente.

**Exportar proyecto** descarga `.fratv.json`: plantilla, episodio, piezas, textos,
tema, formato y configuración de relojes. **Importar como copia** valida el archivo
y crea otro proyecto, conservando los existentes. Los assets propios del catálogo
viajan en el paquete OBS. Los logos externos siguen siendo enlaces; no se copian
automáticamente ni se aceptan archivos de diseño arbitrarios.

El brief se pega o se carga como TXT, con etiquetas como estas:

```text
Programa: Conversaciones FRATV
Fecha: 2026-11-01T21:00
Conductor: Ana Pérez
Cargo conductor: Conductora
Invitado: Juan Soto | Músico
Invitada: María Lagos | Directora
Tema: Cultura y comunidad
Auspiciador: Nombre del auspiciador
```

La interfaz muestra los datos reconocidos y las líneas no reconocidas. Solo se
aplican tras revisar. No usa IA, no interpreta PDF/Word ni deduce datos ausentes.
Importar un brief actualiza el formulario; las piezas existentes se conservan
hasta volver a prepararlas.

## Exportador general

Selecciona uno o varios formatos de lienzo y salidas. En biblioteca, elige la
identidad: FRATV, Fraternidad o coproducción. La selección inicial corresponde
a la pieza actual para evitar mezclar marcas involuntariamente. Cada recurso se incluye
solo en sus relaciones compatibles. Límite de 60 combinaciones pieza/formato por
paquete. La cola es serial, muestra progreso, permite cancelar y conserva el
historial después de recargar.

- **PNG:** el cuadro seleccionado, con alfa cuando la pieza lo admite.
- **MOV:** video ProRes 4444, con alfa cuando corresponde.
- **MP4:** H.264 compuesto sobre negro.
- **OBS:** recursos HTML, assets, servidor local portátil, listado de URLs y dock
  de control. Incluye el proyecto editable y las instrucciones.

Los videos se capturan con el mismo `seek()` a 60 fps. La cola captura en Chrome y
codifica con ffmpeg; no es instantánea. Las piezas estáticas salen como PNG. Los
relojes reales se entregan como fuente viva y una instantánea PNG de referencia,
con advertencia explícita si se solicitó video. No se simula un reloj controlable
con un MOV. El stinger conserva su punto de corte de 400 ms.

Los resultados se guardan en `editor/.local/exports/` y se descargan desde la
interfaz. No se versionan en git. El estudio anterior sigue disponible en
`../scripts/` con `npm run estudio`.

## Relojes reales desde OBS

Disponibles para **Cuenta regresiva**, **EN VIVO** en variante reloj y
**EN BREVE COMIENZA**, además de **Inicio**, **Cuenta regresiva**,
**En vivo / tiempo transcurrido** y **Pausa** de Fraternidad:

1. Abre **En vivo** en el inspector.
2. Elige cuenta regresiva o tiempo transcurrido, duración u hora objetivo.
3. Copia la URL de la gráfica y agrégala como **Fuente de navegador** de OBS con
   el tamaño del formato seleccionado.
4. Copia la URL del panel y agrégala como **dock de navegador personalizado**.
5. Desde el dock puedes iniciar, pausar, reiniciar y mostrar/ocultar la gráfica.

**Pausar el reloj no detiene la animación decorativa.** La fuente y el panel
comparten el tiempo del servidor. Recargar la fuente no reinicia el conteo.
El transporte de la vista previa del editor es independiente; para comprobar el
reloj compartido pulsa **Ver la fuente en vivo en el lienzo**.

La configuración viaja en `.fratv.json`. El estado en ejecución se conserva en
`editor/.local/live.json`; el paquete portátil también conserva el estado de los
canales exportados. Dos formatos de la misma pieza usan el mismo canal. Mantén
el servidor abierto durante la transmisión. Si se pierde la conexión, la fuente
viva se oculta para no mostrar un reloj desincronizado.

Para usar el ZIP en otro computador, descomprímelo y abre `INICIAR.command` en Mac,
o ejecuta `node runtime/portable.mjs`. Después abre
http://127.0.0.1:8796/fuentes.html. Requiere Node, pero no React, Puppeteer ni ffmpeg
para mostrar las fuentes vivas. Usa sus URLs en OBS. Las fuentes y logos remotos
siguen necesitando internet.

## Verificación

```bash
npm test                     # adaptadores, proyectos y relojes guardados
npm run test:server          # cola, validación, relojes y paquete portátil
npm run build               # tipos y compilación
npm run test:browser         # editor original; servidor activo en 5178
npm run test:projects        # guardado, formulario, brief, respaldo e importación
npm run test:production      # exportación real y dos fuentes sincronizadas
npm run test:fraternidad      # 34 renders, referencias aprobadas, tipografías
npm run test:fraternidad-production # fuentes vivas, archivos y paquete Fraternidad
npm run test:fraternidad-editor # plantillas, fuentes, guardado y controles
npm run test:clock-rounding    # panel/fuente con tiempos fraccionarios
```

Las pruebas de navegador usan Chrome y las dependencias de `scripts/`. Generan
capturas e informes en la carpeta temporal del sistema. `test:production` también
usa ffprobe/unzip para inspeccionar los archivos descargados.

En `../scripts/` siguen siendo obligatorios `npm test` y `npm run test:regresion`.
Las referencias FRATV no se regeneraron. Las de Fraternidad se capturaron desde
los tres pilotos originales tras la aprobación explícita del usuario. La cuenta regresiva sigue excluida de la
comparación visual determinista por su reloj real.

## Límites actuales

- Sin cuentas ni sincronización en nube. Borrar los datos del navegador borra sus
  proyectos locales; conserva respaldos JSON.
- Sin edición por capas, efectos, audio ni importación de archivos de diseño.
- 1:1 y 4:5 siguen pendientes de revisión visual pieza por pieza.
- El control vivo está comprobado en Chrome, en el paquete independiente y en
  OBS 33.0.1 con sus cuatro fuentes reales y el dock. Se observó una pantalla
  negra transitoria cuya causa no se determinó; las capturas y controles finales
  pasaron. La medición de GPU y una transmisión prolongada siguen pendientes.
- Las catorce extensiones de Fraternidad siguen la dirección de los tres pilotos
  aprobados; no se registran como aprobaciones individuales nuevas. Las tres
  coproducciones actuales se conservan.

## Fraternidad y tipografías

En Biblioteca, filtra **Fraternidad** para ver sus 17 piezas. Sus composiciones
están disponibles en horizontal y vertical. La paleta azul, dorada y marfil
permanece fija; en **Estilo → Tipografía** puedes elegir:

- **Aprobada:** Manrope + IBM Plex Mono; conserva la referencia visual.
- **Editorial:** Instrument Sans + IBM Plex Mono.
- **Neutra:** Inter + IBM Plex Mono.

La selección se guarda en el proyecto y acompaña al exportador y a OBS. Las
fuentes se cargan antes de medir el texto. Los logos originales no cambian.
Google Fonts requiere conexión; el paquete no incluye sus binarios.

Los HTML y manifiesto están en `../handoff/fraternidad/`; consulta su README.
`/pilotos-fraternidad/` conserva la presentación histórica de los tres pilotos;
las versiones conectadas al editor y al control vivo están en el catálogo.
