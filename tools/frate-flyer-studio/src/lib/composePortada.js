// ═══════════════════════════════════════════════════════════════════
// composePortada — convierte el CONCEPTO en las capas de una Portada 9:16.
//
// CLAVE: las capas se generan en DISPLAY-SPACE (340×604 para story), que
// es el sistema de coordenadas que espera CanvasEditor. El editor escala
// solo al exportar (×3.176 → 1080×1920). Generar en 1080×1920 acá fue el
// bug del Flyer Ready anterior: todo quedaba fuera del lienzo.
// ═══════════════════════════════════════════════════════════════════
import { makeLayer } from './CanvasEditor.jsx'

// Lienzo de referencia (story display)
export const PORTADA_W = 340
export const PORTADA_H = 604

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

// "2026-07-04" → "VIE 4 JUL"
export function formatFecha(iso) {
  if (!iso) return ''
  try {
    const [y, m, d] = iso.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const dia = DIAS[date.getDay()] || ''
    return `${dia} ${d} ${MESES[m - 1]}`.trim()
  } catch {
    return iso
  }
}

// Fondo: foto con overlay oscuro, o gradiente FRATE si no hay foto.
export function backgroundFor(concept) {
  if (concept.foto) {
    return { type: 'image', src: concept.foto, overlay: true, overlayOpacity: 0.5, opacity: 1 }
  }
  return { type: 'gradient', stops: [['#1a0012', 0], ['#050509', 1]] }
}

// Genera las capas de la Portada a partir del concepto.
export function composePortada(concept = {}) {
  const {
    titulo = 'TÍTULO DEL EVENTO',
    fecha = '',
    fechaTexto = '',
    concurso = '',
    premio = '',
    instagram = '@fraternidadcampuscentral',
    marca = 'FRATE · CAMPUS CENTRAL',
  } = concept

  const fechaLabel = (fechaTexto || formatFecha(fecha) || '').toUpperCase()
  const layers = []
  let z = 10

  // Logo / marca arriba
  layers.push(makeLayer('text', {
    name: 'Marca', content: marca, font: 'Oswald', fontSize: 13, fontWeight: '600',
    color: '#9b30ff', textAlign: 'center', uppercase: true,
    x: 20, y: 26, w: 300, h: 20, zIndex: z++,
  }))

  // Título grande
  layers.push(makeLayer('text', {
    name: 'Título', content: titulo, font: 'Bebas Neue', fontSize: 52, fontWeight: '700',
    color: '#ffffff', textAlign: 'center', uppercase: true, lineHeight: 0.95,
    shadow: true, shadowColor: 'rgba(255,45,120,0.7)', shadowBlur: 18, shadowOX: 0, shadowOY: 4,
    x: 15, y: 150, w: 310, h: 150, zIndex: z++,
  }))

  // Fecha
  if (fechaLabel) {
    layers.push(makeLayer('text', {
      name: 'Fecha', content: fechaLabel, font: 'Oswald', fontSize: 22, fontWeight: '500',
      color: '#ffd700', textAlign: 'center', uppercase: true,
      x: 20, y: 322, w: 300, h: 32, zIndex: z++,
    }))
  }

  // Línea divisoria
  layers.push(makeLayer('rect', {
    name: 'Línea', fill: '#ff2d78', stroke: '', radius: 2,
    x: 140, y: 368, w: 60, h: 3, zIndex: z++,
  }))

  // Concurso (frase, no mayúsculas forzadas)
  if (concurso) {
    layers.push(makeLayer('text', {
      name: 'Concurso', content: concurso, font: 'Space Grotesk', fontSize: 15, fontWeight: '500',
      color: '#f0f0f8', textAlign: 'center', uppercase: false, lineHeight: 1.25,
      x: 28, y: 392, w: 284, h: 60, zIndex: z++,
    }))
  }

  // Premio destacado
  if (premio) {
    layers.push(makeLayer('text', {
      name: 'Premio', content: `🎁 ${premio}`, font: 'Bebas Neue', fontSize: 26, fontWeight: '700',
      color: '#ff2d78', textAlign: 'center', uppercase: true,
      shadow: true, shadowColor: 'rgba(0,0,0,0.6)', shadowBlur: 8, shadowOX: 0, shadowOY: 2,
      x: 20, y: 472, w: 300, h: 46, zIndex: z++,
    }))
  }

  // Instagram abajo
  layers.push(makeLayer('text', {
    name: 'Instagram', content: instagram, font: 'Space Mono', fontSize: 12, fontWeight: '400',
    color: '#9090aa', textAlign: 'center', uppercase: false,
    x: 20, y: 568, w: 300, h: 18, zIndex: z++,
  }))

  return layers
}
