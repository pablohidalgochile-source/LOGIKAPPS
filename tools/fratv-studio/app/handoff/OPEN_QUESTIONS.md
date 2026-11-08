# Preguntas abiertas

Registra aquí toda duda que afecte a la marca o al alcance. No improvises sobre la
identidad: es más rápido preguntar que rehacer masters.

## Bloqueantes abiertos

- [ ] **Masters en color archivado.** `fratv-logo-horizontal-por-capas.svg` y
  `FRATV_V8_01_EQUILIBRADO_FIRMA_CORREGIDA.svg` usan el naranja `#FF6B3D` en `icon-tv` y
  `word-tv`. La paleta aprobada manda `#B72A3A`. Los catálogos ya están en rojo; los
  masters no. **Reemitir antes de implementar cualquier recurso.**
- [ ] **Faltan 13 de los 15 recursos** declarados en `manifest.json`. Solo llegaron
  `live-badge.html` y `lower-third.html`.
- [ ] **Falta el repositorio de la app.** No hay `package.json` ni `schemas/`, pese a que
  `README.md` documenta `npm run dev` y ambos JSON referencian `$schema`. Aclarar si el
  código es entrega del diseño o trabajo nuestro.
- [x] ~~**Fuente del wordmark.**~~ **RESUELTO: vectorizado.** Las letras FRA y TV pasaron
  de texto a trazos, extraídos de Arial Rounded MT Bold con opentype.js. El logo ya no
  depende de ninguna tipografía instalada. La bajada **no** se vectorizó a propósito: usa
  Poppins (Google Font) y es un campo editable del manifest. Master nuevo en
  `assets/masters/fratv-logo-horizontal-vectorizado.svg`; el original con texto se conserva
  como archivo de trabajo.

## Abiertas por la construcción de los recursos

- [ ] **`SPEC_GEOMETRIA.md` mezcla dos escalas.** Dice “todo en píxeles a 1920 × 1080”, pero
  de H03 a H12 las cifras son las de las **tarjetas del catálogo**, que miden 817 px de
  ancho para representar 1920. Medido en el navegador: título de cortinilla 31 px, título
  de programa 47 px y wordmark del ident 52 px coinciden exactamente con la tarjeta. H02 y
  H06, en cambio, sí están a 1920 porque se copiaron de los recursos ya escritos.
  Los 13 recursos nuevos se construyeron aplicando el factor **2,35** a las medidas de
  tarjeta. **Confirmar el criterio**, o entregar la tabla a 1920 real.
- [ ] **¿La F al 30 % mayor aplica también con contenedor?** El catálogo aprobado dibuja la
  versión con contenedor **sin** `scale(1.3)`, y solo la aplica en la versión sin
  contenedor. Los recursos siguen el catálogo. Si la aprobación de la proporción alcanza
  también al contenedor, hay que reemitir esa construcción.
- [ ] **Alto del ticker.** `SPEC_GEOMETRIA.md` dice “alto 16 % de la franja inferior”, que no
  queda definido. Se usó **96 px**, parametrizable con `?alto=`. Confirmar el valor.
- [ ] **Posición del sponsor.** No está en el spec. Se colocó en `right 5% / bottom 5%`, que
  se superpone con el ticker si ambos salen a la vez. Definir la posición, o la regla de
  convivencia entre los dos.
- [ ] **Relaciones 9:16, 1:1 y 4:5.** Los recursos son 1920 × 1080 fijos, igual que los dos
  canónicos. `manifest.json` declara los cuatro aspectos: falta definir si se resuelven en
  el recurso (media queries) o en la app al exportar.
- [ ] **`H12a` describe una sola animación de ident.** Con las cuatro entradas aprobadas,
  necesita las cuatro tablas de timing. Las cuatro están implementadas en `ident-long.html`
  con los tiempos deducidos del catálogo; confirmar.

## Pendientes del cliente

- [ ] **Ortografía definitiva** de la marca hermana: `LOGIKAPPS` o `LOGIKAAPS`. Bloquea los
  masters del ecosistema, no los de FRATV.
