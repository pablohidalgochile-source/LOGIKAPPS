// ═══════════════════════════════════════════════════════════════════
// PLANTILLA: "Scanner · Archivo encontrado"
// Réplica estructural del flyer estilo HUD/forense de FRATE.
//
// compose(data) → ~38 capas en DISPLAY-SPACE del formato "poster" 2:3
// (392×588). El editor escala al exportar (×2.755 → 1080×1620).
// Todas las capas son texto/rect/círculo/línea estándar → 100% editables
// en el CanvasEditor (mover, redimensionar, color, fuente, etc.).
// ═══════════════════════════════════════════════════════════════════
import { makeLayer } from '../CanvasEditor.jsx'

export const FORMAT = 'poster'   // 392×588 display · 1080×1620 export

// Datos de ejemplo (el flyer real "ME ENCANTA TU SONRISA"). A futuro
// estos campos se mapean desde el evento del Express.
export const EXAMPLE = {
  marca1: 'FRATERNIDAD',
  marca2: 'CAMPUS CENTRAL',
  dia: 'SÁBADO',
  diaNum: '02',
  mes: 'MAYO',
  horario: '11 PM – 05 AM',
  caso: 'CASO: MIRADA 7.2B',
  ubicacion: 'UBICACIÓN: PISTA PRINCIPAL',
  hora: 'HORA: 02:13 AM',
  nivel: 99,
  peligrosidad: 'PELIGROSIDAD: ALTA',
  chatMsg: 'ME ENCANTA TU SONRISA',
  titulo1: 'ME ENCANTA',
  titulo2: 'TU SONRISA',
  subtitulo: 'PERO ME ENAMORA MÁS COMO BAILAS',
  concurso: 'ETIQUETA A QUIEN TE ROBA LA SONRISA',
  premios: '1 BOTELLA · 4 VIP · + SHOTS',
  logo: 'FRATE',
  web: 'WWW.FRATE.CL',
  footer: 'PERREO · AMIGOS · FLOW · LIBERTAD · HISTORIAS',
  foto: null,
}

const PINK = '#ff2d78'
const PINK_SOFT = '#ff6aac'
const CYAN = '#00e5ff'
const WHITE = '#ffffff'
const DIM = '#9090aa'
const MONO = 'Space Mono'
const HUD = 'Oswald'
const HEAVY = 'Anton'

// Patrón fijo de barras para el código de barras (determinista)
const BARCODE = [2, 1, 3, 1, 2, 1, 3, 2, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 2, 1, 3, 1]

