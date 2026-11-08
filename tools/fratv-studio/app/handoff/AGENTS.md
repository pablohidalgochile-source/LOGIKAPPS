# Instrucciones para el agente (Codex)

Estás construyendo **FRATV Overlay Studio**: una app web que edita y exporta overlays de
video para OBS a partir de templates de marca ya aprobados.

## Antes de escribir código

0. Lee `../HANDOFF-CODEX.md` y `../AGENTS.md`. Mandan sobre este archivo donde
   haya diferencia: son más recientes.
1. Lee `BRAND.md` completo. Las reglas de marca no son sugerencias.
2. Lee `SPEC_APP.md`. Es la especificación funcional.
3. Lee `THEMING.md`. El contrato de color y tipografía condiciona toda la arquitectura.
4. Abre `catalog/` en el navegador para ver el diseño aprobado.
5. Lee `SPEC_GEOMETRIA.md`, pero **ojo: mezcla dos escalas** (factor 2,35, ver §5.3 del
   hand-off). No lo uses como fuente sin confirmar con el cliente.

## Reglas duras

- **Ningún color hexadecimal literal en `resources/`.** Todo por `var(--fr-*)`.
- **Ninguna familia tipográfica literal en `resources/`.** Todo por `var(--fr-font-*)`.
- **Ninguna medida en px literal en `resources/`.** Todo como `calc(n * var(--fr-u))`, con `n`
  medido contra un ancho de 1920. Solo los filetes de 1 px quedan en px.
- **Ningún porcentaje de posición literal en los bordes.** Van `--safe-top`, `--safe-bottom`,
  `--safe-x`, `--safe-lower` y `--safe-flag`. Así el mismo recurso sirve en 16:9, 9:16, 1:1 y 4:5.
- No modifiques los SVG de `assets/masters/`. Se consumen tal cual.
- No cambies los identificadores de capa: `icon-tile`, `icon-f`, `icon-play`, `icon-tv`, `word-fra`, `word-tv`, `tagline`.
- Los recursos de permanencia solo animan `transform`, `opacity` y `clip-path`.
- Cada recurso debe funcionar **abierto directamente en el navegador**, sin build, para que OBS pueda cargarlo como Browser Source local.

## Cómo trabajar

- Un commit por bloque funcional. Mensajes en imperativo y en español.
- Antes de dar por terminado un recurso, compáralo con su tarjeta del catálogo.
- Si algo del diseño no se puede implementar sin romper una regla de marca, **para y documenta** en `OPEN_QUESTIONS.md`. No improvises sobre la marca.
- Escribe tests para: resolución de tokens, cálculo de contraste, determinismo del render (mismo input → mismo hash de frames).
  Para el determinismo, no exijas igualdad exacta en recursos con texto grande: Chrome varía
  unos píxeles de borde entre cargas (§5.5 del hand-off). Usa el criterio de
  `scripts/verificar-regresion.mjs`.

## Definición de terminado

Un recurso está terminado cuando:

1. Se ve idéntico a su tarjeta del catálogo con el tema `fratv-oficial`.
2. Cambia por completo de color al cambiar de tema, sin residuos.
3. Cambia de tipografía al cambiar de preset, sin romper el layout.
4. Exporta con alfa limpio, sin halo ni borde de premultiplicado. **No con ffmpeg a WebM**:
   ffmpeg no puede escribir alfa en WebM (medido, ver §5.4 del hand-off). Las rutas reales
   son `.mov` qtrle o ProRes 4444, o WebCodecs en el navegador si hace falta WebM.
5. Respeta el área segura de cada formato y se ve bien en 16:9 **y** en 9:16.
6. `npm run test:regresion` pasa: no movió nada de lo aprobado.
7. Corre a 60 fps en OBS sin subir la GPU más de un 3 % respecto a la escena vacía.

## Lo que NO debes hacer

- No rediseñes el logo ni "mejores" la composición.
- No añadas efectos por defecto. Todo efecto es opt-in.
- No conviertas el catálogo en la app: el catálogo es referencia, la app es producto.
- No metas dependencias de UI pesadas. La app debe arrancar rápido y renderizar preciso.
