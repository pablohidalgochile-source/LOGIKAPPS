// ═══════════════════════════════════════════════════════════════════
// editorTemplates.js — modelo de capas del EDITOR (port 1:1 del
// prototipo design_handoff_frate_flyers/editor/data.js).
// Cada capa = { id, name, type, x, y, w, h?, z, role, locked,
//               selectable, anchor?, style?, html(EVENT) → string }.
// Los textos editables llevan data-edit="campo". Roles: A/B/C.
// rec y scanner van cableadas (el resto se elige desde la galería).
// ═══════════════════════════════════════════════════════════════════
import { seededBars } from '../lib/flyerData.js'

const A = '/assets'

export const FONT_MAP = {
  display: "'Anton',sans-serif",
  hud: "'Chakra Petch',sans-serif",
  mono: "'Share Tech Mono',monospace",
}

/* ---- Helpers de contenido dinámico ---- */
export function barHtml(pct, total) {
  const on = Math.round(total * pct / 100)
  let s = ''
  for (let i = 0; i < total; i++) s += `<span class="seg${i < on ? '' : ' off'}"></span>`
  return s + `<span class="pct">${pct}%</span>`
}
function songPlayer(d) {
  return `<div class="song-player"><div class="sp-play">▶</div><div class="sp-info">`
    + `<div class="sp-kicker">SONANDO EN LA PISTA</div>`
    + `<div class="sp-title" data-edit="songTitle">${d.songTitle}</div>`
    + `<div class="sp-artist" data-edit="songArtist">${d.songArtist}</div>`
    + `<div class="sp-bar"><i></i></div></div></div>`
}
function prizesInline(arr) {
  return arr.map((p, i) => `${i ? '<span class="fr-plus">+</span>' : ''}<div class="fr-prize"><b>${p.n}</b><small>${p.label}</small></div>`).join('')
}
// Line-up del día (DJs / promos / extras) — capa OPCIONAL: parte oculta si
// el evento no trae operación. Lee campos string editables (lineupDjs/…),
// poblados por mapExpress desde dayInfo. Estilo neutro inline (REC + Scanner).
function lineupHtml(d, accent = 'var(--c3, #ff2d78)') {
  const rows = [['DJS', d.lineupDjs, 'lineupDjs'], ['PROMOS', d.lineupPromos, 'lineupPromos'], ['EXTRA', d.lineupExtras, 'lineupExtras']]
    .filter(([, v]) => v && String(v).trim())
  const body = (rows.length ? rows : [['PROMOS', 'Line-up por confirmar', 'lineupPromos']])
    .map(([k, v, ed]) => `<div style="display:flex;gap:8px;align-items:baseline;margin-top:7px">`
      + `<span style="font:700 10px/1 'Chakra Petch',sans-serif;letter-spacing:.14em;color:${accent};min-width:52px">${k}</span>`
      + `<span data-edit="${ed}" style="font:600 13px/1.3 'Chakra Petch',sans-serif;color:#f2f2f2;flex:1">${v}</span></div>`).join('')
  return `<div style="background:rgba(8,8,10,.66);backdrop-filter:blur(3px);border:1px solid rgba(255,255,255,.14);border-left:3px solid ${accent};border-radius:10px;padding:12px 14px">`
    + `<div style="font:800 11px/1 'Chakra Petch',sans-serif;letter-spacing:.2em;color:${accent}">◈ LINE-UP DE LA NOCHE</div>${body}</div>`
}

/* ============================================================
   PLANTILLA 1 — REC / DIAGNÓSTICO  (base poster 1080×1620)
   roles de color: A=título · B=hud/chat · C=fecha/concurso/tags/qr/song
   ============================================================ */