export function compose(d = EXAMPLE) {
  const L = []
  const add = (type, p) =>
    L.push(makeLayer(type, { zIndex: L.length + 1, ...(type === 'text' ? { uppercase: false } : {}), ...p }))
  const T = (p) => add('text', p)
  const R = (p) => add('rect', p)
  const C = (p) => add('circle', p)

  // ── TOP BAR ──────────────────────────────────────────────────────
  T({ name: 'Marca', content: d.marca1, font: HUD, fontWeight: '700', fontSize: 18, color: WHITE, textAlign: 'center', x: 40, y: 16, w: 240, h: 24 })
  T({ name: 'Submarca', content: d.marca2, font: HUD, fontWeight: '400', fontSize: 9, color: DIM, textAlign: 'center', x: 40, y: 40, w: 240, h: 14 })

  // Badge de fecha (esquina superior derecha)
  R({ name: 'Badge fecha', fill: 'transparent', stroke: WHITE, strokeW: 1, radius: 5, x: 306, y: 12, w: 72, h: 76 })
  T({ name: 'Día', content: d.dia, font: HUD, fontSize: 8, color: PINK, textAlign: 'center', x: 306, y: 17, w: 72, h: 12 })
  T({ name: 'Número', content: d.diaNum, font: HEAVY, fontSize: 36, color: WHITE, textAlign: 'center', x: 306, y: 26, w: 72, h: 42 })
  T({ name: 'Mes', content: d.mes, font: HUD, fontSize: 9, color: WHITE, textAlign: 'center', x: 306, y: 70, w: 72, h: 14 })
  T({ name: 'Horario', content: d.horario, font: HUD, fontSize: 9, color: '#ccccdd', textAlign: 'center', x: 276, y: 94, w: 102, h: 14 })

  // ── HUD IZQUIERDA ────────────────────────────────────────────────
  R({ name: 'Pill archivo', fill: 'rgba(255,45,120,0.14)', stroke: PINK, strokeW: 1, radius: 3, x: 18, y: 100, w: 150, h: 17 })
  T({ name: 'Archivo', content: 'ARCHIVO ENCONTRADO', font: HUD, fontWeight: '600', fontSize: 8.5, color: PINK, textAlign: 'left', x: 25, y: 104, w: 140, h: 12 })
  T({ name: 'Caso', content: d.caso, font: MONO, fontSize: 9, color: DIM, textAlign: 'left', x: 20, y: 128, w: 190, h: 13 })
  T({ name: 'Ubicación', content: d.ubicacion, font: MONO, fontSize: 9, color: DIM, textAlign: 'left', x: 20, y: 144, w: 210, h: 13 })
  T({ name: 'Hora', content: d.hora, font: MONO, fontSize: 9, color: DIM, textAlign: 'left', x: 20, y: 160, w: 190, h: 13 })
  T({ name: 'Label impacto', content: 'NIVEL DE IMPACTO:', font: HUD, fontSize: 9, color: DIM, textAlign: 'left', x: 20, y: 182, w: 160, h: 13 })
  R({ name: 'Barra fondo', fill: 'rgba(255,255,255,0.05)', stroke: PINK, strokeW: 1, radius: 2, x: 20, y: 197, w: 74, h: 10 })
  R({ name: 'Barra fill', fill: PINK, stroke: '', radius: 2, x: 20, y: 197, w: Math.max(4, Math.round(74 * (d.nivel || 99) / 100)), h: 10 })
  T({ name: 'Impacto %', content: `${d.nivel || 99}%`, font: HEAVY, fontSize: 16, color: WHITE, textAlign: 'left', x: 100, y: 192, w: 60, h: 20 })
  T({ name: 'Peligrosidad', content: d.peligrosidad, font: HUD, fontSize: 9, color: CYAN, textAlign: 'left', x: 20, y: 218, w: 180, h: 13 })

  // ── SCANNER (crosshair central) ──────────────────────────────────
  C({ name: 'Scanner ext', fill: 'transparent', stroke: CYAN, strokeW: 1, opacity: 0.4, x: 196, y: 135, w: 104, h: 104 })
  C({ name: 'Scanner int', fill: 'transparent', stroke: CYAN, strokeW: 1, opacity: 0.3, x: 222, y: 161, w: 52, h: 52 })
  add('line', { name: 'Scan horiz', fill: CYAN, strokeW: 2, opacity: 0.28, zIndex: L.length + 1, x: 176, y: 186, w: 144, h: 2 })
  R({ name: 'Scan vert', fill: CYAN, stroke: '', opacity: 0.28, x: 247, y: 125, w: 2, h: 124 })
  R({ name: 'Pill objetivo', fill: 'rgba(255,45,120,0.12)', stroke: PINK, strokeW: 1, radius: 3, x: 214, y: 256, w: 158, h: 16 })
  T({ name: 'Objetivo', content: 'OBJETIVO IDENTIFICADO', font: HUD, fontSize: 7.5, color: PINK, textAlign: 'left', x: 220, y: 259, w: 150, h: 11 })

  // ── CHAT (izquierda) ─────────────────────────────────────────────
  R({ name: 'Burbuja', fill: 'rgba(16,16,26,0.88)', stroke: '#333344', strokeW: 1, radius: 11, x: 20, y: 278, w: 150, h: 48 })
  T({ name: 'Tú', content: 'TÚ', font: HUD, fontSize: 8, color: CYAN, textAlign: 'left', x: 30, y: 283, w: 60, h: 11 })
  T({ name: 'Mensaje', content: d.chatMsg, font: 'Bebas Neue', fontSize: 14, color: PINK, textAlign: 'left', x: 30, y: 295, w: 134, h: 18 })
  T({ name: 'Visto', content: 'VISTO ✓✓', font: MONO, fontSize: 7, color: '#888899', textAlign: 'left', x: 30, y: 316, w: 100, h: 10 })
  R({ name: 'Pill escribiendo', fill: 'rgba(16,16,26,0.88)', stroke: '#2a2a3a', strokeW: 1, radius: 9, x: 20, y: 338, w: 142, h: 19 })
  T({ name: 'Escribiendo', content: 'ESTÁ ESCRIBIENDO...  •••', font: MONO, fontSize: 8.5, color: '#888899', textAlign: 'left', x: 28, y: 342, w: 130, h: 12 })
  T({ name: 'Corazón', content: '♥', font: 'Arial', fontWeight: '700', fontSize: 36, color: PINK, textAlign: 'center', x: 312, y: 298, w: 44, h: 44 })

  // ── TÍTULO ───────────────────────────────────────────────────────
  T({ name: 'Título 1', content: d.titulo1, font: HEAVY, fontWeight: '900', fontSize: 44, color: WHITE, textAlign: 'center', x: 10, y: 366, w: 372, h: 50 })
  T({ name: 'Título 2', content: d.titulo2, font: HEAVY, fontWeight: '900', fontSize: 58, color: PINK, textAlign: 'center', x: 10, y: 412, w: 372, h: 66, shadow: true, shadowColor: 'rgba(255,45,120,0.7)', shadowBlur: 24, shadowOX: 0, shadowOY: 3 })
  T({ name: 'Subtítulo', content: d.subtitulo, font: HUD, fontSize: 11, color: CYAN, textAlign: 'center', x: 20, y: 482, w: 352, h: 16 })

  // ── POLAROIDS (4 marcos de foto) ─────────────────────────────────
  ;[24, 116, 208, 300].forEach((x, i) =>
    R({ name: `Foto ${i + 1}`, fill: 'rgba(255,255,255,0.04)', stroke: PINK, strokeW: 1, radius: 2, x, y: 504, w: 68, h: 46 })
  )

  // ── FOOTER ───────────────────────────────────────────────────────
  add('line', { name: 'Divisor', fill: '#333344', strokeW: 1, opacity: 0.5, zIndex: L.length + 1, x: 20, y: 560, w: 352, h: 1 })

  // Columna izquierda: concurso
  T({ name: 'Concurso', content: 'CONCURSO', font: 'Bebas Neue', fontSize: 13, color: PINK, textAlign: 'left', x: 20, y: 565, w: 140, h: 16 })
  T({ name: 'Premios', content: d.premios, font: HUD, fontSize: 7, color: PINK_SOFT, textAlign: 'left', x: 20, y: 580, w: 150, h: 12 })

  // Columna central: logo
  T({ name: 'Logo', content: d.logo, font: HEAVY, fontSize: 26, color: WHITE, textAlign: 'center', x: 150, y: 564, w: 92, h: 30 })
  T({ name: 'Logo sub', content: d.marca2, font: HUD, fontSize: 6.5, color: '#999aaa', textAlign: 'center', x: 150, y: 590, w: 92, h: 10 })

  // Columna derecha: entradas + código de barras
  T({ name: 'Entradas', content: 'ENTRADAS EN', font: HUD, fontSize: 7, color: '#999aaa', textAlign: 'right', x: 262, y: 565, w: 110, h: 10 })
  T({ name: 'Web', content: d.web, font: HUD, fontWeight: '600', fontSize: 10, color: WHITE, textAlign: 'right', x: 252, y: 575, w: 120, h: 14 })
  let bx = 372
  BARCODE.forEach((w, i) => {
    bx -= w + 1
    if (bx > 252) R({ name: i === 0 ? 'Barcode' : `bar${i}`, fill: '#e8e8f0', stroke: '', x: bx, y: 590, w, h: 8 })
  })

  return L
}

export function background(d = EXAMPLE) {
  if (d.foto) return { type: 'image', src: d.foto, overlay: true, overlayOpacity: 0.55, opacity: 1 }
  return { type: 'gradient', stops: [['#0c0010', 0], ['#000000', 1]] }
}

export const TEMPLATE = {
  id: 'scanner',
  nombre: 'Scanner · Archivo encontrado',
  ratio: FORMAT,
  compose,
  background,
  example: EXAMPLE,
}
export default TEMPLATE
