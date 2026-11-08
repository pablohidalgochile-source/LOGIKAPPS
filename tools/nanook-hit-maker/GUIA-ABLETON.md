# NANOOK HIT MAKER 0.7 — notas, estructura y audio sincronizados

Un proyecto musical compartido entre JAVITA, MAGIC MUSIC PROMPT y Contrapista. Analiza una canción, escribe música y crea ideas/letras/prompts. Entrega notas, stems y estructura al Set abierto de Ableton. Después, las ediciones de notas, secciones y clips de audio se sincronizan automáticamente en ambos sentidos y actualizan JAVITA, con autoguardado e historial.

## Abrir

Ejecuta `Abrir NANOOK HIT MAKER.command`, o desde esta carpeta:

```sh
python3 server.py
```

Abre `http://127.0.0.1:8771/`. El servidor requiere Python 3.10+; el motor de análisis requiere NumPy, FFmpeg y FFprobe. El lanzador utiliza el Python 3.13 ya instalado en este Mac, que contiene NumPy. MAGIC requiere Node 22+ y conexión a Internet. No instala paquetes. La terminal mantiene la app activa; Ctrl+C la detiene. Si el puerto ya está ocupado, abre la dirección existente o usa `--port 8772` para una segunda instancia.

## Producir directamente en Ableton

El puente **NanookHitMaker 0.7.1** debe instalarse en la biblioteca de usuario de cada Mac y seleccionarse como superficie de control, con entrada y salida MIDI **Ninguno**. No requiere Max for Live, puertos virtuales, credenciales ni servicios externos. Sincronización automática comprobada con **Live Suite 12.4.3**. Live aplicó su actualización automática pendiente durante el reinicio necesario del puente.

### Stems y clips de audio en ambos sentidos

Los proyectos vinculados incorporan sus pistas de audio NHM automáticamente en **Proyecto → Stems y clips sincronizados**, conservando el estado anterior en el historial. Se reciben archivos nuevos o sustituidos desde Live, sus posiciones, recortes, duración, nivel del clip en dB, transposición, afinación, nombres y activación. También se reciben clips añadidos, duplicados o retirados dentro de esas pistas. Las pistas ajenas al vínculo no se adoptan.

Edita estos mismos ajustes en NANOOK: el autoguardado prepara la escucha y actualiza automáticamente el Arrangement. **Archivo del clip** permite sustituirlo por otro audio ya guardado en la canción; **Añadir stem** crea una pista vinculada nueva. Un análisis nuevo de Contrapista sustituye los stems de análisis correspondientes por sus versiones nuevas y añade los que falten, manteniendo los canales y sus dispositivos. Una referencia subida no se envía como stem hasta elegirla.

Los archivos recibidos se copian con SHA-256 a versiones inmutables dentro del proyecto NANOOK. Las muestras enviadas se copian con verificación al proyecto real de Live mediante nombres basados en contenido. No se sobrescriben las copias usadas por revisiones anteriores. Detectar una muestra nueva o consolidada en Live no exige exportarla ni importarla a mano en NANOOK. La detección de cambios de contenido utiliza tamaño y fechas del archivo; una escritura incompleta vuelve a comprobarse y no sustituye una versión válida.

Cada pista ofrece una **escucha local antes de efectos y mezcla**. FFmpeg representa posición, recorte, nivel, mute y cambio de velocidad/afinación del audio sin Warp. La escucha generada no reemplaza el original ni imprime los instrumentos, plugins, automatización, fades o envolventes de Live. Se comparan los tiempos a milisegundos, el nivel a décimas de dB y la afinación a cents para evitar eco por precisión nativa.

