# FRATV Overlay Studio · estado actual

Actualizado el 31 de octubre de 2026: catálogo integrado y relojes comprobados en OBS.
Revisión anterior conservada en `historial/ESTADO-EDITOR-0.2.0.md`.

## Producto implementado

El editor local conserva proyectos con guardado automático, duplicación,
respaldo/importación JSON, plantillas reutilizables, formulario del episodio,
brief TXT etiquetado, generación por persona y exportador general con cola.
El servidor local y el paquete portátil incluyen control de relojes para OBS.
No hay cuentas, nube ni interpretación del brief mediante IA.

La biblioteca ahora contiene **35 recursos**: 15 FRATV, tres coproducciones
existentes y 17 propios de Fraternidad. El filtro de identidad y el exportador
permiten trabajar por catálogo. Los 18 HTML originales, sus logos, manifiesto
y referencias aprobadas permanecen intactos.

## Fraternidad

El usuario aprobó expresamente mosca, nombre/cargo e inicio en horizontal y
vertical, y autorizó extender el catálogo e integrar sus temporizadores.
Se capturaron seis referencias desde los pilotos originales del commit b50160e
antes de adaptar el runtime, en `laminas/referencia-fraternidad-*`.

`fraternidad/manifest.json` declara 17 recursos. Sus HTML comparten estilos,
tokens y runtime; respetan los formatos 16:9 y 9:16 y los logos originales.
Las catorce extensiones siguen la dirección aprobada, sin registrarse como
aprobaciones individuales. La presentación histórica de los pilotos sigue en
`/pilotos-fraternidad/`; el catálogo de producción vive en el editor.

Manrope + IBM Plex Mono conserva el diseño aprobado. Instrument Sans e Inter
son alternativas explícitas, disponibles en Estilo y conservadas en proyectos,
respaldo, exportación y fuentes vivas. La paleta Fraternidad permanece fija.
El runtime espera las fuentes antes de ajustar los textos largos.

Dos plantillas exclusivas generan las piezas desde el episodio. Al regenerar,
los relojes de piezas equivalentes mantienen su configuración y se eliminan
claves huérfanas, evitando llenar el almacenamiento con episodios anteriores.

## Exportación y operación en vivo

PNG, MOV ProRes 4444 con alfa cuando corresponde, MP4 H.264 y paquete HTML OBS.
El exportador ofrece pieza, programa o biblioteca de la identidad elegida.
La vista previa y el exportador utilizan el mismo runtime y cuadro determinista.

Inicio, cuenta regresiva, tiempo transcurrido y pausa Fraternidad usan el servicio
compartido. Fuente y dock permiten iniciar, pausar, continuar, reiniciar,
mostrar/ocultar y fijar una hora objetivo. Horizontal y vertical comparten canal;
recargar la fuente conserva el estado. El redondeo usa techo para cuenta regresiva
y piso para tiempo transcurrido en fuente, panel del editor y dock.

Los relojes se entregan como fuente viva y PNG de referencia; los pedidos de video
se informan como omitidos para esa pieza. No se presenta un video como reloj
controlable. La animación decorativa es independiente de la pausa del reloj.
El paquete descargado contiene assets locales, proyecto y servidor Node portátil.

## Instalación y comprobación en OBS

- Restaurados siete medios copiando `pack/png/flag_16x9.png` y los videos
  `pack/video/*_16x9_60fps*` a sus nombres anteriores sin sufijo de formato.
  Los videos se verificaron con ffprobe a 1920 × 1080, 60 fps y alfa cuando
  corresponde. La colección nueva
  **FRATV MAESTRA + FRATERNIDAD** conserva diez escenas y agrega cuatro.
  Las trece colecciones originales conservan sus bytes respecto del respaldo.
  La copia mantiene las 27 fuentes, ajustes, atajos y transiciones; OBS 33 agregó
  atajos de monitoreo vacíos.
- El dock **Fraternidad · Relojes**, `/live-control?grupo=fraternidad`, reúne
  Inicio, Cuenta regresiva, En vivo y Pausa en canales independientes, conserva
  selección/estado y muestra los controles sin desplazar un dock de 400 × 550.
  El control individual sigue disponible. `ABRIR-EDITOR-Y-OBS.command` abre el entorno.
