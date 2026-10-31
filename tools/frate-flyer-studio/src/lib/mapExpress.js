// ═══════════════════════════════════════════════════════════════════
// mapExpress.js — form_data (Flyer Express / Supabase) → EVENT del flyer.
// Sigue docs/MAPEO-DATOS.md al pie de la letra:
//   DINÁMICO  = viene del evento (concursoFlyer, songTitle, tags…)
//   DERIVADO  = calculado (date → dateDay/Num/Month; título → líneas)
//   CHROME    = fijo de plantilla/marca (QR, handle, caso, impacto…)
// No inventa campos: lo que falta cae al default CHROME/demo del EVENT.
// ═══════════════════════════════════════════════════════════════════
import { REC_EVENT_DEMO } from './flyerData.js'

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

// "2026-07-04" → { dateDay:'SÁBADO', dateNum:'04', dateMonth:'JULIO' }
export function parseFecha(iso) {
  if (!iso) return null
  try {
    const [y, m, d] = iso.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return { dateDay: DIAS[date.getDay()], dateNum: String(d).padStart(2, '0'), dateMonth: MESES[m - 1] }
  } catch { return null }
}

// Título → titleLine1 / titleTu / titleKeyword (palabra clave = la última)
export function splitTitle(title) {
  const words = (title || '').trim().toUpperCase().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  if (words.length === 1) return { titleLine1: '', titleTu: '', titleKeyword: words[0] }
  const keyword = words[words.length - 1]
  const rest = words.slice(0, -1)
  // conector corto (TU/TU./MI/EL/LA…) va como titleTu si es la penúltima palabra
  const conn = rest[rest.length - 1]
  if (rest.length >= 2 && conn.length <= 3) {
    return { titleLine1: rest.slice(0, -1).join(' '), titleTu: conn, titleKeyword: keyword }
  }
  return { titleLine1: rest.join(' '), titleTu: '', titleKeyword: keyword }
}

// "4 ACCESOS VIP + 1 BOTELLA…" → [{n:'4',label:'ACCESOS VIP'},{n:'1',label:'BOTELLA…'}]
export function parsePrizes(prize) {
  if (!prize) return null
  const parts = String(prize).split('+').map(s => s.trim()).filter(Boolean)
  if (!parts.length) return null
  return parts.map(p => {
    const m = p.match(/^(\d+)\s+(.+)$/)
    return m ? { n: m[1], label: m[2].toUpperCase() } : { n: '', label: p.toUpperCase() }
  })
}

// Extrae una frase-concepto potente desde el caption: salta el encabezado
// (TÍTULO — FECHA, todo mayúsculas), hashtags, concurso y cierre de marca.
// Prefiere una oración real (con minúsculas) de largo medio.
export function conceptFromCaption(caption) {
  if (!caption) return ''
  const bad = /frate|síguenos|@|🎁|🏠|👉|https?:|www\.|casa del perreo|campus central del|concurso|premio/i
  const cand = String(caption).split('\n')
    .map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 160 && !bad.test(s))
  // una oración de verdad = tiene bastantes minúsculas (el encabezado va en mayúsculas)
  const lc = s => (s.match(/[a-záéíóúñ]/g) || []).length
  const sentence = cand.find(s => lc(s) >= 12) || cand[0] || ''
  // recorta un guion-fecha final si quedó pegado
  return sentence.replace(/\s*[—–]\s*[A-ZÁÉÍÓÚÑ0-9 ]+[🎉❤️🔥✨]?\s*$/, '').trim().toUpperCase()
}

// Chat derivado del evento (título + concepto) — reemplaza el demo fijo.
export function chatFromEvent({ titleFull, concept }) {
  const t = (titleFull || '').trim()
  const c = (concept || '').replace(/<[^>]+>/g, '').toLowerCase().replace(/\.$/, '')
  if (!t && !c) return null
  const short = c.length > 58 ? c.slice(0, 55).replace(/[,;:]?\s+\S*$/, '') + '…' : c + '…'
  const bubbles = []
  if (c) bubbles.push({ side: 'in', text: short.charAt(0).toUpperCase() + short.slice(1), time: '23:47' })
  if (t) bubbles.push({ side: 'out', text: `esto es ${t.toLowerCase()}`, time: '23:48', seen: true })
  bubbles.push({ side: 'in', text: 'Nos vemos en FRATE?', time: '23:48' })
  bubbles.push({ side: 'out', text: 'sí.', time: '23:48', seen: true })
  return bubbles
}

// Une la operación del día en líneas de line-up para una capa opcional.
export function lineupFromDayInfo(dayInfo = {}) {
  const djs = (dayInfo.djs || []).filter(Boolean)
  const promos = (dayInfo.promos || []).filter(Boolean)
  const extras = (dayInfo.extras || []).filter(Boolean)
  return { djs, promos, extras, hasAny: !!(djs.length || promos.length || extras.length) }
}

