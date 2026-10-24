# Instalar LOGIKAPPS en tu Mac

LOGIKAPPS reúne tus aplicaciones, sitios y carpetas y guarda tus ideas en tu Mac. **Packs de apps** reúne herramientas por actividad y **Explorar** conserva las fichas individuales, ambos incluidos con la app. **Mis apps** es tu biblioteca personal: empieza vacía y cada persona agrega sus propios accesos. El catálogo público no contiene los datos ni las rutas privadas del creador.

## Requisitos

- Mac con Apple Silicon o procesador Intel.
- macOS 13 Ventura o posterior.
- Las herramientas que agregues deben estar instaladas o disponibles por separado.

## Descargar la beta

Descarga la **beta 0.5.1**, etiqueta [v0.5.1-beta.1](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/tag/v0.5.1-beta.1). El archivo se llama **LOGIKAPPS-0.5.1-macos-universal.dmg**.

1. Abre el DMG y arrastra LOGIKAPPS a Aplicaciones.
2. Abre LOGIKAPPS desde Aplicaciones.
3. En el Dock, abre el menú del icono y elige **Opciones → Mantener en el Dock**.
4. Con una biblioteca vacía se abre **Packs de apps**. Elige **Ver contenido** y sigue la guía del pack. Usa **Agregar app** para conectar tus propias herramientas a **Mis apps**.

Puedes copiarla a la carpeta Aplicaciones de tu usuario si prefieres instalarla solo para ti. No hace falta mantener dos copias.

**Esta beta tiene firma local ad-hoc y todavía no está notarizada por Apple.** Por eso macOS puede impedir su apertura al descargarla de Internet. La firma local comprueba integridad; no certifica la identidad del distribuidor.

