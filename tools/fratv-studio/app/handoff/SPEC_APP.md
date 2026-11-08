# FRATV Overlay Studio — especificación de la app

## 1. Producto

Un editor de overlays de video para transmisión, con calidad de broadcast y complejidad
controlada. Referencia mental: **After Effects + Premiere reducidos** a lo que FRATV
necesita, partiendo de templates ya diseñados en lugar de un lienzo vacío.

El usuario no diseña desde cero: elige un recurso, cambia textos, color, tipografía y
tiempos, opcionalmente añade efectos y audio, previsualiza y exporta.

### Usuarios

- **Operador de transmisión** — carga overlays en OBS, cambia nombres antes de salir al aire. Necesita rapidez.
- **Editor de contenido** — arma promos y cortinillas para redes. Necesita control de tiempos y formatos.
- **Responsable de marca** — define perfiles de identidad y bloquea lo que no se puede tocar.

### No objetivos

No es un editor de video general. No importa metraje, no corta timeline de cámara, no hace
color grading. Edita **overlays**.

## 2. Arquitectura

Recomendación (el agente puede ajustarla si justifica la decisión en el PR):

- **React + Vite + TypeScript**, sin framework de UI pesado.
- **Recursos como documentos HTML autónomos**, cargados en `<iframe>` aislado. Mismo archivo para el editor, para el render y para el Browser Source de OBS. Una sola fuente de verdad visual.
- **Comunicación** por `postMessage`: la app envía tokens, textos y tiempo; el iframe responde con estado de carga y duración real.
- **Estado** en un store plano serializable (proyecto → escenas → capas → overrides). Todo proyecto es un JSON versionado.
- **Persistencia** en `IndexedDB` (proyectos, fuentes, audio) + export/import de `.fratv.json`.
- **Servicio de render** en Node + FFmpeg, opcional, para ProRes 4444 y mezcla de audio.

### Control de tiempo determinista

Crítico para exportar: la animación **no** puede depender del reloj del navegador. Cada
recurso expone `window.FRATV.seek(tMs)` y todas sus animaciones se derivan de ese valor
(`animation-play-state: paused` + `animation-delay` negativo, o Web Animations API con
`currentTime`). El exportador avanza cuadro a cuadro: `seek(n * 1000/60)` → captura.

Sin esto, el video exportado no coincide con la previsualización. Es el requisito técnico
número uno.

## 3. Editor — estructura de la interfaz

```
┌──────────────┬────────────────────────────────┬──────────────┐
│  BIBLIOTECA  │           LIENZO               │  INSPECTOR   │
│  24 recursos │  preview a escala, safe areas, │  texto       │
│  por familia │  fondo conmutable (alfa/negro/ │  color       │
│              │  imagen de referencia)         │  tipografía  │
│              │                                │  efectos     │
├──────────────┴────────────────────────────────┴──────────────┤
│  LÍNEA DE TIEMPO  ·  capas, cues, easing, audio  ·  60 fps   │
└───────────────────────────────────────────────────────────────┘
```

### Lienzo

- Escala automática con zoom manual.
- Fondo conmutable: tablero alfa, negro, marfil o **imagen/video de referencia** del usuario (para verificar legibilidad sobre metraje real).
- Overlay de áreas seguras según la relación activa, leído de `tokens.json`.
- Regla y guías. Snap a área segura.

### Línea de tiempo

- Una fila por capa del recurso, con su nombre real (`icon-play`, `word-fra`, `tagline`...).
- Bloques arrastrables: inicio, duración, retardo.
- Curva de easing editable por bloque, con los presets de `tokens.json` a un clic.
- Pistas de audio con forma de onda y ganancia.
- Marcador de cuadro con lectura en ms y en frames. Navegación con flechas cuadro a cuadro.
- Marcadores de `cue`: puntos nombrados que la app y OBS pueden disparar (`enter`, `hold`, `exit`).

### Inspector

Pestañas: **Contenido** (campos de `manifest.json`), **Estilo** (tema, overrides, tipografía),
**Movimiento** (duración, easing, retardos), **Efectos**, **Audio**, **Salida**.

## 4. Tematización y tipografía

Ver `THEMING.md` — es contrato, no sugerencia. Resumen operativo:

- Panel de paleta con los presets y un editor de los cinco colores base.
- Al cambiar la paleta, **todos** los recursos del proyecto se actualizan en vivo.
- Verificador de contraste permanente, con advertencia visible bajo 4,5:1 en texto pequeño.
- Tipografía por presets, Google Fonts o archivo propio; las fuentes se cachean localmente para que el render sea offline y reproducible.
- Un botón **Restablecer a la identidad oficial** siempre visible. Nadie debe quedar atrapado en un tema roto.

## 5. Exportación

