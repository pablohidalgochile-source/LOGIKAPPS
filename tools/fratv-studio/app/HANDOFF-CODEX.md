# HAND-OFF PARA CHATGPT CODEX
## FRATV Overlay Studio

> **Avance del 31 de octubre de 2026:** la segunda etapa del editor local existe
> en `editor/`. Lee `handoff/ESTADO-EDITOR.md` y `editor/README.md` para su estado
> actual. El relato original de este documento se conserva como antecedente;
> las menciones a la app por construir corresponden al traspaso anterior.

Este documento es para que un agente que **no estuvo** en la conversación donde
se construyó esto pueda tomar el trabajo y seguirlo sin romperlo.

No es solo una especificación de lo que falta. Es también el relato de lo que
ya existe, **cómo funciona por dentro**, qué se midió, en qué se falló y cómo
se corrigió. La parte más valiosa son las secciones 5 y 6: ahí está todo lo que
costó caro averiguar. Léelas antes de tocar código, o vas a volver a pagar.

**Léelo en este orden:** 0 → 1 → 2 → 3 → 5 → 6 → 7. Las secciones 4, 8 y 9 son
de consulta.

---

## 0 · EL REPOSITORIO

Esta carpeta (`_REBRAND/`) es un repositorio git, rama `main`. Codex trabaja
**en este mismo Mac**, sobre la carpeta, no en la nube.

**Qué está versionado y qué no.** Pesa unos 5 MB. Todo lo generado está en
`.gitignore` y se reconstruye con los scripts: videos exportados, PNG, paquete
portátil, colecciones de OBS, salidas del estudio, logs y `node_modules`. En
disco hay ~800 MB más que **no** van al repositorio. Si necesitas los videos,
`npm run exportar` los regenera (unos 20 minutos).

**Lo único generado que sí se versiona** es `laminas/referencia-16x9/` y
`laminas/referencia-9x16/`: el render de los 18 recursos tal como el cliente
los aprobó. Es la red de seguridad (§8).

**Línea base, antes de tocar nada:**

```bash
cd scripts
npm install
npm test                 # debe terminar sin faltas
npm run test:regresion   # debe decir "Todo coincide con la referencia aprobada"
```

Si alguna de las dos falla en tu entorno, no empieces: algo del ambiente no
calza (Chrome, ffmpeg, ImageMagick, fuentes) y cualquier comparación posterior
va a mentir.

**Requisitos:** Node 20+, Chrome o Chromium (lo ubica `scripts/chrome.mjs`; si
no lo encuentra, define `CHROME_PATH`), ffmpeg, ImageMagick, y acceso a
internet para las fuentes de Google.

**Archivos de instrucciones:** `AGENTS.md` en la raíz es el punto de entrada;
`handoff/AGENTS.md` trae las reglas de la app. Si se contradicen, manda el de
la raíz y este documento, que son más recientes.

---

## 1 · DE DÓNDE VIENE ESTO

### 1.1 La historia en cuatro movimientos

**Primero fue WKC.** El proyecto nació como la gráfica de un canal de combate.
Ese nombre **desapareció**. No es un cambio de logo: cambió la naturaleza del
producto. FRATV es **un canal**, no una marca de peleas. Si encuentras "WKC" en
algún archivo, es residuo histórico; la carpeta se llama así por inercia.

**Después vino la identidad.** El diseño del logo y su paquete de variantes se
hizo en un proyecto aparte de ChatGPT, a partir del documento
`HANDOFF-IDENTIDAD.md` de esta carpeta. De ahí volvieron dos paquetes
(`Siete storyboards con timing`) con el lockup, las animaciones de ident y la
geometría. Las decisiones del cliente sobre esos paquetes están en
`RESPUESTA-DECISIONES.md`: la F al 30 % mayor, y las cuatro animaciones de
entrada adoptadas en vez de elegir una.

**Después se construyeron los recursos.** 18 archivos HTML autónomos que son
la gráfica real que sale al aire. No son maquetas: se exportan a video con
canal alfa y entran a OBS.

**Y finalmente vino lo vertical.** El sistema completo estaba pensado solo para
16:9. Se rehízo para que el mismo archivo sirva en 16:9, 9:16, 1:1 y 4:5, porque
el canal transmite también a Instagram y TikTok. Eso es lo último que se hizo y
está descrito en la sección 3.2.

### 1.2 Qué es FRATV, en una frase

Un canal de contenido digital con transmisiones en vivo, que necesita gráfica
de aire consistente —moscas, lower thirds, cortinillas, stingers, tickers— y
que la produce **una sola persona** operando una ATEM Mini Extreme ISO y OBS,
muchas veces en vivo y sin tiempo.

