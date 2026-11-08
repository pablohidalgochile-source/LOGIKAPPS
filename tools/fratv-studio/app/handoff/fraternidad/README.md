# Catálogo Fraternidad · 1.0.0

Catálogo propio de diecisiete recursos, integrado después de la aprobación de
mosca, nombre/cargo e inicio con cuenta regresiva el 31 de octubre de 2026.
La aprobación de esos tres pilotos define la dirección visual. Las otras catorce
piezas son extensiones de esa dirección; no se registran como aprobaciones
individuales ni reemplazan las referencias originales de FRATV.

## Identidad y formatos

Conserva sin cambios los PNG de `../assets/eventos/`, la paleta y composición de
los tres pilotos. Usa `../resources/fratv-aspectos.css` como única fuente de
escala y áreas seguras. Hay composiciones específicas para 16:9 y 9:16.
No se habilitan 1:1 y 4:5 en este catálogo.

La tipografía predeterminada es Manrope, con IBM Plex Mono para cifras. Las
opciones **Editorial** (Instrument Sans) y **Neutra** (Inter) son alternativas
explícitas, no cambios a la referencia aprobada. El runtime espera sus archivos
reales antes de medir el texto y resolver `FRATV.ready`. Los colores FRATV no
sustituyen automáticamente la identidad azul/dorada de estas piezas.

## Piezas

- Identidad: mosca, apertura, identidad breve y transición.
- Información: nombre/cargo, título de programa, agenda y banda de avisos.
- Emisión: inicio, cuenta regresiva independiente, en vivo/tiempo transcurrido,
  pausa/regreso y espera técnica.
- Participación y cierre: auspiciador, comentario/pregunta, cierre y créditos.

Los campos y límites se declaran en `manifest.json`; los textos iniciales son
muestras. Ninguna pieza incorpora por defecto nombres del episodio real ni
resultados de redes o plataformas externas.

## Contrato del runtime

Cada HTML se puede abrir directamente, sin compilar. Comparte `fraternidad.js`,
`fraternidad.css` y `tokens.css`; usa rutas relativas para funcionar también en
el paquete portátil. Google Fonts y logos remotos necesitan conexión.

`window.FRATV` expone `meta`, `aspecto`, `ready`, `seek(ms)`, `play()` y `pause()`.
El editor y el exportador esperan `ready` antes de aplicar el cuadro. `seek`
es determinista: no depende de la fecha, del tiempo de carga ni de un intervalo.

La cuenta de muestra permanece en 05:00, o 00:00 en el tiempo transcurrido.
El servicio vivo escribe los nodos `data-field="clock"` y respeta
`data-clock-format="short"`. La animación decorativa no escribe ni reinicia el
reloj. Los cuatro recursos temporales declaran `liveMode` en el manifiesto.
La recarga y persistencia del reloj son responsabilidad del servicio compartido.

Las entradas terminan en los primeros 1.600 ms y luego permanecen estables.
Nombre/cargo, título, agenda, auspiciador y comentario tienen salida de 400 ms,
que termina 200 ms antes de su duración declarada para dejar los últimos cuadros
transparentes. Mosca, relojes, apertura y pantallas completas conservan su pose.

- Banda: ciclo de 18 segundos calculado contra su ancho real de contenido.
- Créditos: ciclo de 22 segundos calculado contra la altura real de las filas.
- Transición: 800 ms; cubre todo el cuadro entre 250 y 550 ms; corte a 400 ms.
  Vuelve a transparencia completa a los 750 ms.

La cuenta no se hornea como un video presuntamente controlable. El exportador
entrega su fuente viva y la referencia gráfica según las salidas solicitadas.

## Comprobaciones del catálogo

Los tres pilotos de referencia se comparan en su pose de 1.600 ms con el reloj
estático en 05:00 y transparencia. Los demás recursos se inspeccionan en ambos
formatos. Para la transición se usa el cuadro de 400 ms; para banda y créditos,
el punto medio del ciclo muestra contenido desplazándose.

Se comprobó además una agenda de cinco títulos de 200 caracteres y un título de
55 caracteres anchos, con las tres tipografías en ambos formatos, sin exceder
las áreas seguras. Los textos se ajustan al espacio conservando su contenido.
Los relojes en OBS y los paquetes dependen de las pruebas del servicio y editor.
