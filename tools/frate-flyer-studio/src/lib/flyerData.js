// ═══════════════════════════════════════════════════════════════════
// flyerData.js — contrato de datos EVENT + TWEAKS (ver README §4 y
// docs/MAPEO-DATOS.md del handoff). Paletas, formatos, fuentes keyword,
// demo del REC y carga de datos inyectados (?data= / window.FRATE_*).
// ═══════════════════════════════════════════════════════════════════

// Paleta = 3 acentos por zona: A=título · B=HUD/chat · C=concurso/fecha/tags
export const PALETTES = {
  rec:     { name: 'Rosa',    colors: ['#ff2d78', '#00e5ff', '#b14bff'] },
  violeta: { name: 'Violeta', colors: ['#b14bff', '#00e5ff', '#ff2d78'] },
  cyan:    { name: 'Cyan',    colors: ['#00e5ff', '#ff2d78', '#b14bff'] },
  coral:   { name: 'Coral',   colors: ['#ff6a3d', '#ffd23d', '#ff2d78'] },
  verde:   { name: 'Verde',   colors: ['#39ff7d', '#00e5ff', '#f5ff3d'] },
}

export const KW_FONTS = {
  bungee: "'Bungee', cursive",
  marker: "'Permanent Marker', cursive",
  spray:  "'Rubik Spray Paint', cursive",
}

// Formatos Instagram (todos verticales, 1080px de ancho)
export const FORMATS = {
  story:    [1080, 1920],  // 9:16 historia
  carousel: [1080, 1350],  // 4:5 carrusel / feed
  poster:   [1080, 1620],  // 2:3 afiche
}

export const FORMAT_LABELS = { story: 'Historia 9:16', carousel: 'Carrusel 4:5', poster: 'Afiche 2:3' }
export const KW_LABELS = { bungee: 'Urbano', marker: 'Marcador', spray: 'Spray' }
export const TITLE_STYLE_LABELS = { aligned: 'Alineado', center: 'Centrado', block: 'Bloque' }
export const SONG_STYLE_LABELS = { player: 'Player', spectrum: 'Espectro', editorial: 'Editorial' }

// `palette` puede ser preset o array de 3 hex libres (los manda la IA)
export function paletteColors(palette) {
  if (Array.isArray(palette)) return palette
  return (PALETTES[palette] || PALETTES.rec).colors
}

// ── Demo REC / Diagnóstico (mismos datos del prototipo hi-fi) ─────────
export const REC_TWEAKS_DEFAULT = {
  palette: 'rec',
  format: 'story',
  titleStyle: 'aligned',
  keywordFont: 'bungee',
  songStyle: 'player',
  showChat: true,
  showHud: true,
}

export const REC_EVENT_DEMO = {
  rec: 'REC', fps: '180FPS', timecode: '23:47:32', zone: 'ZONA PISTA',
  hudEyeLabel: 'SU MIRADA',
  impactoLabel: 'NIVEL DE IMPACTO', impacto: '99.7%',
  peligroLabel: 'PELIGROSIDAD', peligro: 'EXTREMA',
  ubicLabel: 'UBICACIÓN', ubic: 'FRATE', ubicSub: 'PISTA CENTRAL',
  horaLabel: 'HORA DETECTADA', hora: '01:47 AM',
  typing: 'ESCRIBIENDO…',
  chat: [
    { side: 'in',  text: 'No sé cómo decírtelo…', time: '23:47' },
    { side: 'out', text: 'pero cada vez que sonríes se me olvida todo', time: '23:48', seen: true },
    { side: 'in',  text: 'Nos vemos en FRATE?', time: '23:48' },
    { side: 'out', text: 'sí.', time: '23:48', seen: true },
  ],
  titlePre: 'DIAGNÓSTICO',
  titleLine1: 'ME ENCANTA', titleTu: 'TU', titleKeyword: 'SONRISA',
  concept: 'PERO ME ENAMORA MÁS <em>CÓMO BAILAS</em>.',
  analysisLabel: 'ANÁLISIS COMPLETO', analysisPct: 99,
  dateDay: 'JUEVES', dateNum: '30', dateMonth: 'ABRIL', time: '11 PM – 05 AM',
  tags: ['PERREO', 'AMIGOS', 'HISTORIAS'],
  concursoTitle: 'CONCURSO',
  concursoText: 'Etiqueta a quien te hace sonreír y gana:',
  prizes: [{ n: '4', label: 'ENTRADAS' }, { n: '1', label: 'BOTELLA DESTILADO A ELECCIÓN' }],
  songTitle: 'SI ANTES TE HUBIERA CONOCIDO', songArtist: 'KAROL G',
  qrUrl: 'https://www.frate.cl', qrCap: 'WWW.FRATE.CL',
  ticketsLabel: 'ENTRADAS EN:', ticketsUrl: 'WWW.FRATE.CL', entUrl: 'WWW.FRATE.CL',
  handle: '@FRATERNIDADCAMPUSCENTRAL',
}

// Muestras demo para el botón Regenerar (prueba de re-creación)
export const REC_SAMPLES = [
  { titleLine1: 'ME ENCANTA', titleTu: 'TU', titleKeyword: 'SONRISA', concept: 'PERO ME ENAMORA MÁS <em>CÓMO BAILAS</em>.', dateDay: 'JUEVES', dateNum: '30', dateMonth: 'ABRIL', songTitle: 'SI ANTES TE HUBIERA CONOCIDO', songArtist: 'KAROL G', concursoText: 'Etiqueta a quien te hace sonreír y gana:' },
  { titleLine1: 'ME GUSTA', titleTu: 'TU', titleKeyword: 'CAOS', concept: 'Y CÓMO <em>LO BAILAS TODO</em>.', dateDay: 'VIERNES', dateNum: '15', dateMonth: 'MAYO', songTitle: 'LUNA', songArtist: 'FEID, ATL JACOB', concursoText: 'Etiqueta a tu cómplice de caos y gana:' },
  { titleLine1: 'NADIE BAILA', titleTu: '', titleKeyword: 'COMO TÚ', concept: 'Y LO <em>SABES BIEN</em>.', dateDay: 'SÁBADO', dateNum: '07', dateMonth: 'JUNIO', songTitle: 'LA FALDA', songArtist: 'MYKE TOWERS', concursoText: 'Etiqueta a la reina de la pista y gana:' },
]

// Barras pseudo-aleatorias deterministas (código de barras / espectros) —
// misma semilla y constantes que los prototipos para paridad visual.
export function seededBars(seed, count, dimOpacity = 0.8) {
  let s = seed
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  return Array.from({ length: count }, () => ({
    w: (rnd() * 3 + 1).toFixed(1),
    o: rnd() > 0.5 ? 1 : dimOpacity,
  }))
}

// ── Inyección: ?data=<base64(JSON)> o window.FRATE_EVENT/FRATE_TWEAKS ─
// Mezcla lo inyectado sobre los defaults → regeneración infinita.
export function loadInjected(eventDefaults, tweaksDefaults) {
  const event = { ...eventDefaults }
  const tweaks = { ...tweaksDefaults }
  try {
    const raw = new URLSearchParams(window.location.search).get('data')
    if (raw) {
      const d = JSON.parse(decodeURIComponent(escape(atob(raw))))
      Object.assign(event, d.event || {})
      Object.assign(tweaks, d.tweaks || {})
    }
  } catch (e) { console.warn('data param inválido', e) }
  if (window.FRATE_EVENT) Object.assign(event, window.FRATE_EVENT)
  if (window.FRATE_TWEAKS) Object.assign(tweaks, window.FRATE_TWEAKS)
  return { event, tweaks }
}