La sincronización admite **audio sin Warp ni bucles**, hasta 24 pistas y 64 clips de audio por canción, 1 GB y 30 minutos por muestra, sin solapamientos dentro de una misma pista. El Arrangement sigue usando BPM constante coincidente y 4/4; durante reproducción o grabación se espera. La lectura conserva clips con envolventes como fuentes/ajustes, pero la escucha no imprime esas envolventes y una escritura posterior se bloquea para protegerlas. Para trabajar material con Warp/groove/envolventes, conserva el original en Live y prepara una versión consolidada sin ellos. Las ediciones de fades no se sincronizan. Al cambiar archivo o posición se recrean solo los clips de la pista de audio afectada; los fades automáticos de Live pueden volver a generarse. Ajustar el nivel, recorte o afinación sin mover/sustituir el archivo conserva el clip existente.

La comparación por pista combina audio y notas editados en componentes distintos. Si ambos lados cambian una misma pista de audio, se conservan las alternativas y se elige NANOOK o Ableton en el aviso de conflicto. **Recuperar** una revisión que incluye clips de audio crea una versión nueva y la devuelve a Live automáticamente. Las revisiones previas a 0.7 carecen de montaje de audio: recuperan sus otros datos y mantienen el montaje de audio actual.

Las revisiones aceptadas incluyen archivos fuente y escuchas y viajan en el respaldo ZIP con su historial. El límite del respaldo/restauración sigue siendo **2 GB**; el historial de audio puede ocupar espacio considerable. El Set externo de Ableton se guarda y respalda aparte. Los borradores pendientes, capturas de control y baselines del vínculo quedan en `data/ableton/`, fuera del ZIP portable; restaurar el ZIP crea otro id que necesita su vínculo propio.

La prueba real con el fixture sintético Umbral incorporó cuatro stems en r11; nivel de NANOOK −3 dB a Live en r12; nivel nativo −4 dB recibido en r13; una muestra invertida con archivo nuevo de Live recibida en r14; posición 1 s, recorte 0,5 s, duración 20 s, +3 dB y +2 semitonos enviados en r15. Recuperar r14 creó r16 y restauró esos ajustes en Live; recuperar r15 creó r17 y devolvió la edición nueva. Los originales y ambas versiones de audio permanecen en el historial. La primera escucha de la muestra invertida detectó una fracción de segundo que FFmpeg no admitía en notación exponencial: se corrigió, se probó y se reanudó desde la versión conservada.

### Sincronización automática de notas y estructura

En los proyectos ya vinculados, la sincronización queda activa automáticamente. Mantén NANOOK y Live abiertos, el mismo Set guardado y las etiquetas NHM. Edita una nota en JAVITA o Live, o cambia los nombres/límites de sección. **No hace falta pulsar Guardar, Enviar ni Leer cambios.** El estado global aparece en todas las áreas del proyecto y permite pausar/reanudar. La partitura se actualiza sin recargar la página. En Componer, **Estructura compartida · editar secciones** permite escribir nombres, límites y añadir/quitar secciones.

El autoguardado espera aproximadamente 1,1 segundos sin nuevas ediciones. El puente observa Live cada segundo y agrupa cambios estables durante 1,2 segundos; la propagación habitual tarda unos **3–5 segundos**. Se espera a que Live esté **detenido, sin grabar**, con el mismo BPM constante y 4/4. Durante reproducción/grabación el estado indica que los cambios siguen pendientes. No cambia automáticamente el tempo global ni la mezcla.

Cada edición aceptada guarda una revisión con su origen. Las lecturas sin cambios no crean versiones. La comparación con el último estado compartido combina ediciones en partes distintas. Si ambos lados cambian una misma parte o estructura de forma incompatible, se conservan las dos versiones y se pausa ese proyecto para elegir **Usar NANOOK** o **Usar Ableton**. Si clips y localizadores difieren, se elige la fuente de estructura; después se alinean ambas representaciones. Una edición del navegador con revisión antigua se combina con cambios compatibles; si hay conflicto, su borrador queda conservado en disco hasta resolverlo.

