# Tematización — color y tipografía en tiempo real

Requisito del cliente: **poder cambiar el color de todo** y **cambiar la tipografía** sin
tocar el código de cada recurso.

## Principio

Ningún recurso lleva un color o una fuente literal. Todo se resuelve por **CSS custom
properties** inyectadas en el `:root` del documento del recurso. La app escribe las
variables; el recurso solo las consume.

```css
/* dentro de resources/*.html — así se escribe SIEMPRE */
.status-pill { background: var(--fr-accent); color: var(--fr-on-accent); }
.data-plate  { background: var(--fr-plate); color: var(--fr-text); }
.label       { font-family: var(--fr-font-display); letter-spacing: var(--fr-track-label); }
```

El mismo mecanismo gobierna la **escala y las áreas seguras por formato**, con una
diferencia: esas no las escribe la app, las resuelve la hoja `fratv-aspectos.css` según el
atributo `data-aspecto` del `:root`. La app solo declara el formato; el resto es cascada.

| Variable | Rol | 16:9 | 9:16 |
|---|---|---|---|
| `--fr-u` | unidad de escala, `100vw / anchoDeDiseño` | `/1920` | `/1000` |
| `--safe-top` · `--safe-bottom` · `--safe-x` | bordes | 5 % · 5 % · 5 % | 12 % · 22 % · 6 % |
| `--safe-lower` | lower third, título, ticker | 12 % | 25 % |
| `--safe-flag` | mosca, badge, cuenta regresiva | 5 % | 14 % |

Los mismos números están en `manifest.json` para que la app los lea sin interpretar CSS.
`node scripts/verificar-aspectos.mjs` falla si las dos copias se separan.

## Variables del contrato

| Variable | Rol | Valor por defecto |
|---|---|---|
| `--fr-accent` | Acento / estado / contenedor | `#B72A3A` |
| `--fr-on-accent` | Texto sobre acento | `#F5F1E8` |
| `--fr-plate` | Placa de datos (con alfa) | `rgba(16,11,24,.94)` |
| `--fr-surface` | Fondo pleno de cortinillas | `#100B18` |
| `--fr-text` | Texto principal | `#F5F1E8` |
| `--fr-text-dim` | Texto secundario | `rgba(245,241,232,.72)` |
| `--fr-hairline` | Separadores | `rgba(245,241,232,.18)` |
| `--fr-radius-plate` | Radio de placas | `12px` |
| `--fr-font-display` | Títulos y nombres | Poppins |
| `--fr-font-mono` | Datos, relojes, rótulos | JetBrains Mono |
| `--fr-font-wordmark` | Wordmark FRATV | Arial Rounded MT Bold |

## Tres niveles de override

1. **Perfil de identidad** — la paleta y las fuentes globales del proyecto.
2. **Preset de recurso** — un recurso puede pedir otro acento (p. ej. sponsor en marfil).
3. **Capa** — override puntual dentro del editor, siempre partiendo del token.

La app resuelve en ese orden. El nivel 3 se guarda como *diff* contra el 1, para que al
cambiar la paleta global todo lo no sobrescrito se actualice solo.

## Presets de color incluidos

- `fratv-oficial` — rojo / negro / marfil. **El aprobado.**
- `fratv-invertido` — marfil como superficie, negro como texto, rojo intacto.
- `fratv-mono-marfil` — una tinta marfil. Para fondos saturados o coproducciones.
- `fratv-mono-negro` — una tinta negra. Para fondos claros e impresos.
- `fratv-archivo-naranja` — `#FF6B3D`. **Solo comparación histórica**, marcado como no válido para masters.
- `personalizado` — el usuario define los cinco colores, con verificación de contraste.

### Verificación de contraste obligatoria

Al aplicar cualquier paleta, la app calcula el contraste de cada par texto/fondo del
recurso. Si baja de **4,5:1** en texto pequeño, muestra advertencia visible en el inspector
y en el diálogo de exportación. Nunca la bloquea en silencio: el diseñador decide.

Caso conocido: rojo `#B72A3A` sobre negro `#100B18` da ≈1,9:1. Solo válido como masa
gráfica, jamás para texto.

## Tipografía

Tres vías, todas obligatorias:

1. **Presets curados** — pares ya validados. El primero es el aprobado.
2. **Google Fonts** — buscador con carga por familia y pesos 400–700; se cachea el WOFF2 en `IndexedDB` para que el render sea offline y determinista.
3. **Archivos propios** — subida de WOFF2/TTF/OTF, se guardan en el proyecto.

Cada preset define familia, pesos, escala y **tracking** por rol. El tracking importa: los
rótulos en mono van a `0.16–0.28em` y eso es parte de la identidad, no un detalle.

Presets iniciales:

| Preset | Display | Mono | Wordmark |
|---|---|---|---|
| `aprobado` | Poppins 600/700 | JetBrains Mono 400/700 | Arial Rounded MT Bold |
| `editorial` | Instrument Sans | IBM Plex Mono | Poppins 700 |
| `neutro` | Helvetica Now / Inter | Roboto Mono | Helvetica Rounded |

**Importante:** cambiar la fuente **no** puede alterar la geometría del logo. El wordmark
del master es vectorial (`assets/`); la variable `--fr-font-wordmark` solo afecta a los
lockups compuestos en vivo, nunca al SVG maestro.

## Regla dura para el implementador

Si en una revisión de código aparece un color hexadecimal literal dentro de `resources/`,
es un bug. Sin excepciones.
