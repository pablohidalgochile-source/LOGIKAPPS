# resources/ — los recursos renderizables

Un HTML autónomo por recurso. **El mismo archivo** sirve para tres cosas:

1. previsualización dentro del editor (en `<iframe>`),
2. captura cuadro a cuadro del exportador,
3. carga directa como **Browser Source** en OBS.

Por eso no llevan build, ni imports remotos, ni framework.

Y **el mismo archivo** sirve además en los cuatro formatos: 16:9, 9:16, 1:1 y 4:5. No hay
versiones separadas. La recomposición la hacen `--fr-u` y los tokens de área segura, que
viven en `fratv-aspectos.css`.

## Contrato que todo recurso debe cumplir

```js
window.FRATV = {
  meta:   { id, durationMs, loop, alpha },
  seek(tMs),            // posiciona TODAS las animaciones. Determinista.
  setTokens(obj),       // escribe las custom properties en :root
  setFields(obj),       // rellena los campos editables
  ready: Promise        // resuelve cuando fuentes e imágenes están listas
};
```

`seek()` es el requisito crítico: si una animación depende del reloj del navegador, el
video exportado no coincide con la previsualización.

A eso se suma `setAspecto(a)`, que escribe `data-aspecto` en `:root`. Si no se declara, el
runtime lo deduce de la razón del viewport: exportar a 1080×1920 ya aplica la composición
vertical sin pasar nada.

## Cómo se escriben las medidas

Los recursos se dibujaron contra un ancho de **1920**. Esa medida de diseño se escribe
tal cual, multiplicada por la unidad:

```css
.name { font-size: calc(54 * var(--fr-u)); }      /* NO: font-size: 54px */
```

En 16:9 `--fr-u` vale `100vw/1920`, así que a 1920 px da exactamente 54 px y el diseño
horizontal no se mueve. En 9:16 el divisor es 1000, y toda la gráfica pesa más.

Los bordes se posicionan con tokens, nunca con porcentajes literales:

```css
.flag { right: var(--safe-x); top: var(--safe-flag); }
.lt   { left: var(--safe-x);  bottom: var(--safe-lower); }
```

Si una pieza necesita separarse del token, se escribe como suma —`calc(var(--safe-x) + 3%)`—
para que en 16:9 siga resolviendo a su valor de siempre.

Excepción única: los filetes de 1 px se quedan en 1 px a cualquier escala.

## Parámetros de URL

Todo campo de `manifest.json` se acepta como query param, más:

| Param | Efecto |
|---|---|
| `tema` | id de tema de `tokens.json` |
| `tipo` | preset tipográfico |
| `autoplay` | `1` (por defecto) o `0` |
| `loop` | `1` / `0` |
| `duracion` | ms, sobrescribe la del manifest |
| `safe` | `1` dibuja las guías de área segura (solo para ajustar en OBS) |

Ejemplo listo para OBS:

```
lower-third.html?name=PABLO%20HIDALGO&role=CONDUCTOR%20%C2%B7%20FRATV&tema=fratv-oficial&loop=0
```

## Reglas

- **Cero colores literales.** Todo por `var(--fr-*)`. `npm run lint:tokens` falla si aparece un hex.
- **Cero familias tipográficas literales.** Todo por `var(--fr-font-*)`.
- Solo `transform`, `opacity` y `clip-path` en los recursos de permanencia.
- El SVG de marca se inserta tal cual desde `assets/masters/`, conservando los ids de capa.
- Fondo transparente por defecto; las cortinillas pintan su propia superficie.

## Estado

**Los 15 recursos del manifest están escritos.**

`lower-third.html` y `live-badge.html` son la **referencia canónica** entregada por diseño.
Los 13 restantes se construyeron sobre ese mismo patrón, tomando las posiciones del
catalogo aprobado y las medidas de `SPEC_GEOMETRIA.md`. Verificado en los 15:

- cero colores y cero familias tipográficas literales fuera del `:root` de defaults;
- `id`, `durationMs`, `loop` y `alpha` coinciden con `manifest.json`;
- `seek()` determinista: misma marca de tiempo devuelve exactamente el mismo estado;
- cambio de tema sin restos del tema anterior, y preset `editorial` sin romper cajas.

### Criterios aplicados donde el spec no alcanzaba

| Tema | Qué se hizo |
|---|---|
| Escala de `SPEC_GEOMETRIA.md` | Sus medidas de H03 a H12 están en píxeles de tarjeta de catálogo (817 px = 1920), no a 1920. Se aplicó el factor **2,35**. Ver `OPEN_QUESTIONS.md`. |
| Radios | De `tokens.json` (14 / 22 / 7), que coinciden con los dos recursos canónicos. |
| Posiciones | Porcentajes leídos del catálogo aprobado: son independientes de escala. |
| Símbolo con contenedor | Sin `scale(1.3)`, igual que el catálogo aprobado. El 30 % mayor de la F aparece solo en la versión sin contenedor. |

### Hoja de contacto

`../_contacto.html` muestra los 15 a escala sobre un damero que revela el canal alfa, y
posiciona los recursos sin loop en su punto de sostenido. Es herramienta de revisión, no
forma parte de la entrega.
