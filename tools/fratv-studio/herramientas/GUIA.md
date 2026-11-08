# FRATV · kit para el Mac de transmisión

Preparado el 31 de octubre de 2026 para **Mac Apple Silicon**. Lee primero esta
guía; nada instala OBS ni modifica sus escenas automáticamente.

## Qué recibes

FRATV **no es un plugin nativo de OBS**. Son recursos HTML, cuatro fuentes de
navegador, un dock de control y un servidor local. Usan `obs-browser`, incluido
en OBS. La integración funciona sin contraseña de WebSocket; esa conexión solo
se usa para verificaciones nativas automatizadas cuando el operador la autoriza.

Este kit incluye:

- `app/`: editor actual completo, fuentes, manifiestos, recursos aprobados,
  referencias visuales, pruebas y lockfiles. No contiene `node_modules`.
- Exactamente siete medios heredados en `app/pack/png/` y `app/pack/video/`.
- `plantillas/cuatro-relojes.json`: cuatro escenas de ensayo, opción inicial.
- `plantillas/maestra.json`: copia saneada de 14 escenas, opcional. Sus cámaras
  y audio deben seleccionarse en destino; no lleva dispositivos ni atajos del origen.
- `herramientas/`: diagnóstico, verificación, preparación, respaldo y prueba de traslado.
- `manifest.json` y `MANIFEST.sha256`: versiones, contenido y hashes.
- `evidencia-origen/`: cuatro PNG y el informe anterior con rutas relativas.
  Acreditan el Mac de origen, nunca el resultado del equipo de transmisión.
- `proyectos/Mi-programa.fratv.json`, si figura en el manifiesto: exportación exacta
  por la interfaz, schema `fratv-project` v1. Es «Mi programa», con **0 piezas**,
  el único proyecto observado en ese navegador. No se accedió a almacenamiento
  de otros navegadores ni se promete recuperar proyectos ajenos a esa exportación.
- `PROMPT-PARA-OTRO-AGENTE.md`: instrucciones para continuar la instalación supervisada.

No viajan perfiles de OBS, credenciales, configuración de plugins, copias de OBS,
logs privados, cachés, historial de exportaciones ni almacenamiento del navegador.
La plantilla maestra conserva estructura y transformaciones, pero vacía
identificadores de hardware, atajos y ajustes privados, y elimina consultas
personalizadas de los navegadores heredados. No es un respaldo íntegro de OBS.

## Estado probado en origen y límites

Origen: OBS 33.0.1 arm64, Qt 6.11.1, obs-browser 2.27.5 / CEF 150.0.7871.252.
Se probaron las cuatro fuentes dentro de OBS con capturas reales, iniciar,
pausar, reiniciar, mostrar y ocultar. El dock y sus cuatro canales también pasaron
pruebas de navegador, incluyendo conservación, aislamiento y permanencia de Inicio
a 65 segundos. OBS cerró y abrió normalmente dos veces después de actualizarlo.
Las trece colecciones originales del origen conservaron sus bytes.

El verificador incluido se ejecutó también en el Mac de origen el 31-10-2026:
las cuatro fuentes pasaron avance, pausa, reinicio, visibilidad, aislamiento y
capturas; las cifras fueron revisadas visualmente. Restauró estados lógicos,
escena de programa, vista previa y modo estudio. Este resultado acredita el
script en origen y no sustituye su ejecución ni la revisión manual en destino.

La instalación desde el kit en otra ruta pasó npm ci, build, 23 pruebas del editor,
7 del servidor, lint de los 18 recursos y regresión horizontal/vertical. El editor
no informó vulnerabilidades; las herramientas heredadas de exportación en
app/scripts conservan nueve avisos altos de npm audit en dependencias de Puppeteer.
Se mantiene el lockfile de origen para esta reproducción; revisar esos avisos antes
de ampliar el uso y no ejecutar npm audit fix --force durante una instalación
de transmisión sin volver a comprobar las exportaciones y referencias visuales.

