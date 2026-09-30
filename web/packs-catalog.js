/* Shared pack descriptions only. Accounts and personal libraries stay on each device. */
(() => {
  const release = 'https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.4.0-beta.1/';
  const dj = release + 'LOGIKAPPS-Pack-DJ-0.1.0-beta.zip';
  const fraternity = release + 'LOGIKAPPS-Pack-Fraternidad-0.1.0-beta.zip';
  const local = (id, name, description, icon, requirements) => ({ id: `pack-dj-${id}`, name, description, category: 'music', icon, kind: 'download', connectKind: 'command', url: dj, requirements });
  const web = (id, name, description, url, requirements) => ({ id: `pack-fraternidad-${id}`, name, description, category: 'business', icon: 'frate', kind: 'web', url, requirements });
  window.LOGIKAPPS_PACKS = [
    {
      id: 'dj', name: 'Pack DJ', category: 'music', icon: 'disc', version: '0.1 beta', url: dj,
      description: 'Prepara tu música, busca versiones, trabaja con video y crea visuales. Cinco herramientas reunidas para tu sesión.',
      requirements: 'Para Mac · Incluye las herramientas y sus lanzadores. Requiere Python y Node.js; las funciones de descarga y conversión necesitan componentes adicionales indicados en la guía.',
      steps: ['Descarga y descomprime el pack completo. Guarda la carpeta en un lugar permanente de tu Mac.', 'Abre EMPIEZA-AQUI.html y prepara los requisitos de las herramientas que quieras usar.', 'Conecta el lanzador de cada herramienta a Mis apps con los botones de abajo. Cada una conserva sus datos en tu equipo.'],
      tools: [
        local('surco', 'Surco', 'Biblioteca musical, enlaces y captura de audio. Incluida en la carpeta Surco del pack.', 'disc', 'Python 3.10+; yt-dlp para enlaces; FFmpeg y Chrome para algunas funciones. Sigue LEEME antes de lanzar.'),
        local('trackhunt', 'TRACKHUNT', 'Busca temas y versiones y abre sus fuentes. Incluida en la carpeta TRACKHUNT del pack.', 'waves', 'Node.js 22.13+ y preparación inicial. Algunas fuentes y el reconocimiento requieren configuración propia; no incluye claves.'),
        local('nanook-video', 'NANOOK VIDEO', 'Descarga y convierte video y audio. Incluida en la carpeta NANOOK-VIDEO del pack.', 'play', 'Node.js 22.13+, Python 3.10+, yt-dlp y FFmpeg/ffprobe para descargar y convertir. El motor de mejora con IA no está incluido.'),
        local('vj-lab', 'VJ/LAB', 'Visuales de escenario y composición gráfica. Incluida en la carpeta VJ-LAB del pack.', 'sparkles', 'Python 3.10+ para el lanzador local y navegador actualizado. La generación de logos con IA no está incluida.'),
        local('hit-lab', 'Hit Lab', 'Crates, muestras sintetizadas y herramientas de preparación musical. Incluida en la carpeta Hit-Lab del pack.', 'music', 'Python 3.10+ y navegador actualizado. El radar y la similitud usan un catálogo de demostración; no son datos musicales en vivo.')
      ]
    },
    {
      id: 'fraternidad', name: 'Pack Fraternidad', category: 'business', icon: 'frate', version: '0.1 beta', url: fraternity,
      description: 'Los accesos del equipo, juntos: administración, web, diseño, punto de venta y casting. Con una guía para entrar a cada sistema.',
      requirements: 'Mac y navegador web · Descarga de accesos y guía. Internet y cuenta autorizada en cada sistema; descargar el pack no concede permisos de administración.',
      steps: ['Descarga y descomprime el pack. Abre GUIA.html para consultar el uso y acceso de cada sistema.', 'Solicita al administrador tu cuenta y los permisos que correspondan a tu función.', 'Agrega los accesos de abajo a Mis apps. También puedes abrirlos desde la guía o los accesos incluidos en la carpeta.'],
      tools: [
        web('erp', 'FRATE ERP', 'Administración y operación de Fraternidad.', 'https://erp.frate.cl/', 'Internet y cuenta autorizada. Utiliza información del sistema en línea; no es una copia sin conexión.'),
        web('web', 'FRATE Web · Administración', 'Administración de la web y ticketera. La guía también incluye el sitio público.', 'https://www.frate.cl/admin', 'Cuenta con permisos de administración. El sitio público está en www.frate.cl.'),
        web('flyer', 'FRATE Flyer', 'Acceso a Flyer Express para preparar las piezas del equipo.', 'https://flyer.frate.cl/', 'Internet y acceso autorizado. Las funciones de generación dependen de la configuración del servicio.'),
        web('pos', 'FRATE POS', 'Acceso al punto de venta de Fraternidad.', 'https://pos.frate.cl/', 'Cuenta y permisos de caja asignados. No incluye credenciales ni habilita transacciones por sí solo.'),
        web('cast', 'FRATE Cast', 'Acceso a la plataforma de casting.', 'https://cast.frate.cl/auth', 'Internet. Las funciones de gestión requieren una cuenta y el rol correspondiente.')
      ]
    }
  ];
})();