Si confías en la procedencia de la descarga, consulta el procedimiento de Apple en [Abrir apps de forma segura en el Mac](https://support.apple.com/es-cl/102445). Apple describe la opción **Abrir igualmente** en Privacidad y seguridad cuando está disponible. No desactives las protecciones del sistema ni sigas instrucciones para borrar la cuarentena desde Terminal. Si el Mac está administrado por una organización, su política puede impedir la apertura.

Si prefieres revisar y compilar el código, sigue la alternativa siguiente. Una futura entrega con Developer ID y notarización reducirá esta fricción.

## Actualizar desde la beta anterior

Cierra LOGIKAPPS, reemplaza su copia en Aplicaciones por la nueva versión y ábrela de nuevo. Si instalaste la beta anterior y la veías vacía, **Packs de apps aparecerá al iniciar la versión 0.5.1**. No necesitas borrar datos ni reiniciar tu biblioteca: se conservan los accesos, ideas y favoritos que ya tengas.

Packs de apps y Explorar vienen dentro de la app. No descargan novedades en segundo plano: para recibir una nueva selección de contenido tendrás que instalar una versión posterior de LOGIKAPPS. Las bibliotecas existentes conservan sus accesos y pueden abrir los packs desde la barra lateral.

## Incorporar a tu compañero

Abre `PRIMEROS-PASOS-EQUIPO.html`, incluido en el DMG, o la guía del Pack IA y Equipo. Usa cuentas propias e invitaciones a los proyectos y repositorios concretos. Instalar LOGIKAPPS no concede acceso a los sistemas privados.

## Descargar y preparar un pack

Los ZIP se descargan por separado del DMG:

- **[Pack DJ](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-DJ-0.2.0-beta.zip):** descomprime y abre `EMPIEZA-AQUI.html`. Incluye Surco, TRACKHUNT, NANOOK VIDEO, VJ/LAB y Hit Lab con sus lanzadores y archivos. Python 3.10+ permite usar las herramientas Python; TRACKHUNT y NANOOK VIDEO requieren Node.js 22.13+. Hay requisitos adicionales por función, detallados en sus LEEME o LEER-PRIMERO. Prepara cada herramienta y conecta su archivo `Abrir … .command`, no el ZIP ni el preparador.
- **[Pack Fraternidad](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-Fraternidad-0.2.0-beta.zip):** descomprime y abre `GUIA.html` o sus accesos `.webloc`. Incluye ERP, WEB, FLYER, POS y CAST. Necesitas internet y una cuenta propia autorizada para cada servicio; solicita los permisos a su administrador.

**Descargar o conectar no instala las dependencias automáticamente.** El Pack DJ no contiene cinco `.app` autónomas y el Pack Fraternidad no contiene copias locales de los servicios. Conserva las carpetas completas de las herramientas locales, porque sus lanzadores necesitan los archivos que las acompañan. Si las mueves, edita su ubicación en Mis apps.

Consulta [Contenido y requisitos](CONTENIDO.md). LOGIKAPPS por sí sola no necesita Python ni Node.js.

## Compilar desde el código

Requiere las herramientas de línea de comandos de Xcode. Si no las tienes, ejecuta `xcode-select --install` y termina la instalación de Apple. Luego descarga o clona este repositorio, abre Terminal en su carpeta y ejecuta:

```bash
/bin/bash scripts/build-macos.sh
open .build/LOGIKAPPS.app
```

No requiere instalar Node ni dependencias JavaScript para compilar o usar la app. Node 24 se utiliza únicamente para ejecutar las pruebas de la interfaz.

La app resultante funciona en Apple Silicon e Intel. Puedes copiar `.build/LOGIKAPPS.app` a Aplicaciones. Para crear tu propio DMG:

```bash
/bin/bash scripts/create-dmg.sh
```

El instalador aparece en `dist/LOGIKAPPS-0.5.1-macos-universal.dmg`. La compilación local también usa firma ad-hoc salvo que configures una identidad Developer ID; crear un DMG no lo notariza automáticamente.

## Tus datos

Ideas, favoritos y herramientas personales se guardan localmente en `~/Library/Application Support/LOGIKAPPS/`. No se suben al repositorio de GitHub ni se incluyen al compilar un instalador. Los catálogos de Packs de apps y Explorar están separados de esos datos. Las webs que abras conservan sus propias políticas y conexiones.

Actualizar LOGIKAPPS conserva esa carpeta. Antes de cambiar de Mac o desinstalar definitivamente, cierra la app y guarda una copia de esa carpeta en un lugar privado. Eliminar la app de Aplicaciones no elimina automáticamente tus datos.

Agregar una herramienta registra un acceso: no instala su software ni concede sus licencias a otras personas. Una carpeta compartida o enlace puede requerir permisos adicionales.

Los nuevos packs **Diseño y Joyería** e **IA y Equipo** se descargan desde la app. Consulta [Contenido](CONTENIDO.md) para requisitos de Taller Teatina, FrateIA y accesos web.

## Si la ventana se queda negra o no termina de abrir

1. Descarga la actualización **0.5.1**, cierra LOGIKAPPS con ⌘Q y copia la app del nuevo DMG a **Aplicaciones**, reemplazando la copia anterior. Abre esa copia desde Aplicaciones; no borres la carpeta de datos.
2. El arranque muestra «Preparando LOGIKAPPS». Si la lectura inicial falla, intenta una carga alternativa. Si ambas fallan, aparece una pantalla nativa con botones de recuperación.
3. Pulsa **Volver a abrir**. También está disponible en el menú LOGIKAPPS → Volver a abrir la interfaz, o ⌘R.
4. Si persiste, pulsa **Copiar diagnóstico** o usa LOGIKAPPS → Copiar diagnóstico de apertura y comparte ese texto con soporte. Indica si instalaste en Aplicaciones y si toda la ventana sigue negra. El texto no incluye tu biblioteca, rutas ni cuentas.

La alternativa utiliza los mismos archivos incluidos en la app; no descarga ni ejecuta código remoto y no cambia las protecciones de macOS. La falta de notarización es independiente del fallo de carga: esta versión sigue usando firma ad-hoc.