Esto no acredita el hardware, plugins, GPU, audio ni una transmisión prolongada
del destino. Se observó una imagen negra transitoria durante el trabajo anterior;
su causa no se determinó y las verificaciones finales pasaron. No se cambió el
runtime por esa hipótesis. La aceptación nativa completada fue horizontal.

**Todavía requiere internet para Google Fonts y logos externos.** Los logos de
marca locales sí están incluidos. No se empaquetaron los binarios tipográficos:
no prometer funcionamiento totalmente offline. Tampoco se incluyen instaladores
ni runtimes de OBS, Node, Chrome, ffmpeg o Python. Este es un kit reproducible de
fuentes y material, con preparación manual supervisada.

Tamaño orientativo sin dependencias: código y referencias alrededor de 6,6 MiB,
siete medios 5,76 MiB, más esta documentación y herramientas. El manifiesto da
el tamaño exacto de cada archivo. No necesitas copiar cientos de MB de exportaciones.

## 1. Comprobar el Mac y preservar su configuración

1. Confirma `uname -m` y la versión con `sw_vers -productVersion`.
   Debe ser Apple Silicon/arm64. OBS 33.0.1 usado aquí requiere **macOS 13.0+**.
   Si la versión no alcanza, detente y resuelve compatibilidad; no fuerces la instalación.
2. Comprueba el OBS del destino antes de actualizarlo. Si necesita cambio,
   usa una distribución oficial arm64, verifica firma/hash y conserva la aplicación
   anterior. No copiar la app modificada ni la configuración del Mac de origen.
3. Cierra OBS normalmente. Con Node disponible, puedes respaldar la configuración
   **propia de ese Mac** ejecutando desde la raíz del kit:

```bash
node herramientas/respaldar.mjs
```

El respaldo queda fuera del kit, en `~/Documents/FRATV_RESPALDOS_PRIVADOS/`, con
permisos privados. Contiene credenciales del destino: no lo compartas ni lo
subas al repositorio. El script se niega a continuar si OBS está ejecutándose.
No modifica ni elimina su configuración.

### Distribución oficial de OBS usada como referencia

