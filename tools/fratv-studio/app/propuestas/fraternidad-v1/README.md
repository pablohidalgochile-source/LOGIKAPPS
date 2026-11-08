# Fraternidad · pilotos de diseño 01

Estado: **tres diseños aprobados por el usuario**, 31 de octubre de 2026.
Esta carpeta conserva los pilotos históricos; sus versiones integradas viven
en `handoff/fraternidad/` y utilizan el editor, exportador y servicio vivo.
Tres piezas y dos composiciones por pieza: mosca, nombre/cargo e inicio con
cuenta regresiva, en 1920 × 1080 y 1080 × 1920. Estas muestras conservan el reloj de demostración. Las versiones del catálogo
son las que se usan en las plantillas y el exportador de producción.

## Abrir y revisar

Desde `editor/`, ejecuta `npm run dev` y abre
`http://127.0.0.1:5178/pilotos-fraternidad/`.

La galería presenta las seis vistas, entradas animadas, cambios de fondo,
áreas seguras y campos de muestra. Sus iframes conservan el tamaño nativo y se
escalan solo para presentarlos. Los enlaces «Vista original» abren las muestras
iniciales a pantalla completa; las ediciones de la galería son temporales.

«ANA PÉREZ», «CONDUCTORA» y «ENCUENTRO FRATERNIDAD» son contenido de ejemplo.
El fondo de personas es una ilustración CSS de prueba, no una cámara real.

## Dirección aprobada en los pilotos

- Firma institucional blanca para mosca y nombre/cargo; insignia Frate para inicio.
- Azul `#011b52` y dorado `#ad8641` observados en la insignia. El marfil
  `#f7f4ea`, tonos auxiliares, Manrope y IBM Plex Mono fueron propuestos en estos pilotos y aprobados por el usuario; no provienen
  de un manual oficial recuperado de Fraternidad.
- Mosca sobre placa azul, placa de nombre marfil con filete dorado e inicio
  azul con dos filetes circulares. Sin firma FRATV dentro de las tres piezas.
- Composición vertical propia: firma sobre la placa de nombre; insignia sobre
  el título y reloj. Las medidas y áreas seguras heredan `fratv-aspectos.css`
  sin cambiar ese archivo ni las decisiones de formato existentes.

Se reutilizan los dos PNG de `handoff/assets/eventos/` sin alterarlos.
Los contenedores CSS compensan exclusivamente sus márgenes transparentes.
No se redibujó, recoloreó ni recortó el archivo original.

## Reloj de demostración

El reloj permite iniciar, pausar, continuar y reiniciar con duraciones de uno,
cinco o diez minutos. Es independiente de la animación de entrada. La galería
manda el mismo tiempo a ambas vistas.

Este piloto no está conectado al servicio compartido de emisión ni a OBS.
Recargar la galería restablece la demostración. Las versiones adaptadas al catálogo reciben el estado del servicio vivo
existente; esta presentación conserva su demostración independiente.

## Verificación reproducible

Con el servidor encendido, desde `editor/`:

```sh
npm test
npm run build
npm run test:pilots
```

`test:pilots` captura las seis composiciones en Chrome y revisa logos, textos,
áreas seguras, repetibilidad del cuadro, reloj y galería a 1440 y 390 px.
Las capturas e informe se guardan fuera del repositorio, en la carpeta temporal
indicada al terminar. `FRATERNIDAD_QA_OUTPUT` permite elegir otro destino.

La prueba original sigue en `scripts/`: `npm test` y `npm run test:regresion`.
Después de la aprobación se capturaron sus seis referencias en las carpetas
`laminas/referencia-fraternidad-*`, antes de adaptar el runtime al editor.

## Aprobación registrada

El usuario aprobó las seis vistas y autorizó extender esta dirección visual.
El catálogo Fraternidad ya está integrado; consulta `handoff/fraternidad/README.md`.
