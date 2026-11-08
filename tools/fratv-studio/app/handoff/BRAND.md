# FRATV — reglas de marca

**Marca:** FRATV
**Bajada oficial:** CONTENIDO DIGITAL HUMANO
**Personalidad:** humana, cercana, curiosa, contemporánea, con carácter editorial.
**Idea central:** la tecnología y el lenguaje audiovisual al servicio de las personas.

No debe sentirse como un canal corporativo antiguo, ni como plantilla genérica de
streaming, ni infantil. Claridad televisiva + energía digital + calidez humana.

## Paleta final aprobada

| Token | Valor | Uso |
|---|---|---|
| `brand.red` | `#B72A3A` | Color maestro. Contenedor, etiquetas de estado, acentos. |
| `brand.ink` | `#100B18` | Negro de marca. Interior del símbolo, placas de datos, fondos. |
| `brand.ivory` | `#F5F1E8` | Texto principal y contraste. |
| `brand.night` | `#08070C` | Fondo de escena y lienzos. |

Rojo, negro y marfil son los **colores finales**. El naranja histórico `#FF6B3D` y el azul
rey `#0B1F4D` quedan **solo como archivo**: no se usan en masters nuevos.

### Contraste

Nunca texto rojo sobre negro ni negro sobre rojo en tamaños pequeños. Para datos,
horarios, cargos y párrafos: **marfil sobre negro** o **negro sobre marfil**. El rojo y el
negro sí pueden convivir como masas gráficas grandes.

## Construcción del símbolo

El símbolo es un contenedor cuadrado rojo de esquinas muy redondeadas que contiene, en
negro de marca:

1. Una **F** gruesa y redondeada, **un 30 % mayor** que la versión original (proporción aprobada).
2. Un **triángulo de reproducción** del mismo peso visual que la F.
3. Las letras **TV** recortadas en rojo dentro del play.

Firma horizontal = símbolo + wordmark. Wordmark: las cinco letras del mismo tamaño, altura
y línea base — **FRA** en marfil, **TV** en rojo. Bajada debajo, en marfil.

Existe una versión **sin contenedor** (F + play sueltos, en marfil o en rojo) para moscas,
créditos y cierres.

### Capas con identificadores estables

`icon-tile`, `icon-f`, `icon-play`, `icon-tv`, `word-fra`, `word-tv`, `tagline`.
Conservar esos nombres. Cualquier cambio se documenta.

## Innegociables

- No redibujar la F. No cambiar la proporción del play. No alterar el TV interior.
- No cambiar la relación de tamaño entre FRA y TV.
- No sustituir la bajada oficial ni volver a la anterior.
- No estirar, aplastar, ondular ni deformar ninguna forma.
- No convertir el triángulo en Pac-Man. No añadir ojos, boca ni rasgos caricaturescos.
- No usar giros 3D del logo completo.
- No rebotes elásticos, glitches genéricos ni efectos de plantilla.
- La pose final de toda animación coincide **exactamente** con el SVG maestro.
- No convertir el rojo en fucsia, burdeos ni rojo deportivo brillante.

## El play como personaje

El triángulo es el personaje de FRATV. No es una mascota y no cambia de forma. Su
personalidad se expresa solo con actuación corporal abstracta: anticipación, inclinaciones
de 4–7°, pausas conscientes, aceleración con peso, decisión al activar otros elementos.

**En el logo ident aprobado el play no entra ni sale ni se desplaza.** La animación resuelve
la escala y la opacidad en 240 ms y se detiene en la pose oficial.

## Dos reglas de composición

Todo el sistema broadcast se construye con dos reglas. Cualquier recurso nuevo las respeta:

1. **Placa negra al 94 % de opacidad** para datos: nombres, cargos, horarios, comentarios, cifras.
2. **Bloque rojo pleno** para etiquetas de estado: EN VIVO, AHORA, A CONTINUACIÓN, NUEVO EPISODIO.

Excepción documentada: el sponsor va sobre **placa marfil**, para que respire cualquier logo ajeno.

## Áreas seguras

- **Horizontal 1920×1080:** gráficos dentro del 5 % (96 px); textos largos dentro del 10 %. El ticker es la única excepción: va de borde a borde.
- **Vertical 1080×1920:** 12 % superior y 22 % inferior reservados a la interfaz de la plataforma. La mosca baja al 14 %; los lower thirds se apoyan en el 25 %.

## Movimiento

- 60 fps. Solo `transform`, `opacity` y `clip-path` en los recursos de permanencia.
- Easing con peso, sin rebote de aplicación móvil.
- Pausas suficientes para que el movimiento se lea.
- Debe seguir siendo elegante visto diez veces seguidas.
- La salida termina totalmente limpia y transparente.
