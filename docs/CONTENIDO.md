# Packs y herramientas de LOGIKAPPS 0.4.0

**Packs de apps** reúne herramientas por actividad. **Explorar** conserva la selección individual y **Mis apps** contiene solo los accesos que cada persona agrega. Con una biblioteca vacía, la app abre Packs de apps; una biblioteca existente conserva sus accesos e ideas.

El DMG instala LOGIKAPPS. Los packs se descargan por separado y no instalan dependencias automáticamente. Para empezar, descomprime la carpeta completa y abre su guía.

## Pack DJ · cinco herramientas locales

[Descargar Pack DJ 0.1.0 beta](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.4.0-beta.1/LOGIKAPPS-Pack-DJ-0.1.0-beta.zip)

Abre **EMPIEZA-AQUI.html**. El pack contiene Surco, TRACKHUNT, NANOOK VIDEO, VJ/LAB y Hit Lab en carpetas independientes, con sus lanzadores. Conserva cada carpeta completa en una ubicación donde puedas guardar archivos.

| Herramienta | Requisitos para usarla | Preparación e instrucciones |
|---|---|---|
| **Surco** | Python 3.10+; yt-dlp para enlaces; FFmpeg para algunas conversiones; Chrome para capturar audio de pestaña | Sigue [LEEME](../tools/surco/LEEME.md) y prepara su entorno. Conecta `Abrir Surco.command`. |
| **TRACKHUNT** | Node.js 22.13+ con npm e internet; conexiones propias para algunas fuentes | Ejecuta `Preparar TRACKHUNT.command` y después conecta `Abrir TRACKHUNT.command`. Consulta [LEEME](../tools/trackhunt/LEEME.md). |
| **NANOOK VIDEO** | Node.js 22.13+, Python 3.10+, FFmpeg y ffprobe; internet para YouTube | Ejecuta `Preparar NANOOK VIDEO.command`, que prepara yt-dlp, y después conecta `Abrir NANOOK VIDEO.command`. Consulta [LEEME](../tools/nanook-video/LEEME.md). |
| **VJ/LAB** | Python 3.10+ y navegador actualizado; no requiere Node para usarlo | Conecta `Abrir VJ LAB.command`. Lee [LEER-PRIMERO](../tools/vj-lab/LEER-PRIMERO.txt). |
| **Hit Lab** | Python 3.10+ y navegador con Web Audio; no requiere Node para usarlo | Conecta `Abrir Hit Lab.command`. Lee [LEER-PRIMERO](../tools/hit-lab/LEER-PRIMERO.txt). |

Estos lanzadores abren herramientas locales en el navegador. Mantén su ventana de Terminal abierta mientras las uses y pulsa **Control+C** para detenerlas. En LOGIKAPPS selecciona **Conectar lanzador** y elige el archivo `Abrir … .command`, no el ZIP ni el preparador. Los requisitos se preparan solo cuando decides hacerlo; abrir LOGIKAPPS o consultar el catálogo no instala programas.

### Alcance de las herramientas DJ

- **Surco:** biblioteca musical, exploración de enlaces y captura de pestaña. No incluye música ni bibliotecas previas. Las plataformas pueden limitar la disponibilidad de archivos.
- **TRACKHUNT:** búsquedas, versiones y exportación de enlaces, incluido Sets → Deezer. No descarga música. El reconocimiento de audio utiliza AudD y envía un fragmento al proveedor; algunas conexiones requieren configuración propia y están sujetas a sus cuotas.
- **NANOOK VIDEO:** interfaz y servidor para descargar y convertir archivos, con motor yt-dlp preparado por cada persona. Real-ESRGAN y sus modelos de IA no están incluidos. No garantiza acceso a todos los videos o resoluciones.
- **VJ/LAB:** presets y composición visual, con exportación PNG estática. No incluye generación de logos con IA ni exportación de video o audio; los cambios duran la sesión.
- **Hit Lab:** sonidos sintetizados, estimación orientativa de tempo y un catálogo fijo de demostración. Radar y similitud no son datos musicales en vivo. Exporta tu selección antes de cerrar.