const REC = {
  id: 'rec', name: 'REC · Diagnóstico forense',
  format: 'poster', defaultPalette: 'rec',
  layers: [
    { id: 'photo', name: 'Foto (fondo)', type: 'image', x: 0, y: 0, w: 1080, h: 1620, z: 0, locked: true, role: '-',
      html: (d) => `<div class="fr-photo" style="position:absolute;inset:0"><image-slot id="ed-face" shape="rect" placeholder="ARRASTRA EL ROSTRO"${d.faceSrc ? ` src="${d.faceSrc}"` : ''}></image-slot></div>` },
    { id: 'recbar', name: 'REC · FPS', type: 'group', x: 48, y: 48, w: 220, z: 5, role: 'A',
      html: (d) => `<div class="fr-rec"><div class="fr-rec-row"><span class="fr-dot"></span><span class="fr-rec-label" data-edit="rec">${d.rec}</span></div><span class="fr-mono-sm" data-edit="fps">${d.fps}</span></div>` },
    { id: 'logo', name: 'Logo Fraternidad', type: 'image', x: 372, y: 34, w: 336, h: 132, z: 5, role: '-',
      html: () => `<img src="${A}/logo-fraternidad.png" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 14px rgba(0,0,0,.6))" alt="Fraternidad">` },
    { id: 'cam', name: 'Cámara (batería)', type: 'group', x: 842, y: 48, w: 188, z: 5, role: '-',
      html: (d) => `<div class="fr-cam"><div class="fr-battery"><i></i><i></i><i></i><i></i></div><span class="fr-mono-sm" data-edit="timecode">${d.timecode}</span><span class="fr-mono-sm" data-edit="zone">${d.zone}</span></div>` },
    { id: 'hud', name: 'HUD (tarjetas)', type: 'group', x: 48, y: 300, w: 240, z: 6, role: 'B',
      style: 'display:flex;flex-direction:column;gap:14px',
      html: (d) => `
        <div class="fr-card"><div class="fr-card-row"><div class="fr-eye"><image-slot id="ed-eye" shape="circle" placeholder="ojo" style="width:100%;height:100%"></image-slot></div><div style="flex:1"><div class="fr-card-label" data-edit="hudEyeLabel">${d.hudEyeLabel}</div><svg class="fr-heart-line" viewBox="0 0 160 26" preserveAspectRatio="none"><polyline points="0,13 30,13 40,4 50,22 60,8 70,16 80,13 110,13 120,6 128,18 136,13 160,13"/></svg></div></div></div>
        <div class="fr-card"><div class="fr-card-label" data-edit="impactoLabel">${d.impactoLabel}</div><div class="fr-card-val fr-val-accent" data-edit="impacto">${d.impacto}</div></div>
        <div class="fr-card"><div class="fr-card-label" data-edit="peligroLabel">${d.peligroLabel}</div><div class="fr-card-val" data-edit="peligro">${d.peligro}</div></div>
        <div class="fr-card"><div class="fr-card-row"><span class="fr-pin">◈</span><div class="fr-card-label" data-edit="ubicLabel">${d.ubicLabel}</div></div><div class="fr-card-val" style="font-size:22px;margin-top:6px" data-edit="ubic">${d.ubic}</div><div class="fr-card-label" data-edit="ubicSub">${d.ubicSub}</div></div>
        <div class="fr-card"><div class="fr-card-label" data-edit="horaLabel">${d.horaLabel}</div><div class="fr-card-val fr-val-accent" style="font-size:24px" data-edit="hora">${d.hora}</div></div>` },
    { id: 'chat', name: 'Chat', type: 'group', x: 772, y: 360, w: 262, z: 6, role: 'B',
      style: 'display:flex;flex-direction:column;gap:12px;align-items:flex-end',
      html: (d) => `<div class="fr-typing" data-edit="typing">${d.typing} <b></b><b></b><b></b></div>`
        + d.chat.map(m => `<div class="fr-bubble ${m.side === 'out' ? 'fr-out' : 'fr-in'}">${m.text}<span class="t">${m.time}${m.seen ? ' <span class="fr-check">✓✓</span>' : ''}</span></div>`).join('') },
    { id: 'lineup', name: 'Line-up (DJs / promos)', type: 'group', x: 772, y: 660, w: 262, z: 6, role: 'C',
      html: (d) => lineupHtml(d) },
    { id: 'title', name: 'Título', type: 'group', x: 56, y: 900, w: 980, z: 7, role: 'A',
      html: (d) => `<div class="fr-title ts-aligned">`
        + `<div class="fr-title-pre" data-edit="titlePre">${d.titlePre}</div>`
        + `<div class="fr-title-1"><span data-edit="titleLine1">${d.titleLine1}</span> <span class="fr-title-tu" data-edit="titleTu">${d.titleTu}</span></div>`
        + `<div class="fr-title-2"><span data-edit="titleKeyword">${d.titleKeyword}</span><span class="fr-title-heart">♡</span></div></div>` },
    { id: 'analysis', name: 'Análisis', type: 'group', x: 260, y: 1168, w: 560, z: 7, role: 'A',
      style: 'text-align:center',
      html: (d) => `<div class="fr-analysis-label" data-edit="analysisLabel">${d.analysisLabel}</div><div class="fr-bar" data-bar="${d.analysisPct}"></div>` },
    { id: 'date', name: 'Fecha', type: 'group', x: 56, y: 1250, w: 360, z: 6, role: 'C', anchor: 'bottom',
      html: (d) => `<div class="fr-date-day" data-edit="dateDay">${d.dateDay}</div><div class="fr-date-main"><span class="fr-date-num" data-edit="dateNum">${d.dateNum}</span><span class="fr-date-month" data-edit="dateMonth">${d.dateMonth}</span></div><div class="fr-date-time" data-edit="time">${d.time}</div>` },
    { id: 'wordmark', name: 'FRATE (wordmark)', type: 'group', x: 380, y: 1258, w: 320, z: 6, role: '-', anchor: 'bottom',
      style: 'text-align:center',
      html: () => `<div class="fr-wordmark">FRAT<span class="eq">E</span></div><div class="fr-wordmark-sub">CAMPUS CENTRAL</div>` },
    { id: 'tags', name: 'Tags', type: 'group', x: 800, y: 1250, w: 232, z: 6, role: 'C', anchor: 'bottom',
      style: 'text-align:right',
      html: (d) => `<div class="fr-tags">${d.tags.map(t => `<div><span>${t[0]}</span>${t.slice(1)}</div>`).join('')}</div>` },
    { id: 'concurso', name: 'Concurso', type: 'group', x: 56, y: 1418, w: 440, z: 6, role: 'C', anchor: 'bottom',
      html: (d) => `<div class="fr-concurso"><h4 data-edit="concursoTitle">${d.concursoTitle}</h4><p data-edit="concursoText">${d.concursoText}</p><div class="fr-prizes">${prizesInline(d.prizes)}</div></div>` },
    { id: 'song', name: 'Canción + redes', type: 'group', x: 520, y: 1432, w: 300, z: 6, role: 'C', anchor: 'bottom',
      style: 'display:flex;flex-direction:column;gap:10px',
      html: (d) => songPlayer(d) + `<div class="fr-handle" data-edit="handle">${d.handle}</div><div class="fr-socials"><i>IG</i><i>TT</i><i>SP</i><i>YT</i></div>` },
    { id: 'qr', name: 'QR entradas', type: 'group', x: 902, y: 1408, w: 130, z: 7, role: 'C', anchor: 'bottom',
      style: 'text-align:right',
      html: (d) => `<div class="fr-qr" data-qr="${d.qrUrl}"></div><div class="fr-qr-cap">ENTRADAS · <span data-edit="entUrl">${d.entUrl}</span></div>` },
    { id: 'overlay', name: 'Overlays (grain)', type: 'deco', x: 0, y: 0, w: 1080, h: 1620, z: 60, locked: true, selectable: false, role: '-',
      html: () => `<div class="fr-flare" style="position:absolute;inset:0"></div><div class="fr-scan" style="position:absolute;inset:0"></div><div class="fr-grain" style="position:absolute;inset:0"></div>` },
  ],
}

/* ============================================================
   PLANTILLA 2 — SCANNER / ARCHIVO  (base poster 1080×1620)
   roles: A=título · B=archivo/crosshair/sello · C=concurso/song/tags/qr
   ============================================================ */
