# Los overlays FRATV en OBS

Hay dos formas de trabajar, y conviene usar las dos.

| | **Pack importable** | **En vivo por navegador** |
|---|---|---|
| Qué es | Una colección de escenas con videos ya exportados | URLs que OBS carga de un servidor local |
| Ventaja | No necesita servidor encendido. El stinger sirve como transición real. | El texto se cambia sin re-exportar |
| Para qué | Marca, cortinillas, créditos, mosca | Lower thirds, programación, sponsor, cuenta regresiva |
| Cómo | `GENERAR-PACK-OBS.command` y después importar el `.json` | `ABRIR-SERVIDOR-OBS.command` y copiar URLs |

El pack generado ya mezcla las dos: deja como video lo que no cambia y como navegador
lo que sí. No tienes que elegir.

---

# A · La colección maestra (lo que vas a usar)

Doble clic en **`GENERAR-PACK-OBS.command`** y después, en OBS,
**Colección de escenas → Importar** eligiendo `pack/FRATV_MAESTRA_60FPS.json`.

Trae el estudio completo montado:

| Entrada | Para qué |
|---|---|
| `ATEM · PROGRAMA` | La señal de la ATEM Mini Extreme ISO por USB-C. El switcheo de cámaras lo sigues haciendo en la mesa. |
| `VIDEO EXTRA` | El otro computador que lanza videos. |
| `AUDIO 1` · `AUDIO 2` | Tus dos entradas de sonido. |
| `NAVEGADOR 1` · `NAVEGADOR 2` | Dos navegadores libres, apúntalos a lo que necesites. |

Y nueve escenas listas: pre-show, en vivo, entrevista, video extra, pausa, cierre,
créditos, ident e interacción. Más la transición **FRATV Stinger** ya configurada.

> **La primera vez tienes que elegir los dispositivos.** Las fuentes vienen sin equipo
> fijado, igual que las tenías antes. Con la ATEM y la interfaz conectadas, abre
> propiedades en cada una y selecciónalas. Se hace una sola vez.

En las escenas de programa, los overlays que se disparan —lower third, título, programación
y sponsor— vienen **ocultos**. Los activas con el ojo cuando los necesitas.

---

# B · El pack de recursos sueltos

Doble clic en **`GENERAR-PACK-OBS.command`**. La primera vez instala dependencias y
tarda varios minutos: abre cada recurso en Chrome, lo captura cuadro a cuadro y arma
los videos con ffmpeg.

Al terminar tienes en `pack/`:

```
pack/
  video/    los recursos como .mov con transparencia, a 60 y 30 fps
  png/      la mosca, que es estática
  FRATV_OVERLAYS_60FPS.json
  FRATV_OVERLAYS_30FPS.json
```

**Para importar:** en OBS, **Colección de escenas → Importar**, eliges el `.json` y
aceptas. Se crea una colección nueva — **no toca ninguna de las tuyas**.

Trae seis escenas de programa (pre-show, en vivo, entrevista, pausa, cierre, créditos),
una escena de capas reutilizables, y el ident y el stinger sueltos.

> Si después mueves la carpeta `pack/`, OBS pierde los archivos: las rutas quedan
> absolutas dentro del `.json`. Vuelve a generar el pack y a importarlo.

## Ojo con el modo estudio

Si trabajas en **modo estudio**, los recursos de una sola pasada —el ident, el stinger, el
lower third— **no se reproducen en la vista previa**. OBS solo los reinicia cuando la
fuente se *activa*, y estar en preview no cuenta como activarse.

No es un fallo: en preview se ven vacíos, y al pasarlos a programa arrancan. Verificado.

## El stinger como transición de verdad

Ahora sí se puede, porque hay archivo de video:

**Transiciones → + → Stinger**, eliges `pack/video/stinger_16x9_60fps_alfa.mov` y
pones el punto de transición en **400 ms**.

Tres detalles que importan y que se midieron sobre el archivo:

- Tiene que ser el **`.mov` con alfa**, no el `.mp4`. Fuera del barrido el stinger es
  transparente para dejar ver la escena; el `.mp4` no tiene canal alfa y pinta un fondo
  blanco sobre toda la mezcla.
- El punto va en **400 ms**. El barrido se rehizo: ahora tapa el cuadro entero entre los
  200 y los 580 ms, con una retención al medio. Antes la ventana era de 75 ms y había que
  afinar a 300; ahora hay 180 ms de margen a cada lado y **400 sirve en todos los
  formatos**, horizontal y vertical.
- Para vertical el archivo es `stinger_9x16_60fps_alfa.mov`. Mismo punto de corte.

Conviene marcar también **Precargar vídeo en RAM**: son 1,2 MB y evita el tirón del
primer disparo.

---

# C · En vivo por navegador

## 1. Enciende el servidor

Doble clic en **`ABRIR-SERVIDOR-OBS.command`**.

Se abre una ventana de Terminal y, al segundo, el panel en el navegador. **Deja esa ventana
abierta** mientras transmites: si la cierras, los overlays dejan de cargar. Para apagarlo,
`Control + C` en esa ventana.

> La primera vez macOS puede bloquear el archivo. Clic derecho → **Abrir** → **Abrir**.

Si el panel no se abre solo: <http://localhost:8790/_obs.html>

## 2. Arma la URL en el panel

El panel lista los 15 recursos. En cada uno:

1. Rellena los campos (nombre, cargo, títulos, lo que corresponda).
2. Arriba eliges **tema** y **tipografía** para todos a la vez.
3. **Copiar URL para OBS**.

El botón **Ver** abre el recurso en el navegador para revisarlo antes de llevarlo a OBS.

## 3. Pégala en OBS