Las notas MIDI se actualizan dentro del clip existente: un cambio de altura/velocidad conserva sus identificadores nativos. Mover o redimensionar una nota elimina/añade el evento correspondiente. Los cambios MIDI no recrean los stems, instrumentos o efectos. El tratamiento de los clips de audio se describe arriba. Para escribir automáticamente en una parte existente, esta debe tener **un único clip MIDI de Arrangement desde 1.1.1, sin bucle, sin recorte y activo**, y las notas deben caber en su final. Si preparas un montaje de varios clips, consolídalo desde 1.1.1 antes de escribir de nuevo desde NANOOK. Los montajes complejos sí pueden recibirse, dentro de los límites de lectura descritos abajo.

La cola, pausa, vínculo y estado pendiente se conservan al reiniciar. Se verifica la captura actual antes de mutar y se espera una confirmación posterior desde Live. Una edición nativa más reciente cancela un envío aún no iniciado. Una operación parcial o dudosa se detiene sin reintentos automáticos; revisa/deshaz en Live antes de reanudar. Las capturas anteriores a escrituras y las alternativas en conflicto quedan en `data/ableton/auto-history/`; Live conserva además las capturas previas en `Samples/NANOOK/<id>/sync-history/`.

Este seguimiento forma parte del servidor local: **al cerrar el servidor se detiene**; al abrirlo vuelve a comprobar el Set. No instala tareas del sistema. Guarda también el Set en Ableton para conservar sus cambios nativos en disco. Reabrir un Set antiguo puede interpretarse como restaurar su música; el historial de NANOOK conserva las versiones anteriores.

La prueba nativa llevó **Umbral - mezcla de revisión 5 a 10**: nota de bajo enviada automáticamente desde JAVITA, otra editada en Live recibida sin botones, sección renombrada en NANOOK y localizador movido del compás 6 al 7 en Live, con alineación automática de los clips de estructura. Se conservaron las 513 identidades de notas, los cuatro stems, las 13 pistas, dispositivos, mezcla, nueve assets y textos de MAGIC. Sin ediciones posteriores permaneció en revisión 10, también tras reiniciar NANOOK. El Set previo y el ZIP de revisión 5 están en `data/ableton/before-auto-0.6/`; la revisión 10 restaurada se comprobó en un almacén temporal.

### Primera entrega al Set y controles manuales

Para un proyecto nuevo se hace una primera entrega explícita. Los controles están plegados en Producción bajo **Primera entrega y controles manuales**. Luego se activa el seguimiento del vínculo comprobado:

1. Abre un Set en Ableton y guárdalo una vez. En **Producción** de NANOOK verás su nombre, versión y tempo. Es el destino actual de la entrega; compruébalo antes de enviar.
2. Elige los audios. Se marcan por defecto los stems del último análisis, excluyendo la referencia original, la reconstrucción y el bajo sintetizado. Todas las partes con notas y la estructura compartida se incluyen. La marca de tempo permite aplicar el BPM de NANOOK y 4/4 a todo el Set. Si la desmarcas, el tempo y el compás de Live deben coincidir para mantener la alineación.
3. Detén reproducción/grabación y pulsa **Enviar canción a Ableton**. La app guarda primero tus cambios. Copia las muestras con verificación de integridad a `Samples/NANOOK/<project-id>` del proyecto real de Live y entrega sus notas directamente a la API de Live. No se descargan ZIP ni se arrastran archivos.
4. Live crea clips de Arrangement: una pista MIDI por parte, una de audio por muestra y una pista de estructura con clips de sección, más localizadores nativos. El audio comienza sin Warp, conservando sus segundos originales. Las notas se convierten de segundos a pulsos usando el tempo del proyecto.
5. Espera **Canción incorporada al Set**. El puente comprueba las notas y muestras desde Live después de sus operaciones diferidas de audio y marcadores. Registra también los tiempos MIDI que Live realmente almacenó como referencia para comparar futuras ediciones.
6. Continúa con tus instrumentos y efectos en ese mismo Set. Los nuevos MIDI comienzan silenciados cuando se envían stems; elige y activa tus instrumentos cuando quieras trabajar el MIDI. Guarda el Set en Ableton para conservar la producción.
7. Continúa editando notas y secciones con la sincronización automática activa. Si necesitas una entrega completa de audio o un reemplazo manual, usa **Actualizar pistas en Ableton** dentro de los controles manuales. Conserva dispositivos y mezcla; si hay cambios nativos no representados, requiere revisión antes de sustituir clips.