const SCAN = {
  id: 'scanner', name: 'Scanner · Archivo encontrado',
  format: 'poster', defaultPalette: 'violeta',
  layers: [
    { id: 'photo', name: 'Foto (fondo)', type: 'image', x: 0, y: 0, w: 1080, h: 1620, z: 0, locked: true, role: '-',
      html: (d) => `<div class="fr-photo" style="position:absolute;inset:0"><image-slot id="ed-face" shape="rect" placeholder="ARRASTRA EL ROSTRO"${d.faceSrc ? ` src="${d.faceSrc}"` : ''}></image-slot></div>` },
    { id: 'date', name: 'Badge fecha', type: 'group', x: 56, y: 50, w: 190, z: 6, role: 'A',
      html: (d) => `<div class="sc-datebadge" style="position:static"><div class="sc-db-day" data-edit="dateDay">${d.dateDay}</div><div class="sc-db-num" data-edit="dateNum">${d.dateNum}</div><div class="sc-db-month" data-edit="dateMonth">${d.dateMonth}</div></div>` },
    { id: 'logo', name: 'Logo Fraternidad', type: 'image', x: 372, y: 40, w: 336, h: 120, z: 6, role: '-',
      html: () => `<img src="${A}/logo-fraternidad.png" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 14px rgba(0,0,0,.6))" alt="Fraternidad">` },
    { id: 'time', name: 'Horario', type: 'text', x: 56, y: 250, w: 240, z: 6, role: '-',
      html: (d) => `<div class="sc-time" style="position:static" data-edit="time">${d.time}</div>` },
    { id: 'seal', name: 'Sello F', type: 'group', x: 64, y: 330, w: 92, h: 92, z: 6, role: 'B',
      html: () => `<div class="sc-seal" style="position:static"><b>F</b></div>` },
    { id: 'file', name: 'Archivo encontrado', type: 'group', x: 752, y: 168, w: 272, z: 7, role: 'B',
      html: (d) => `<div class="sc-file" style="position:static;width:100%"><div class="sc-file-h" data-edit="fileTitle">${d.fileTitle}</div><div class="sc-file-body"><div class="sc-row"><em>CASO:</em> <b data-edit="caso">${d.caso}</b></div><div class="sc-row"><em>UBICACIÓN:</em> <span data-edit="ubic">${d.ubic}</span></div><div class="sc-row"><em>HORA:</em> <span data-edit="hora">${d.hora}</span></div><div class="sc-row"><em>NIVEL DE IMPACTO:</em></div><div class="fr-bar" data-bar="${d.analysisPct}"></div><div class="sc-danger" data-edit="peligro">PELIGROSIDAD: ${d.peligro}</div></div></div>` },
    { id: 'song', name: 'Canción', type: 'group', x: 56, y: 560, w: 290, z: 7, role: 'C',
      html: (d) => songPlayer(d) },
    { id: 'lineup', name: 'Line-up (DJs / promos)', type: 'group', x: 56, y: 690, w: 290, z: 7, role: 'C',
      html: (d) => lineupHtml(d, 'var(--c2, #a855f7)') },
    { id: 'cross', name: 'Crosshair', type: 'deco', x: 560, y: 300, w: 230, h: 230, z: 5, role: 'B',
      html: () => `<div class="sc-cross" style="position:static;width:100%;height:100%"><i class="r1"></i><i class="r2"></i><i class="r3"></i><span class="h"></span><span class="v"></span></div>` },
    { id: 'objetivo', name: 'Tag objetivo', type: 'text', x: 560, y: 548, w: 240, z: 8, role: 'B',
      html: (d) => `<div class="fr-tag-float" style="position:static;display:inline-block" data-edit="objetivo">${d.objetivo}</div>` },
    { id: 'title', name: 'Título', type: 'group', x: 60, y: 820, w: 960, z: 8, role: 'A',
      style: 'text-align:center',
      html: (d) => `<div class="sc-title"><div class="fr-title-1" data-edit="titleLine1">${d.titleLine1}</div><div class="sc-tline2"><div class="sc-kw-wrap"><span class="fr-title-tu" data-edit="titleTu">${d.titleTu}</span><span class="fr-title-2"><span data-edit="titleKeyword">${d.titleKeyword}</span><span class="fr-title-heart">♡</span></span></div></div><div class="sc-concept" data-edit="concept">${d.concept}</div></div>` },
    { id: 'polas', name: 'Polaroids', type: 'group', x: 90, y: 1120, w: 900, z: 7, role: '-', anchor: 'bottom',
      style: 'display:flex;gap:14px;justify-content:center',
      html: (d) => d.polas.map((cap, i) => `<div class="sc-pola" style="flex:1"><image-slot id="ed-pola-${i + 1}" shape="rect" placeholder="foto"></image-slot><div class="cap">${cap}</div></div>`).join('') },
    { id: 'concurso', name: 'Concurso', type: 'group', x: 56, y: 1360, w: 430, z: 7, role: 'C', anchor: 'bottom',
      html: (d) => `<div class="sc-concurso"><h4 data-edit="concursoTitle">${d.concursoTitle}</h4><p data-edit="concursoText">${d.concursoText}</p><ul class="sc-prizelist">${d.prizes.map(p => `<li>${p.n} ${p.label}</li>`).join('')}</ul></div>` },
    { id: 'entradas', name: 'QR entradas', type: 'group', x: 820, y: 1380, w: 200, z: 7, role: 'C', anchor: 'bottom',
      style: 'text-align:right',
      html: (d) => `<div class="sc-ent-label">ENTRADAS EN</div><div class="sc-ent-url" data-edit="entUrl">${d.entUrl}</div><div class="fr-qr" data-qr="${d.qrUrl}"></div>` },
    { id: 'tags', name: 'Tags', type: 'text', x: 90, y: 1530, w: 900, z: 7, role: 'C', anchor: 'bottom',
      html: (d) => `<div class="sc-tagrow">${d.tags.map(t => `<span>${t}</span>`).join('<s>•</s>')}</div>` },
    { id: 'overlay', name: 'Overlays (grain)', type: 'deco', x: 0, y: 0, w: 1080, h: 1620, z: 60, locked: true, selectable: false, role: '-',
      html: () => `<div class="fr-flare" style="position:absolute;inset:0"></div><div class="fr-scan" style="position:absolute;inset:0"></div><div class="fr-grain" style="position:absolute;inset:0"></div>` },
  ],
}

/* ============================================================
   PLANTILLA 3 — SCANNER v2 (calca de referencia) · fijo 1080×1620
   Coordenadas = scanner2.css (pad inset 56) llevadas a espacio-lienzo.
   Lettering chorreado via --f-drip (spray = Rubik Wet Paint).
   ============================================================ */