Esa última frase manda sobre todas las decisiones de producto. Si algo requiere
abrir After Effects para cambiar un nombre, está mal diseñado.

### 1.3 El idioma no es un detalle

Todo el texto visible —interfaz, mensajes, comentarios, commits— va en
**español de Chile**, tuteando. Nada de voseo ni argentinismos: ni "dale", ni
"querés", ni "fijate", ni "mirá". Es "quieres", "puedes", "fíjate", "mira".
Esto aplica también a lo que escribas **dentro de la app**. El cliente lo ha
pedido muchas veces; es un requisito, no una preferencia estética.

---

## 2 · INVENTARIO REAL

```
_REBRAND/
├── handoff/                      ← el contrato: esto es la fuente de verdad
│   ├── manifest.json             ← declara los 18 recursos y sus formatos
│   ├── tokens.json               ← paleta, tipografías, política de efectos
│   ├── BRAND.md                  ← reglas de marca (léelo primero)
│   ├── SPEC_APP.md               ← la app que hay que construir
│   ├── SPEC_GEOMETRIA.md         ← ⚠ mezcla dos escalas, ver §5.3
│   ├── THEMING.md                ← contrato de tematización
│   ├── OPEN_QUESTIONS.md         ← dudas abiertas con el cliente
│   ├── assets/
│   │   ├── masters/              ← SVG del logo, incluido el vectorizado
│   │   ├── eventos/              ← logos de Fraternidad
│   │   └── reference/            ← catálogos aprobados en PNG
│   └── resources/                ← LOS 18 RECURSOS + runtime compartido
│       ├── fratv-runtime.js      ← seek determinista, temas, formatos
│       └── fratv-aspectos.css    ← escala y áreas seguras por formato
│
├── scripts/                      ← herramientas, todas en Node sin build
│   ├── exportar.mjs              ← lote: recursos → video, por formato y fps
│   ├── estudio-png.mjs/.html     ← estudio local en vivo (puerto 8795)
│   ├── pack-maestra.mjs          ← colección OBS de producción
│   ├── pack-obs.mjs              ← colección OBS de catálogo
│   ├── renderizar-laminas.mjs    ← lámina de contacto por formato
│   ├── medir-cajas.mjs           ← mide cajas y detecta desbordes
│   ├── verificar-aspectos.mjs    ← manifiesto y CSS de formatos no se separan
│   ├── armar-pack-portatil.mjs   ← reconstruye el paquete para otro computador
│   ├── lint-tokens.mjs           ← el contrato de tokens, CON pruebas propias
│   ├── verificar-regresion.mjs   ← render actual contra la referencia aprobada
│   └── chrome.mjs                ← ubica Chrome en cualquier sistema
│   ├── verificar-bucle.mjs       ← comprueba que un bucle cierre
│   └── vectorizar-wordmark.mjs   ← tipografía → trazos
│
├── pack/                         ← salida: videos, PNG y colecciones OBS
├── laminas/
│   ├── referencia-16x9/          ← LO APROBADO, versionado: no tocar a mano
│   └── referencia-9x16/          ← idem vertical
├── png-exportados/               ← salida del estudio
├── videos-generados/             ← salida del estudio
├── FRATV_OBS_PACK/ + .zip        ← paquete portátil (generado, no editar a mano)
├── AGENTS.md                     ← punto de entrada para el agente
├── .gitignore                    ← qué es generado y no se versiona
├── HANDOFF-IDENTIDAD.md          ← brief que se le dio al diseño
├── RESPUESTA-DECISIONES.md       ← decisiones del cliente
├── NOTAS-FORMATOS-ALFA.md        ← mediciones de códecs con alfa
└── LEEME-OBS.md                  ← instrucciones de operación
```

### Los 18 recursos

| id | familia | dura | bucle | alfa | formatos |
|---|---|---|---|---|---|
| `ident-long` | marca | 1900 | no | sí | los 4 |
| `ident-short` | marca | 900 | no | sí | los 4 |
| `stinger` | marca | 800 | no | sí | 16:9 · 9:16 |
| `flag` | estado | — | sí | sí | los 4 |
| `flag-evento` | estado | — | sí | sí | los 4 |
| `live-badge` | estado | 1500 | sí | sí | los 4 |
| `countdown` | estado | — | sí | sí | los 4 |
| `bumper-in` | cortinilla | 7000 | sí | no | los 4 |
| `bumper-out` | cortinilla | 7000 | sí | no | los 4 |
| `bumper-evento` | cortinilla | 7000 | sí | no | los 4 |
| `lower-third` | información | 9000 | no | sí | los 4 |
| `lower-third-evento` | información | 9000 | no | sí | los 4 |
| `program-title` | información | 8000 | no | sí | los 4 |
| `schedule` | información | 8000 | no | sí | los 4 |
| `engagement` | interacción | 8000 | sí | sí | los 4 |
| `sponsor` | comercial | 8000 | no | sí | los 4 |
| `ticker` | comercial | 18000 | sí | sí | 16:9 · 9:16 |
| `end-credits` | cierre | 22000 | sí | sí | los 4 |