// form_data del Express → EVENT (sobre los defaults CHROME/demo)
export function mapFormDataToEvent(formData = {}, selectedTitle = '') {
  const ev = { ...REC_EVENT_DEMO }
  const fd = formData

  // Título (DERIVADO de selectedTitle/eventName)
  const t = splitTitle(selectedTitle || fd.eventName)
  if (t) Object.assign(ev, t)

  // Concepto (DINÁMICO) — cadena de respaldo, NUNCA queda el demo:
  //   flyerConcept de la IA → concepto base → frase del caption → concurso → target
  const conceptSrc = (fd.flyerConcept && fd.flyerConcept.trim())
    || (fd.baseConcept && fd.baseConcept.trim())
    || conceptFromCaption(fd.captionFinal)
    || (fd.concursoFlyer ? String(fd.concursoFlyer).split('\n')[0] : '')
    || (fd.contestTarget ? `PARA ${fd.contestTarget}` : '')
  if (conceptSrc) ev.concept = String(conceptSrc).toUpperCase()

  // Fecha / horario (DERIVADO de date · DINÁMICO time)
  const f = parseFecha(fd.date)
  if (f) Object.assign(ev, f)
  if (fd.time) { ev.time = fd.time; ev.hora = fd.time.split(/[–-]/)[0].trim() }

  // Canción (DINÁMICO) — sin canción real NO se hereda la del demo
  if (fd.songTitle) ev.songTitle = String(fd.songTitle).toUpperCase()
  else { ev.songTitle = ''; ev.songArtist = '' }
  const artist = [fd.songMainArtist, fd.songFeatArtists].filter(Boolean).join(', ')
  if (artist) ev.songArtist = artist.toUpperCase()

  // Concurso + premios (DINÁMICO: concursoFlyer · prize · contestTarget)
  if (fd.concursoFlyer) ev.concursoText = String(fd.concursoFlyer).split('\n')[0]
  else if (fd.contestTarget) ev.concursoText = `Etiqueta a ${fd.contestTarget}`
  const prizes = parsePrizes(fd.prize)
  if (prizes) ev.prizes = prizes

  // Tags (DINÁMICO: editorialMood[] + customMood, máx 3)
  const tags = [...(fd.editorialMood || []), ...(fd.customMood ? [fd.customMood] : [])]
    .map(s => String(s).replace(/^[^\wÁÉÍÓÚÑ]+/i, '').trim().toUpperCase())
    .filter(Boolean)
  if (tags.length) ev.tags = tags.slice(0, 3)

  // Chat — la IA lo entrega listo (flyerChat); si no, se deriva del evento
  const titleFull = [ev.titleLine1, ev.titleTu, ev.titleKeyword].filter(Boolean).join(' ')
  const aiChat = Array.isArray(fd.flyerChat)
    ? fd.flyerChat.filter(b => b && b.text).map((b, i) => ({
        side: b.side === 'out' ? 'out' : 'in',
        text: String(b.text),
        time: b.time || `23:${String(46 + i).padStart(2, '0')}`, // monótono creciente
        seen: b.side === 'out',
      }))
    : null
  const chat = (aiChat && aiChat.length) ? aiChat : chatFromEvent({ titleFull, concept: ev.concept })
  if (chat) ev.chat = chat
  // Scanner usa un mensaje único
  if (titleFull) ev.chatMsg = titleFull

  // Copy editorial por plantilla (DINÁMICO IA · flyerCopy) — respaldo al demo/CHROME
  const fc = fd.flyerCopy || {}
  if (fc.caso) ev.caso = String(fc.caso).toUpperCase()
  if (fc.peligro) ev.peligro = String(fc.peligro).toUpperCase()
  ev._titular = fc.titular || ''
  ev._bajada = fc.bajada || ''

  // Fotos (DINÁMICO: fotosReferencia[0] = rostro; 1..4 = polaroids)
  const fotos = fd.fotosReferencia || []
  if (fotos[0]?.src) ev.faceSrc = fotos[0].src

  // ── Datos para line-up y preview (no van a slots fijos del flyer) ──
  ev._caption = fd.captionFinal || ''
  ev._contestTarget = fd.contestTarget || ''
  ev._lineup = lineupFromDayInfo(fd.dayInfo || {})
  ev._brief = fd.exportBrief?.plainText || fd.exportBrief?.markdown || ''
  // Campos string editables para la capa Line-up del editor
  ev.lineupDjs = ev._lineup.djs.join(' · ')
  ev.lineupPromos = ev._lineup.promos.join(' · ')
  ev.lineupExtras = ev._lineup.extras.join(' · ')

  return ev
}

// Fila de la tabla → ítem de la bandeja
export function rowToInboxItem(row, idx = 0) {
  const fd = row.form_data || {}
  const ev = mapFormDataToEvent(fd, row.selected_title)
  const d = new Date(row.updated_at || row.generated_at)
  const hoy = new Date(); const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const createdAt = same(d, hoy) ? `Hoy · ${hora}` : same(d, ayer) ? `Ayer · ${hora}` : d.toLocaleDateString('es-CL')
  return {
    id: `EXP-${String(row.generated_at).slice(-6)}`,
    pkg: row.selected_title || fd.eventName || 'Sin título',
    createdAt,
    status: fd.captionFinal ? 'Copy lista' : 'Borrador',
    suggest: idx % 2 === 0 ? 'rec' : 'scanner',
    event: ev,
  }
}