Las etiquetas entre corchetes **NHM** identifican las pistas y localizadores. Conserva esas etiquetas: puedes cambiar el texto anterior, con revisión antes de actualizar. Si se borran etiquetas, se eliminan pistas vinculadas o se duplican identificadores, el puente se detiene para evitar pistas duplicadas, incluso si marcaste reemplazar cambios. Las pistas congeladas deben descongelarse antes de actualizar. Los marcadores del productor que coinciden en el tiempo se conservan; la sección sigue visible en la pista de estructura.

El puente sincroniza automáticamente notas, estructura y clips de audio del proyecto vinculado. La primera entrega a un Set y los reemplazos manuales completos siguen siendo explícitos. El vínculo incluye la ruta del Set: conserva el nombre/ruta del archivo `.als` mientras lo actualizas. Un Set copiado o renombrado conserva la música, pero necesita recuperar su vínculo antes de nuevas actualizaciones; no se adoptan pistas desconocidas automáticamente.

El Set de ejemplo está en `data/ableton/sets/NANOOK - Umbral Project/`: 513 notas, cuatro stems, dos clips de sección y dos localizadores; sus cuatro pistas originales permanecen. Las comprobaciones anteriores de envío y retorno manual se conservan en `verification/`.

### Lectura manual opcional y límites de recepción

La lectura manual permite revisar una captura antes de aplicarla; pausa primero el seguimiento automático si quieres controlar ese recorrido.

1. Edita las notas de las pistas MIDI NHM en el **Arrangement** de Live. Puedes cambiar alturas, tiempos, duraciones, velocidades, duplicar/mover/recortar clips o borrar sus notas. Conserva las etiquetas de pista. El mute de pista no excluye su música de la partitura; los clips y notas desactivados sí se omiten.
2. Edita los clips de la pista **Estructura**, o los localizadores. Detén reproducción/grabación y pulsa **Leer cambios de Ableton** en Producción. La lectura no modifica el Set ni guarda una partitura nueva.
3. Revisa las partes, conteos y ejemplos de notas. La estructura detecta qué fuente cambió. Si clips y localizadores tienen cambios distintos, elige expresamente cuál usar. La opción de localizadores lee **todos los del Set**, incluidos los del productor.
4. Marca notas, estructura o ambas. Una comparación con la última versión compartida conserva las ediciones de NANOOK en partes que Live no cambió. Si ambos editaron una misma parte o la estructura de forma distinta, hace falta elegir expresamente la versión de Live para sustituir esos componentes.
5. Pulsa **Actualizar partitura**. El puente vuelve a comprobar el Set y la captura, sin modificarlo. Si Live cambió desde la vista previa, se rechaza la aplicación y hay que leer otra vez. Si NANOOK cambió en otra pestaña, se rechaza la revisión obsoleta. Los cambios sin guardar de esta pestaña se guardan primero y se pide revisar la comparación actualizada.
6. La aplicación crea una revisión atómica, con las notas recibidas y los límites/nombres de sección. Conserva título, letra, dirección creativa, tonalidad, acordes, análisis y assets. Las partes modificadas quedan sin marcar como revisadas; se invalida un motivo hits anterior cuando sus notas cambiaron. El historial conserva el estado previo.
7. **Ver partitura actualizada** abre JAVITA. Los rótulos de sección aparecen en el visor y en MusicXML; la paginación conserva los números globales de compás. MAGIC usa estas notas y secciones compartidas en su siguiente propuesta.