- [Publicación OBS 33.0.1 y checksums oficiales](https://github.com/obsproject/obs-studio/releases/tag/33.0.1).
- [DMG oficial para Apple Silicon](https://github.com/obsproject/obs-studio/releases/download/33.0.1/OBS-Studio-33.0.1-macOS-Apple.dmg).
- SHA-256 del DMG: `3d6b2eedeb56416602af635adaba32327fdf11ff9d2806a4ce7d5b608de73238`.
- TeamIdentifier de firma comprobado en origen: `2MMRE5MTB8`.

Descarga solo si la revisión de compatibilidad determina que hace falta.
Comprueba `shasum -a 256` sobre el DMG y la firma con `codesign` antes de
sustituir una instalación. Ni el DMG ni la aplicación OBS forman parte del kit.

## 2. Verificar archivos y dependencias

Descomprime en una carpeta fija, no en una ubicación temporal que vayas a borrar.
Si mueves la carpeta después de importar la maestra, tendrás que preparar/importar
otra copia con las rutas nuevas. Los nombres con espacios están admitidos.

Recomendado para esta entrega: **Node 24 LTS, arm64**. El mínimo técnico del
editor sigue siendo 22.18. En origen está verificado Node 24.15.0 en
`/usr/local/bin/node`, pero el comando `node` de una terminal anterior resolvía
23.4.0: comprueba `node --version` y `node -p process.arch` después de instalar
para no arrancar con una versión distinta. Ajusta PATH según la instalación real
del destino, no copiando aliases o enlaces del origen. Node 23 ya está fuera de
soporte; [Node publica sus versiones LTS](https://nodejs.org/en/about/previous-releases).
Instala o actualiza
herramientas solo después de revisar lo que falta; el kit no lo hace por ti.

Desde la raíz del kit:

```bash
./VERIFICAR.command
./DIAGNOSTICO.command
```

Diagnóstico solo lee versiones, archivos y servicios. Que 5178/8790 no respondan
antes de encender el estudio es normal. Revisa los campos de arquitectura y macOS,
no solo el código de salida. Si un puerto está ocupado por otra app, no la cierres
automáticamente: resuelve el conflicto antes de continuar.

Dependencias por uso:

| Uso | Necesario |
|---|---|
| Editor y dock de este kit | Node compatible + dependencias npm del proyecto |
| Cinco navegadores heredados de la maestra | Python 3, servidor local 8790 |
| Exportar PNG/MOV/MP4 | Chrome, ffmpeg/ffprobe, zip, Puppeteer Core |
| Regresión visual y prueba completa del dock | ImageMagick además de Chrome |
| Cuatro fuentes dentro de OBS | OBS con su Browser Source + servicio FRATV activo |

Instalación npm manual, desde la raíz del kit, usando sus lockfiles:

```bash
npm --prefix app/scripts ci
npm --prefix app/editor ci
npm --prefix app/editor run build
npm --prefix app/editor test
npm --prefix app/editor run test:server
npm --prefix app/scripts test
npm --prefix app/scripts run test:regresion
npm --prefix app/editor run test:group-control
npm --prefix app/editor run test:clock-rounding
```

`test:group-control` usa un puerto y estado temporales; no toca los relojes reales.
La regresión necesita las fuentes tipográficas disponibles. Si una prueba falla,
conserva su salida y resuelve el ambiente antes de continuar; no regeneres las
referencias aprobadas para ocultar diferencias. No copies `node_modules` del origen.

## 3. Preparar colecciones sin escribir en OBS

```bash
./PREPARAR-COLECCIONES.command
```

Esto verifica SHA, resuelve únicamente rutas permitidas de medios y escribe dos
JSON con nombres únicos en `colecciones-preparadas/<fecha-id>/`. No entra a la
carpeta de configuración de OBS y no sobrescribe colecciones existentes.

En OBS, usa **Colección de escenas → Importar** y elige primero
`cuatro-relojes.json`. Conserva la colección de producción del destino tal como está.
La maestra de 14 escenas es opcional: impórtala como otra colección solo si la
necesitas y después reasigna ATEM, VIDEO EXTRA y AUDIO 1/2. Los audios de la
plantilla están silenciados hasta revisar sus dispositivos. No copies perfiles
ni claves de emisión. Si quieres incorporar las cuatro escenas a una colección
existente, hazlo sobre una copia y comprueba sus diferencias antes de sustituir nada.

Los siete medios son `flag.png`, `ident-long_60fps_alfa.mov`,
`live-badge_60fps_alfa.mov`, `bumper-in_60fps.mp4`, `bumper-out_60fps.mp4`,
`end-credits_60fps.mp4` y `stinger_60fps_alfa.mov`. El preparador comprueba sus
rutas. El stinger conserva su punto de corte; no lo sustituyas por un video opaco.

## 4. Encender editor y dock

Abre `ABRIR-ESTUDIO.command`. El launcher comprueba dependencias y puertos,
reutiliza los servicios correctos o los inicia; no instala ni compila al arrancar.
Usa la compilación si está al día; si no, abre desarrollo. Mantén la terminal
abierta durante la operación. Control + C detiene solo procesos iniciados por ella.

- Editor y API: `http://127.0.0.1:5178/`
- Dock: `http://127.0.0.1:5178/live-control?grupo=fraternidad`
- Navegadores heredados: `http://127.0.0.1:8790/resources/...`

En OBS agrega el dock mediante **Docks → Docks de navegador personalizados**,
nombre **Fraternidad · Relojes**, URL anterior. No copies `user.ini` del origen.
El inspector muestra la configuración dentro de una sección plegable; los botones
operativos quedan visibles en un dock de 400 × 550.

| Escena | Recurso | Canal | Inicio |
|---|---|---|---|
| Inicio | `fraternidad-start` | `fraternidad-obs-inicio` | 05:00 regresiva |
| Cuenta regresiva | `fraternidad-countdown` | `fraternidad-obs-cuenta` | 05:00 regresiva |
| En vivo | `fraternidad-live` | `fraternidad-obs-envivo` | 00:00 transcurrido |
| Pausa | `fraternidad-break` | `fraternidad-obs-pausa` | 05:00 regresiva |

Las plantillas usan fuentes 1920 × 1080, 60 fps, sin apagarlas al quedar inactivas
ni reiniciarlas al activar. Los valores iniciales solo se aplican si el canal
no existe; abrir el dock no reinicia un estado existente. El seed de las fuentes
usa `liveMode` y `liveDurationMs`, distintos de los nombres de parámetros de la API.

Ejemplo completo:

```text
http://127.0.0.1:5178/live/fraternidad-start?channel=fraternidad-obs-inicio&aspecto=16%3A9&autoplay=1&tipo=aprobado&liveMode=countdown&liveDurationMs=300000
```

Para continuar «Mi programa», usa **Importar como copia** en el editor con su
`.fratv.json`. Se verificó y copió exactamente; no lleva piezas preparadas.
Los proyectos se guardan por navegador y origen. Una carpeta de código no contiene
por sí sola los proyectos del navegador. Exporta los que necesites antes de migrar.

## 5. Comprobación nativa reproducible

Con la colección de ensayo importada, el servidor FRATV encendido y el dock
agregado/guardado en OBS, ejecuta primero:

```bash
node herramientas/comprobar-obs.mjs . --comprobar
```

Es de solo lectura. Usa el servidor WebSocket local autenticado que ya tenga
OBS; no lo habilita, cambia su contraseña ni abre puertos. Lee la credencial
en memoria desde la configuración local y nunca la imprime ni la incluye en
informes. Rechaza el ensayo si hay emisión, grabación, cámara virtual o replay
activos. También verifica las cuatro fuentes y canales, sus escenas, el dock
y los relojes pausados en su punto de reinicio. Si alguno está a medio contar,
no lo reinicia por ti: no hay una operación de API para restaurar después un
valor arbitrario sin alterar su configuración. Revisa ese estado manualmente.

Después de revisar las condiciones, la ejecución funcional explícita es:

```bash
node herramientas/comprobar-obs.mjs . --ejecutar
```

Requiere ImageMagick. Mantén OBS sin salidas activas y no cambies colección,
escena de programa ni controles mientras corre. El script conserva la escena de
programa, usa la vista previa y restaura vista previa/modo estudio y el estado
lógico original de los cuatro relojes, incluida su visibilidad. En cada uno:

1. Captura una imagen real de la fuente desde OBS y comprueba que no esté vacía.
2. Inicia, espera, pausa y comprueba avance y estabilidad del valor pausado.
3. Captura el reloj pausado y exige cambio de imagen respecto del reinicio.
4. Oculta y comprueba transparencia; muestra y comprueba imagen nuevamente.
5. Reinicia y verifica que los otros tres canales sigan intactos.

Guarda las capturas, `estado-previo.json` y `comprobacion-obs.json` dentro de
`resultados-equipo-local/<fecha-id>/`, separado de `evidencia-origen/`. Las rutas
de imágenes del informe son relativas. Si aparece una salida activa o alguien
cambia colección/programa, se detiene; si restaurar pudiera afectar esa nueva
operación, informa recuperación manual en lugar de modificar una emisión.

Un resultado `automatedNativePass: true` acredita estas comprobaciones en el
computador de esa ejecución; **no equivale a estar listo para producción**.
`productionReady` permanece en `false`: revisa visualmente las cifras capturadas,
usa los botones del dock nativo, haz el ensayo prolongado y los dos reinicios.
El script verifica la API y el registro del dock, no simula clics de su interfaz.
No afirmar que pasó en destino por un build, un puerto abierto o las imágenes de origen.

## 6. Aceptación antes de transmitir


- Repite cada control en cada reloj: iniciar, esperar dos segundos, pausar,
  reiniciar, ocultar y mostrar. Los otros tres no deben cambiar.
- Compara la gráfica real de OBS con el dock, no solo una respuesta de API.
  Captura las cuatro fuentes y registra modos, valores y resultado.
- Cambia rápidamente de selector, recarga fuente/dock y alterna escenas/foco.
  Comprueba que la gráfica siga dibujada a los 65 segundos y sin reiniciar la cuenta.
- Cierra y abre OBS normalmente dos veces; revisa que no aparezcan nuevos crashes.
  Verifica la persistencia esperada tras reiniciar el servicio.
- Haz un ensayo local de 10–15 minutos, con FPS/frames perdidos/GPU observados,
  y revisa audio/hardware por separado. No inicies una transmisión automáticamente.
- En la colección de ensayo, comprueba la pérdida/recuperación del servidor:
  las fuentes se ocultan cuando pierden conexión, evitando un reloj desincronizado.
- Compara las colecciones del destino con su respaldo para confirmar que la
  incorporación no sustituyó escenas ni ajustes previos.
- Para vertical, prepara un perfil/lienzo separado 1080 × 1920 o usa el flujo
  vertical existente. No deformes la salida de producción al modificar su perfil.
  La configuración vertical requiere su propia aceptación nativa.

Si se usa WebSocket para capturas/verificación, utiliza solo la autorización local
existente del destino. Nunca escribas claves en scripts, terminal visible, informes,
JSON de escenas o documentación. La integración no necesita copiar ninguna
contraseña del origen ni abrir el servicio a la red.

## Recuperación

Selecciona la colección/perfil anterior del destino y detén solo los procesos
creados por el kit. Retira el dock o colección de ensayo si no los usarás.
Para volver de una actualización de OBS, restaura la aplicación y configuración
**del destino** tomadas antes del cambio, con OBS cerrado. El respaldo privado
no forma parte del ZIP y no se comparte. No borres el kit mientras alguna escena
lo referencie. No restaures la configuración de otro computador sobre la actual.

## Paquetes existentes y regeneración

El ZIP del exportador general (`runtime/portable.mjs`) permite emisión ligera en
8796 con Node, sin React ni herramientas de render. No trae el editor ni crea
colecciones automáticamente. Sus canales deben coincidir con el dock elegido:
fuentes 8796 y dock 5178 controlarían servicios distintos. Aún depende de fuentes
web y logos externos. `scripts/armar-pack-portatil.mjs` es el empaquetador antiguo
de FRATV; por sí solo no incorpora el catálogo y dock nuevos de Fraternidad.

Para regenerar este kit desde el repositorio original:

```bash
node scripts/transferencia-obs/generar.mjs
```

Su lista de origen usa archivos versionados permitidos, exactamente siete medios
y herramientas propias conocidas. Se sanea la colección de origen sin modificarla.
Cada salida es nueva bajo `editor/.local/transferencia-obs/`. Para incorporar la
exportación revisada del proyecto se pasan salida, colección y proyecto como
tres argumentos posicionales; otra
exportación necesita revisión explícita antes de ampliar la allowlist de hashes.
No se incluyen proyectos del navegador automáticamente.

La prueba `node herramientas/probar.mjs .` relocaliza una copia en otra carpeta
con espacios, comprueba hashes, prepara dos colecciones y sus siete rutas, altera
un medio para demostrar que el verificador lo rechaza y elimina la copia temporal.
No abre ni modifica OBS.
