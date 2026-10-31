/* Public catalogue: reviewed apps and access instructions; no personal state. */
window.LOGIKAPPS_PACKS = [
  {
    "id": "dj",
    "name": "Pack DJ",
    "category": "music",
    "icon": "disc",
    "version": "0.3.0-beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-DJ-0.3.0-beta.zip",
    "description": "Cinco herramientas locales para música, video y visuales, más el acceso privado a MAGIC MUSIC PROMPT con sus instrucciones.",
    "requirements": "Para Mac · Incluye las herramientas y sus lanzadores. Requiere Python y Node.js; las funciones de descarga y conversión necesitan componentes adicionales indicados en la guía.",
    "steps": [
      "Descarga y descomprime el pack completo. Guarda la carpeta en un lugar permanente de tu Mac.",
      "Abre EMPIEZA-AQUI.html y prepara los requisitos de las herramientas que quieras usar.",
      "Conecta el lanzador de cada herramienta a Mis apps con los botones de abajo. Cada una conserva sus datos en tu equipo."
    ],
    "tools": [
      {
        "id": "pack-dj-surco",
        "name": "Surco",
        "description": "Biblioteca musical, enlaces y captura de audio. Incluida en la carpeta Surco del pack.",
        "category": "music",
        "icon": "disc",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-DJ-0.3.0-beta.zip",
        "requirements": "Python 3.10+; yt-dlp para enlaces; FFmpeg y Chrome para algunas funciones. Sigue LEEME antes de lanzar."
      },
      {
        "id": "pack-dj-trackhunt",
        "name": "TRACKHUNT",
        "description": "Búsquedas, Playlist Hunt, preparación de playlists, calidad y conexiones. Actualizado desde el desarrollo revisado el 31-10-2026.",
        "category": "music",
        "icon": "waves",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-DJ-0.3.0-beta.zip",
        "requirements": "Node.js 22.13+ y preparación inicial. Playlist Hunt y otras integraciones necesitan credenciales propias. Sin claves ni conexiones de otra persona.",
        "version": "0.2.0 beta portable"
      },
      {
        "id": "pack-dj-nanook-video",
        "name": "INGESTA",
        "description": "Descarga, lotes y conversión MP4 desde enlaces públicos. El nombre anterior era NANOOK VIDEO.",
        "category": "music",
        "icon": "play",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-DJ-0.3.0-beta.zip",
        "requirements": "Node.js 22.13+, Python 3, FFmpeg/ffprobe. Sigue LEEME; el motor IA y sus modelos son opcionales y no se incluyen.",
        "version": "3.0.4",
        "logoPending": true
      },
      {
        "id": "pack-dj-vj-lab",
        "name": "VJ/LAB",
        "description": "Visuales de escenario y composición gráfica. Incluida en la carpeta VJ-LAB del pack.",
        "category": "music",
        "icon": "sparkles",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-DJ-0.3.0-beta.zip",
        "requirements": "Python 3.10+ para el lanzador local y navegador actualizado. La generación de logos con IA no está incluida."
      },
      {
        "id": "pack-dj-hit-lab",
        "name": "DJ Nanook Hit Lab",
        "description": "Crates, muestras sintetizadas y herramientas de preparación musical. Incluida en la carpeta Hit-Lab del pack.",
        "category": "music",
        "icon": "music",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-DJ-0.3.0-beta.zip",
        "requirements": "Python 3.10+ y navegador actualizado. El radar y la similitud usan un catálogo de demostración; no son datos musicales en vivo."
      },
      {
        "id": "pack-dj-magic",
        "name": "MAGIC MUSIC PROMPT",
        "description": "Songs, Speech, Sounds y Albums: prepara textos, prompts y organiza audio importado. Acceso privado; integración automática de Suno pendiente.",
        "category": "music",
        "icon": "music",
        "kind": "web",
        "url": "https://nanook-suno-bridge.nanook.chatgpt.site/",
        "requirements": "Internet y acceso autorizado por el responsable del sitio. Si aparece 401 o acceso denegado, solicita habilitación. Descargar LOGIKAPPS no abre el sitio privado ni activa Suno."
      }
    ]
  },
  {
    "id": "fraternidad",
    "name": "Pack Fraternidad",
    "category": "business",
    "icon": "frate",
    "version": "0.3.0-beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Fraternidad-0.3.0-beta.zip",
    "description": "Accesos del equipo y FRATE FLYER STUDIO local, con instrucciones para cada herramienta.",
    "requirements": "Mac y navegador; Python 3 para Studio. Las webs requieren cuentas autorizadas. Studio se entrega como prototipo sin cuentas configuradas.",
    "steps": [
      "Descarga y descomprime el pack. Abre GUIA.html para consultar el uso y acceso de cada sistema.",
      "Solicita al administrador tu cuenta y los permisos que correspondan a tu función.",
      "Agrega las webs a Mis apps. Para FRATE FLYER STUDIO, abre su lanzador local con Python 3 y conéctalo desde la ficha."
    ],
    "tools": [
      {
        "id": "pack-fraternidad-erp",
        "name": "FRATE ERP",
        "description": "Administración y operación de Fraternidad.",
        "category": "business",
        "icon": "frate",
        "kind": "web",
        "url": "https://erp.frate.cl/",
        "requirements": "Internet y cuenta autorizada. Utiliza información del sistema en línea; no es una copia sin conexión."
      },
      {
        "id": "pack-fraternidad-web",
        "name": "FRATE Web · Administración",
        "description": "Administración de la web y ticketera. La guía también incluye el sitio público.",
        "category": "business",
        "icon": "frate",
        "kind": "web",
        "url": "https://www.frate.cl/admin",
        "requirements": "Cuenta con permisos de administración. El sitio público está en www.frate.cl."
      },
      {
        "id": "pack-fraternidad-flyer",
        "name": "FRATE FLYER EXPRESS",
        "description": "Acceso a Flyer Express para preparar las piezas del equipo.",
        "category": "business",
        "icon": "frate",
        "kind": "web",
        "url": "https://flyer.frate.cl/",
        "requirements": "Internet y acceso autorizado. Las funciones de generación dependen de la configuración del servicio."
      },
      {
        "id": "pack-fraternidad-pos",
        "name": "FRATE POS",
        "description": "Acceso al punto de venta de Fraternidad.",
        "category": "business",
        "icon": "frate",
        "kind": "web",
        "url": "https://pos.frate.cl/",
        "requirements": "Cuenta y permisos de caja asignados. No incluye credenciales ni habilita transacciones por sí solo."
      },
      {
        "id": "pack-fraternidad-cast",
        "name": "FRATE Cast",
        "description": "Acceso a la plataforma de casting.",
        "category": "business",
        "icon": "frate",
        "kind": "web",
        "url": "https://cast.frate.cl/auth",
        "requirements": "Internet. Las funciones de gestión requieren una cuenta y el rol correspondiente."
      },
      {
        "id": "pack-fraternidad-studio",
        "name": "FRATE FLYER STUDIO",
        "category": "creative",
        "icon": "frate",
        "version": "0.1.0",
        "stage": "prototype",
        "description": "Editor y plantillas de flyers; proyecto distinto de Flyer Express.",
        "requirements": "Python 3; editor local sin bandeja Express configurada. Exportación automatizada y servicios necesitan preparación propia.",
        "kind": "download",
        "connectKind": "command",
        "logoPending": false,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Fraternidad-0.3.0-beta.zip"
      }
    ]
  },
  {
    "id": "design",
    "name": "Pack Diseño y Joyería",
    "category": "creative",
    "icon": "diamond",
    "version": "0.2.0-beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Diseno-0.2.0-beta.zip",
    "description": "Elephant, Taller Teatina, Mi Talla y FRATV para OBS: imagen, video, joyería y recursos gráficos.",
    "requirements": "Elephant: Apple Silicon/macOS 14+ y dependencias propias. Teatina: Apple Silicon/macOS 13+. Mi Talla: Python 3. FRATV: navegador y OBS por separado.",
    "steps": [
      "Descarga el pack y abre GUIA.html.",
      "Descomprime Elephant o Taller Teatina y copia la app a Aplicaciones. Prepara sus requisitos; Mi Talla se abre con su lanzador y FRATV tiene su guía para OBS.",
      "Usa Conectar app para Elephant y Teatina, Conectar lanzador para Mi Talla o Conectar carpeta para FRATV."
    ],
    "tools": [
      {
        "id": "pack-design-teatina",
        "name": "Taller Teatina",
        "description": "Estudio de joyería: contornos 2D, medidas, componentes 3D y exportaciones SVG, OBJ, STL y 3MF.",
        "category": "creative",
        "icon": "diamond",
        "kind": "download",
        "connectKind": "app",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Diseno-0.2.0-beta.zip",
        "requirements": "Apple Silicon · macOS 13+ · Versión 0.4.0 sin notarización. Edición local; analizar fotos requiere configuración propia de OpenAI. Validar medidas antes de fabricar.",
        "version": "0.4.0",
        "stage": "beta",
        "logoPending": true
      },
      {
        "id": "pack-design-fratv",
        "name": "FRATV para OBS",
        "description": "15 gráficas HTML: rótulos, identidad de canal, cuenta regresiva, programación y créditos. Descarga el pack y previsualízalo en tu navegador.",
        "category": "creative",
        "icon": "film",
        "kind": "download",
        "connectKind": "folder",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Diseno-0.2.0-beta.zip",
        "requirements": "Mac, Windows o Linux · Navegador actualizado · OBS Studio por separado para transmitir. Pack horizontal 1920 × 1080; no incluye el editor Studio."
      },
      {
        "id": "pack-design-elephant",
        "name": "Elephant",
        "category": "creative",
        "icon": "elephant",
        "version": "0.2.0",
        "stage": "beta",
        "description": "Ampliación local de fotos y video, modo Fiel e IA, muestras y cola de trabajo.",
        "requirements": "Apple Silicon, macOS 14+, Python 3, ImageMagick y FFmpeg/ffprobe. IA opcional; modelos no incluidos.",
        "kind": "download",
        "connectKind": "app",
        "logoPending": false,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Diseno-0.2.0-beta.zip"
      },
      {
        "id": "pack-design-mi-talla",
        "name": "Mi Talla",
        "category": "creative",
        "icon": "diamond",
        "version": "0.1.0",
        "stage": "beta",
        "description": "Medidas de anillos, tablas y calibración visual.",
        "requirements": "Python 3 y navegador actualizado. Validación física pendiente.",
        "kind": "download",
        "connectKind": "command",
        "logoPending": true,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Diseno-0.2.0-beta.zip"
      }
    ]
  },
  {
    "id": "ia",
    "name": "Pack IA y Equipo",
    "category": "personal",
    "icon": "sparkles",
    "version": "0.2.0-beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-IA-Equipo-0.2.0-beta.zip",
    "description": "FrateIA para preparar el Mac y una guía para colaborar con ChatGPT, GitHub y las herramientas del equipo.",
    "requirements": "FrateIA: Apple Silicon, macOS 14+, versión de prueba. ChatGPT y ArtCraft son accesos web. Las invitaciones y permisos se gestionan por separado.",
    "steps": [
      "Descarga el pack y abre GUIA.html para preparar el Mac y tus cuentas.",
      "Instala FrateIA desde el ZIP incluido. Puedes explorar primero; los modelos se preparan en cada Mac.",
      "Solicita las invitaciones de ChatGPT, GitHub y FrateIA que correspondan. No se transfieren carpetas ni conversaciones locales automáticamente."
    ],
    "tools": [
      {
        "id": "pack-ia-frateia",
        "name": "FrateIA · Prueba",
        "description": "Prepara tu estación de IA, reúne herramientas y trabaja con proyectos locales. Versión 0.3.1 de prueba.",
        "category": "personal",
        "icon": "sparkles",
        "kind": "download",
        "connectKind": "app",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-IA-Equipo-0.2.0-beta.zip",
        "requirements": "Apple Silicon · macOS 14+ · Sin notarización. Modelos y herramientas se descargan aparte. Equipo necesita invitación; todavía no se verificó colaboración entre dos Mac.",
        "version": "0.3.1 de prueba",
        "stage": "beta"
      },
      {
        "id": "pack-ia-chatgpt",
        "name": "ChatGPT y Codex Cloud",
        "description": "Acceso a ChatGPT y al trabajo en la nube. La guía explica cómo recibir acceso a proyectos y repositorios.",
        "category": "personal",
        "icon": "globe",
        "kind": "web",
        "url": "https://chatgpt.com/",
        "requirements": "Cuenta propia de ChatGPT y acceso a cada proyecto. Para código, GitHub propio con permisos. La disponibilidad de Cloud depende de tu cuenta y entorno."
      },
      {
        "id": "pack-ia-artcraft",
        "name": "ArtCraft",
        "description": "Página oficial de apps creativas y descargas de otros desarrolladores.",
        "category": "creative",
        "icon": "sparkles",
        "kind": "web",
        "url": "https://getartcraft.com/apps",
        "requirements": "Herramientas externas en alfa o desarrollo; consulta la disponibilidad y requisitos de cada descarga."
      }
    ]
  },
  {
    "id": "organization",
    "name": "Pack Organización",
    "category": "personal",
    "icon": "house",
    "description": "Orgalina y Jacinta M. Pastelería: herramientas locales de organización, caja y pedidos.",
    "requirements": "Orgalina: Node.js 22.13+ y preparación. Jacinta: Python 3 y navegador. Cada persona empieza con sus propios datos.",
    "steps": [
      "Descarga y descomprime el pack en una carpeta permanente.",
      "Abre GUIA.html y prepara los requisitos de cada herramienta.",
      "Conecta su lanzador a Mis apps y conserva tus copias de datos."
    ],
    "tools": [
      {
        "id": "pack-organization-orgalina",
        "name": "Orgalina",
        "category": "personal",
        "icon": "house",
        "version": "0.2.0",
        "stage": "prototype",
        "description": "Presupuesto doméstico, servicios y lectura de texto de boletas PDF.",
        "requirements": "Node.js 22.13 o posterior y npm.",
        "kind": "download",
        "connectKind": "command",
        "logoPending": false,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Organizacion-0.1.0-beta.zip"
      },
      {
        "id": "pack-organization-jacinta",
        "name": "Jacinta M. Pastelería",
        "category": "business",
        "icon": "briefcase",
        "version": "local · sin número",
        "stage": "beta",
        "description": "Caja del día, pedidos de tortas y carta.",
        "requirements": "Python 3 y navegador actualizado.",
        "kind": "download",
        "connectKind": "command",
        "logoPending": false,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Organizacion-0.1.0-beta.zip"
      }
    ],
    "version": "0.1.0-beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Organizacion-0.1.0-beta.zip"
  },
  {
    "id": "lab",
    "name": "Pack Laboratorio",
    "category": "creative",
    "icon": "terminal",
    "description": "Prototipos y proyectos en desarrollo, con su código, acceso local y pendientes visibles.",
    "requirements": "Python 3 o Node.js según herramienta. Los servicios externos se configuran por separado; no se presentan como productos terminados.",
    "steps": [
      "Descarga y abre GUIA.html.",
      "Revisa el estado y las instrucciones de cada proyecto antes de conectarlo.",
      "Prueba con datos propios de demostración y conserva una copia antes de continuar el desarrollo."
    ],
    "tools": [
      {
        "id": "pack-lab-club",
        "name": "CLUB SANTA CRUZ",
        "category": "business",
        "icon": "grid",
        "version": "0.2.0",
        "stage": "prototype",
        "description": "Demostración de comercios, beneficios y roles.",
        "requirements": "Python 3 y navegador actualizado. Nombre/logo Pasaporte Colchagua pendientes.",
        "kind": "download",
        "connectKind": "command",
        "logoPending": true,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Laboratorio-0.1.0-beta.zip"
      },
      {
        "id": "pack-lab-subtitles",
        "name": "Subtitle Translator Pro",
        "category": "creative",
        "icon": "film",
        "version": "0.1.0",
        "stage": "prototype",
        "description": "Edición y traducción de SRT/VTT conservando tiempos y formato.",
        "requirements": "Node.js 22.13 o posterior y npm. Traducción requiere proveedor y cuenta propios.",
        "kind": "download",
        "connectKind": "command",
        "logoPending": false,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Laboratorio-0.1.0-beta.zip"
      },
      {
        "id": "pack-lab-multicam",
        "name": "Estudio Multicam",
        "category": "creative",
        "icon": "film",
        "version": "1.0.0 en código",
        "stage": "prototype",
        "description": "Mesa de realización, cámaras y salida de programa. Bullet Cam y retratos 3D son conceptos separados.",
        "requirements": "Python 3, navegador con permisos de cámara/micrófono y servicios propios de señalización.",
        "kind": "download",
        "connectKind": "command",
        "logoPending": false,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Laboratorio-0.1.0-beta.zip"
      },
      {
        "id": "pack-lab-nanookey",
        "name": "NANOOKEY",
        "category": "music",
        "icon": "disc",
        "version": "prototipo",
        "stage": "prototype",
        "description": "Escáner local de archivos y metadatos de biblioteca.",
        "requirements": "Python 3; mutagen opcional para metadatos.",
        "kind": "download",
        "connectKind": "folder",
        "logoPending": false,
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Laboratorio-0.1.0-beta.zip"
      }
    ],
    "version": "0.1.0-beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.6.0-beta.1/LOGIKAPPS-Pack-Laboratorio-0.1.0-beta.zip"
  }
];
