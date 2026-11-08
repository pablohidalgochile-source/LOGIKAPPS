# Geometría exacta — medidas obligatorias

Complemento de `manifest.json`. Todo en píxeles a **1920 × 1080**. Para 1080 × 1920
multiplica por 0.5625 salvo donde se indique.

**Esto no es orientativo.** Si un recurso no coincide con estas medidas, no está terminado.
Comparar siempre contra `assets/reference/catalogo-horizontal.png`.

---

## Escalas de referencia

| Concepto | Valor |
|---|---|
| Lienzo horizontal | 1920 × 1080 |
| Área de acción | inset 5 % → 96 px lateral, 54 px vertical |
| Área de títulos | inset 10 % → 192 px lateral, 108 px vertical |
| Radio de placa de datos | 14 px |
| Radio de pastilla de estado | 22 px |
| Radio de chip / etiqueta | 7 px |
| Opacidad de placa de datos | 0.94 |

---

## Símbolo

Contenedor cuadrado: `viewBox="40 40 520 520"`, `rect x=55 y=55 w=490 h=490 rx=134`.
El radio es **134 / 523 = 0.2562** del lado. Nunca un valor absoluto.

Sin contenedor: `viewBox="56 162 430 276"`.
Grupo `icon-f` con `translate(60 166.5) scale(1.3) translate(-101.25 -197.25)` — el
`scale(1.3)` **es** la proporción aprobada de la F. No tocarlo.
Grupo `icon-play` con `translate(21 0)`.
Trazo de la F: `stroke-width="54"`, `linecap` y `linejoin` redondos.
TV interior: `stroke-width="16"` en el símbolo grande, `14` dentro del contenedor.

| Uso | Alto del símbolo |
|---|---|
| Mosca 16:9 | 238 px de ancho (12.4 % del lienzo) |
| Mosca 9:16 | 280 px de ancho (26 %) |
| Lower third | 76 px |
| Cierre / créditos | 172 px |
| Ident | 269 px (14 %) |

---

## H06 · Lower Third

| Elemento | Medida |
|---|---|
| Posición | `left: 5%`, `bottom: 12%` |
| Radio del bloque | 14 px |
| Bloque de marca | padding lateral 30 px, símbolo 76 px |
| Placa de datos | padding 26 px arriba / 54 px lados / 30 px abajo |
| Nombre | 54 px, peso 600, tracking −0.01em, line-height 1 |
| Cargo | mono 19 px, peso 400, tracking 0.2em, margen superior 17 px |
| Etiqueta de tema | mono 15 px peso 700, tracking 0.16em, padding lateral 20 px |
| Texto de tema | 25 px peso 500, padding 18 / 32 px |
| Entrada | `clip-path: inset(0 100% 0 0)` → `inset(0)` en 420 ms, easing `wipe` |
| Texto | sube 12 px con opacidad, 320 ms, retardo 120 ms entre nombre y cargo |
| Tema | entra por el lado opuesto con 1100 ms de retardo |

## H02 · EN VIVO

| Elemento | Medida |
|---|---|
| Posición | `left: 5%`, `top: 5%` |
| Radio | 22 px |
| Pastilla roja | padding 18 / 32 px, punto 18 px, etiqueta 26 px tracking 0.22em |
| Placa con reloj | padding 16 px / 30 px derecha / 24 px izquierda |
| Etiqueta en placa | 23 px, tracking 0.2em |
| Reloj | mono 23 px peso 700, tracking 0.1em, `tabular-nums` |
| Separador | 1 × 28 px, opacidad 0.4 |
| Medidor | 3 barras de 5 × 26 px, gap 5 px |
| Pulso del punto | 1500 ms, opacidad 1 → 0.25 → 1 |
| Barras | 850 ms, `scaleY` .22 → 1, retardos 0 / 120 / 240 ms |

## H01 · Mosca

`right: 5%`, `top: 5%`. Ancho 238 px. Variante marfil por defecto; TV recortado en rojo.
Estática, sin animación.

## H03 · Cuenta regresiva

Reloj largo: mono 25 px peso 700 tracking 0.06em, placa padding 11 / 18 px, rótulo mono
8.5 px tracking 0.16em a dos líneas. Pastilla corta: mono 19 px + etiqueta 9.5 px tracking
0.18em. Barra de bloque: alto 6 px, radio 4 px, ancho 34 % del lienzo.