1. En **Fuentes**, botón **+** → **Navegador**.
2. Ponle nombre y acepta.
3. Pega la URL en el campo **URL**. **No marques** "Archivo local".
4. **Ancho 1920**, **alto 1080**.
5. Marca **Apagar la fuente cuando no esté visible** y **Refrescar el navegador cuando la escena se active**.
6. Acepta. Deberías ver el overlay sobre tu escena.

El punto 5 importa: hace que la animación arranque desde cero cada vez que entras a la
escena. Sin eso, un lower third que ya terminó aparece invisible.

**No toques el CSS personalizado** que OBS trae por defecto en esa ventana. Ya deja el
fondo transparente, que es justo lo que necesitan estos recursos.

## 4. Relanzar una animación a mano

Clic derecho sobre la fuente → **Actualizar**. Útil para los lower thirds, que corren una
vez y se van.

---

## Cómo se comporta cada recurso

| Recurso | Comportamiento | Dónde ponerlo |
|---|---|---|
| `flag` · mosca | Permanente, no se mueve | Arriba en todas las escenas |
| `live-badge` · EN VIVO | Permanente, en bucle | Junto a la mosca |
| `ticker` | Permanente, en bucle | Franja inferior |
| `countdown` | Permanente, cuenta sola | Pre-show |
| `engagement` | En bucle, 8 s | Columna derecha |
| `lower-third` | **Corre una vez**, 9 s y se va | Dispara al presentar a alguien |
| `program-title` | **Corre una vez**, 8 s | Apertura de bloque |
| `schedule` | **Corre una vez**, 8 s | Antes de un corte |
| `sponsor` | **Corre una vez**, 8 s | Bloque comercial |
| `ident-long` / `ident-short` | **Corre una vez**, 1,9 s / 0,9 s | Apertura |
| `stinger` | **Corre una vez**, 0,8 s | Transición entre escenas |
| `bumper-in` / `bumper-out` | En bucle, **fondo opaco** | Escena propia, detrás de todo |
| `end-credits` | En bucle, **fondo opaco** | Escena de cierre |

Los tres de fondo opaco no son overlays: tapan la pantalla. Van en su propia escena, no
encima de la cámara.

## El stinger como transición real

El `stinger` cubre el cuadro completo justo a la mitad de su recorrido. Ahí es donde OBS
debe cortar.

En **Transiciones** → **+** → **Transición estilo stinger**, OBS pide un archivo de video,
no una URL. Así que por ahora hay dos caminos:

- **Provisional:** úsalo como fuente de navegador en una escena puente.
- **Definitivo:** exportarlo como video. Eso es justamente lo que hará la app, y es la
  razón de fondo por la que se especificó la exportación con canal alfa.

## Si algo no se ve

| Síntoma | Causa |
|---|---|
| En modo estudio el ident o el lower third no se ven | Están en preview. Solo arrancan al pasar a programa. |
| Todo negro | La ventana del servidor se cerró. Vuelve al paso 1. |
| El overlay no aparece | Es un recurso de una sola pasada y ya terminó. Clic derecho → Actualizar. |
| Fondo negro en vez de transparente | Tocaste el CSS personalizado de OBS, o es uno de los tres opacos. |
| Se ve chico o cortado | Ancho y alto de la fuente deben ser 1920 × 1080. |
| El texto sale con otra fuente | Sin internet no cargan las Google Fonts. Se verá con la de reserva. |

---

## Vertical: Instagram, TikTok y Reels

Los 18 recursos funcionan en 9:16. No son archivos distintos: el mismo HTML se
recompone solo según el tamaño del lienzo. Lo que cambia es que la gráfica pesa
más, la mosca baja para no quedar bajo el encabezado de Instagram, el ticker sube
para no quedar bajo la descripción, y el chip de tema del lower third se apila
bajo la placa en vez de ir al costado.

### Lo primero que hay que entender

**El tamaño del lienzo en OBS es del PERFIL, no de la colección de escenas.** Si
importas la colección vertical estando en tu perfil de 1920×1080, se te va a
deformar todo. Hay dos caminos.

### Camino A — Aitum Vertical (el que te conviene, ya lo tienes)

Mantienes un solo perfil horizontal y tu colección de siempre. Aitum agrega un
**segundo lienzo vertical** con su propia lista de escenas y su propia salida, así
que puedes transmitir a YouTube en 16:9 y a Instagram o TikTok en 9:16 **al mismo
tiempo**, desde la misma ATEM.

En el lienzo vertical de Aitum, las fuentes de overlay las sacas de la colección
vertical generada:

```bash
node scripts/pack-maestra.mjs --aspecto=9:16 --fps=60
```

Los recursos editables (lower third, título de programa, parrilla, sponsor,
cuenta regresiva, ticker) entran como **fuente de navegador** con `&aspecto=9:16`
en la URL. Eso es lo que hace que se recompongan para vertical. Si copias la URL
horizontal y le cambias solo el tamaño de la fuente, **no** se recompone: la
diferencia la hace el parámetro, no el tamaño.

### Camino B — Perfil aparte

Creas un perfil nuevo a 1080×1920 (**Perfil → Nuevo**, y en Ajustes → Vídeo pones
base y salida en 1080×1920), y recién ahí importas
`pack/FRATV_MAESTRA_9x16_60FPS.json`. Es más simple de entender, pero no puedes
transmitir los dos formatos a la vez: tienes que cambiar de perfil.

### Generar una pieza vertical suelta

Para un recurso puntual, el estudio es más rápido que el lote:

```bash
./ESTUDIO.command
```

En `localhost:8795` eliges el recurso, pones **Formato: 9:16**, escribes los
títulos y bajas el PNG con alfa o generas el video. Los formatos que un recurso no
soporta salen marcados como no disponibles.
