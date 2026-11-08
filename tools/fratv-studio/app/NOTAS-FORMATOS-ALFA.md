# Formatos con canal alfa — lo que funciona y lo que no

Medido en esta máquina (macOS, ffmpeg 8.1.1). Importa porque `SPEC_APP.md` da por
hecho que la salida principal es **WebM VP9 con alfa**, y eso **no se puede producir
con ffmpeg**.

## La prueba

Se exportó un cuadro del ident a PNG con transparencia y se codificó en cada formato.
Después se extrajo el canal alfa de cada resultado y se comparó con el original.

| Formato | Canal alfa | Resultado |
|---|---|---|
| PNG de origen | 93,8 % transparente · 2,6 % opaco | referencia |
| **QuickTime Animation (`qtrle`)** | 93,8 % · 2,6 % | **idéntico al original ✓** |
| **ProRes 4444 (`prores_ks`)** | 93,9 % · 2,6 % | **idéntico al original ✓** |
| HEVC con alfa (`hevc_videotoolbox`) | todo en cero | contenido perdido ✗ |
| WebM VP9 (`libvpx-vp9`) | no hay | ✗ |
| WebM VP8 (`libvpx`) | no hay | ✗ |

## Por qué falla WebM

ffmpeg **sí codifica** el alfa: el log dice `Stream #0:0: Video: vp9, yuva420p`. Lo que
no hace es **escribirlo** — el muxer WebM descarta el plano alfa, y al decodificar el
archivo sale `yuv420p`. Con VP8 el encoder directamente avisa: *"Transparency encoding
with auto_alt_ref does not work"*, y aun poniendo `-auto-alt-ref 0` el resultado tampoco
lleva alfa.

No es un problema de parámetros. ffmpeg no expone la escritura de alfa en WebM.

Para WebM con alfa real hay que salir de ffmpeg: `vpxenc` de libvpx, o el `VideoEncoder`
de WebCodecs dentro del navegador con `alpha: "keep"` — que es justamente la ruta que
`SPEC_APP.md` propone para la app, y que **sí** funciona, porque ahí el muxer es otro.

## Qué se usa en el pack

| Formato | Para qué | Peso |
|---|---|---|
| **`qtrle` en `.mov`** | Salida principal para OBS. Sin pérdida, alfa recto. | ~41 KB por cuadro |
| `prores_ks` 4444 en `.mov` | Master de archivo. Mismo alfa. | ~182 KB por cuadro |
| `libx264` en `.mp4` | Sin alfa, compuesto sobre negro. Es lo que OBS acepta como **transición stinger**. | mínimo |

`qtrle` es Run-Length Encoding sin pérdida: comprime muy bien las zonas planas y
transparentes, que es exactamente de lo que están hechos estos overlays. Por eso pesa
cuatro veces menos que ProRes sin perder un solo bit.

## Corrección: qtrle NO es el culpable de los `.mov` que no abrían

En algún momento se afirmó que `qtrle` era un códec viejo que AVFoundation ya no
maneja, y que por eso los `.mov` generados no se podían abrir ni compartir.
**Eso es falso y se verificó.** Se generaron miniaturas de Finder para un `.mov`
en qtrle y otro en ProRes: **las dos salieron bien**. macOS decodifica qtrle sin
problema.

Lo que sí es cierto: **ningún `.mov` con canal alfa se puede subir a WhatsApp,
Instagram ni correo**, en qtrle ni en ProRes. Esos servicios esperan H.264 sin
transparencia. Para compartir hay que usar el `.mp4` que se genera al lado.

ProRes 4444 quedó como opción por omisión en el estudio por ser el estándar de la
industria y el que abren todos los editores sin discusión — no porque qtrle
estuviera roto. La causa original del error que reportó el cliente **sigue sin
determinarse**: falta saber con qué aplicación lo abría y qué decía el mensaje.

## Consecuencia para la app

Cuando se construya FRATV Overlay Studio, la exportación a WebM con alfa **no puede
delegarse a ffmpeg**. Tiene que hacerse con WebCodecs en el navegador, como dice el spec.
El servicio de ffmpeg sirve para ProRes y para la mezcla de audio, no para el WebM.

Conviene corregir esa suposición en `SPEC_APP.md` §5, donde la tabla da a entender que
cualquiera de las dos rutas sirve.
