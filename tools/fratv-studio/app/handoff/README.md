# FRATV Overlay Studio — paquete de handoff

Sistema de identidad broadcast de **FRATV** y especificación de la app web que genera los
videos de overlay para OBS.

Este repositorio es la **fuente única de verdad**. Nada de lo que hay aquí se decide de
nuevo: el diseño y el movimiento ya están aprobados por el cliente.

## Qué hay que construir

Una app web tipo *After Effects + Premiere reducido*: toma los templates de overlay ya
diseñados y permite editarlos (texto, color, tipografía, tiempos, efectos, audio) y
**exportarlos como video con canal alfa** para usarlos en OBS.

## Mapa del repositorio

| Ruta | Qué es |
|---|---|
| `BRAND.md` | Reglas de marca. Innegociables. Léelo antes de tocar un pixel. |
| `SPEC_APP.md` | Especificación funcional y técnica de la app. El documento principal. |
| `SPEC_GEOMETRIA.md` | **Medidas exactas de cada recurso en píxeles. Obligatorio.** |
| `THEMING.md` | Cómo funciona el cambio de color y de tipografía en tiempo real. |
| `tokens.json` | Todos los tokens: color, tipografía, radios, espaciado, easings. |
| `manifest.json` | Los 24 recursos: tamaños, duraciones, campos editables, alfa, loop. |
| `resources/` | Un HTML por recurso, parametrizable. Lo que la app renderiza y OBS carga. |
| `catalog/` | Catálogos visuales aprobados (horizontal y vertical). Referencia de diseño. |
| `assets/` | SVG maestros por capas, PNG exportados, capturas de referencia. |
| `AGENTS.md` / `CLAUDE.md` | Instrucciones para Codex y para Claude Code. |

## Arranque

_Estos comandos son de la **app por construir**; todavía no existen. Los que funcionan hoy están en `../AGENTS.md`._

```bash
npm install
npm run dev          # app en http://localhost:5173
npm run render:ffmpeg  # servicio de render ProRes (opcional, requiere ffmpeg en PATH)
```

## Orden de trabajo sugerido

1. Leer `BRAND.md` y `SPEC_APP.md`.
2. Implementar el runtime de recursos (`resources/`) + tematización por CSS custom properties.
3. Implementar el editor: inspector de capas, línea de tiempo, presets tipográficos.
4. Implementar el exportador WebM/alfa + secuencia PNG + MP4 de preview.
5. Añadir efectos y audio.
6. Añadir el servicio FFmpeg para ProRes 4444.
7. Empaquetado ZIP por perfil de identidad.

## Regla de oro

**El logo no se rediseña.** Ni un path, ni una proporción, ni un color fuera de los tokens.
Si algo no se puede resolver sin modificar la marca, se documenta y se pregunta.