const DRIP_FONTS = { bungee: "'Bungee',cursive", marker: "'Permanent Marker',cursive", spray: "'Rubik Wet Paint',cursive" }
const stat = 'position:static;'
const S2 = {
  id: 'scanner2', name: 'Scanner v2 · Calca', fixedFormat: true,
  format: 'poster', defaultPalette: 'rec', keywordFontDefault: 'spray',
  canvasClass: 'fr-canvas',
  cssVars: (pal, kw) => ({ '--accent': pal[0], '--accent-2': pal[1], '--accent-3': pal[2], '--f-drip': DRIP_FONTS[kw] || DRIP_FONTS.spray }),
  layers: [
    { id: 'photo', name: 'Foto (fondo)', type: 'image', x: 0, y: 0, w: 1080, h: 1620, z: 0, locked: true, role: '-',
      html: (d) => `<div class="fr-photo s2-photo" style="position:absolute;inset:0"><image-slot id="ed-face" shape="rect" placeholder="ARRASTRA EL ROSTRO"${d.faceSrc ? ` src="${d.faceSrc}"` : ''}></image-slot></div>` },
    { id: 'border', name: 'Borde exterior', type: 'deco', x: 0, y: 0, w: 1080, h: 1620, z: 3, locked: true, selectable: false, role: 'A',
      html: () => `<div class="s2-border"></div>` },
    { id: 'brand', name: 'Marca (texto)', type: 'group', x: 300, y: 62, w: 480, z: 6, role: '-', style: 'text-align:center',
      html: (d) => `<div class="s2-brand" style="${stat}transform:none"><div class="n" data-edit="venue">${d.venue}</div><div class="s" data-edit="venueSub">${d.venueSub}</div></div>` },
    { id: 'date', name: 'Badge fecha', type: 'group', x: 856, y: 56, w: 168, z: 6, role: 'A',
      html: (d) => `<div class="s2-date frm" style="${stat}width:100%"><div class="d" data-edit="dateDay">${d.dateDay}</div><div class="n" data-edit="dateNum">${d.dateNum}</div><div class="m" data-edit="dateMonth">${d.dateMonth}</div></div>` },
    { id: 'time', name: 'Horario', type: 'text', x: 856, y: 252, w: 168, z: 6, role: '-',
      html: (d) => `<div class="s2-time" style="${stat}width:100%" data-edit="time">${d.time}</div>` },
    { id: 'file', name: 'Archivo encontrado', type: 'group', x: 56, y: 148, w: 300, z: 7, role: 'A',
      html: (d) => `<div class="s2-file frm" style="${stat}width:100%"><div class="hd" data-edit="fileTitle">${d.fileTitle}</div><div class="bd"><div class="s2-row">CASO: <b data-edit="caso">${d.caso}</b></div><div class="s2-row">UBICACIÓN: <span data-edit="ubic">${d.ubic}</span></div><div class="s2-row">HORA: <span data-edit="hora">${d.hora}</span></div><div class="s2-imp-l">NIVEL DE IMPACTO:</div><div class="s2-imp"><div class="s2-hatch"><i style="width:${d.impactPct || 99}%"></i></div><b data-edit="impactoNum">${d.impactoNum}</b></div><div class="s2-danger">PELIGROSIDAD: <em data-edit="peligroTxt">${d.peligroTxt || 'ALTA'}</em></div></div></div>` },
    { id: 'chat', name: 'Chat', type: 'group', x: 56, y: 526, w: 264, z: 7, role: 'B',
      html: (d) => `<div class="s2-chat" style="${stat}width:100%"><div class="s2-bubble frm"><div class="hd"><span class="av">◉</span><span class="who" data-edit="chatWho">${d.chatWho}</span><span class="t" data-edit="chatTime">${d.chatTime}</span></div><div class="msg" data-edit="chatMsg">${d.chatMsg}</div><div class="seen"><span data-edit="chatSeen">${d.chatSeen}</span> <b>✓✓</b></div></div><div class="s2-typing frm"><span data-edit="typing">${d.typing}</span> <i></i><i></i><i></i></div></div>` },
    { id: 'seal', name: 'Sello circular', type: 'group', x: 904, y: 356, w: 116, h: 116, z: 6, role: 'B',
      html: () => `<div class="s2-seal" style="${stat}width:100%;height:100%"><svg class="ring" viewBox="0 0 116 116"><defs><path id="eds2ring" d="M58,10 a48,48 0 1,1 -0.1,0"></path></defs><text><textPath href="#eds2ring" startOffset="0">FRATERNIDAD · CAMPUS CENTRAL · </textPath></text></svg><b>F</b></div>` },
    { id: 'cross', name: 'Crosshair', type: 'deco', x: 584, y: 356, w: 250, h: 250, z: 5, role: 'B',
      html: () => `<div class="s2-cross" style="${stat}width:100%;height:100%"><i class="r1"></i><i class="r2"></i><i class="r3"></i><span class="h"></span><span class="v"></span></div>` },
    { id: 'objetivo', name: 'Tag objetivo', type: 'text', x: 556, y: 324, w: 260, z: 8, role: 'A',
      html: (d) => `<div class="s2-objetivo" style="${stat}display:inline-block" data-edit="objetivo">${d.objetivo}</div>` },
    { id: 'title', name: 'Lettering', type: 'group', x: 96, y: 704, w: 888, z: 8, role: 'A',
      html: (d) => `<div class="s2-title" style="${stat}width:100%;left:auto;right:auto"><div class="s2-l1" data-edit="titleLine1">${d.titleLine1}</div><div class="s2-l2"><span data-edit="titleTu">${d.titleTu}</span> <span data-edit="titleKeyword">${d.titleKeyword}</span><span class="heart">♡</span></div><div class="s2-concept" data-edit="concept">${d.concept}</div></div>` },
    { id: 'polas', name: 'Polaroids', type: 'group', x: 56, y: 1138, w: 968, z: 7, role: '-',
      html: (d) => `<div class="s2-polas" style="${stat}width:100%">${(d.polas || []).map((cap, i) => `<div class="s2-pola frm"><image-slot id="ed-s2pola-${i + 1}" shape="rect" placeholder="foto"></image-slot><div class="cap">${cap}</div></div>`).join('')}</div>` },
    { id: 'concurso', name: 'Concurso', type: 'group', x: 56, y: 1268, w: 340, z: 7, role: 'A',
      html: (d) => `<div class="s2-concurso frm" style="${stat}width:100%"><div class="h"><span class="ic"></span><b data-edit="concursoTitle">${d.concursoTitle}</b></div><p data-edit="concursoText">${d.concursoText}</p><ul>${(d.prizes || []).map(p => `<li>${p.n} ${p.label}</li>`).join('')}</ul></div>` },
    { id: 'frate', name: 'FRATE (outline)', type: 'group', x: 340, y: 1284, w: 400, z: 7, role: '-', style: 'text-align:center',
      html: () => `<div class="s2-frate" style="${stat}transform:none"><div class="w">FRAT<em>E</em></div><div class="s">CAMPUS CENTRAL</div></div>` },
    { id: 'tickets', name: 'Entradas + barcode', type: 'group', x: 704, y: 1300, w: 320, z: 7, role: 'A',
      html: (d) => `<div class="s2-tickets" style="${stat}width:100%"><div class="lab"><span class="globe"></span> <span data-edit="entLabel">${d.entLabel}</span></div><div class="url" data-edit="entUrl">${d.entUrl}</div><div class="s2-barcode">${seededBars(9, 46).map(b => `<i style="width:${b.w}px;opacity:${b.o}"></i>`).join('')}</div><div class="meta"><span data-edit="metaAcceso">${d.metaAcceso}</span> · <b>DRESS CODE:</b> <span data-edit="metaDress">${d.metaDress}</span></div></div>` },
    { id: 'pill', name: 'Pill de tags', type: 'group', x: 96, y: 1482, w: 888, z: 7, role: 'A',
      html: (d) => `<div class="s2-pill frm" style="${stat}width:100%">${(d.tags || []).map(t => `<span>${t}</span>`).join('<s>•</s>')}</div>` },
    { id: 'overlay', name: 'Overlays (grain)', type: 'deco', x: 0, y: 0, w: 1080, h: 1620, z: 60, locked: true, selectable: false, role: '-',
      html: () => `<div class="fr-scan" style="position:absolute;inset:0"></div><div class="fr-grain" style="position:absolute;inset:0"></div>` },
  ],
}

/* ============================================================
   PLANTILLA 4 — THE FRATE TIMES (diario) · fijo 1080×1620
   Bloques del flujo del diario como capas (pad inset 46).
   Color: --stamp = A de la paleta.
   ============================================================ */