Los tres `*-evento` llevan el logo de Fraternidad y son para coproducciones.

---

## 3 · CÓMO FUNCIONA

### 3.1 El runtime y el determinismo

Cada recurso es un HTML autónomo: sin framework, sin build, sin imports remotos
salvo las fuentes de Google. Carga `fratv-runtime.js`, que expone `window.FRATV`.

**La pieza central es `seek(tMs)`.** Toda animación se escribe con `@keyframes`
en porcentajes sobre la duración total. El runtime recolecta las animaciones con
`getAnimations()`, las pausa, y les fija `currentTime`:

```js
seek: function (tMs) {
  if (!anims) { anims = collectAnimations(); anims.forEach(a => a.pause()); }
  var d = meta.durationMs || 0;
  var t = meta.loop && d ? tMs % d : Math.min(tMs, d || tMs);
  anims.forEach(a => { try { a.currentTime = t; } catch (e) {} });
}
```

**Por qué importa:** el exportador no graba la pantalla. Llama `seek(n*1000/fps)`
y saca una captura, cuadro por cuadro. El video resultante es exactamente lo que
se ve en el navegador, sin deriva ni cuadros saltados. Si rompes el determinismo
de `seek()`, rompes el exportador. Cualquier animación que no pase por
`getAnimations()` —un `setInterval`, un `requestAnimationFrame` propio— es un
error, salvo en `countdown`, que depende del reloj real y por eso está excluido
de la exportación.

**En bucle se omite el último cuadro.** Es idéntico al primero y produciría un
tirón al repetir. En una sola pasada sí se incluye, para que cierre limpio:

```js
const total = Math.round(dur * fps / 1000);
const cuadros = loop ? total : total + 1;
```

### 3.2 La escala fluida: `--fr-u`

Esto es lo último que se construyó y es lo que permite que un mismo archivo
sirva en los cuatro formatos.

**El problema.** Los 18 recursos se dibujaron contra un lienzo de 1920 de ancho,
con medidas en píxeles fijos: la mosca medía `238px`, el nombre del lower third
`54px`. Al renderizar a 1080×1920 todo salía del mismo tamaño en píxeles, o sea
un 78 % más grande en proporción al cuadro, y las piezas anchas se desbordaban.

**La solución.** Una unidad de escala. Toda medida se escribe como la medida de
diseño multiplicada por una fracción del ancho:

```css
:root[data-aspecto="16:9"] { --fr-u: calc(100vw / 1920); }
:root[data-aspecto="9:16"] { --fr-u: calc(100vw / 1000); }
```

```css
.name { font-size: calc(54 * var(--fr-u)); }
```

En 16:9 el divisor es el ancho real, así que `54 * (100vw/1920)` a 1920 px da
exactamente `54px`: **el diseño horizontal no se movió ni un píxel** (verificado,
§5.1). En 9:16 el divisor es 1000, no 1080, así que la gráfica pesa más de lo
que pesaría a prorrata — que es lo correcto, porque en un teléfono se ve chico.

**Este divisor es la perilla de diseño.** Cambiar `1000` por `1200` encoge toda
la gráfica vertical de una vez. Vive en **un solo lugar**: `fratv-aspectos.css`.

**Regla:** no escribas `px` desnudos en los recursos. La única excepción son los
filetes de 1 px, que a cualquier escala quieren seguir siendo un filete.

### 3.3 Áreas seguras por formato

Antes había un `inset: 5%` igual para todos. En vertical eso es incorrecto:
Instagram y TikTok escriben encima arriba (el encabezado) y abajo (la
descripción y los botones), y eso no se recupera.

Cinco tokens, definidos por formato en `fratv-aspectos.css`:

| token | qué posiciona | 16:9 | 9:16 |
|---|---|---|---|
| `--safe-top` / `--safe-bottom` | bordes generales | 5 % / 5 % | 12 % / 22 % |
| `--safe-x` | bordes laterales | 5 % | 6 % |
| `--safe-lower` | lower third, título, ticker | 12 % | 25 % |
| `--safe-flag` | esquina superior: mosca, badge | 5 % | 14 % |

