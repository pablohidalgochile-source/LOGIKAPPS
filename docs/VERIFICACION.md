# Verificación de la beta 0.4.0

Comprobación local del 30 de septiembre de 2026 en un Mac Apple Silicon. Los resultados de LOGIKAPPS, los recursos FRATV y las herramientas del Pack DJ se distinguen a continuación.

## Suite principal de entrega: 108 comprobaciones

| Área | Cantidad | Alcance |
|---|---:|---|
| LOGIKAPPS nativo | 64 | Almacenamiento, validación, bibliotecas existentes, exportación, restauración con copia previa y conservación de datos ante errores. |
| Frontend de LOGIKAPPS | 33 | Formularios, búsqueda, favoritos, ideas, rutas, límites, importación, catálogos y navegación de packs. |
| FRATV | 11 | Textos, campos, temporizador, controles y referencias a archivos de las gráficas. |

Las 108 comprobaciones son la suma de estas tres suites. Las verificaciones del Pack DJ y la prueba gráfica descritas abajo se informan por separado.

## Interfaz nativa y datos personales

La prueba gráfica con WKWebView se ejecutó con una biblioteca temporal vacía. Comprobó:

- Primera apertura en **Packs de apps**, con Pack DJ y Pack Fraternidad.
- Entrada y regreso desde ambos packs, cada uno con **cinco herramientas**, y enlaces de descarga HTTPS.
- Navegación a Explorar y presencia de sus fichas con enlaces HTTP(S).
- Separación entre catálogos y Mis apps: consultar packs no agrega accesos ni cambia ideas personales.
- Crear y editar un acceso, marcar favorito, buscar, crear y vincular una idea, quitar el acceso conservando la idea y luego editarla y borrarla.
- Restauración del estado temporal al terminar.

Las pruebas de datos incluyen bibliotecas de versiones anteriores, vacías y con contenido. Conservan favoritos, notas e ideas vinculadas. Las importaciones y exportaciones personales no incluyen los catálogos de packs.

La captura de la entrega está en [packs.png](packs.png). La prueba gráfica local se informa por separado de GitHub Actions; no se presenta como una prueba de escritorio en los runners.

## Pack DJ: verificaciones independientes

| Herramienta | Comprobación local |
|---|---|
| **Surco** | Compilación Python y arranque aislado, biblioteca temporal, estado local, recursos de interfaz y controles de acceso local. |
| **TRACKHUNT** | 6 pruebas del modelo y conexiones con respuestas controladas; preparación limpia, compilación y arranque aislado. |
| **NANOOK VIDEO** | 9 pruebas locales de formatos, selección y opciones de mejora; arranque aislado con estado vacío y comprobación de interfaz y salud local. |
| **VJ/LAB** | 6 comprobaciones del pack: arranque, recursos y aislamiento del servidor local. |
| **Hit Lab** | 6 comprobaciones del pack: arranque, recursos y aislamiento del servidor local. |

Además se extrajo el ZIP del Pack DJ en una carpeta temporal y se probaron **VJ/LAB y Hit Lab en el navegador usando Python, sin Node.js para ejecutarlos**:

- En VJ/LAB se editaron texto y escena, se probó la pausa y se descargó un PNG validado de **1920 × 1080**.
- En Hit Lab el filtro Drums redujo las muestras de **8 a 2**. Se descargó y validó un WAV generado por la herramienta: **88.244 bytes, mono, 16 bits, 44,1 kHz y 1 segundo**.

Estas pruebas no equivalen a validar todas las funciones de cada herramienta. No se descargó música de plataformas ni se capturó audio de una pestaña en esta preparación. El WAV de Hit Lab es un sonido sintetizado localmente. No se probaron modelos de mejora con IA, cuotas ni todas las conexiones opcionales de proveedores.

## Pack Fraternidad y FRATV

Las cinco direcciones del Pack Fraternidad respondieron HTTP 200 sin iniciar sesión; POS redirigió a su página de ingreso. Se contrastaron los requisitos de cuenta y permisos con los accesos documentados. Se validaron la guía, el manifiesto y los cinco `.webloc`. **No se realizaron ventas, pagos, cambios de datos ni otras operaciones internas de ERP, WEB, FLYER, POS o CAST.**

En FRATV se verificaron también la guía y la cuenta regresiva en el navegador, incluido el avance del contador. No se realizó una transmisión en OBS.

## Paquetes e integración continua

Los ZIP se construyen a partir de listas explícitas de archivos, sin bibliotecas, historial ni credenciales personales. El empaquetador de packs verifica el contenido y genera archivos SHA-256. La comprobación del paquete de LOGIKAPPS revisa versión, macOS mínimo, arquitecturas arm64/x86_64 y catálogos estáticos separados de la biblioteca personal. La integridad final del DMG se comprueba con `hdiutil` y su suma SHA-256 antes de publicar.

[GitHub Actions](https://github.com/pablohidalgochile-source/LOGIKAPPS/actions/workflows/check.yml) ejecuta la suite principal y, por separado, las pruebas de NANOOK VIDEO, VJ/LAB y Hit Lab. TRACKHUNT se verificó localmente con sus dependencias preparadas; su instalación no forma parte de este workflow. Los artefactos incluyen el DMG, los packs, las descargas individuales y sus verificaciones.

## Límites

Estas pruebas no certifican todas las versiones de macOS ni las operaciones de herramientas que cada persona agregue. La prueba visual local se realizó en Apple Silicon; la matriz de CI también contempla un runner Intel. El lanzamiento de una herramienta depende de sus requisitos, instalación y permisos.

La app usa firma ad-hoc. El DMG no tiene firma Developer ID y la descarga no está notarizada por Apple. Verificar su integridad no equivale a superar Gatekeeper. Consulta [Instalación](INSTALACION.md).