- [ ] **Familia de combate.** El sistema no contempla versus, rounds, campeonato ni
  resultado, y FRATV transmite eventos de combate. Definir si entra una familia
  `competencia` (marcador de combate, versus, resultado oficial, anuncio de campeonato) o
  si esas piezas quedan fuera del sistema nuevo.

## Abiertas desde el paso a multiformato

- [ ] **Cuánto debe pesar la gráfica en vertical.** El ancho de diseño de 9:16 quedó en
  **1000**, elegido comparando 1000 / 1200 / 1400 sobre el lower third, la mosca y el
  ticker (`laminas/COMPARACION-ESCALAS-VERTICAL.png`). Con 1000 la gráfica ocupa casi el
  doble de proporción que si se escalara a prorrata, que es lo que pide un teléfono.
  Es revisable cambiando un número en `resources/fratv-aspectos.css`. **Falta que el
  proyecto de identidad lo apruebe o lo corrija.**

- [ ] **Alto del ticker en vertical.** Pasó de 96 a 150 unidades de diseño y subió por
  encima del área que tapa Instagram. La velocidad se frenó 1,5× para mantener el tiempo
  de lectura. Los tres números son razonables pero no aprobados.

- [ ] **Posición del sponsor en vertical.** Quedó abajo a la derecha, dentro del área
  segura. No se recompuso; solo se reposicionó.

- [ ] **1:1 y 4:5 no están revisados pieza por pieza.** El sistema los soporta y los
  anchos de diseño están puestos (1150 y 1100), pero nadie miró las 18 piezas en esos
  formatos. Solo 16:9 y 9:16 están mirados.

- [ ] **La secundaria del lower third es chica en vertical.** La línea de rol
  («CONDUCTOR · FRATV») escala junto con el resto, y en un teléfono queda al límite de lo
  legible. Arreglarlo de verdad pide un tamaño propio para vertical, no solo escalar.
  Decidir si se hace.

- [ ] **Qué error exacto daban los `.mov`.** El cliente reportó que no los podía abrir ni
  compartir. Se atribuyó al códec qtrle y **esa explicación resultó falsa**: macOS lo
  decodifica bien. Falta saber con qué aplicación los abría y qué decía el mensaje. Lo que
  sí está confirmado es que ningún `.mov` con alfa se sube a WhatsApp ni a Instagram, y
  que para eso está el `.mp4`.

## Resueltas

- **Paleta final**: rojo `#B72A3A`, negro `#100B18`, marfil `#F5F1E8`. El azul rey y el naranja quedan como archivo.
- **Proporción de la F**: 30 % mayor. **Aprobada por el cliente.** V1–V5 pasan a masters
  nuevos; V6 queda como firma histórica e institucional; V8 pasa a archivo.
- **Logo ident**: el play no entra, no sale y no se desplaza.
- **Logo ident — variantes**: se adoptan **las cuatro** (1a, 1b, 1c, 1d). Todas terminan en
  la misma pose final, así que son cuatro entradas al mismo lockup, no cuatro identidades.
  Uso asignado: **1a** ident de programa (comparte barrido con el stinger) · **1b** ident de
  uso diario (por defecto) · **1c** ident con personaje · **1d** base del Logo Ident Short.
  Una transmisión usa una sola de las cuatro de principio a fin. Requiere campo `variant`
  en `ident-long` dentro de `manifest.json`.
- **Reglas de composición**: placa negra al 94 % para datos, bloque rojo pleno para estado.
- **Relaciones 1:1 y 4:5**: derivadas automáticamente del vertical, no rediseñadas pieza por pieza.
- **Cómo se resuelve el multiformato**: un solo archivo por recurso, recompuesto por CSS
  según `data-aspecto`. No hay versiones separadas por formato y no las va a haber.
- **Punto de corte del stinger**: **400 ms**, igual en los cuatro formatos. La geometría del
  barrido se rehizo para que la ventana de cobertura total pase de 75 ms a ~350 ms, y de
  paso se corrigió que el logo quedaba 300 px descentrado en 16:9.
- **Banco de audio**: se licencia, no se produce a medida. Fase 4.