Los recursos los usan en vez de porcentajes literales. Donde una pieza tenía un
valor propio distinto, se expresa como una suma, de modo que **en 16:9 resuelve
a su valor de siempre**:

```css
.titulo { left: calc(var(--safe-x) + 3%); bottom: calc(var(--safe-lower) + 2%); }
```

### 3.4 Las tres piezas que hubo que recomponer

Escalar no bastaba para todo.

**`stinger`** — ver §5.2, es la historia más larga.

**`ticker`** — la banda estaba pegada al borde inferior, donde Instagram tapa.
En vertical sube (`--fr-ticker-abajo: var(--safe-bottom)`) y crece de 96 a 150
unidades de diseño. Y la velocidad se compensa: en un cuadro angosto cada
titular pasa menos tiempo a la vista, así que la marquesina va **1,5× más
lenta** para que el tiempo de lectura sea el mismo. El 1,45 sale de igualar la
permanencia en pantalla entre 1920 y 1080 de ancho; se redondeó.

**`lower-third` y `lower-third-evento`** — la placa y el chip de tema estaban
uno al lado del otro. A 1080 de ancho se pisan. En vertical el chip se apila
bajo la placa, alineado al mismo borde izquierdo, y entra desde la izquierda en
vez de desde la derecha.

### 3.5 El sistema de temas

Cuatro temas, definidos en el runtime, aplicados como variables CSS:

```
fratv-oficial     rojo #B72A3A sobre placa negra, texto marfil
fratv-invertido   placa marfil, texto negro
fratv-mono-marfil acento marfil
fratv-mono-negro  acento negro
```

**Contrato:** ningún recurso escribe un color o una tipografía literal. Todo
sale de `var(--fr-*)`. Tampoco medidas en px desnudos. Lo revisa
`scripts/lint-tokens.mjs`, que hoy pasa en los 18 recursos.

Ese lint **trae sus propias pruebas**: `node lint-tokens.mjs --probar` verifica
las reglas contra diez casos conocidos antes de que confíes en ellas. Está así
porque la versión anterior de la regla no detectaba nada (§6.4). Una regla de
lint sin prueba es una regla que no sabes si corre.

### 3.6 Las herramientas

**`exportar.mjs`** — lote. Levanta un servidor local, abre Chrome sin interfaz,
recorre los recursos y por cada formato y cada fps captura cuadro a cuadro y
codifica con ffmpeg. Tres salidas: `.mov` qtrle con alfa, `.mov` ProRes 4444, y
`.mp4` sin alfa compuesto sobre negro. El formato va en el nombre del archivo
(`lower-third_9x16_60fps_alfa.mov`) porque en una carpeta conviven ambos.

**`estudio-png.mjs` + `.html`** — el estudio en vivo, en `localhost:8795`. Es lo
que el cliente usa a diario: elige el recurso, escribe los títulos que quiera,
mueve el tiempo, elige formato y tema, y baja el PNG con alfa o genera el video.
La captura la hace el mismo Chrome con el mismo `seek()`, así que lo que baja es
idéntico a lo que ve. El progreso viaja por Server-Sent Events.

**Automatiza el stinger:** cuando lo generado es un stinger, el estudio mide en
qué cuadro el barrido tapa el 100 % del lienzo, toma el **centro** de ese tramo
y escribe ese punto de corte en todas las colecciones del pack. No lo estima:
extrae el canal alfa de los cuadros con ffmpeg y cuenta píxeles opacos.

**`pack-maestra.mjs`** — genera la colección de producción para OBS, con las
entradas reales del estudio: `ATEM · PROGRAMA` (el switcheo de cámaras se hace
en la ATEM Mini Extreme ISO y entra una sola señal por USB-C), `VIDEO EXTRA`
(otro computador que da play a videos), `AUDIO 1`, `AUDIO 2` y dos navegadores
libres. Acepta `--aspecto`.

Los recursos cuyo texto cambia entre transmisiones (`lower-third`,
`program-title`, `schedule`, `sponsor`, `countdown`, `ticker`) entran como
**fuente de navegador** apuntando al servidor local, para poder editarlos por
URL sin re-exportar. El resto entra como video o PNG.

**`renderizar-laminas.mjs`** y **`medir-cajas.mjs`** — control de calidad. La
primera hace una lámina de contacto de los 18 recursos en el formato pedido,
para mirar. La segunda imprime las cajas con números y marca lo que se sale del
cuadro, para leer. Úsalas las dos: hay defectos que solo se ven y otros que solo
se miden.

---

## 4 · CONTRATOS INNEGOCIABLES

