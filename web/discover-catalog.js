/* Public tools only. Personal applications and local paths live in each user's library. */
window.LOGIKAPPS_DISCOVER = [
  {
    id: 'surco-public-beta',
    name: 'Surco',
    description: 'Organiza tu biblioteca musical, guarda enlaces y captura audio desde una interfaz local. Beta portable con instrucciones de preparación.',
    category: 'music',
    icon: 'disc',
    kind: 'download',
    connectKind: 'command',
    url: 'https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.3.0-beta.1/Surco-0.1.0-beta.zip',
    requirements: 'Mac · Python 3.10+ · yt-dlp para enlaces · FFmpeg y Chrome para algunas funciones de audio. Sigue LEEME antes de abrir el lanzador.'
  },
  {
    id: 'fratv-obs-public-beta',
    name: 'FRATV para OBS',
    description: '15 gráficas HTML: rótulos, identidad de canal, cuenta regresiva, programación y créditos. Descarga el pack y previsualízalo en tu navegador.',
    category: 'creative',
    icon: 'film',
    kind: 'download',
    connectKind: 'folder',
    url: 'https://github.com/pablohidalgochile-source/LOGIKAPPS/releases/download/v0.3.0-beta.1/FRATV-OBS-Pack-0.1.0-beta.zip',
    requirements: 'Mac, Windows o Linux · Navegador actualizado · OBS Studio por separado para transmitir. Pack horizontal 1920 × 1080; no incluye el editor Studio.'
  },
  {
    id: 'frate-public-web',
    name: 'FRATE Web',
    description: 'Acceso al sitio de Fraternidad Campus Central: eventos, información del espacio y cuenta de asistentes.',
    category: 'business',
    icon: 'frate',
    kind: 'web',
    url: 'https://www.frate.cl/',
    requirements: 'Internet · Sitio para mayores de 18 años. Algunas funciones requieren una cuenta propia; LOGIKAPPS no concede acceso a servicios privados.'
  }
];
