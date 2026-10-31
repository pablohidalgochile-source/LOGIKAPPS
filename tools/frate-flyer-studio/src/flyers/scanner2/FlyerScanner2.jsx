// ═══════════════════════════════════════════════════════════════════
// FlyerScanner2 — "Scanner v2" (calca de referencia pro): marcos HUD con
// esquinas, sello girado, código de barras, lettering pintado (--f-drip),
// FRATE con la E en acento. Réplica de Flyer Scanner v2.html.
// Vara: design_handoff_frate_flyers/screenshots/03-scanner-v2.png
// ═══════════════════════════════════════════════════════════════════
import '../base.css'
import './scanner2.css'
import '../../lib/image-slot.js'
import { paletteColors, PALETTES, seededBars } from '../../lib/flyerData.js'

// v2 usa su propio mapa de fuente del lettering (spray = Rubik Wet Paint)
const DRIP_FONTS = {
  bungee: "'Bungee',cursive",
  marker: "'Permanent Marker',cursive",
  spray: "'Rubik Wet Paint',cursive",
}
const DRIP_LABELS = { bungee: 'Urbano', marker: 'Marcador', spray: 'Pintado' }

function FlyerScanner2({ event, tweaks }) {
  const pal = paletteColors(tweaks.palette)
  const canvasStyle = {
    '--accent': pal[0], '--accent-2': pal[1], '--accent-3': pal[2],
    '--f-drip': DRIP_FONTS[tweaks.keywordFont] || DRIP_FONTS.spray,
    width: 1080, height: 1620,
  }
  const barcode = seededBars(9, 46)

  return (
    <div className="fr-canvas" id="canvas" style={canvasStyle}>

      {/* FONDO */}
      <div className="fr-photo s2-photo">
        <image-slot id="s2-face" shape="rect" placeholder="ARRASTRA EL ROSTRO AQUÍ · FULL-BLEED" src={event.faceSrc || undefined} />
      </div>

      <div className="s2">
        <div className="s2-border" />

        {/* Crosshair sobre el rostro */}
        <div className="s2-cross"><i className="r1" /><i className="r2" /><i className="r3" /><span className="h" /><span className="v" /></div>
        <div className="s2-objetivo">{event.objetivo}</div>

        <div className="s2-pad">
          {/* TOP */}
          <div className="s2-brand">
            <div className="n">{event.venue}</div>
            <div className="s">{event.venueSub}</div>
          </div>
          <div className="s2-date frm">
            <div className="d">{event.dateDay}</div>
            <div className="n">{event.dateNum}</div>
            <div className="m">{event.dateMonth}</div>
          </div>
          <div className="s2-time">{event.time}</div>

          {/* ARCHIVO */}
          <div className="s2-file frm">
            <div className="hd">{event.fileTitle}</div>
            <div className="bd">
              <div className="s2-row">CASO: <b>{event.caso}</b></div>
              <div className="s2-row">UBICACIÓN: <span>{event.ubic}</span></div>
              <div className="s2-row">HORA: <span>{event.hora}</span></div>
              <div className="s2-imp-l">NIVEL DE IMPACTO:</div>
              <div className="s2-imp"><div className="s2-hatch"><i style={{ width: `${event.impactPct || 99}%` }} /></div><b>{event.impactoNum}</b></div>
              <div className="s2-danger" dangerouslySetInnerHTML={{ __html: event.peligro || '' }} />
            </div>
          </div>

          {/* CHAT */}
          <div className="s2-chat">
            <div className="s2-bubble frm">
              <div className="hd"><span className="av">◉</span><span className="who">{event.chatWho}</span><span className="t">{event.chatTime}</span></div>
              <div className="msg">{event.chatMsg}</div>
              <div className="seen"><span>{event.chatSeen}</span> <b>✓✓</b></div>
            </div>
            <div className="s2-typing frm"><span>{event.typing}</span> <i /><i /><i /></div>
          </div>

          {/* SELLO */}
          <div className="s2-seal">
            <svg className="ring" viewBox="0 0 116 116">
              <defs><path id="s2ring" d="M58,10 a48,48 0 1,1 -0.1,0" /></defs>
              <text><textPath href="#s2ring" startOffset="0">FRATERNIDAD · CAMPUS CENTRAL · </textPath></text>
            </svg>
            <b>F</b>
          </div>

          {/* LETTERING */}
          <div className="s2-title">
            <div className="s2-l1">{event.titleLine1}</div>
            <div className="s2-l2"><span>{event.titleTu}</span> <span>{event.titleKeyword}</span><span className="heart">♡</span></div>
            <div className="s2-concept" dangerouslySetInnerHTML={{ __html: event.concept || '' }} />
          </div>

          {/* POLAROIDS */}
          <div className="s2-polas">
            {(event.polas || []).map((cap, i) => (
              <div key={i} className="s2-pola frm">
                <image-slot id={`s2-pola-${i + 1}`} shape="rect" placeholder="foto" />
                <div className="cap">{cap}</div>
              </div>
            ))}
          </div>

          {/* CONCURSO */}
          <div className="s2-concurso frm">
            <div className="h"><span className="ic" /><b>{event.concursoTitle}</b></div>
            <p>{event.concursoText}</p>
            <ul>{(event.prizes || []).map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>

          {/* FRATE */}
          <div className="s2-frate">
            <div className="w">FRAT<em>E</em></div>
            <div className="s">CAMPUS CENTRAL</div>
          </div>

          {/* ENTRADAS */}
          <div className="s2-tickets">
            <div className="lab"><span className="globe" /> <span>{event.entLabel}</span></div>
            <div className="url">{event.entUrl}</div>
            <div className="s2-barcode">
              {barcode.map((b, i) => <i key={i} style={{ width: `${b.w}px`, opacity: b.o }} />)}
            </div>
            <div className="meta"><span>{event.metaAcceso}</span> · <b>DRESS CODE:</b> <span>{event.metaDress}</span></div>
          </div>

          {/* PILL */}
          <div className="s2-pill frm">
            {(event.tags || []).map((t, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <s>•</s>}
                <span>{t}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="fr-scan" />
      <div className="fr-grain" />
    </div>
  )
}

export const TEMPLATE = {
  id: 'scanner2',
  name: 'Scanner v2',
  Component: FlyerScanner2,
  stageClass: 'fr-stage',
  size: () => [1080, 1620],
  tweaksDefault: { palette: 'rec', keywordFont: 'spray' },
  eventDemo: {
    venue: 'FRATERNIDAD', venueSub: 'CAMPUS CENTRAL',
    dateDay: 'SÁBADO', dateNum: '02', dateMonth: 'MAYO', time: '11 PM – 05 AM',
    fileTitle: 'ARCHIVO ENCONTRADO', caso: 'MIRADA 7.2B', ubic: 'PISTA PRINCIPAL', hora: '02:13 AM',
    impactPct: 99, impactoNum: '99%', peligro: 'PELIGROSIDAD: <em>ALTA</em>',
    chatWho: 'Tú', chatTime: '02:13 AM', chatMsg: 'ME ENCANTA TU SONRISA', chatSeen: 'VISTO',
    typing: 'ESTÁ ESCRIBIENDO…', objetivo: 'OBJETIVO IDENTIFICADO',
    titleLine1: 'ME ENCANTA', titleTu: 'TU', titleKeyword: 'SONRISA',
    concept: 'PERO ME ENAMORA MÁS <em>COMO BAILAS</em>.',
    polas: ['#REC', '#02A', '#02B', '#EC'],
    concursoTitle: 'CONCURSO', concursoText: 'Etiqueta a quien te roba la sonrisa y gánate:',
    prizes: ['1 BOTELLA PREMIUM', '4 ENTRADAS VIP', '+ SHOTS PARA TU MESA'],
    entLabel: 'ENTRADAS EN', entUrl: 'WWW.FRATE.CL',
    metaAcceso: 'ACCESO +18', metaDress: 'TU MEJOR VERSIÓN',
    tags: ['PERREO', 'AMIGOS', 'FLOW', 'LIBERTAD', 'HISTORIAS'],
  },
  samples: [
    { dateDay: 'SÁBADO', dateNum: '02', dateMonth: 'MAYO', caso: 'MIRADA 7.2B', titleLine1: 'ME ENCANTA', titleTu: 'TU', titleKeyword: 'SONRISA', concept: 'PERO ME ENAMORA MÁS <em>COMO BAILAS</em>.', peligro: 'PELIGROSIDAD: <em>ALTA</em>', chatMsg: 'ME ENCANTA TU SONRISA' },
    { dateDay: 'VIERNES', dateNum: '19', dateMonth: 'JUNIO', caso: 'MIRADA 3.9X', titleLine1: 'ME PIERDO EN', titleTu: 'TU', titleKeyword: 'MIRADA', concept: 'Y NO PUEDO <em>DEJAR DE VERTE</em>.', peligro: 'PELIGROSIDAD: <em>EXTREMA</em>', chatMsg: 'NO PUEDO DEJAR DE VERTE' },
    { dateDay: 'JUEVES', dateNum: '11', dateMonth: 'JULIO', caso: 'PISTA 5.5C', titleLine1: 'ME ENCANTA', titleTu: 'TU', titleKeyword: 'CAOS', concept: 'Y CÓMO <em>LO BAILAS TODO</em>.', peligro: 'PELIGROSIDAD: <em>ALTA</em>', chatMsg: 'ME ENCANTA TU CAOS' },
  ],
  controls: [
    { type: 'palette' },
    { type: 'seg', key: 'keywordFont', label: 'Fuente palabra clave', options: DRIP_LABELS },
  ],
  regenCycle: { key: 'palette', values: Object.keys(PALETTES), random: false },
}

export default FlyerScanner2