- OBS 32.1.2 reprodujo el cierre en la liberación de elementos de accesibilidad
  de Qt. OBS 33.0.1 oficial, con Qt 6.11.1 y SHA/firma verificados, completó dos
  ciclos de cierre/apertura sin nuevos informes de crash. StreamDeck 5.5.4.2 y
  DistroAV 6.2.1 cargaron. App anterior y configuración respaldadas en
  `editor/.local/obs-backups/20261031-174357/`, fuera de git.
- Las cuatro fuentes pasaron `GetSourceScreenshot`, inicio, pausa, reinicio y
  mostrar/ocultar en OBS. Evidencia: `obs-fraternidad/comprobacion-obs.json` y
  capturas en visualizaciones de Codex, fuera del repositorio. La conexión
  autenticada a OBS ya estaba habilitada; se usó localmente sin versionar secretos.
- Los nuevos handoffs de Overlay Studio y Social Command fueron revisados;
  sus fases de desarrollo esperan confirmación y no se iniciaron aquí.

## Verificaciones

- Contrato original: diez casos de lint, 18 recursos y cuatro formatos correctos.
- Regresión original: 17 piezas deterministas en cada formato coinciden con las
  referencias; countdown sigue excluido por su reloj real.
- Los seis renders aprobados Fraternidad coinciden con la referencia; el
  comparador rechaza una alteración intencional de 20 % en la mosca.
- 34 composiciones del catálogo verificadas: carga, repetición del cuadro,
  límites estáticos y logos; contacto visual revisado.
- Tres fuentes reales y nombres largos en ambos formatos. Casos extremos de
  título y agenda en las tres tipografías, además de HTML directo sin build.
- Stinger Fraternidad: cobertura total de 250 a 550 ms, corte a 400 ms y salida
  transparente. Las placas con salida terminan con cuadros transparentes.
- Modelo y proyectos: 23 pruebas aprobadas; conservación de los contratos anteriores, generación
  Fraternidad, respaldo y relojes al regenerar 40 episodios.
- Navegador original: 17 comprobaciones del editor y nueve de proyectos pasan.
- Producción original: ZIP descargado y extraído con PNG, MOV con alfa, MP4 y
  proyecto; dos fuentes sincronizadas, recarga, visibilidad y reinicio correctos.
- Siete bloques del editor Fraternidad: identidad, tipografías, exportador,
  generación, panel/fuente/dock, respaldo/importación y recarga. Filtro móvil
  visible y sin desborde.
- Cuatro pruebas de redondeo: 10,5 segundos pausados se muestran como 11 en
  cuenta regresiva y 10 en cronómetro, igual en fuente y dock.
- Servidor Fraternidad: siete pruebas de servidor y seis de producción; manifiesto combinado, cuatro relojes, persistencia,
  ZIP y servidor portátil verificados. Prueba real con archivos y fuentes
  tipográficas cargadas desde el paquete extraído.
- `npm run test:group-control`: cuatro fuentes reales, controles aislados,
  conservación de estados y selección, respuestas atrasadas descartadas y dock
  compacto. Las cuatro gráficas permanecieron dibujadas después de su duración;
  Inicio también a los 65 segundos y tras cambiar el foco, sin `seek` manual.
  La prueba usa puerto y almacenamiento temporales, sin tocar relojes del usuario.
- Se probó el comportamiento de carga inicial en segundo plano: Chrome puede
  suspender el RAF de `FRATV.ready`. El arnés activa cada fuente al prepararla y
  después verifica sus relojes en segundo plano, sin cambiar el runtime aprobado.

Comandos actuales: `../editor/README.md`. Las capturas y paquetes de prueba
quedan fuera de git. Solo las referencias expresamente aprobadas se versionan.

## Límites comprobados

- Guardado por navegador/origen local, sin sincronización remota.
- Brief TXT con etiquetas; sin interpretación libre ni PDF/Word.
- El ZIP contiene logos locales, pero no binarios de Google Fonts; las fuentes
  y logos externos requieren conexión. No se promete un paquete totalmente offline.
- Se observó una pantalla negra transitoria en OBS cuya causa exacta no se
  determinó. No se modificó el runtime por esa hipótesis: la permanencia en Chrome
  a 65 segundos y las capturas finales de las cuatro fuentes en OBS pasaron.
  La medición de GPU y una transmisión prolongada siguen pendientes.
- 1:1 y 4:5 no están habilitados para Fraternidad; los derivados FRATV siguen
  pendientes de revisión visual individual.
- Sin edición por capas, audio, efectos ni publicación remota.
