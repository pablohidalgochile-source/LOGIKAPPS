# Instalar LOGIKAPPS en tu Mac

LOGIKAPPS reúne tus aplicaciones, sitios y carpetas y guarda tus ideas en tu Mac. **Explorar** muestra un catálogo público incluido con la app. **Mis apps** es tu biblioteca personal: empieza vacía y cada persona agrega sus propios accesos. El catálogo público no contiene los datos ni las rutas privadas del creador.

## Requisitos

- Mac con Apple Silicon o procesador Intel.
- macOS 13 Ventura o posterior.
- Las herramientas que agregues deben estar instaladas o disponibles por separado.

## Descargar la beta

Comprueba en [Releases](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases) si está publicada la **beta 0.3.0**, etiqueta `v0.3.0-beta.1`. El archivo de esta versión se llama **LOGIKAPPS-0.3.0-macos-universal.dmg**. Si esa entrega todavía no aparece, puedes compilar el código siguiendo la alternativa de abajo; esta guía no confirma por sí sola que la descarga esté publicada.

1. Abre el DMG y arrastra LOGIKAPPS a Aplicaciones.
2. Abre LOGIKAPPS desde Aplicaciones.
3. En el Dock, abre el menú del icono y elige **Opciones → Mantener en el Dock**.
4. Entra en **Explorar** para ver el contenido incluido. Usa **Agregar app** para conectar tus propias herramientas a **Mis apps**.

Puedes copiarla a la carpeta Aplicaciones de tu usuario si prefieres instalarla solo para ti. No hace falta mantener dos copias.

**Esta beta tiene firma local ad-hoc y todavía no está notarizada por Apple.** Por eso macOS puede impedir su apertura al descargarla de Internet. La firma local comprueba integridad; no certifica la identidad del distribuidor.

Si confías en la procedencia de la descarga, consulta el procedimiento de Apple en [Abrir apps de forma segura en el Mac](https://support.apple.com/es-cl/102445). Apple describe la opción **Abrir igualmente** en Privacidad y seguridad cuando está disponible. No desactives las protecciones del sistema ni sigas instrucciones para borrar la cuarentena desde Terminal. Si el Mac está administrado por una organización, su política puede impedir la apertura.

Si prefieres revisar y compilar el código, sigue la alternativa siguiente. Una futura entrega con Developer ID y notarización reducirá esta fricción.

## Actualizar desde la beta anterior

Cierra LOGIKAPPS, reemplaza su copia en Aplicaciones por la nueva versión y ábrela de nuevo. Si instalaste la beta anterior y la veías vacía, **Explorar aparecerá al iniciar la versión 0.3.0**. No necesitas borrar datos ni reiniciar tu biblioteca: se conservan los accesos, ideas y favoritos que ya tengas.

El catálogo de Explorar viene dentro de la app. No se sincroniza ni descarga novedades en segundo plano: para recibir una nueva selección de contenido tendrás que instalar una versión posterior de LOGIKAPPS. Tener una ficha en Explorar no significa que otra aplicación esté instalada; consulta la disponibilidad y la acción que indique cada herramienta.

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

El instalador aparece en `dist/LOGIKAPPS-0.3.0-macos-universal.dmg`. La compilación local también usa firma ad-hoc salvo que configures una identidad Developer ID; crear un DMG no lo notariza automáticamente.

## Tus datos

Ideas, favoritos y herramientas personales se guardan localmente en `~/Library/Application Support/LOGIKAPPS/`. No se suben al repositorio de GitHub ni se incluyen al compilar un instalador. El catálogo público de Explorar está separado de esos datos. Las webs que abras conservan sus propias políticas y conexiones.

Actualizar LOGIKAPPS conserva esa carpeta. Antes de cambiar de Mac o desinstalar definitivamente, cierra la app y guarda una copia de esa carpeta en un lugar privado. Eliminar la app de Aplicaciones no elimina automáticamente tus datos.

Agregar una herramienta registra un acceso: no instala su software ni concede sus licencias a otras personas. Una carpeta compartida o enlace puede requerir permisos adicionales.
