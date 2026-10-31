# Verificación de LOGIKAPPS 0.5.1 beta

Revisión del 24 de octubre de 2026 en Apple Silicon con macOS 14.8.3. La causa de la ventana completamente negra reportada en otro Mac no está confirmada; falta probar esta entrega allí.

| Comprobación de la corrección | Resultado |
|---|---|
| Interfaz y recursos JavaScript/FRATV | 45 pruebas aprobadas |
| Almacenamiento, rutas, recursos integrados y validación nativa | 81 pruebas aprobadas |
| Apertura WKWebView por archivos locales | Cuatro packs, 16 fichas, siete entradas en Explorar y biblioteca temporal restaurada |
| Apertura integrada con CSP y nonce | Mismo recorrido completo aprobado, sin scripts externos |
| Fallo simulado de lectura inicial | La recuperación automática carga la interfaz integrada y completa el recorrido |
| Recursos de interfaz ausentes | Panel nativo de recuperación y diagnóstico sin rutas personales |
| Instalador | Universal arm64/x86_64 para macOS 13+; firma ad-hoc y SHA-256 verificados |

Son **126 comprobaciones automatizadas**; los recorridos de WKWebView se ejecutan por separado con datos temporales. Los modos de prueba rechazan carpetas de datos personales. La copia personal instalada no se reemplaza durante la validación.

La recuperación usa APIs públicas de WebKit, normaliza las rutas del documento local y ofrece «Volver a abrir» y «Copiar diagnóstico». El diagnóstico contiene versión, sistema, arquitectura y códigos de carga; no incluye biblioteca, cuentas ni rutas personales. La interfaz espera hasta 12 segundos por intento antes de recuperar o informar el fallo.

La aplicación conserva firma ad-hoc y no está notarizada por Apple. La compilación Intel se verifica en CI; no se ha probado esta corrección en otro Mac físico. Los resultados de la matriz Apple Silicon e Intel están en [GitHub Actions](https://github.com/pablohidalgochile-source/LOGIKAPPS/actions/workflows/check.yml). El instalador está en la [Release v0.5.1-beta.1](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/tag/v0.5.1-beta.1).

Los packs no cambian en esta corrección y mantienen las descargas de v0.5.0-beta.1. Sus comprobaciones y límites se conservan a continuación como registro de la revisión anterior.

## Registro de packs 0.5.0


Revisión local del 21 de octubre de 2026 en Apple Silicon. No sustituye una prueba en el Mac del destinatario.

| Comprobación | Resultado |
|---|---|
| Interfaz y datos JavaScript | 34 pruebas aprobadas |
| Recursos FRATV | 11 pruebas aprobadas |
| Almacenamiento, rutas y validación nativa | 64 pruebas aprobadas |
| Primera apertura desde la app extraída del DMG | Correcta; cuatro packs y biblioteca personal vacía |
| Navegación nativa real (WKWebView) | DJ 6 fichas, Fraternidad 5, Diseño 2 e IA 3; Explorar 7 fichas; ArtCraft visible |
| Biblioteca temporal | Crear, editar, buscar, favorito, ideas y borrar; estado temporal restaurado |
| VJ/LAB y Hit Lab | 6 controles por herramienta: copia portable, arranque y aislamiento local |
| NANOOK VIDEO | 9 pruebas aprobadas |
| Cuatro archivos de packs | Integridad ZIP, SHA-256, nombres exactos de descargas, guías y permisos de lanzadores correctos |
| Taller Teatina y FrateIA extraídas de sus ZIP | Firma ad-hoc, arquitectura arm64, versión y requisitos comprobados |
| LOGIKAPPS y DMG | Universal arm64/x86_64; macOS 13+; firma ad-hoc válida; imagen y SHA-256 correctos |

Las 109 comprobaciones de la suite principal son las primeras tres filas. Los controles de packs, herramientas e interfaz nativa se informan por separado. [Captura real de primera apertura](packs.png).

Los packs nativos contienen únicamente archivos de aplicación revisados mediante manifiestos SHA-256. Se excluyeron metadatos Finder, proyectos, fotografías, conversaciones y archivos de configuración privados. FrateIA conserva sus funciones 0.3.1; la copia pública elimina símbolos de depuración que contenían rutas de compilación y renueva sus firmas locales. No se reconstruyeron ni certificaron sus funciones de IA o colaboración.

## Accesos comprobados sin iniciar sesión

El 21 de octubre de 2026, ERP, WEB, FLYER, POS y CAST respondieron HTTP 200; POS redirigió a `/login`. ArtCraft respondió 200. MAGIC MUSIC PROMPT devolvió 401: es un sitio privado y su guía solicita autorización. ChatGPT bloqueó la consulta automatizada con 403; se enlaza su página oficial y se contrastaron las instrucciones de Cloud con la documentación oficial de OpenAI. Estas comprobaciones no acreditan permisos ni operaciones internas.

## Límites

- Las aplicaciones nativas usan firma ad-hoc, sin notarización Apple. No se probó esta entrega en otro Mac físico. El ejecutable universal de LOGIKAPPS incluye Intel; Taller Teatina y FrateIA son solo Apple Silicon.
- FrateIA requiere macOS 14+. Su colaboración necesita invitaciones y una prueba entre dos Mac; no se habilitaron cuentas al publicar.
- MAGIC MUSIC PROMPT requiere acceso al sitio privado; Suno automático continúa pendiente.
- Taller Teatina requiere configuración propia para analizar fotografías. No se probaron llamadas de IA, importación real en LightBurn ni fabricación física en esta entrega.
- Las herramientas DJ conservan sus requisitos y límites: Hit Lab usa datos de demostración; VJ/LAB no incluye generación de logos con IA; NANOOK VIDEO no incluye el motor de mejora con IA. No se descargó música ni se hicieron operaciones en sistemas de negocio.
- Colchagua, la idea de restaurante y Nube familiar no se distribuyen en estos packs.

Los resultados de la matriz de compilación Apple Silicon e Intel se consultan en [GitHub Actions](https://github.com/pablohidalgochile-source/LOGIKAPPS/actions/workflows/check.yml). Las descargas públicas están en la [Release v0.5.0-beta.1](https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/tag/v0.5.0-beta.1).