| Formato | Uso | Ruta técnica |
|---|---|---|
| **WebM VP9 con alfa** | OBS, la salida principal | `VideoEncoder` (WebCodecs) con `alpha: "keep"`, muxer WebM en worker |
| **Secuencia PNG con alfa** | Composición externa, ProRes | `OffscreenCanvas` → PNG por cuadro → ZIP |
| **MP4 H.264** | Previsualización y redes | WebCodecs + muxer MP4; fondo plano obligatorio |
| **GIF** | Vista rápida y mensajería | Paleta reducida, aviso de calidad |
| **MOV ProRes 4444** | Master con alfa real | Servicio Node: secuencia PNG → `ffmpeg` |
| **HTML en vivo** | Browser Source de OBS | Copia del recurso + `?params` + tokens embebidos |

### Comando de referencia para ProRes

```bash
ffmpeg -framerate 60 -i frames/%05d.png \
  -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le \
  -alpha_bits 16 -vendor apl0 salida.mov
```

Con audio, añadir `-i audio.wav -c:a pcm_s16le -shortest`.

### Reglas de exportación

- **Alfa recto, no premultiplicado.** Si aparece halo oscuro en los bordes, el bug está aquí.
- Sin audio en WebM alfa ni en secuencia PNG. El audio va en MP4 y ProRes.
- Cola de render con progreso por recurso, cancelable, y **exportación por lotes**: todos los recursos de un perfil, en todas las relaciones marcadas, en un ZIP con estructura por carpetas.
- Nombre de archivo determinista: `fratv_{recurso}_{relacion}_{tema}_{version}.{ext}`.

### Estructura del ZIP de identidad

```
FRATV_IDENTIDAD_v1/
  16x9/  9x16/  1x1/  4x5/
    webm-alpha/  png-seq/  mp4-preview/  html-obs/
  masters/        # SVG por capas, PNG 1000/500/200/80
  perfil.json     # tema y tipografía usados
  LEEME.md        # cómo cargarlo en OBS
```

## 6. Efectos y audio

### Efectos disponibles

`blur`, `glow`, `vignette`, `lightSweep`, `grain`, `motionBlur`, `chromaticEdge`.

Implementación por **shader WebGL sobre el cuadro capturado**, no por filtro CSS: el filtro
CSS no es determinista entre navegadores y arruina el render. Cada efecto es una pasada con
parámetros animables desde la línea de tiempo.

**Política por recurso** (en `tokens.json` → `effects.policy`): permitidos en ident,
stinger, cortinillas y créditos; restringidos en moscas, EN VIVO, lower thirds, ticker,
cuenta regresiva y módulos de interacción. En los restringidos la app los desactiva y
explica por qué: sobre canal alfa VP9 el glow se degrada y el consumo de GPU en OBS sube.

### Audio

Cuatro ranuras: `enter`, `accent`, `loop`, `exit`. Cada una con archivo, ganancia, fundido
y desplazamiento en cuadros. Forma de onda visible en la línea de tiempo para cuadrar el
golpe con el movimiento. Nada de audio en recursos de permanencia con loop infinito.

Se incluye un banco base mínimo: un *whoosh* de entrada, un golpe de acento y un cierre,
coherentes con una marca sobria — sin sonidos de plantilla ni efectos cómicos.

## 7. Integración con OBS

- Cada recurso se sirve como URL local con parámetros: `?nombre=...&cargo=...&tema=fratv-oficial`.
- Endpoint de control por WebSocket para disparar `enter`, `hold` y `exit` desde un atajo o desde el mismo OBS. El operador no debería tener que recargar la fuente para lanzar un lower third.
- `autoplay`, `loop` y `duration` como parámetros de URL.
- Botón **Copiar URL para OBS** en cada recurso, con el tamaño recomendado ya indicado.

## 8. Los 24 recursos

Doce recursos × dos orientaciones ya diseñadas (más 1:1 y 4:5 derivados). Ver
`manifest.json` para tamaños, duraciones, campos editables y área segura de cada uno.

Familias: **marca** (ident largo, ident corto, stinger) · **estado** (mosca, EN VIVO, cuenta
regresiva) · **cortinilla** (en breve comienza, gracias por ver) · **información** (lower
third, título de programa, a continuación y programación) · **interacción** (comentario,
votación, meta) · **comercial** (sponsor, ticker) · **cierre** (end credits).

## 9. Fases

1. **Base** — runtime de recursos, tokens, tematización en vivo, biblioteca. *Sin esto no hay nada.*
2. **Editor** — inspector, línea de tiempo, presets tipográficos, áreas seguras.
3. **Exportación** — WebM alfa, PNG, MP4, ZIP por lotes. *Aquí el producto ya sirve.*
4. **Efectos y audio** — shaders, ranuras de audio, política por recurso.
5. **Producción** — servicio ProRes, control OBS por WebSocket, perfiles de identidad compartibles.

## 10. Riesgos conocidos

- **WebCodecs + alfa**: soporte desigual entre navegadores. Requiere detección y aviso claro; Chromium es el objetivo primario.
- **Determinismo del render**: si un recurso usa `animation` sin `seek()`, el export se desincroniza. Cubrir con test de hash de cuadros.
- **Fuentes**: una familia que carga tarde produce un primer cuadro con fallback. Bloquear el render hasta `document.fonts.ready`.
- **Efectos sobre alfa**: documentado arriba. No prometer glow perfecto en WebM.
- **Contraste rojo/negro**: recordatorio permanente en el editor, no solo en la documentación.
