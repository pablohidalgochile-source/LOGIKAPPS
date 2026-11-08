# CLAUDE.md — FRATV Overlay Studio

## Qué es este repositorio

El sistema de identidad broadcast de FRATV (aprobado) y la especificación de la app web que
genera los videos de overlay para OBS. Lee `README.md` para el mapa, `SPEC_APP.md` para el
producto, `BRAND.md` para las reglas.

## Contexto que necesitas cargar

| Antes de tocar... | Lee |
|---|---|
| cualquier cosa | `BRAND.md` |
| `resources/` | `THEMING.md`, `tokens.json`, `manifest.json`, `SPEC_GEOMETRIA.md`, y §3.2–3.4 del hand-off |
| cualquier cosa de formatos | `resources/fratv-aspectos.css` |
| el editor | `SPEC_APP.md` §3, §4 |
| el exportador | `SPEC_APP.md` §5 |
| efectos o audio | `SPEC_APP.md` §6, `tokens.json` → `effects.policy` |

## Convenciones

- Español en UI, copy, commits y comentarios. Inglés en nombres de código.
- Tokens antes que valores. Si necesitas un valor nuevo, añádelo a `tokens.json`, no al componente.
- Los recursos son HTML autónomos: sin framework, sin build, sin imports remotos salvo fuentes.
- Nada de `!important`. Nada de estilos globales que se filtren entre recursos.
- **Nada de `px` desnudos.** Toda medida va como `calc(n * var(--fr-u))`, donde `n` es la
  medida de diseño contra un ancho de 1920. Única excepción: los filetes de 1 px.
- **Nada de porcentajes de posición literales en los bordes.** Van los tokens
  `--safe-top`, `--safe-bottom`, `--safe-x`, `--safe-lower`, `--safe-flag`. Si una pieza
  necesita un valor propio, se escribe como suma —`calc(var(--safe-x) + 3%)`— para que en
  16:9 siga resolviendo a lo de siempre.
- Lo que es decisión de formato vive en `resources/fratv-aspectos.css`, no copiado en cada
  recurso. Lo propio de un recurso (geometría del barrido, alto del ticker) sí queda local.

## Comandos

Los que existen hoy (dentro de `scripts/`):

```bash
npm test                  # lint probado + contrato de recursos + formatos
npm run test:regresion    # render actual contra la referencia aprobada
npm run laminas -- 9:16   # lámina de contacto de un formato
npm run cajas -- 9:16     # cajas y desbordes, con números
```

Los de la app, **por construir** (todavía no existen):

```bash
npm run dev              # editor
npm run build            # bundle de producción
npm run test             # unitarios + determinismo de render
npm run lint:tokens      # falla si hay color o fuente literal en resources/
npm run render:ffmpeg    # servicio ProRes 4444
```

`lint:tokens` es obligatorio en CI. Es la defensa real del contrato de tematización.
Ojo: una versión anterior de esa regla usaba `font-family:\s*(?!var\()`, que **no detecta
nada**, porque `\s*` consume cero caracteres y el lookahead siempre pasa. Escríbele una
prueba a la regla misma.

**Antes y después de tocar un recurso:** renderiza la lámina de 16:9 y compárala. El
diseño horizontal está aprobado y no se puede mover. La única excepción autorizada hasta
hoy fue la geometría del stinger, que estaba defectuosa (ver §5.2 del hand-off).

## Cuando dudes

Pregunta antes de improvisar sobre la marca. Registra la duda en `OPEN_QUESTIONS.md` con
contexto suficiente para que el cliente decida sin abrir el código.

## Lo que nunca cambia sin aprobación

La geometría del logo, la relación FRA/TV, la bajada oficial, la paleta rojo/negro/marfil,
las dos reglas de composición (placa negra para datos, bloque rojo para estado) y el hecho
de que en el ident **el play no se desplaza**.