const TIMES = {
  id: 'times', name: 'The Frate Times · Diario', fixedFormat: true, noKeywordFont: true,
  format: 'poster', defaultPalette: 'verde',
  canvasClass: 'ft-canvas',
  cssVars: (pal) => ({ '--stamp': pal[0] }),
  layers: [
    { id: 'header', name: 'Cabecera (masthead)', type: 'group', x: 46, y: 46, w: 988, z: 5, role: '-',
      html: (d) => `<div class="ft-folio"><span data-edit="vol">${d.vol}</span><span class="c" data-edit="edicion">${d.edicion}</span><span data-edit="precio">${d.precio}</span></div><div class="ft-rule dbl"></div><div class="ft-mast"><h1 data-edit="masthead">${d.masthead}</h1></div><div class="ft-rule"></div><div class="ft-dateline"><span><b data-edit="place">${d.place}</b></span><span class="mid" data-edit="motto">${d.motto}</span><span data-edit="fecha">${d.fecha}</span></div><div class="ft-rule"></div>` },
    { id: 'breaking', name: 'Última hora', type: 'group', x: 46, y: 320, w: 988, z: 5, role: 'A',
      html: (d) => `<div class="ft-breaking" style="margin-top:0"><span class="tag" data-edit="breakingTag">${d.breakingTag}</span><span class="txt" data-edit="breakingTxt">${d.breakingTxt}</span></div>` },
    { id: 'headline', name: 'Titular', type: 'group', x: 46, y: 386, w: 988, z: 5, role: '-',
      html: (d) => `<div class="ft-head"><h2>${d.headline}</h2><div class="ft-deck" data-edit="deck">${d.deck}</div></div><div class="ft-byline" data-edit="byline">${d.byline}</div>` },
    { id: 'col1', name: 'Columna de texto', type: 'group', x: 46, y: 742, w: 317, z: 5, role: '-',
      html: (d) => `<div class="ft-col"><p data-edit="col1a">${d.col1a}</p><p data-edit="col1b">${d.col1b}</p><div class="ft-quote" data-edit="quote">${d.quote}</div><p data-edit="col1c">${d.col1c}</p><p data-edit="col1d">${d.col1d}</p></div>` },
    { id: 'photo', name: 'Foto de portada', type: 'group', x: 381, y: 742, w: 653, z: 5, role: 'A',
      html: (d) => `<div class="ft-photo" style="grid-column:auto"><div class="ft-kicker" data-edit="kicker">${d.kicker}</div><image-slot id="ed-ftface" shape="rect" placeholder="ARRASTRA LA FOTO DE PORTADA"${d.faceSrc ? ` src="${d.faceSrc}"` : ''}></image-slot><div class="halftone"></div><div class="cap"><b data-edit="capBold">${d.capBold}</b> <span data-edit="capText">${d.capText}</span></div><div class="ft-classified"><h3 data-edit="classTitle">${d.classTitle}</h3><p data-edit="classText">${d.classText}</p><div class="win"><span data-edit="prizeTimes">${d.prizeTimes}</span></div></div></div>` },
    { id: 'briefs', name: 'En esta edición', type: 'group', x: 46, y: 1356, w: 988, z: 5, role: 'A',
      html: (d) => `<div class="ft-briefs" style="margin-top:0"><div class="lbl" data-edit="briefsLbl">${d.briefsLbl}</div><div class="cols"><div class="ft-brief"><div class="k" data-edit="b1k">${d.b1k}</div><h4 data-edit="b1h">${d.b1h}</h4><p data-edit="b1p">${d.b1p}</p></div><div class="ft-brief"><div class="k" data-edit="b2k">${d.b2k}</div><h4 data-edit="b2h">${d.b2h}</h4><p data-edit="b2p">${d.b2p}</p></div><div class="ft-brief"><div class="k" data-edit="b3k">${d.b3k}</div><h4 data-edit="b3h">${d.b3h}</h4><p data-edit="b3p">${d.b3p}</p></div></div></div>` },
    { id: 'foot', name: 'Pie (marca + barcode)', type: 'group', x: 46, y: 1492, w: 988, z: 5, role: '-',
      html: (d) => `<div class="ft-foot" style="margin-top:0"><div class="l"><b data-edit="site">${d.site}</b><br><span data-edit="meta">${d.meta}</span></div><div class="brand"><div class="fr" data-edit="brand">${d.brand}</div><div class="sub" data-edit="brandSub">${d.brandSub}</div></div><div class="price"><div class="ft-barcode">${seededBars(5, 40).map(b => `<i style="width:${b.w}px;opacity:${b.o}"></i>`).join('')}</div></div></div>` },
    { id: 'stamp', name: 'Sello de goma', type: 'group', x: 816, y: 706, w: 188, h: 188, z: 6, role: 'A',
      html: (d) => `<div class="ft-stamp" style="${stat}width:100%;height:100%"><div class="in"><span class="big">${d.stampBig}</span><span class="sm" data-edit="stampSm">${d.stampSm}</span><span class="date" data-edit="stampDate">${d.stampDate}</span></div></div>` },
  ],
}

/* ============================================================
   PLANTILLA 5 — PROHIBIDA (revista) · fijo 1080×1620
   Color: --accent = A (foil) · --accent2 = B (sello/confidencial).
   ============================================================ */
