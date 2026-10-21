/* Public distribution catalogue. No credentials or personal library. */
window.LOGIKAPPS_PACKS = [
  {
    "id": "dj",
    "name": "Pack DJ",
    "category": "music",
    "icon": "disc",
    "version": "0.2 beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-DJ-0.2.0-beta.zip",
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
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-DJ-0.2.0-beta.zip",
        "requirements": "Python 3.10+; yt-dlp para enlaces; FFmpeg y Chrome para algunas funciones. Sigue LEEME antes de lanzar."
      },
      {
        "id": "pack-dj-trackhunt",
        "name": "TRACKHUNT",
        "description": "Busca temas y versiones y abre sus fuentes. Incluida en la carpeta TRACKHUNT del pack.",
        "category": "music",
        "icon": "waves",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-DJ-0.2.0-beta.zip",
        "requirements": "Node.js 22.13+ y preparación inicial. Algunas fuentes y el reconocimiento requieren configuración propia; no incluye claves."
      },
      {
        "id": "pack-dj-nanook-video",
        "name": "NANOOK VIDEO",
        "description": "Descarga y convierte video y audio. Incluida en la carpeta NANOOK-VIDEO del pack.",
        "category": "music",
        "icon": "play",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-DJ-0.2.0-beta.zip",
        "requirements": "Node.js 22.13+, Python 3.10+, yt-dlp y FFmpeg/ffprobe para descargar y convertir. El motor de mejora con IA no está incluido."
      },
      {
        "id": "pack-dj-vj-lab",
        "name": "VJ/LAB",
        "description": "Visuales de escenario y composición gráfica. Incluida en la carpeta VJ-LAB del pack.",
        "category": "music",
        "icon": "sparkles",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-DJ-0.2.0-beta.zip",
        "requirements": "Python 3.10+ para el lanzador local y navegador actualizado. La generación de logos con IA no está incluida."
      },
      {
        "id": "pack-dj-hit-lab",
        "name": "Hit Lab",
        "description": "Crates, muestras sintetizadas y herramientas de preparación musical. Incluida en la carpeta Hit-Lab del pack.",
        "category": "music",
        "icon": "music",
        "kind": "download",
        "connectKind": "command",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-DJ-0.2.0-beta.zip",
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
    "version": "0.2 beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-Fraternidad-0.2.0-beta.zip",
    "description": "Los accesos del equipo, juntos: administración, web, diseño, punto de venta y casting. Con una guía para entrar a cada sistema.",
    "requirements": "Mac y navegador web · Descarga de accesos y guía. Internet y cuenta autorizada en cada sistema; descargar el pack no concede permisos de administración.",
    "steps": [
      "Descarga y descomprime el pack. Abre GUIA.html para consultar el uso y acceso de cada sistema.",
      "Solicita al administrador tu cuenta y los permisos que correspondan a tu función.",
      "Agrega los accesos de abajo a Mis apps. También puedes abrirlos desde la guía o los accesos incluidos en la carpeta."
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
        "name": "FRATE Flyer",
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
      }
    ]
  },
  {
    "id": "design",
    "name": "Pack Diseño y Joyería",
    "category": "creative",
    "icon": "diamond",
    "version": "0.1 beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-Diseno-0.1.0-beta.zip",
    "description": "Taller Teatina para tus piezas y FRATV para tus transmisiones. Aplicación de Mac, gráficas y guías de inicio.",
    "requirements": "Taller Teatina: Mac Apple Silicon con macOS 13+. FRATV: navegador y OBS por separado. No incluye LightBurn, Blender, Cura ni claves de IA.",
    "steps": [
      "Descarga el pack y abre GUIA.html.",
      "Descomprime el ZIP de Taller Teatina y copia la app a Aplicaciones. FRATV incluye sus recursos HTML y guía para OBS.",
      "Usa Conectar app para Taller Teatina o Conectar carpeta para los recursos de FRATV."
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
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-Diseno-0.1.0-beta.zip",
        "requirements": "Apple Silicon · macOS 13+ · Versión 0.4.0 sin notarización. Edición local; analizar fotos requiere configuración propia de OpenAI. Validar medidas antes de fabricar."
      },
      {
        "id": "pack-design-fratv",
        "name": "FRATV para OBS",
        "description": "15 gráficas HTML: rótulos, identidad de canal, cuenta regresiva, programación y créditos. Descarga el pack y previsualízalo en tu navegador.",
        "category": "creative",
        "icon": "film",
        "kind": "download",
        "connectKind": "folder",
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-Diseno-0.1.0-beta.zip",
        "requirements": "Mac, Windows o Linux · Navegador actualizado · OBS Studio por separado para transmitir. Pack horizontal 1920 × 1080; no incluye el editor Studio."
      }
    ]
  },
  {
    "id": "ia",
    "name": "Pack IA y Equipo",
    "category": "personal",
    "icon": "sparkles",
    "version": "0.1 beta",
    "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-IA-Equipo-0.1.0-beta.zip",
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
        "url": "https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.5.0-beta.1/LOGIKAPPS-Pack-IA-Equipo-0.1.0-beta.zip",
        "requirements": "Apple Silicon · macOS 14+ · Sin notarización. Modelos y herramientas se descargan aparte. Equipo necesita invitación; todavía no se verificó colaboración entre dos Mac."
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
  }
];