La recepción requiere **BPM iguales, tempo constante y 4/4**. Se rechaza la automatización de tempo; el retorno no interpreta un mapa de tempo ni cambios de compás a lo largo del Set. Conserva la polifonía y despliega repeticiones de bucles en eventos del Arrangement. Una nota que atraviesa el límite de un bucle requiere consolidar el clip en Live antes de recibir. El groove queda como posiciones escritas; las probabilidades/variaciones se reducen a eventos y velocidades nominales con aviso. La recepción MIDI no incluye MPE, expresión, CC, dispositivos, mezcla ni automatización. El audio tiene su propio seguimiento de fuentes y clips descrito arriba. Los cambios de esas fuentes siguen en Live; las pistas nuevas del productor permanecen fuera del vínculo. Límite compartido: 24 partes, 100.000 notas y 30 minutos. El visor conserva su cuantización provisional a semicorcheas.

Las lecturas pendientes sobreviven a una recarga bajo `data/ableton/queue`; no están en el ZIP portable hasta aplicar. Los borradores pendientes en conflicto y capturas de control son locales; las revisiones aceptadas sí viajan con su historial. Un proyecto restaurado recibe otro id y necesita su propio vínculo con Live. Las notas, estructura, referencias de comparación y hasta 100 recibos aceptados sí viajan con el proyecto y su historial. Tras reiniciar el servidor se recupera una aplicación confirmada o se vuelve a revisión, sin repetir una mutación musical automáticamente. Un reenvío puede pedir revisión si Live conserva cambios de audio, groove, nombres u otros detalles que NANOOK no representa.

### Instalación en otra biblioteca o tras mover NANOOK

Ejecuta **Conectar Ableton.command** o:

```sh
python3 scripts/install-ableton.py
# Para una biblioteca personalizada:
python3 scripts/install-ableton.py --user-library "/ruta/a/User Library"
```

Solo instala los dos archivos propios de `ableton_bridge/NanookHitMaker` y su configuración de carpeta compartida. Una instalación anterior se respalda en `data/ableton/installation-backups/`. Reinicia Live y selecciona **NanookHitMaker** en **Link, Tempo & MIDI → Superficies de control**, entrada y salida Ninguno. No se modifican los scripts de fábrica, las preferencias por código ni los proyectos originales de JAVITA, MAGIC o Contrapista. `ableton-bridge-manifest.json` registra procedencia, hashes y versión comprobada.

### Persistencia y límites de la entrega

El intercambio interno usa `data/ableton/queue/` y un heartbeat local del Control Surface; no abre sockets ni expone audio a Internet. Se ejecutan la primera entrega solicitada y las ediciones automáticas del proyecto vinculado activo. Una entrega manual sin recibir caduca a los 30 segundos; una automática no iniciada caduca a los 10 segundos y puede volver a evaluarse desde una captura actual. Durante la colocación de localizadores, conserva Live detenido; si cambias de Set o empiezas a grabar, la operación se interrumpe y requiere revisión. Los fallos parciales de la API nativa no se presentan como transacciones atómicas: revisa Live y usa Deshacer o recupera el Set guardado antes de reintentar. No se reintenta automáticamente una mutación dudosa.

El respaldo NANOOK conserva sus proyectos, revisiones y audios; **no incluye el Set externo de Ableton**. Para conservar o compartir la producción de Live, guarda y copia su carpeta de proyecto con `Samples/NANOOK` y los archivos de vínculo. Las referencias de audio del Set de ejemplo se comprobaron como rutas relativas al proyecto.