**De marca.** La geometría del logo, la relación FRA/TV, la bajada oficial, la
paleta rojo `#B72A3A` / negro `#100B18` / marfil `#F5F1E8`, las dos reglas de
composición (placa negra para datos, bloque rojo para estado) y el hecho de que
**en el ident el play no se desplaza**: nada de eso cambia sin aprobación.

**De código.**
- Los recursos son HTML autónomos. Sin framework, sin build, sin imports
  remotos salvo fuentes.
- Nada de `!important`. Nada de estilos globales que se filtren.
- Tokens antes que valores. Si necesitas un valor nuevo, va a `tokens.json`.
- Español en interfaz, copy y comentarios. Inglés en nombres de código.
- `seek(t)` debe ser determinista y puro.
- Nada de `px` desnudos fuera de los filetes de 1 px.

---

## 5 · CONOCIMIENTO MEDIDO — NO LO REDESCUBRAS

Todo lo de esta sección se verificó ejecutando algo, no razonando.

### 5.1 El paso a escala fluida no movió el diseño horizontal 🟢

213 medidas convertidas a `calc(n * var(--fr-u))` en 18 archivos. Se renderizó
cada recurso a 1920×1080 antes y después y se compararon los PNG:

```
16 recursos   AE = 0            idénticos al píxel
bumper-out    6946 px (0,33 %)  solo antialiasing, ver §5.5
countdown     780 px (0,04 %)   es el reloj en vivo, cambia por diseño
stinger       66156 px (3,19 %) cambio intencional, ver §5.2
```

**Cómo reproducirlo:** `node renderizar-laminas.mjs 16:9 --salida=/tmp/antes`,
aplicas el cambio, repites a `/tmp/despues`, y comparas con
`compare -metric AE`. Es la red de seguridad de todo el sistema.

### 5.2 El stinger estaba mal, de dos maneras distintas 🔴

Ambas descubiertas midiendo, y ninguna visible a simple vista porque el stinger
dura 800 ms.

**La ventana de cobertura era demasiado angosta.** Un stinger sirve de
transición porque hay un instante en que tapa el cuadro entero: ahí corta OBS.
Se midió esa ventana extrayendo el canal alfa cuadro a cuadro:

```
16:9   cubría el 100% solo entre 250 y 325 ms   → ventana de 75 ms (4,5 cuadros)
9:16   cubría el 100% solo entre 250 y 275 ms   → ventana de 25 ms (1,5 cuadros)
```

En vertical, un error de un cuadro y se ve el corte.

**El logo estaba descentrado.** La paleta se anclaba con `left: 0; width: 150%`,
así que en el momento de la cobertura su centro caía al 75 % del ancho. Medido:
**300 px a la derecha del centro en 16:9**, un 15,6 % del ancho.

**La corrección** fue centrar la paleta (`top/left: 50%` + `translate(-50%,-50%)`),
hacer el ancho dependiente del formato —el sesgo de 11° se come ancho en
proporción a la altura, y en 9:16 el cuadro es casi el doble de alto— y, sobre
todo, **agregar una retención**: los fotogramas 40 % y 60 % están en la misma
posición, así que el cuadro queda tapado durante 160 ms de corrido.

Resultado medido:

```
16:9   100% entre 220 y 560 ms   ventana 340 ms   logo centrado (desvío 0 px)
9:16   100% entre 200 y 580 ms   ventana 380 ms   logo centrado (desvío 0 px)
1:1    100% entre 220 y 580 ms   ventana 360 ms   logo centrado
4:5    100% entre 220 y 580 ms   ventana 360 ms   logo centrado
```

**El punto de corte es 400 ms y es el mismo en todos los formatos.** Está en el
centro de la ventana, con ~180 ms de margen a cada lado. Si vuelves a tocar la
geometría del barrido, **vuelve a medir**: el estudio ya trae la rutina.

### 5.3 `SPEC_GEOMETRIA.md` mezcla dos escalas 🔴

El documento da medidas que no están todas en el mismo sistema. Las tarjetas de
referencia se midieron a 817 px de ancho representando 1920: **el factor es
2,35**. Si construyes literalmente lo que dice ese archivo, un título de bumper
te queda en 31 px sobre un cuadro de 1080. Confirma con el cliente antes de
usarlo como fuente.

### 5.4 ffmpeg no sabe escribir alfa en WebM 🔴

Ni VP8 ni VP9. El encoder produce el canal alfa y **el muxer lo descarta**.
Verificado. Las alternativas reales con alfa son `.mov` en qtrle o ProRes 4444.
La tabla completa está en `NOTAS-FORMATOS-ALFA.md`.

