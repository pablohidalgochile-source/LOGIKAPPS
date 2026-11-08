# Fraternidad · inventario y propuesta de catálogo propio

Revisión: 31 de octubre de 2026 (America/Santiago).
Estado: inventario verificado, catálogo propuesto y tres pilotos visuales construidos para revisión; el diseño y el catálogo completo siguen pendientes de aprobación.

Las rutas de este documento son relativas a la raíz `_REBRAND/`, salvo donde se indica el directorio padre. La revisión no cambió ni copió assets originales.

## Lo que existe y se puede comprobar

| Material | Ruta | Estado y uso observado |
|---|---|---|
| Firma horizontal blanca | `handoff/assets/eventos/fraternidad-horizontal-blanco.png` | PNG RGBA de 5000 × 1500, con transparencia. Firma institucional «Fraternidad / Campus Central», usada en la mosca y la placa de nombre de coproducción. Versionada. |
| Insignia Frate | `handoff/assets/eventos/fraternidad-insignia.png` | PNG RGBA de 1612 × 1104, con transparencia. Insignia azul, dorada y blanca, con «Fraternidad», «Frate», «Campus Central» y símbolo circular. Versionada; inspección visual realizada. |
| Mosca de coproducción | `handoff/resources/flag-evento.html` | FRATV es la marca principal y Fraternidad acompaña. No es una mosca exclusivamente Fraternidad. |
| Nombre y cargo de evento | `handoff/resources/lower-third-evento.html` | Usa firma Fraternidad en la placa de marca; conserva composición, colores y runtime FRATV. No prueba una identidad independiente de Fraternidad. |
| Cortinilla de evento | `handoff/resources/bumper-evento.html` | Insignia Frate al centro, «FRATV PRESENTA» y firma FRATV en el cierre de la composición. Pieza de coproducción. |
| Referencias aprobadas horizontales | `laminas/referencia-16x9/flag-evento.png`, `laminas/referencia-16x9/lower-third-evento.png`, `laminas/referencia-16x9/bumper-evento.png` | Versionadas y revisadas visualmente. Son la referencia de las tres piezas existentes, no de nuevas piezas Fraternidad. |
| Referencias aprobadas verticales | `laminas/referencia-9x16/flag-evento.png`, `laminas/referencia-9x16/lower-third-evento.png`, `laminas/referencia-9x16/bumper-evento.png` | Versionadas; disponibles para conservar la regresión del catálogo actual. |
| Declaración de los recursos | `handoff/manifest.json` | Declara los tres recursos de evento y apunta a los dos logos anteriores. |

El archivo horizontal tiene márgenes transparentes amplios: su contenido visible ocupa aproximadamente 3950 × 622 dentro del lienzo de 5000 × 1500. La insignia ocupa aproximadamente 1254 × 908 dentro de 1612 × 1104. Es una observación de encuadre para dimensionar correctamente, no una autorización para recortar o reemitir los masters.

## Material que no se encontró en el alcance revisado

La búsqueda por nombres y extensiones en `_REBRAND/` y su directorio padre `WKC/`, excluyendo dependencias y metadatos git, no encontró:

- Un manual de identidad exclusivo de Fraternidad.
- Un master vectorial SVG, AI o EPS de Fraternidad.
- Una definición aprobada de colores, tipografías, animaciones o áreas seguras específica de Fraternidad.
- Un catálogo de recursos exclusivos de Fraternidad con referencias de aprobación.

`handoff/BRAND.md`, `handoff/tokens.json` y `HANDOFF-IDENTIDAD.md` describen FRATV. No deben trasladarse a Fraternidad como si fueran su manual.

También existe `../OVERLAYS.psd` (1920 × 1080, varias capas). Su nombre no identifica Fraternidad y esta revisión no lo certifica como material de esa marca. No se usa como evidencia de un catálogo Fraternidad aprobado.

Esto describe el alcance local revisado, no afirma que el usuario carezca de esos materiales en otras carpetas o servicios.

## Cómo separar las identidades

El sistema debe distinguir tres catálogos:

1. **FRATV:** los recursos actuales del canal.
2. **Fraternidad:** piezas cuya marca principal sea Fraternidad y que puedan emitirse sin firma FRATV.
3. **Coproducción:** las tres piezas actuales con ambas marcas y futuras variantes de colaboración.

Reutilizar el motor, los controles, los campos y el exportador sí es viable. Convertir automáticamente toda la gráfica roja de FRATV en «Fraternidad» mediante sustitución de logo no establece una identidad nueva aprobada.

Para el catálogo propio propongo mantener ambas firmas disponibles, con roles explícitos: firma horizontal institucional para información y marca permanente; insignia para aperturas o eventos que la usen. Esta asignación es una propuesta pendiente, no una decisión histórica del usuario.

## Catálogo propuesto · primera prioridad

Las siguientes piezas son nuevas propuestas. Ninguna debe etiquetarse como «aprobada» o «implementada» solo por figurar aquí.

