# Prompts de arranque

Copia y pega. El ZIP va adjunto o descomprimido en la raíz del repositorio.

---

## 1 · ChatGPT Codex — arranque del proyecto

```
Vas a construir FRATV Overlay Studio: una app web que edita y exporta overlays de video
para OBS a partir de templates de marca ya aprobados. El repositorio adjunto es la fuente
única de verdad.

Antes de escribir código, lee en este orden: README.md, BRAND.md, SPEC_APP.md, THEMING.md,
AGENTS.md. Luego abre catalog/ en el navegador para ver el diseño aprobado y assets/reference/
para las capturas.

No empieces a codear todavía. Primero devuélveme:
1. Un resumen en diez líneas de qué vas a construir.
2. El stack que eliges y por qué (SPEC_APP.md §2 recomienda uno, puedes discutirlo).
3. Tu plan de la fase 1 desglosado en tareas de medio día.
4. Cualquier contradicción o hueco que hayas encontrado en la documentación.
5. Los riesgos técnicos que ves además de los ya listados en SPEC_APP.md §10.

Reglas duras que no se negocian:
- Ningún color hexadecimal ni familia tipográfica literal dentro de resources/. Todo por
  var(--fr-*). El lint de CI debe fallar si aparece uno.
- Toda animación se controla por seek(tMs). Nada depende del reloj del navegador, o el
  video exportado no coincidirá con la previsualización.
- El logo no se rediseña: ni un path, ni una proporción, ni un color fuera de los tokens.
- Los recursos son HTML autónomos que funcionan abiertos directamente en el navegador,
  sin build, porque OBS los carga como Browser Source local.

Si algo no se puede implementar sin romper una regla de marca, para y anótalo en
OPEN_QUESTIONS.md en lugar de improvisar.
```

---

## 2 · Claude Code — arranque del proyecto

```
Este repositorio contiene la identidad broadcast aprobada de FRATV y la especificación de
FRATV Overlay Studio, una app web que genera los videos de overlay para OBS. Lee CLAUDE.md
primero: te dice qué cargar según lo que vayas a tocar.

Tarea de esta sesión: fase 1 completa (SPEC_APP.md §9).

  1. Andamiaje del proyecto y CI, incluido el script lint:tokens.
  2. Runtime de recursos: resources/fratv-runtime.js ya existe como referencia — revísalo,
     mejóralo si hace falta y documenta lo que cambies.
  3. Tematización en vivo por CSS custom properties, con los presets de tokens.json y el
     verificador de contraste.
  4. Biblioteca de recursos leída de manifest.json.
  5. Migrar lower-third.html y live-badge.html al runtime definitivo y construir dos
     recursos más siguiendo ese mismo patrón: flag y live/countdown.

Criterio de terminado por recurso (AGENTS.md lo detalla): idéntico a su tarjeta del
catálogo con el tema fratv-oficial, recolorea por completo al cambiar de tema, cambia de
tipografía sin romper el layout, exporta alfa limpio sin halo y respeta su área segura.

Trabaja en commits pequeños, en español, en imperativo. Al terminar dime qué quedó fuera
y qué decisiones tomaste que yo debería revisar.
```

---

## 3 · Prompt corto para retomar en otra sesión

```
Contexto: repositorio FRATV Overlay Studio. Lee CLAUDE.md (o AGENTS.md) y el estado en
OPEN_QUESTIONS.md antes de responder. Respeta el contrato de tokens: ningún color ni fuente
literal en resources/. Dime en qué punto está el proyecto y qué toca ahora.
```

---

## 4 · Qué entregar además del ZIP

| Qué | Por qué |
|---|---|
| El ZIP descomprimido **en la raíz del repositorio**, no en una subcarpeta | Codex y Claude Code buscan `AGENTS.md` y `CLAUDE.md` en la raíz. Dentro de `handoff/` no los leen automáticamente. |
| Las cuatro capturas de `assets/reference/` | Referencia visual inmediata sin ejecutar nada. |
| Los dos SVG maestros de `assets/masters/` | Geometría real del logo con los ids de capa. |
| Tus respuestas a `OPEN_QUESTIONS.md` | Wordmark, audio, 1:1 y 4:5. Sin ellas el agente adivina. |
| Un video de referencia de tu OBS, si lo tienes | Vale más que cualquier descripción de cómo lo usas. |

### Un detalle que ahorra horas

Renombra al desempaquetar: `handoff/AGENTS.md` → `AGENTS.md` en la raíz, y lo mismo con
`CLAUDE.md`. El resto puede quedarse en `handoff/` o subir a la raíz; ajusta las rutas del
README si lo mueves.