Referencias primarias: [instalación de Remote Scripts](https://help.ableton.com/hc/en-us/articles/209072009-Installing-third-party-remote-scripts), [API Track](https://docs.cycling74.com/apiref/lom/track/), [Song](https://docs.cycling74.com/apiref/lom/song/) y [Clip](https://docs.cycling74.com/apiref/lom/clip/).

## Crear con MAGIC dentro de la canción

1. Abre **Dirección · MAGIC**. El resumen muestra el tempo, la armonía, las partes revisadas y candidatas de JAVITA, los intervalos y ritmos de hasta 16 ataques por parte y hasta 16 secciones del proyecto. Incluye las candidatas de tonalidad y acordes de Contrapista cuando existen. Puedes crear también desde una partitura o un proyecto sin análisis.
2. Elige idea completa, desarrollo de idea/gancho, letra o prompts. Escribe tu dirección, elige voz, idioma y, si quieres, una de las 24 recetas guía del motor actual de MAGIC. La receta orienta la producción sin restablecer las decisiones musicales del proyecto.
3. Elige un **tempo entero entre 40 y 220 BPM para la propuesta**. El valor inicial es el tempo de la partitura redondeado y visible; el proyecto conserva su tempo, incluso con decimales. Si queda fuera del intervalo debes elegir uno válido. Una tonalidad detectada se presenta como candidata y no se fuerza como una elección explícita.
4. Pulsa **Crear propuesta con MAGIC**. Primero se guarda el proyecto. Se envía a OpenAI el resumen musical visible, los textos actuales acotados y los ajustes de generación. **No se envían audio, stems, archivos ni rutas internas.** La generación usa la API Responses con JSON estructurado, `store:false` y el modelo configurado por MAGIC (por defecto `gpt-5.4-mini`).
5. Compara las tres alternativas y revisa letra, gancho, Styles, Exclude, guion de producción y sugerencias. Marca qué textos incorporar. El título queda sin marcar por defecto. Una propuesta no modifica el proyecto hasta aplicar la selección.
6. **Aplicar selección y guardar versión** crea una revisión. Conserva notas, tempo, acordes, audios y los textos que no seleccionaste. Si cambiaste la música o los textos desde la generación, requiere revisión explícita; un guardado de otra pestaña se rechaza.
7. Continúa editando los textos compartidos. El respaldo incluye la propuesta aceptada con sus tres alternativas, contexto, ajustes y procedencia. Las revisiones anteriores permiten recuperar el texto previo. El texto para Suno utiliza el tempo de la propuesta, sin cambiar el de la partitura.

La clave existente de `las variables propias OPENAI_API_KEY y OPENAI_MODEL` se lee **solo en el proceso de servidor**, según la autorización del usuario del 05-11-2026. No se copia ni se escribe en NANOOK, no llega al navegador y no se incluye en respaldos. No se usa la clave distinta de la raíz. El modelo puede configurarse con `OPENAI_MODEL` en ese mismo archivo existente.

Cada generación consume la cuenta de API de MAGIC y solo empieza al pulsar el botón. No hay generación al abrir o recargar. Se admite una generación a la vez, independiente del análisis local. Los trabajos se guardan en `data/magic/`: una propuesta lista se recupera al recargar; un trabajo interrumpido no se reintenta automáticamente. Cancelar detiene la espera local, sin garantizar que el proveedor detenga una solicitud ya recibida. Los trabajos pendientes todavía no forman parte del respaldo; aplica una propuesta para incorporarla de forma portable. Se conservan hasta 50 propuestas aceptadas por proyecto.

## Analizar una canción dentro de la app

1. Pulsa **Subir canción y analizar** en el inicio, o **Subir canción** dentro de un proyecto. Se acepta audio entre 1 segundo y 30 minutos, hasta 1 GB.
2. En **Analizar · Contrapista**, selecciona canción completa o el tipo de stem. Deja el tempo manual vacío para detectarlo.
3. Elige **IA local** para Demucs y Basic Pitch, o **Rápido** para la aproximación DSP. Si faltan los modelos, IA aparece deshabilitado; no se sustituye por otro modo a escondidas.
4. Pulsa **Analizar canción**. El trabajo continúa en segundo plano y se conserva su progreso al recargar. Puedes trabajar en otras áreas mientras termina. Solo se ejecuta un análisis a la vez.
5. Si no hubo cambios musicales, las notas, stems, reconstrucción, informe y paquete de Ableton se incorporan automáticamente a esta misma canción, en una revisión única. La letra, el título y la dirección creativa se conservan.
6. Si tienes cambios sin guardar, puedes guardarlos y aplicar el resultado. Si las notas, el tempo u otros datos musicales cambiaron mientras se analizaba, la app exige elegir **Sustituir partes y guardar versión anterior**. Puedes recuperar esa versión después.
7. **Revisar partitura** abre las partes en JAVITA; **Escuchar stems** abre los audios guardados dentro del proyecto. No hace falta abrir Contrapista ni mover archivos manualmente.

**Cancelar análisis** detiene también los subprocesos de IA y conserva el audio y el proyecto. Un resultado ya listo puede descartarse sin aplicarlo. Si se cierra el servidor, los trabajos en curso se cancelan o se marcan interrumpidos; el audio permanece disponible para reintentar. Los resultados listos y los ya aplicados se recuperan al volver a abrir. No hay continuación automática de una inferencia parcial tras cerrar la app.

El runtime de IA reutiliza `../Contrapista/.venv-ai/bin/python`. Los pesos ya instalados se copian bajo `data/runtime/` y los temporales y cachés se escriben allí, sin modificar Contrapista. `NANOOK_AI_PYTHON` permite indicar otro intérprete compatible. La app sigue dependiendo de ese entorno instalado; no es un instalador portable de modelos.

## Recorrido disponible

1. Crea una canción o importa JSON de JAVITA/hits o un borrador/biblioteca de MAGIC. La importación musical sustituye las partes de la canción seleccionada y conserva el documento original en el historial. Las bibliotecas de MAGIC permiten elegir una idea.
2. También puedes importar un `Contrapista.zip` previo para crear un proyecto con su informe, notas, stems y Set de Ableton. Este intercambio es opcional: la pestaña Analizar ya realiza el trabajo directamente.
3. En Componer, revisa notas, escucha una referencia sintetizada y marca una parte como revisada. También puedes componer un arreglo determinista con el motor hits 0.3.0 de JAVITA, sin servicios de IA.
4. En Dirección crea con MAGIC desde la partitura y el análisis, o edita directamente idea, letra, Styles y Exclude. También puedes exportar un borrador compatible con MAGIC o texto para el flujo manual de Suno. El tempo de la propuesta es independiente del tempo de la partitura.
5. Exporta MIDI completo y MusicXML de una parte melódica. El MIDI conserva la duración total, las notas simultáneas y el canal de batería. La partitura usa la cuantización y el 4/4 provisionales del motor JAVITA.
6. Guarda y descarga un respaldo ZIP con todos los audios, documentos originales y revisiones. Restaurarlo crea otro proyecto, conservando el actual. Un guardado desactualizado se rechaza para evitar sobreescrituras entre pestañas.

Los proyectos viven en `data/projects/`, excluido de Git. El respaldo es la vía portable: copiar solamente `project.json` no copia audio. No hay sincronización remota. El seguimiento automático local con Live funciona mientras el servidor está activo.

Los ejemplos **Umbral · prueba de integración** y **Umbral - mezcla** proceden del fixture sintético de Contrapista. Sus detecciones son candidatos, no notas corregidas ni una validación de canciones comerciales.

## Fronteras de esta versión

- El motor de análisis es una copia revisada de Contrapista 0.3. La integración no cambia sus algoritmos ni mejora por sí sola la precisión de transcripción, timbre o reconstrucción.
- El ZIP/Set original importado de Contrapista se conserva íntegro como material de origen. El puente nuevo escribe los clips directamente en el Set abierto de Live; el exportador MIDI sigue disponible como alternativa.
- El MIDI tiene hasta 15 canales melódicos y uno de percusión; si se supera ese límite, se rechaza la exportación en lugar de omitir pistas.
- El JSON de JAVITA tiene límites propios de 5 minutos, 8 partes y 30.000 notas. NANOOK conserva hasta 30 minutos y 100.000 notas, pero no exporta silenciosamente un proyecto que JAVITA rechazaría.
- Aula hits, el analizador de patrones, Albums y la revisión de selecciones de texto de MAGIC permanecen en sus aplicaciones. La creación de propuestas y sus recetas musicales sí están integradas.
- El visor muestra ocho compases por página. La edición muestra hasta 80 ataques de la parte en la página seleccionada, conservando las demás notas.
- Los respaldos/importaciones ZIP admiten hasta 2 GB y verifican rutas e integridad. Los audios individuales admiten hasta 1 GB y 30 minutos.
- La sincronización automática de notas, estructura y audio sin Warp está integrada para Sets vinculados, con Live detenido. La primera entrega al Set es explícita. Suno y Premiere/Audition siguen pendientes. MAGIC genera texto con OpenAI; no genera audio ni garantiza que Suno reproduzca las notas o instrucciones. Esta app sigue siendo local, sin publicación.

## Procedencia y comprobación

`vendor-manifest.json` registra versiones, fuentes y SHA-256. JAVITA sale de la entrega congelada 0.3.0; Contrapista 0.3 adapta únicamente rutas de runtime y modelos. MAGIC incorpora un snapshot sin cambios de su generador, contratos y conocimiento musical `2026-11-05.1`, con 24 recetas. El adaptador propio agrega el contexto musical de NANOOK al generador original. `scripts/vendor.mjs`, `scripts/vendor-contrapista.py` y `scripts/vendor-magic.mjs` regeneran las copias; para actualizar MAGIC usa el último, que fija su propia dependencia Zod 3.25.76, evitando tomar Zod 4 de la raíz. Esta integración no modifica los proyectos originales. Las licencias de OpenSheetMusicDisplay 1.9.2 y Zod están en `public/vendor/`.

```sh
python3 -m unittest discover -s tests -v
node --test tests/adapters.test.mjs tests/magic.test.mjs tests/autosync.test.mjs
```

Las **84 pruebas** (69 Python y 15 JavaScript) cubren persistencia, análisis, MAGIC simulada, envío, retorno y sincronización automática de música y audio. Incluyen agrupación de cambios, ausencia de eco/versiones repetidas, fusión de partes diferentes, conflictos con ambas versiones, elección/alineación de estructura, edición durante autoguardado, pausa, transporte, reinicio, captura obsoleta, fallo parcial sin reintentos, corrección de un envío bloqueado y nota nativa fuera del formato admitido. Las pruebas de Live usan objetos simulados; además se comprobó el ciclo automático nativo con Umbral descrito arriba, la persistencia del Set y un respaldo/restauración real. `verification/ableton-auto.json` conserva la comprobación de notas/estructura 0.6; `verification/ableton-audio.json` registra el ciclo de audio 0.7, versiones, copias y respaldo. Las pruebas de audio añaden sustitución de archivos, recortes, transposición, niveles positivos, stems nuevos del análisis, conflictos, recuperación y conservación de muestras antiguas. Las comprobaciones anteriores se conservan, sin otra llamada real a OpenAI en esta entrega.

Prueba opcional del motor real con el fixture sintético propio de Contrapista:

```sh
python3 scripts/verify-analysis.py --quality ai
python3 scripts/verify-analysis.py --quality fast --seconds 370
```

Estas pruebas procesan audio local con los modelos existentes. No se ejecutan como parte de la suite unitaria y no evalúan calidad perceptual con música del usuario.

El cierre de la comprobación 0.7 guardó el Set final en Live 12.4.3 y verificó su XML: 13 pistas regulares, 513 eventos e identidades MIDI exactamente conservados, dispositivos y mezcla sin cambios y cuatro muestras existentes con rutas relativas. El clip editado conserva posición 1 s, recorte 0,5 s, duración 20 s, nivel +3 dB y +2 semitonos. NANOOK permanece sincronizado en revisión 17.