## H04 / H05 · Cortinillas

Superficie plena. Filete de 5 px: **arriba** en la de apertura, **abajo** en la de cierre.
Símbolo 9.6 % del ancho en apertura, 172 px en cierre. Título 31 px peso 700 line-height
1.1. Subtítulo mono 11.5 px tracking 0.28em, margen superior 13 px. Reloj mono 23 px
tracking 0.08em. Entradas con `translateY(14px)` + opacidad, ciclo de 7 s, retardos 0 /
120 / 240 ms.

## H07 · Título de programa

`left: 8%`, `bottom: 14%`. Etiqueta: chip radio 7 px, padding 6 / 12 px, mono 9.5 px peso
700 tracking 0.18em. Título 47 px peso 700 line-height 1.04 tracking −0.015em, margen
superior 14 px. Regla 4 px de alto, 38 % de ancho, radio 2 px, margen 16 px. Datos mono
10.5 px tracking 0.2em, margen 14 px.

## H08 · Interacción

Columna `right: 5%`, `top: 5%`, ancho 38 %. Tres módulos, gap 12 px, radio 12 px, padding
13 / 16 px. Avatar 20 px radio 6 px. Usuario mono 9 px tracking 0.14em. Comentario 13.5 px
line-height 1.45. Barras: votación 8 px de alto radio 5 px, meta 7 px radio 4 px. Retardos
de entrada 0 / 180 / 360 ms.

## H09 · Sponsor y ticker

Sponsor: **placa marfil**, radio 12 px, padding 13 / 18 px, rótulo mono 8.5 px tracking
0.2em, hueco de logo 96 × 32 px.
Ticker: franja de borde a borde, alto 16 % de la franja inferior, placa al 94 %. Etiqueta
roja fija con padding 14 px, mono 9.5 px peso 700 tracking 0.16em.
**El texto se recorta en el borde derecho de la etiqueta**: el contenedor de la marquesina
lleva `overflow: hidden` y la etiqueta va en su propia capa. Desplazamiento lineal de 18 s
sobre contenido duplicado, `translateX(0 → −50%)`.

## H10 · A continuación y programación

Padding 6 / 7 %. Cabecera: chip rojo + línea de 1 px + etiqueta de día. Filas radio 8 px,
padding 11 / 15 px, gap 9 px. **La primera fila lleva `border-left: 3px` rojo y fondo al
7 %**; el resto al 4 %. Hora mono 15 px peso 700 ancho fijo 52 px. Título 16 px. Etiqueta
mono 9 px tracking 0.14em. Retardos 120 ms por fila, máximo 5.

## H11 · End credits

Superficie plena. Degradados de 26 % arriba y abajo sobre la superficie. Padding lateral
12 %. Rótulo mono 8.5 px tracking 0.2em en acento; nombre 15 px peso 600, margen 5 px. Gap
14 px. Desplazamiento lineal 22 s, `translateY(0 → −50%)` sobre lista duplicada. Marca fija
`right: 5%`, `bottom: 6%`, 9 % de ancho.

## H12a · Ident

Símbolo 14 % del ancho + wordmark 52 px, gap 30 px. Bajada 10 px peso 700 tracking 5.6 px,
margen 12 px. **El play no se desplaza.** Escala 0.94 → 1 con opacidad en 240 ms, retardo
de 300 ms en el wordmark, sostenido y salida por opacidad. Pose final idéntica al master.

## H12b · Stinger

Barrido de 150 % de ancho, `skewX(-11deg)`, sobresale 12 % arriba y abajo. Símbolo al
centro con `skewX(11deg)` compensatorio, 16 % de ancho. Recorrido `translateX(-118% → 0 →
118%)` en 800 ms, easing `cubic-bezier(.7,0,.25,1)`. **Cubre el cuadro completo al 50 %**:
ahí corta OBS.

---

## Verificación

Para cada recurso, antes de darlo por terminado:

1. Superponer la captura del catálogo al 50 % de opacidad. Los bordes deben coincidir.
2. Medir tres elementos con el inspector y comparar con esta tabla.
3. Cambiar a `fratv-mono-marfil` y confirmar que no queda ningún color anterior.
4. Cambiar al preset `editorial` y confirmar que no se rompe ninguna caja.
