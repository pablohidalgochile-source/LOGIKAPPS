# AGENTS.md — FRATV Overlay Studio

Instrucciones para el agente que trabaje en este repositorio (Codex u otro).

## Antes de tocar nada

1. Lee **`HANDOFF-CODEX.md` completo**. Explica qué es esto, cómo funciona por
   dentro, qué se midió y qué errores ya se cometieron. Las secciones 5 y 6 son
   obligatorias: lo que dicen está verificado, no lo vuelvas a descubrir.
2. Después, `handoff/AGENTS.md` y `handoff/BRAND.md`.
3. Corre la línea base y confirma que pasa **antes** de cambiar algo:

   ```bash
   cd scripts && npm install && npm test && npm run test:regresion
   ```

   Si la línea base no pasa en tu máquina, para y repórtalo. No empieces a
   trabajar sobre una base rota.

## Idioma

Todo texto visible —interfaz, mensajes, comentarios, commits— va en **español
de Chile, tuteando**. Nada de voseo ni argentinismos: ni "dale", ni "querés",
ni "fijate", ni "mirá", ni "che". Es "quieres", "puedes", "fíjate", "mira".
Nombres de código en inglés.

## Reglas duras

- `handoff/resources/` es el contrato visual aprobado. **El diseño no se puede
  mover**: después de tocar un recurso, `npm run test:regresion` tiene que
  pasar. Si un cambio es intencional, se muestra al cliente y solo con su
  aprobación se actualiza la referencia con `npm run regresion:guardar`.
- Ningún color, tipografía ni medida en px escritos a mano en los recursos.
  Todo por `var(--fr-*)` y `calc(n * var(--fr-u))`. Lo revisa `npm test`.
- `seek(t)` tiene que seguir siendo determinista. Es lo que hace que el video
  exportado sea idéntico a la vista previa.
- Las decisiones de formato (escala y áreas seguras) viven solo en
  `handoff/resources/fratv-aspectos.css` y en su espejo de `manifest.json`.
- Nada generado entra al repositorio: videos, PNG exportados, paquetes y
  colecciones de OBS se reconstruyen con los scripts (ver `.gitignore`).

## Cómo trabajar

- Antes de un cambio grande, di qué entendiste y qué propones, y espera
  confirmación.
- Un commit por bloque funcional, en imperativo y en español.
- Las dudas de marca no se improvisan: van a `handoff/OPEN_QUESTIONS.md` con
  contexto suficiente para que el cliente decida sin abrir código.
- Si afirmas una causa, pruébala. Si no la puedes probar, di que no la tienes.

## Comandos que existen hoy

Todos se corren dentro de `scripts/`.

```bash
npm test                  # reglas de lint probadas + contrato de recursos + formatos
npm run test:regresion    # render actual contra la referencia aprobada (16:9 y 9:16)
npm run estudio           # estudio en http://localhost:8795
npm run exportar          # todos los recursos a video (lento: ~20 min)
npm run maestra           # colección de producción para OBS
npm run portatil          # paquete para llevar a otro computador
npm run laminas -- 9:16   # lámina de contacto de un formato
npm run cajas -- 9:16     # cajas y desbordes, con números
```

Requieren Node 20+, Chrome o Chromium (se busca solo; si no, `CHROME_PATH`),
ffmpeg e ImageMagick (`magick`, `compare`).

## Editor local — etapa 2 (31 de octubre de 2026)

Existe `editor/` con React, TypeScript y Vite. Lee `editor/README.md` y
`handoff/ESTADO-EDITOR.md` antes de continuar esa app. En esa carpeta:

```bash
npm install
npm run dev              # http://127.0.0.1:5178
npm test                 # contrato del adaptador del editor
npm run build            # tipos y compilación
npm run test:browser     # con el servidor del editor ya encendido
npm run test:projects    # programas, guardado, brief e importación
npm run test:server      # exportación y relojes compartidos
npm run test:production  # render real y control vivo; servidor encendido
npm run test:pilots      # galería histórica de los tres pilotos
npm run test:fraternidad # 34 renders y seis referencias aprobadas; servidor encendido
npm run test:fraternidad-production # exportación y fuentes vivas Fraternidad
```

Esta etapa incluye biblioteca, contenido, temas, formatos, reproducción, proyectos
guardados localmente, plantillas, formulario de episodio, importación/exportación
y fuentes vivas con dock para OBS. No incluye cuentas, nube, efectos ni audio.
El servidor de exportación está en `editor/server/`; las salidas en `editor/.local/`
quedan fuera de git. Los recursos aprobados siguen siendo la fuente visual.
Fraternidad tiene 17 recursos integrados y tres pilotos aprobados. Lee
`handoff/fraternidad/README.md`; las catorce extensiones no se registran como
aprobaciones individuales por inferencia.
`npm run render:ffmpeg` todavía no existe. Los scripts anteriores siguen en
`scripts/`; no confundir las dos carpetas ni reemplazar sus comandos.

## Fraternidad — dirección aprobada y catálogo integrado

El usuario aprobó mosca, nombre/cargo e inicio en ambos formatos y autorizó
extender el catálogo, integrarlo al editor/exportador y conectar sus relojes.
Las referencias se capturaron desde los pilotos originales en
`laminas/referencia-fraternidad-16x9/` y `laminas/referencia-fraternidad-9x16/`.
No las reemplaces por renders nuevos sin aprobación explícita.

`handoff/fraternidad/` contiene manifiesto, 17 HTML y runtime propios.
`editor/src/catalog.ts` y el servidor combinan los catálogos, conservando el
manifiesto original. Manrope sigue siendo la fuente aprobada; Instrument Sans
e Inter son opciones. Los cuatro relojes usan el servicio compartido de OBS.
`propuestas/fraternidad-v1/` queda como presentación histórica, con reloj de
demostración; las fuentes de emisión usan `/live/<id>`.