### 5.5 El render de texto de Chrome no es 100 % determinista 🟡

`bumper-out` difiere entre **dos pasadas de la misma versión**: ~6900 píxeles
(0,33 %), solo en los bordes de las letras. Se verificó que el DOM es idéntico
—mismas animaciones, mismas posiciones, mismas fuentes cargadas— y que el canal
alfa es idéntico. Es variación de antialiasing entre cargas de página.

**Consecuencia práctica:** ninguna. No es visible. Pero si montas una prueba de
regresión automática, **no exijas AE = 0 en recursos con texto grande**: pon un
umbral de ~1 % del cuadro y distingue "cambio real" de "ruido de rasterizado".

### 5.6 `compare -metric AE` de ImageMagick engaña con PNG transparentes 🟡

Devuelve un número sin normalizar que puede ser mayor que la cantidad de
píxeles de la imagen (se llegó a leer 4,5 × 10⁹ sobre 2 millones de píxeles).
**El número útil es el que va entre paréntesis.** Y antes de comparar, aplana
sobre un fondo sólido:

```bash
magick a.png -background black -alpha remove -alpha off /tmp/a.png
compare -metric AE /tmp/a.png /tmp/b.png null:
```

`AE = 0` sí es confiable en cualquier caso. Los valores distintos de cero no.

### 5.7 Lo aprendido integrando con OBS 🔴

- **`source_uuid` es obligatorio en cada ítem de escena.** Sin eso la colección
  importa con las escenas **vacías**, sin ningún error. Se descubrió comparando
  contra una colección real del cliente.
- **El tamaño del lienzo es del PERFIL, no de la colección.** Importar la
  colección vertical sobre un perfil de 1920×1080 deja todo deformado. Hay que
  crear un perfil a 1080×1920, **o** usar Aitum Vertical, que mantiene un solo
  perfil horizontal y saca el vertical por su propio lienzo. El cliente **ya
  tiene Aitum**.
- **El stinger necesita canal alfa.** Con un video opaco, la transición pinta un
  fondo sólido sobre toda la mezcla fuera del barrido. Pasó: el manifiesto decía
  `alpha: false` y el stinger salió blanco.
- Verificado en vivo contra OBS 32.1.2.

### 5.8 Sobre los `.mov` que el cliente no podía abrir 🟡

**La causa real no está determinada.** En su momento se dijo que era el códec
qtrle, porque AVFoundation ya no lo decodificaría. **Eso resultó falso**: se
generaron miniaturas de Finder para qtrle y para ProRes y las dos salieron bien.
macOS decodifica qtrle sin problema.

Lo que sí es cierto y probablemente explica la parte de "no lo puedo compartir":
**ningún `.mov` con canal alfa se sube a WhatsApp, Instagram ni correo**, ni en
qtrle ni en ProRes. Esos servicios esperan H.264 sin transparencia. Para
compartir está el `.mp4` que se genera al lado.

ProRes 4444 quedó como valor por omisión igual, por ser el estándar de la
industria, pero **no por el motivo que se dijo primero**. Si el cliente vuelve a
reportar el error, hay que preguntarle con qué app lo abre y qué dice el
mensaje, en vez de dar por buena la explicación anterior.

### 5.9 Lo vectorizado y la paleta de los masters 🟢

El wordmark está convertido a trazos en
`handoff/assets/masters/fratv-logo-horizontal-vectorizado.svg`. Se compuso la
palabra **completa** con `opentype.js` y después se separó por glifos: generar
"FRA" y "TV" por separado perdía el kerning. El master vectorizado está entero
en `#B72A3A`; los SVG originales traen el naranja `#FF6B3D` archivado, que ya
no es la paleta.

Dato: hay un solape de −8,3 px entre la A y la T. **Es kerning normal, no un
defecto.** Se revisó creyendo que era un error y no lo era.

### 5.10 La F al 30 % mayor es solo sin contenedor 🟡

La decisión del cliente de agrandar la F un 30 % aplica al símbolo **sin**
contenedor. El catálogo aprobado usa `translate(90 195) scale(.75)` puro cuando
va dentro del contenedor redondeado. Aplicar el 1,3 en ambos casos es un error
que ya se cometió una vez.

---

## 6 · ERRORES QUE YA SE COMETIERON

Esta sección existe para que no los repitas. No son hipótesis: pasaron.

**6.1 — Construir desde la especificación sin medir el original.** Se estuvo a
punto de implementar `SPEC_GEOMETRIA.md` literalmente. Habría dado títulos de
31 px. Mide siempre contra el PNG de referencia.