const REVISTA = {
  id: 'revista', name: 'PROHIBIDA · Revista', fixedFormat: true, noKeywordFont: true,
  format: 'poster', defaultPalette: 'coral',
  canvasClass: 'rv-canvas',
  cssVars: (pal) => ({ '--accent': pal[0], '--accent2': pal[1] }),
  layers: [
    { id: 'photo', name: 'Foto (fondo)', type: 'image', x: 0, y: 0, w: 1080, h: 1620, z: 0, locked: true, role: '-',
      html: (d) => `<div class="rv-photo" style="position:absolute;inset:0"><image-slot id="ed-rvface" shape="rect" placeholder="ARRASTRA LA FOTO DE PORTADA"${d.faceSrc ? ` src="${d.faceSrc}"` : ''}></image-slot></div>` },
    { id: 'frame', name: 'Marco interior', type: 'deco', x: 0, y: 0, w: 1080, h: 1620, z: 3, locked: true, selectable: false, role: '-',
      html: () => `<div class="rv-frame"></div>` },
    { id: 'top', name: 'Banda superior', type: 'group', x: 54, y: 40, w: 972, z: 5, role: '-',
      html: (d) => `<div class="rv-top" style="${stat}"><span data-edit="issueTop">${d.issueTop}</span><span class="mid" data-edit="edicion">${d.edicion}</span><span data-edit="ageTop">${d.ageTop}</span></div><div class="rv-hair" style="${stat}margin-top:16px"></div>` },
    { id: 'mast', name: 'Masthead', type: 'group', x: 0, y: 88, w: 1080, z: 5, role: '-', style: 'text-align:center',
      html: (d) => `<div class="rv-mast" style="${stat}"><h1 data-edit="masthead">${d.masthead}</h1><div class="tagline" data-edit="tagline">${d.tagline}</div></div>` },
    { id: 'issue', name: 'Nº marca de agua', type: 'text', x: 890, y: 656, w: 140, z: 4, role: '-',
      html: (d) => `<div class="rv-issue" style="${stat}" data-edit="issueBig">${d.issueBig}</div>` },
    { id: 'sideL', name: 'Coverlines izq', type: 'group', x: 54, y: 470, w: 268, z: 5, role: 'A',
      html: (d) => `<div class="rv-side l" style="${stat}width:100%"><div class="rv-cl"><div class="k" data-edit="l1k">${d.l1k}</div><h3 data-edit="l1h">${d.l1h}</h3><p data-edit="l1p">${d.l1p}</p></div><div class="rv-cl"><div class="k" data-edit="l2k">${d.l2k}</div><h3 data-edit="l2h">${d.l2h}</h3><p data-edit="l2p">${d.l2p}</p></div><div class="rv-cl"><div class="k" data-edit="l3k">${d.l3k}</div><h3 data-edit="l3h">${d.l3h}</h3><p data-edit="l3p">${d.l3p}</p></div></div>` },
    { id: 'sideR', name: 'Coverlines der', type: 'group', x: 758, y: 470, w: 268, z: 5, role: 'B',
      html: (d) => `<div class="rv-side r" style="${stat}width:100%"><div class="rv-cl"><div class="k" data-edit="r1k">${d.r1k}</div><h3 data-edit="r1h">${d.r1h}</h3><p data-edit="r1p">${d.r1p}</p></div><div class="rv-cl"><div class="k" data-edit="r2k">${d.r2k}</div><h3 data-edit="r2h">${d.r2h}</h3><p data-edit="r2p">${d.r2p}</p></div></div>` },
    { id: 'seal', name: 'Sello PROHIBIDA', type: 'group', x: 844, y: 928, w: 172, h: 172, z: 6, role: 'B',
      html: (d) => `<div class="rv-seal" style="${stat}width:100%;height:100%"><svg class="ring" viewBox="0 0 176 176"><defs><path id="edrvring" d="M88,14 a74,74 0 1,1 -0.1,0"></path></defs><text><textPath href="#edrvring" startOffset="0">CONTENIDO EXCLUSIVO · SOLO SOCIOS · FRATE · </textPath></text></svg><div class="in"><div class="big">${d.sealBig}</div><div class="sm" data-edit="sealSm">${d.sealSm}</div></div></div>` },
    { id: 'hero', name: 'Coverline principal', type: 'group', x: 54, y: 1056, w: 972, z: 5, role: 'A',
      html: (d) => `<div class="rv-hero" style="${stat}width:100%"><div class="over" data-edit="heroOver">${d.heroOver}</div><h2>${d.heroTitle}</h2><div class="sub" data-edit="heroSub">${d.heroSub}</div><div class="credit" data-edit="heroCredit">${d.heroCredit}</div></div>` },
    { id: 'foot', name: 'Pie (barcode)', type: 'group', x: 54, y: 1466, w: 972, z: 5, role: '-',
      html: (d) => `<div class="rv-foot" style="${stat}width:100%"><div class="info"><b data-edit="site">${d.site}</b><br><span data-edit="meta">${d.meta}</span></div><div class="rv-price"><div><div class="rv-barcode">${seededBars(7, 34, 0.82).map(b => `<i style="width:${b.w}px;opacity:${b.o}"></i>`).join('')}</div><div class="lbl" data-edit="barLbl">${d.barLbl}</div></div></div></div>` },
    { id: 'grain', name: 'Grano', type: 'deco', x: 0, y: 0, w: 1080, h: 1620, z: 60, locked: true, selectable: false, role: '-',
      html: () => `<div class="rv-grain" style="position:absolute;inset:0"></div>` },
  ],
}

/* ============================================================
   PLANTILLA 6 — ÁLBUM DE FIGURITAS · fijo 1080×1620
   Color: --accent=A · --accent2=B · --accent3=C (pad inset 44).
   ============================================================ */
const ALBUM = {
  id: 'album', name: 'Álbum · Figuritas', fixedFormat: true, noKeywordFont: true,
  format: 'poster', defaultPalette: 'rec',
  canvasClass: 'al-canvas',
  cssVars: (pal) => ({ '--accent': pal[0], '--accent2': pal[1], '--accent3': pal[2] }),
  layers: [
    { id: 'head', name: 'Cabecera', type: 'group', x: 44, y: 44, w: 992, z: 5, role: '-',
      html: (d) => `<div class="al-head"><span class="al-badge" data-edit="badge">${d.badge}</span><span class="al-page" data-edit="page">${d.page}</span></div>` },
    { id: 'title', name: 'Título colección', type: 'group', x: 44, y: 112, w: 992, z: 5, role: 'A',
      html: (d) => `<div class="al-title" style="margin:0"><div class="k" data-edit="coleccion">${d.coleccion}</div><h1 data-edit="title">${d.title}</h1><div class="sub" data-edit="sub">${d.sub}</div></div>` },
    { id: 'grid', name: 'Cromos (grilla)', type: 'group', x: 44, y: 340, w: 992, z: 5, role: '-',
      html: (d) => `<div class="al-grid" style="flex:none;margin-top:0">${(d.stickers || []).map((s, i) => s.state === 'empty'
        ? `<div class="al-slot al-empty"><span class="num">${s.n}</span><div class="ghost"></div><div class="peg">PEGA AQUÍ</div><div class="role">${s.role}</div></div>`
        : `<div class="al-slot"><span class="num">${s.n}</span><image-slot id="ed-alst-${i + 1}" shape="rect" placeholder="figurita"></image-slot><div class="role">${s.role}</div></div>`).join('')}
        <div class="al-slot foil"><span class="num">037</span><span class="star">★</span><image-slot id="ed-alfoil" shape="rect" placeholder="cromo especial"${d.faceSrc ? ` src="${d.faceSrc}"` : ''}></image-slot><div class="role">EDICIÓN LIMITADA</div></div></div>` },
    { id: 'feature', name: 'Cromo especial (barra)', type: 'group', x: 44, y: 1208, w: 992, z: 6, role: 'A',
      html: (d) => `<div class="al-feature" style="grid-column:auto"><div class="al-feat-l"><div class="k" data-edit="featureKicker">${d.featureKicker}</div><h2 data-edit="featureTitle">${d.featureTitle}</h2><div class="concept" data-edit="featureConcept">${d.featureConcept}</div></div><div class="al-feat-r"><div class="al-chip"><span class="ic" data-edit="dateNum">${d.dateNum}</span><span class="tx"><span data-edit="dateTxt">${d.dateTxt}</span><small data-edit="time">${d.time}</small></span></div><div class="al-chip"><span class="ic b3" data-edit="prizeIc">${d.prizeIc}</span><span class="tx"><span data-edit="prizeAlbum">${d.prizeAlbum}</span><small data-edit="prizeSub">${d.prizeSub}</small></span></div><div class="al-chip"><span class="ic b2">#</span><span class="tx"><span data-edit="contest">${d.contest}</span><small data-edit="contestSub">${d.contestSub}</small></span></div></div></div>` },
    { id: 'foot', name: 'Pie (progreso + marca)', type: 'group', x: 44, y: 1494, w: 992, z: 5, role: 'A',
      html: (d) => { const pct = Math.round(100 * (d.collected ?? 0) / (d.total || 5)); return `<div class="al-foot" style="margin-top:0"><div class="al-progress"><div class="lab"><span data-edit="progLab">${d.progLab}</span><span>${d.collected} / ${d.total}</span></div><div class="al-bar"><i style="width:${pct}%"></i></div></div><div class="al-brand"><div class="fr" data-edit="brand">${d.brand}</div><div class="web" data-edit="web">${d.web}</div></div></div>` } },
  ],
}

export const EDITOR_TEMPLATES = { rec: REC, scanner: SCAN, scanner2: S2, times: TIMES, revista: REVISTA, album: ALBUM }