| Recurso propuesto | Datos que completa el brief | Salida gráfica | Comportamiento en vivo |
|---|---|---|---|
| Mosca Fraternidad | Variante de logo | PNG transparente; HTML | Mostrar u ocultar desde el control de emisión. |
| Identidad de apertura y versión breve | Programa o evento, fecha opcional | MOV con alfa cuando corresponda; MP4 | Lanzamiento de la pieza; sin reloj interno. |
| Nombre y cargo | Conductor, invitados, cargos | PNG; MOV con entrada/salida | Seleccionar persona y lanzar entrada, permanencia y salida. Una instancia por persona. |
| Título de programa / episodio | Nombre, tema del día, fecha | PNG; MOV | Cambiar el título desde los datos del episodio y mostrar/ocultar. |
| Comenzamos pronto | Programa, horario, texto de bienvenida | PNG de composición; MP4 de fondo si procede | Cuenta regresiva real mediante fuente de navegador, separada del video decorativo. |
| Cuenta regresiva independiente | Duración o fecha/hora objetivo, rótulo | PNG de ejemplo o placa; gráfica transparente | Iniciar, pausar, reanudar, reiniciar y ocultar. Nunca presentar un MOV como reloj controlable. |
| En vivo / tiempo transcurrido | Etiqueta y modalidad de reloj | PNG de placa | Tiempo transcurrido controlado desde el dock; puede seguir el programa o un bloque. |
| Pausa / volvemos | Mensaje, duración de pausa u hora de regreso | PNG; fondo animado | Temporizador de retorno controlable, con opción de quitar el reloj. |
| A continuación / agenda | Bloques, invitados y horarios | PNG; MOV | Elegir el próximo bloque sin volver a diseñar la pieza. |
| Cierre / gracias | Programa, redes, créditos breves | PNG; MP4 | Lanzamiento de cierre; sin cuenta regresiva implícita. |

Una primera plantilla de programa podría seleccionar estas piezas y generar automáticamente las instancias de conductor, invitados y temas a partir del formulario del episodio. La selección debe ser configurable: no todos los programas necesitan todas las piezas.

## Segunda prioridad

| Recurso propuesto | Uso y datos |
|---|---|
| Banda de noticias / avisos | Mensajes del día, agenda y llamados a la acción; lista editable y opción de ocultar. |
| Auspiciadores | Logo y denominación aprobada; una instancia por auspiciador o una placa conjunta revisada. |
| Comentario o pregunta | Nombre del participante y texto; carga manual antes de cualquier integración con redes. |
| Créditos completos | Filas de roles y nombres, cierre del programa. |
| Transición Fraternidad | Stinger propio con cobertura y punto de corte medidos; no heredar el valor de FRATV sin verificar la nueva geometría. |
| Pantalla de espera técnica | Mensaje breve de continuidad y retorno; sin inventar un tiempo estimado. |

Marcadores deportivos, votaciones con resultados reales y datos de plataformas externas requieren definir fuentes y reglas específicas. No se incluyen por inferencia dentro de un paquete de identidad general.

## Gráfica y reloj son dos entregables distintos

Cada recurso temporal debe incluir:

- **La gráfica:** composición aprobada, placa, tipografía y animación. Puede salir como PNG o video según la pieza.
- **La fuente viva:** HTML servido localmente para Browser Source de OBS, con su control separado. El mismo diseño recibe el valor temporal en ejecución.
- **La configuración del episodio:** duración inicial, modalidad de cuenta, rótulo, estado visible y canal de control; se guarda en el proyecto o paquete.

El control debe poder abrirse como dock de navegador en OBS. Un reinicio o recarga de la fuente no debe reiniciar arbitrariamente el conteo compartido. La fuente y el dock deben recuperar el mismo estado del servicio local. El operador necesita una acción explícita de reinicio.

Para vistas previas y archivos de ejemplo se debe identificar el reloj como muestra estática. Si una exportación omite el video de una cuenta real, debe explicarlo y entregar su fuente viva, sin prometer que el archivo de video responderá a controles.

## Decisiones de diseño pendientes

Para crear y aprobar el catálogo propio hace falta concretar:

- Qué firma corresponde a programas institucionales y cuál a eventos Frate; si existe otra versión vigente fuera de esta carpeta, incorporar el master proporcionado.
- Paleta y tipografías oficiales de Fraternidad. Los colores observados en la insignia no equivalen a tokens de identidad aprobados.
- Si la firma FRATV debe desaparecer por completo en el catálogo propio o existir como opción explícita de coproducción.
- Referencia visual de tres piezas piloto: mosca, nombre y cargo, y pantalla de inicio con cuenta regresiva.

La implementación de guardado, plantillas, brief, exportación y control de relojes puede continuar mientras se resuelven esas decisiones. Los tres recursos de coproducción existentes se conservan con sus referencias actuales.

## Criterio para aprobar las nuevas piezas

Primero presentar las tres piezas piloto en 16:9 y 9:16, con contenido real y prueba sobre fondo de cámara. Después extender el mismo sistema al resto del catálogo. Mantener 1:1 y 4:5 como derivados por revisar, igual que en el sistema actual.

La aprobación debe cubrir legibilidad, convivencia de marcas, áreas seguras y funcionamiento del reloj. Solo después se guardan nuevas referencias de regresión para Fraternidad, separadas de las referencias existentes de FRATV.

## Pilotos presentados · propuesta 01

La autorización posterior del usuario permitió construir mosca, nombre/cargo e
inicio con cuenta regresiva en 16:9 y 9:16. Están aislados en
`propuestas/fraternidad-v1/`, accesibles desde el editor local en
`/pilotos-fraternidad/`. No se incorporaron al manifiesto, las plantillas ni el
exportador, y no se guardaron como nuevas referencias aprobadas.

La propuesta usa los dos logos originales, azul/dorado observados en la insignia,
marfil, Manrope y IBM Plex Mono. El fondo ilustrativo y los nombres de muestra
permiten revisar composición; la prueba con imagen y contenido del programa real
sigue siendo parte de la validación de diseño. La cuenta funciona como
demostración y todavía no recibe el estado compartido de OBS.

La galería permite comparar los seis diseños, cambiar textos y fondos, mostrar
áreas seguras y probar entrada y reloj. La aprobación de esta dirección visual
por parte del usuario sigue pendiente antes de extender el catálogo.
