# Estado del editor local · 0.2.0

Fecha: 31 de octubre de 2026 (America/Santiago).
Fuente: autorización explícita en este chat para guardado, plantillas de programa,
formulario del episodio, importación/exportación general, revisión de Fraternidad
y recursos temporales controlables en vivo desde OBS.

Revisión anterior conservada en `historial/ESTADO-EDITOR-0.1.0.md`.

## Implementado

- Proyectos con guardado automático local, recuperación al recargar, creación,
  duplicación, eliminación confirmada y respaldo `.fratv.json` versionado.
- Plantillas de programa iniciales y selecciones reutilizables del catálogo.
- Formulario de episodio con conductor, invitados/cargos, programa, fecha, temas
  y auspiciadores. Genera una instancia por persona y otras piezas de la plantilla.
- Importador de proyectos validado, siempre como copia; brief TXT etiquetado con
  vista previa, advertencias y aplicación explícita. No es interpretación con IA.
- Exportador por pieza, programa o biblioteca; formatos compatibles por pieza;
  PNG, MOV ProRes 4444 con alfa cuando corresponde, MP4 opaco y paquete HTML OBS.
- Cola serial con progreso, cancelación, historial y descarga ZIP. El proyecto
  editable acompaña al paquete. Fuentes y assets locales incluidos para OBS.
- Relojes vivos para countdown, live-badge en variante reloj y bumper-in. Fuente
  y dock comparten canal: iniciar, pausar, reiniciar, hora objetivo y visibilidad.
  Pausar el reloj no congela la animación decorativa. Los formatos de una misma
  pieza comparten su canal.
- Configuración del reloj dentro del proyecto; estado en ejecución persistido
  por el servidor y conservado en el paquete portátil.
- Servidor portátil basado en Node para abrir las fuentes sin instalar el editor.

Código en `editor/`; servicio en `editor/server/`; salidas excluidas de git en
`editor/.local/`. Los 18 recursos, el manifiesto y las referencias aprobadas no
fueron modificados.

## Verificación

- Contrato original: diez casos del lint, 18 recursos y cuatro formatos, correctos.
- Regresión original 16:9 y 9:16: sin cambios en las 17 piezas deterministas;
  countdown sigue excluido por su reloj real.
- Pruebas de modelo: seis del adaptador y diez de proyectos/configuración de reloj.
- Pruebas de servidor: estado temporal, validación, HTTP compartido, persistencia,
  cola/cancelación y ZIP con configuración de canales.
- Navegador: 17 comprobaciones del editor original y nueve de proyectos/brief/
  respaldo-importación, sin errores JavaScript ni peticiones locales fallidas.
- Exportación real desde la interfaz: ZIP descargado y extraído; PNG, MOV ProRes
  con formato de píxel con alfa y MP4 H.264 comprobados con ffprobe.
- Dos páginas de navegador comparten reloj, pausa estable, recarga sin reinicio,
  reinicio explícito y visibilidad desde el panel.
- Paquete extraído: servidor independiente funciona sin dependencias del editor;
  fuente, cronómetro y cortinilla con reloj pausado comprobados en Chrome.
- Compilación y TypeScript correctos. Capturas de escritorio/móvil revisadas.

## Fraternidad

Inventario y propuesta en `CATALOGO-FRATERNIDAD-PROPUESTA.md`: dos logos PNG,
tres coproducciones existentes y referencias verificadas. Se propone catálogo
exclusivo con diez piezas prioritarias y seis secundarias; pilotos recomendados:
mosca, nombre/cargo e inicio con reloj. Tras la autorización del usuario, los tres
pilotos están construidos en 16:9 y 9:16 en `propuestas/fraternidad-v1/`, con
galería en `/pilotos-fraternidad/`. Son diseños para revisión, pendientes de
aprobación e integración al catálogo de producción. Su reloj es demostrativo.
Se mantienen intactos los recursos actuales y sus referencias aprobadas.

Verificación de pilotos: doce comprobaciones aprobadas en Chrome, incluyendo
las seis composiciones, áreas seguras, nombres largos, repetición del cuadro,
reloj y controles de galería en escritorio y móvil. Las dieciséis pruebas del
editor y su compilación pasan. La línea base original sigue coincidiendo con
las referencias 16:9 y 9:16; no se cambiaron recursos, logos ni manifiesto.

## Límites y pendientes

- Guardado por navegador/origen local, sin cuentas ni sincronización remota.
- Brief TXT con etiquetas; sin interpretación libre, PDF/Word ni servicio de IA.
- Logos externos enlazados: no se incrustan ni se descargan automáticamente.
- Los videos requieren tiempo de render. Los relojes se entregan como fuente
  viva más una instantánea de referencia; no como videos supuestamente controlables.
- Pruebas del control hechas con Chrome y servidor portátil, no dentro de OBS nativo.
  La prueba operacional con la escena real de OBS queda pendiente.
- Sin edición por capas, audio, efectos ni automatización de plataformas externas.
- 1:1 y 4:5 siguen pendientes de revisión visual pieza por pieza.
- Permanecen las vulnerabilidades previamente reportadas en dependencias de
  `scripts/`; no se actualizaron por inferencia en esta etapa.

No se publicó ni se configuró acceso remoto. La propuesta de Fraternidad requiere
aprobar los tres pilotos antes de extender e integrar el catálogo exclusivo.