**6.2 — Diagnosticar sin probar.** Lo del códec qtrle (§5.8) se afirmó como
causa sin haberlo verificado, y era falso. Cuando no tengas la prueba, di que no
la tienes.

**6.3 — Confiar en la herramienta de medición sin validarla.** El `AE` de
ImageMagick (§5.6) hizo parecer que había tres regresiones graves cuando dos
eran ruido y una era el reloj. Antes de creerle a una métrica, pásale un caso
de control: el mismo archivo contra sí mismo tiene que dar 0.

**6.4 — Una regex de lint que no detecta nada.** Se escribió
`font-family:\s*(?!var\()` para cazar tipografías literales. **`\s*` consume
cero caracteres**, así que el lookahead se evalúa en una posición donde siempre
pasa, y la regla no detecta nada. `lint:tokens` es la defensa real del contrato
de temas: si la escribes mal, el contrato no existe y nadie se entera.

Ya está corregido: `scripts/lint-tokens.mjs` analiza el **valor** de cada
declaración en vez de la línea cruda, y trae diez pruebas propias que se corren
con `--probar`. Si tocas las reglas, corre las pruebas primero.

**6.5 — Probar contra un respaldo incompleto.** Se comparó "antes y después"
copiando solo `resources/` sin la carpeta `assets/` al lado. Los tres recursos
con logo de Fraternidad aparecieron como regresiones enormes: en el "antes" la
imagen simplemente no cargaba. El respaldo tiene que incluir las dependencias.

**6.6 — Asignar `onload` después de `src`.** En el estudio, el `seek` inicial no
se aplicaba porque el handler se asignaba después de cambiar el `src` del
iframe. Se resolvió con una función `aplicar()` que reintenta hasta que
`window.FRATV` existe.

**6.6 bis — Esperar a que exista no es esperar a que esté listo.** Ese mismo
arreglo seguía fallando: la vista previa quedaba siempre en el cuadro cero.
Con `?autoplay=0` el runtime hace su **propio** `seek(0)` cuando resuelve
`FRATV.ready` (al cargar las fuentes). El estudio seekeaba apenas existía
`window.FRATV`, antes de eso, y el `seek(0)` lo pisaba. Ahora `aplicar()` espera
`FRATV.ready`. Cualquier cliente del runtime —la app incluida— tiene que hacer
lo mismo. Y el iframe necesita tamaño **antes** de cargar: con ancho cero,
`--fr-u` vale cero y la gráfica colapsa.

**6.7 — Generar archivos sin servirlos.** El estudio escribía los videos a disco
y mostraba "listo", pero no había forma de bajarlos desde el navegador. El
cliente reportó "NO PUEDO BAJAR EL VIDEO". Si generas algo para alguien, dale el
camino completo hasta tenerlo en la mano.

**6.8 — URLs apuntando a un puerto que no existe en destino.** El paquete
portátil apuntaba a `localhost:8790/resources/`, pero el paquete sirve los
overlays desde la raíz. En destino daba 404. Se resolvió con un marcador
`__PACK__` que el instalador reemplaza por la ruta real.

**6.9 — Armar un entregable a mano.** El paquete portátil se construyó copiando
carpetas, sin script. Cuando cambió el contenido no se pudo regenerar y quedó
desactualizado: le faltaban los tres recursos de Fraternidad. Ahora lo arma
`armar-pack-portatil.mjs`. Si algo se entrega más de una vez, se genera.

**6.10 — Un verificador que nunca se probó con una falla.** La primera versión
de `verificar-regresion.mjs` toleraba diferencias de hasta un 1 % del cuadro,
para absorber el ruido de §5.5. Se le hizo una prueba de control —agrandar la
mosca un 20 % a propósito— y **la dejó pasar**: la mosca ocupa menos del 1 %
del cuadro, así que ningún cambio en ella podía superar el umbral. El criterio
correcto cuenta solo los píxeles que difieren más de un 40 % en color (el ruido
de rasterizado es tenue; un cambio real es fuerte) y tolera hasta 1500. Con eso
el ruido medido queda en 490 px y la mosca agrandada en ~19.000, y también se
detecta un cambio sutil: el nombre del lower third de 54 a 52. **Todo
verificador se prueba con una falla conocida antes de confiar en que pasa.**

**6.11 — Repetir un valor de diseño en 18 archivos.** La primera versión de los
tokens de formato quedó copiada en cada recurso. Cambiar la escala vertical
significaba editar 18 archivos. Se extrajo a `fratv-aspectos.css`. Si un número
es una decisión de diseño, tiene que vivir en un solo lugar.

---

## 7 · EL ENCARGO