/* Catálogo — las 6 plantillas cableadas al editor de capas */
export const TEMPLATE_CATALOG = [
  { id: 'rec', name: 'REC', sub: 'Diagnóstico forense', wired: true },
  { id: 'scanner', name: 'Scanner', sub: 'Archivo encontrado', wired: true },
  { id: 'scanner2', name: 'Scanner v2', sub: 'Calca de referencia', wired: true },
  { id: 'times', name: 'The Frate Times', sub: 'Portada de diario', wired: true },
  { id: 'revista', name: 'PROHIBIDA', sub: 'Revista editorial', wired: true },
  { id: 'album', name: 'Álbum', sub: 'Figuritas / cromos', wired: true },
]

/* ============================================================
   buildEvent — completa el EVENT importado del Express con los
   campos propios de cada plantilla (DERIVADOS del título/fecha
   + defaults editoriales CHROME). No inventa datos del evento.
   ============================================================ */
const TIMES_DEFAULTS = {
  vol: 'VOL. IV — Nº 042', edicion: 'EDICIÓN NOCTURNA', precio: 'EJEMPLAR GRATUITO',
  masthead: 'The Frate Times', place: 'CAMPUS CENTRAL · SANTIAGO', motto: '“El diario oficial de la noche”',
  breakingTag: 'ÚLTIMA HORA', breakingTxt: 'Se reportan sonrisas peligrosas en la pista principal',
  deck: 'Testigos aseguran que “se les olvidó todo” apenas comenzó a sonar el perreo. Autoridades del campus piden asistir con actitud.',
  byline: 'POR LA REDACCIÓN DE PISTA · FOTOGRAFÍA: PAPARAZZI FRATE · SECCIÓN NOCTURNA',
  col1a: 'Todo comenzó pasadas las once. Fuentes cercanas a la pista confirman que el ambiente escaló minuto a minuto hasta volverse, según sus palabras, “absolutamente incontrolable”.',
  col1b: 'El caso mantiene al campus en alerta romántica. Se recomienda no hacer contacto visual prolongado sin estar dispuesto a bailar.',
  quote: '“Nunca vi a nadie irse temprano.”',
  col1c: 'La redacción insiste: quien llega, se queda. Y quien se queda, vuelve el sábado siguiente.',
  col1d: 'Los reportes preliminares hablan de miradas cruzadas, canciones dedicadas y al menos un “nos vemos en FRATE” que lo cambió todo.',
  kicker: 'EXCLUSIVA DE PORTADA',
  capBold: 'CAPTADA EN VIVO:', capText: 'la protagonista de la noche, momentos antes de que sonara su canción.',
  classTitle: 'CLASIFICADOS · CONCURSO',
  classText: 'SE BUSCA: la próxima portada. Etiqueta a quien debería salir en la edición del sábado.',
  prizeTimes: 'GANA CABINA + BOTELLA',
  briefsLbl: '— EN ESTA EDICIÓN —',
  b1k: 'SOCIEDAD', b1h: 'La pista no da abasto', b1p: 'Vecinos reportan perreo sostenido hasta el amanecer. No se descartan réplicas el sábado.',
  b2k: 'OPINIÓN', b2h: 'Cómo entrar en personaje', b2p: 'Editorial: llegar con actitud, perder la vergüenza y bailar como si nadie cobrara mañana.',
  b3k: 'CARTELERA', b3h: 'Agenda de la noche', b3p: '11 PM apertura · 01 AM show central · 05 AM cierre. Cupos limitados por edición.',
  site: 'WWW.FRATE.CL', meta: 'ACCESO +18 · DRESS CODE: TU MEJOR VERSIÓN',
  brand: 'FRATE', brandSub: 'CAMPUS CENTRAL',
  stampBig: 'EDICIÓN<br>LIMITADA', stampSm: 'CAMPUS CENTRAL',
}
const REVISTA_DEFAULTS = {
  issueTop: 'Nº 04 · MAYO 2026', edicion: 'EDICIÓN NOCTURNA', ageTop: '+18 · CHILE',
  masthead: 'PROHIBIDA', tagline: 'REVISTA UNIVERSITARIA · FRATE CAMPUS CENTRAL', issueBig: '04',
  l1k: 'PORTADA', l1h: 'La chica de la pista', l1p: 'Perfil de quien nadie pudo dejar de mirar',
  l2k: 'TENDENCIA', l2h: 'Vestir para la madrugada', l2p: 'El código: tu mejor versión',
  l3k: 'PLAYLIST', l3h: 'Lo que sonará', l3p: 'Perreo, nostalgia y himnos de cierre',
  r1k: 'CONFIDENCIAL', r1h: 'Se busca portada', r1p: 'Etiqueta a tu candidat@ del mes',
  r2k: 'AGENDA', r2h: 'Sábado 02 · 11 PM', r2p: 'Pista central · cupos limitados',
  sealBig: 'PROHIBIDA<br>SU VENTA', sealSm: 'A ADULTOS ABURRIDOS',
  heroOver: 'EXCLUSIVA DEL MES',
  heroSub: 'La noche que todos fingen que no esperaban. Perfil íntimo de la pista, el deseo y el after.',
  heroCredit: 'FOTOGRAFÍA · FRATE STUDIO — ESTILISMO · LA NOCHE',
  site: 'WWW.FRATE.CL', meta: 'ACCESO +18 · DRESS CODE ESTRICTO', barLbl: 'FRATE · 02 · MAYO',
}
const ALBUM_DEFAULTS = {
  badge: 'ÁLBUM OFICIAL FRATE', page: 'PÁG. 04',
  coleccion: 'COLECCIÓN NOCHE 2026', title: 'LA PISTA', sub: '¡COMPLETA Y ENTRA GRATIS!',
  stickers: [
    { n: '032', role: 'LA SONRISA', state: 'empty' },
    { n: '033', role: 'EL PERREO', state: 'empty' },
    { n: '034', role: 'EL AFTER', state: 'empty' },
    { n: '035', role: 'LA MIRADA', state: 'empty' },
    { n: '036', role: 'EL CRUSH', state: 'empty' },
  ],
  featureKicker: 'CROMO ESPECIAL · BRILLANTE',
  featureConcept: 'La figurita que todos quieren pegar.',
  prizeIc: '1', prizeAlbum: 'BOTELLA PREMIUM', prizeSub: 'al completar el álbum',
  contest: 'ETIQUETA', contestSub: 'a quien te falta pegar',
  progLab: 'TU COLECCIÓN', collected: 2, total: 5,
  brand: 'FRATE', web: 'WWW.FRATE.CL',
}
const S2_DEFAULTS = {
  venue: 'FRATERNIDAD', venueSub: 'CAMPUS CENTRAL',
  impactoNum: '99%', peligroTxt: 'ALTA',
  chatWho: 'Tú', chatTime: '02:13 AM', chatSeen: 'VISTO',
  entLabel: 'ENTRADAS EN', metaAcceso: 'ACCESO +18', metaDress: 'TU MEJOR VERSIÓN',
}