Los detalles y límites vigentes de esta entrega están en el LEEME o LEER-PRIMERO de cada carpeta. El pack no incluye cuentas, claves, historial ni archivos musicales del creador. No son cinco aplicaciones `.app` autónomas.

## Pack Fraternidad · cinco accesos oficiales

[Descargar Pack Fraternidad 0.1.0 beta](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.4.0-beta.1/LOGIKAPPS-Pack-Fraternidad-0.1.0-beta.zip)

Abre **GUIA.html** o uno de los cinco accesos `.webloc` incluidos. La guía explica cómo entrar a cada servicio y cómo guardar sus enlaces en Mis apps.

| Servicio | Acceso oficial | Qué necesitas |
|---|---|---|
| **FRATE ERP** | [erp.frate.cl](https://erp.frate.cl/) | Cuenta o perfil personal habilitado por la administración. |
| **FRATE WEB** | [Panel de administración](https://www.frate.cl/admin) | Cuenta propia con permisos para la web y ticketera. La guía también enlaza el [sitio público](https://www.frate.cl/). |
| **FRATE FLYER** | [flyer.frate.cl](https://flyer.frate.cl/) | Cuenta autorizada; algunas funciones dependen de integraciones del servicio. |
| **FRATE POS** | [pos.frate.cl](https://pos.frate.cl/) | Cuenta y permisos de operación; coordina caja y dispositivos con el responsable. |
| **FRATE CAST** | [Ingreso de casting](https://cast.frate.cl/auth) | Cuenta personal y rol autorizado para funciones internas. |

El pack contiene **enlaces y una guía**, no una copia local de ERP, WEB, FLYER, POS o CAST. Requiere internet; descargarlo no crea cuentas, concede permisos ni incluye credenciales o datos del negocio. Solicita al administrador el acceso que corresponda a tu función. La revisión comprobó las páginas iniciales sin iniciar sesión ni ejecutar operaciones internas.

## Descargas individuales en Explorar

### Surco

[Descargar Surco 0.1.0 beta por separado](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.4.0-beta.1/Surco-0.1.0-beta.zip)

Incluye la misma herramienta portable y su LEEME. Sigue los requisitos de Surco indicados arriba; no necesitas descargarla dos veces si ya tienes el Pack DJ.

### FRATV para OBS

[Descargar FRATV para OBS 0.1.0 beta](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.4.0-beta.1/FRATV-OBS-Pack-0.1.0-beta.zip)

Contiene 15 gráficas HTML con identidad FRATV: rótulos, avisos, cuenta regresiva, programación y créditos. Descomprime y abre `fratv/GUIA-OBS.html`; mantén juntas las carpetas `fratv` y `brand`. En LOGIKAPPS puedes seleccionar **Conectar carpeta**.

Requiere un navegador actualizado para previsualizar y OBS Studio por separado para transmitir. No incluye Overlay Studio. Las piezas son horizontales a 1920 × 1080; una escena vertical necesita ajustes. Consulta [LEER-PRIMERO](../tools/fratv-obs/LEER-PRIMERO.txt) para personalizar textos. Google Fonts requiere internet; sin conexión se usan fuentes del sistema. [Guía oficial de fuentes de navegador en OBS](https://obsproject.com/kb/browser-source).

### FRATE Web público

[Abrir el sitio de Fraternidad Campus Central](https://www.frate.cl/). Usa **Agregar a Mis apps** para conservar el acceso. Es un sitio para mayores de 18 años y algunas funciones requieren una cuenta propia. Este acceso público es distinto del panel de administración del Pack Fraternidad.

## Actualizar desde una beta anterior

Instala LOGIKAPPS 0.4.0 y vuelve a abrirlo. Si tu biblioteca está vacía, aparecerá **Packs de apps**. Si ya tienes accesos, favoritos e ideas, se conservarán; abre Packs de apps o Explorar desde la barra lateral. No hace falta borrar datos ni importar la biblioteca de otra persona.

Los catálogos están incluidos en cada versión. No consultan un servidor ni descargan herramientas en segundo plano. Una nueva versión de LOGIKAPPS puede actualizar las fichas; tus herramientas descargadas se mantienen en sus propias carpetas.