Construir la app que describe `handoff/SPEC_APP.md`: una aplicación web donde el
operador elige un recurso, escribe los textos, elige tema y formato, previsualiza
con una línea de tiempo y exporta a video con alfa o a PNG.

El estudio local (`scripts/estudio-png.*`) es **el prototipo funcional de eso**.
Hace ya lo esencial. La app debe ser su versión en serio: multiusuario,
desplegable, con catálogo, presets guardados y cola de exportación.

### Lo que decide si el producto sirve

1. **Que el operador pueda sacar un lower third con un nombre nuevo en menos de
   30 segundos**, en vivo, sin abrir nada más.
2. **Que lo exportado sea idéntico a lo previsualizado.** El `seek()` ya lo
   garantiza; no lo rompas.
3. **Que el mismo recurso salga bien en horizontal y en vertical** sin que el
   operador tenga que pensar en áreas seguras.
4. **Que la colección de OBS se importe y funcione**, no que "casi" funcione.

### Prompt de arranque

> Vas a continuar el FRATV Overlay Studio, en esta carpeta. Lee en este orden:
> `AGENTS.md`, `HANDOFF-CODEX.md` completo, después `handoff/BRAND.md`,
> `handoff/manifest.json`, `handoff/resources/fratv-runtime.js`,
> `handoff/resources/fratv-aspectos.css` y `handoff/SPEC_APP.md`.
>
> Las secciones 5 y 6 del hand-off traen mediciones y errores ya cometidos:
> dalos por ciertos y no los repitas. Antes de nada, corre la línea base de la
> sección 0 (`npm test` y `npm run test:regresion` dentro de `scripts/`) y
> dime si pasa. Después de cambiar cualquier recurso, `npm run test:regresion`
> tiene que seguir pasando: lo aprobado no se puede mover.
>
> Todo el texto visible va en español de Chile, tuteando, sin argentinismos.
>
> Empieza por decirme qué entendiste y qué propones. No edites hasta que te
> confirme.

---

## 8 · CÓMO REVISAR LO QUE ENTREGUES

```bash
# 1. Nada de lo aprobado se movió, en horizontal ni en vertical
cd scripts && npm run test:regresion
#    Si un cambio fue intencional y el cliente lo aprobó:
#    npm run regresion:guardar   (y se commitea la referencia nueva)

# 2. Lo vertical compone bien
node scripts/renderizar-laminas.mjs 9:16     # mirar
node scripts/medir-cajas.mjs 9:16            # leer: nada "FUERA DEL CUADRO"
                                             # salvo stinger y end-credits,
                                             # que se salen por diseño

# 3. El stinger tapa el cuadro en todos los formatos
#    ventana ≥ 300 ms, el corte de 400 ms adentro, logo centrado

# 4. La exportación es determinista
node scripts/exportar.mjs --solo=lower-third --fps=60 --aspectos=16:9,9:16
#    dos corridas, mismos bytes salvo el ruido de §5.5

# 5. Los bucles cierran
node scripts/verificar-bucle.mjs

# 6. La colección importa en OBS y las escenas NO salen vacías
node scripts/pack-maestra.mjs --aspecto=16:9 --fps=60
node scripts/pack-maestra.mjs --aspecto=9:16 --fps=60

# 7. El manifiesto y la hoja de formatos siguen diciendo lo mismo
node scripts/verificar-aspectos.mjs

# 8. El contrato de recursos se sostiene
cd scripts && npm test     # prueba las reglas, después las aplica, y
                           # comprueba manifiesto contra CSS de formatos
```

---

## 9 · LO QUE FALTA DECIDIR DEL LADO DEL CLIENTE

Está en `handoff/OPEN_QUESTIONS.md`. Lo vigente:

1. **El factor de escala de `SPEC_GEOMETRIA.md`** (§5.3). Bloquea usar ese
   documento como fuente.
2. **El divisor vertical.** Quedó en 1000 tras comparar 1000 / 1200 / 1400 sobre
   la misma pieza. Es una decisión de diseño revisable con una sola edición.
3. **La F con contenedor** (§5.10): confirmar que el 1,3 no aplica ahí.
4. **Los masters reemitidos en rojo**: los SVG originales siguen en el naranja
   archivado.
5. **La familia de combate**: si FRATV ya no es una marca de peleas, hay que
   decidir si esa familia de recursos se mantiene.
6. **Altura del ticker y posición del sponsor** en vertical: quedaron en valores
   razonables pero no aprobados.
7. **1:1 y 4:5**: el sistema los soporta y los divisores están puestos, pero
   nadie los ha revisado pieza por pieza. Solo 16:9 y 9:16 están mirados.