export function buildEvent(templateId, ev) {
  const fullTitle = [ev.titleLine1, ev.titleTu, ev.titleKeyword].filter(Boolean).join(' ')
  const emTitle = `${ev.titleLine1 || ''} <em>${ev.titleTu || ''}</em> ${ev.titleKeyword || ''}`.trim()
  if (templateId === 'scanner2') {
    return { ...S2_DEFAULTS, ...ev, chatMsg: ev.chatMsg || fullTitle, impactPct: ev.impactPct ?? ev.analysisPct ?? 99, impactoNum: `${ev.impactPct ?? ev.analysisPct ?? 99}%` }
  }
  if (templateId === 'times') {
    return {
      ...TIMES_DEFAULTS, ...ev,
      headline: emTitle,
      // Copy editorial de la IA → titular de portada + bajada (respaldo al CHROME)
      breakingTxt: ev._titular || TIMES_DEFAULTS.breakingTxt,
      deck: ev._bajada || TIMES_DEFAULTS.deck,
      fecha: `${ev.dateDay || ''} ${ev.dateNum || ''} DE ${ev.dateMonth || ''}`.trim(),
      stampDate: `${ev.dateNum || ''} · ${ev.dateMonth || ''}`.trim(),
    }
  }
  if (templateId === 'revista') {
    return {
      ...REVISTA_DEFAULTS, ...ev,
      heroTitle: emTitle,
      // Bajada de la IA → subtítulo del hero (respaldo al CHROME)
      heroSub: ev._bajada || ev._titular || REVISTA_DEFAULTS.heroSub,
      r2h: `${(ev.dateDay || '').slice(0, 1)}${(ev.dateDay || '').slice(1).toLowerCase()} ${ev.dateNum || ''} · ${(ev.time || '').split('–')[0].trim()}`,
      barLbl: `FRATE · ${ev.dateNum || ''} · ${ev.dateMonth || ''}`,
      issueTop: `Nº ${ev.dateNum || '04'} · ${ev.dateMonth || ''} 2026`,
      issueBig: ev.dateNum || '04',
    }
  }
  if (templateId === 'album') {
    return {
      ...ALBUM_DEFAULTS, ...ev,
      featureTitle: fullTitle,
      featureConcept: (ev.concept || ALBUM_DEFAULTS.featureConcept).replace(/<[^>]+>/g, ''),
      dateTxt: `${ev.dateDay || ''} ${ev.dateNum || ''} ${ev.dateMonth || ''}`.trim(),
    }
  }
  return { ...ev }
}

/* Muestras demo para "Regenerar" en el editor */
export const EDITOR_SAMPLES = [
  { titleLine1: 'ME ENCANTA', titleTu: 'TU', titleKeyword: 'SONRISA', concept: 'PERO ME ENAMORA MÁS COMO BAILAS.', dateDay: 'JUEVES', dateNum: '30', dateMonth: 'ABRIL', songTitle: 'SI ANTES TE HUBIERA CONOCIDO', songArtist: 'KAROL G', caso: 'MIRADA 7.2B', peligro: 'EXTREMA' },
  { titleLine1: 'ME GUSTA', titleTu: 'TU', titleKeyword: 'CAOS', concept: 'Y CÓMO LO BAILAS TODO.', dateDay: 'VIERNES', dateNum: '15', dateMonth: 'MAYO', songTitle: 'LUNA', songArtist: 'FEID, ATL JACOB', caso: 'MIRADA 3.9X', peligro: 'ALTA' },
  { titleLine1: 'NADIE BAILA', titleTu: '', titleKeyword: 'COMO TÚ', concept: 'Y LO SABES BIEN.', dateDay: 'SÁBADO', dateNum: '07', dateMonth: 'JUNIO', songTitle: 'LA FALDA', songArtist: 'MYKE TOWERS', caso: 'PISTA 5.5C', peligro: 'EXTREMA' },
]

/* Bandeja demo (mock del prototipo) — fallback si Supabase no responde */
import { REC_EVENT_DEMO } from '../lib/flyerData.js'
const DEMO_LINEUP = { djs: ['DJ Zoe', 'B2B Nico + Vale'], promos: ['2x1 en shots hasta la 1 AM', 'Vodka $3.990'], extras: ['Photobooth gratis'], hasAny: true }
const DEMO_EVENT = { ...REC_EVENT_DEMO, concept: 'PERO ME ENAMORA MÁS COMO BAILAS.', caso: 'MIRADA 7.2B', fileTitle: 'ARCHIVO ENCONTRADO', objetivo: 'OBJETIVO IDENTIFICADO', polas: ['#REC', '#02A', '#02B', '#EC'], metaAcceso: 'ACCESO +18', metaDress: 'TU MEJOR VERSIÓN', venue: 'FRATERNIDAD', venueSub: 'CAMPUS CENTRAL',
  _lineup: DEMO_LINEUP, lineupDjs: DEMO_LINEUP.djs.join(' · '), lineupPromos: DEMO_LINEUP.promos.join(' · '), lineupExtras: DEMO_LINEUP.extras.join(' · '),
  _caption: 'ME ENCANTA TU SONRISA — JUEVES 30 ABRIL 🎉\n\nPero me enamora más cómo bailas. La que llega temprano y se va última, la dueña de la pista.\n\n🎁 CONCURSO: etiqueta a quien te hace sonreír.\n\n👉 @fraternidadcampuscentral', _contestTarget: 'quien te hace sonreír', _brief: 'EVENTO: ME ENCANTA TU SONRISA\nFECHA: Jueves 30 abril · 11 PM – 05 AM\nOPERACIÓN: DJ Zoe / B2B Nico + Vale · 2x1 shots hasta 1 AM · Photobooth gratis' }
export const DEMO_INBOX = [
  { id: 'EXP-2026-0431', pkg: 'Semana 18', createdAt: 'Hoy · 14:32', status: 'Copy lista', suggest: 'rec', event: { ...DEMO_EVENT } },
  { id: 'EXP-2026-0430', pkg: 'Semana 18', createdAt: 'Hoy · 11:07', status: 'Copy lista', suggest: 'scanner', event: { ...DEMO_EVENT, ...EDITOR_SAMPLES[1], concursoText: 'Manda esto a tu crush y quizás lo veas acá.' } },
  { id: 'EXP-2026-0429', pkg: 'Semana 17', createdAt: 'Ayer · 20:14', status: 'Copy lista', suggest: 'rec', event: { ...DEMO_EVENT, ...EDITOR_SAMPLES[2], concursoText: 'Etiqueta a tu grupo y ganen la mesa.' } },
  { id: 'EXP-2026-0428', pkg: 'Semana 17', createdAt: 'Ayer · 16:48', status: 'Enviada a diseño', suggest: 'scanner', event: { ...DEMO_EVENT, titleLine1: 'TE VI', titleTu: 'Y', titleKeyword: 'LISTO', concept: 'NO NECESITÉ MÁS.', dateDay: 'SÁBADO', dateNum: '24', dateMonth: 'MAYO', songTitle: 'QLONA', songArtist: 'KAROL G, PESO PLUMA', caso: 'MIRADA 8.1A', peligro: 'CRÍTICA' } },
]
