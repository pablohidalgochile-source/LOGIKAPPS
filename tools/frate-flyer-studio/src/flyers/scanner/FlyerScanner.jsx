// ═══════════════════════════════════════════════════════════════════
// FlyerScanner — plantilla "Scanner / Archivo encontrado".
// Réplica 1:1 de Flyer Scanner Archivo.html (styles.css + scanner.css).
// Vara: design_handoff_frate_flyers/screenshots/02-scanner-archivo.png
// ═══════════════════════════════════════════════════════════════════
import { useMemo } from 'react'
import '../base.css'
import './scanner.css'
import '../../lib/image-slot.js'
import { FORMATS, KW_FONTS, KW_LABELS, paletteColors, PALETTES } from '../../lib/flyerData.js'
import { qrSvg } from '../../lib/qr.js'

function FlyerScanner({ event, tweaks }) {
  const pal = paletteColors(tweaks.palette)
  const [w, h] = FORMATS[tweaks.format] || FORMATS.story

  const canvasClass = [
    'fr-canvas',
    `fmt-${tweaks.format || 'story'}`,
    `kw-${tweaks.keywordFont || 'bungee'}`,
    tweaks.showChat ? '' : 'hide-chat',
    tweaks.showPolas ? '' : 'hide-polas',
  ].filter(Boolean).join(' ')

  const canvasStyle = {
    '--accent': pal[0], '--accent-2': pal[1], '--accent-3': pal[2],
    '--f-keyword': KW_FONTS[tweaks.keywordFont] || KW_FONTS.bungee,
    width: w, height: h,
  }

  const barTotal = 22
  const barOn = Math.round(barTotal * (event.impactPct ?? 99) / 100)
  const qrMarkup = useMemo(() => ({ __html: qrSvg(event.qrUrl || 'https://www.frate.cl') }), [event.qrUrl])

  return (
    <div className={canvasClass} id="canvas" style={canvasStyle}>

      {/* FONDO */}
      <div className="fr-photo">
        <image-slot id="scan-face" shape="rounded" radius="0" placeholder="ARRASTRA EL ROSTRO AQUÍ · FULL-BLEED" src={event.faceSrc || undefined} />
      </div>
      <div className="fr-flare" />

      {/* HUD superpuesto */}
      <div className="sc-datebadge">
        <div className="sc-db-day">{event.dateDay}</div>
        <div className="sc-db-num">{event.dateNum}</div>
        <div className="sc-db-month">{event.dateMonth}</div>
      </div>
      <div className="sc-time">{event.time}</div>
      <div className="sc-seal"><b>F</b></div>

      <div className="sc-file">
        <div className="sc-file-h">{event.fileTitle}</div>
        <div className="sc-file-body">
          <div className="sc-row"><em>CASO:</em> <b>{event.caso}</b></div>
          <div className="sc-row"><em>UBICACIÓN:</em> <span>{event.ubic}</span></div>
          <div className="sc-row"><em>HORA:</em> <span>{event.hora}</span></div>
          <div className="sc-row"><em>NIVEL DE IMPACTO:</em></div>
          <div className="fr-bar">
            {Array.from({ length: barTotal }, (_, i) => <span key={i} className={`seg${i < barOn ? '' : ' off'}`} />)}
            <span className="pct">{event.impactPct}%</span>
          </div>
          <div className="sc-danger" dangerouslySetInnerHTML={{ __html: event.peligro || '' }} />
        </div>
      </div>

      <div className="sc-chat">
        <div className="fr-song">
          <div className="song-player">
            <div className="sp-play">▶</div>
            <div className="sp-info">
              <div className="sp-kicker">SONANDO EN LA PISTA</div>
              <div className="sp-title">{event.songTitle}</div>
              <div className="sp-artist">{event.songArtist}</div>
              <div className="sp-bar"><i /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="sc-cross"><i className="r1" /><i className="r2" /><i className="r3" /><span className="h" /><span className="v" /></div>
      <div className="fr-tag-float" style={{ left: 560, top: 566 }}>{event.objetivo}</div>

      {/* CONTENIDO EN FLUJO */}
      <div className="sc-content">
        <div className="sc-top"><div className="fr-logo-top"><img src="/assets/logo-fraternidad.png" alt="Fraternidad Campus Central" /></div></div>
        <div className="sc-spacer" />

        <div className="sc-lower">
          <div className="sc-title">
            <div className="fr-title-1">{event.titleLine1}</div>
            <div className="sc-tline2">
              <div className="sc-kw-wrap">
                <span className="fr-title-tu">{event.titleTu}</span>
                <span className="fr-title-2"><span>{event.titleKeyword}</span><span className="fr-title-heart">♡</span></span>
              </div>
            </div>
            <div className="sc-concept" dangerouslySetInnerHTML={{ __html: event.concept || '' }} />
          </div>

          <div className="sc-polas">
            {(event.polas || []).map((cap, i) => (
              <div key={i} className="sc-pola">
                <image-slot id={`scan-pola-${i + 1}`} shape="rect" placeholder="foto" />
                <div className="cap">{cap}</div>
              </div>
            ))}
          </div>

          <div className="sc-bottom">
            <div className="sc-concurso">
              <h4>{event.concursoTitle}</h4>
              <p>{event.concursoText}</p>
              <ul className="sc-prizelist">
                {(event.prizes || []).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div className="sc-logo-frate">
              <image-slot id="scan-frate-logo" shape="rounded" radius="6" placeholder="LOGO FRATE" src={event.logoSrc || undefined} />
              <div className="sc-logo-sub">CAMPUS CENTRAL</div>
            </div>
            <div className="sc-entradas">
              <div className="sc-ent-label">{event.entLabel}</div>
              <div className="sc-ent-url">{event.entUrl}</div>
              <div className="fr-qr" dangerouslySetInnerHTML={qrMarkup} />
            </div>
          </div>

          <div className="sc-meta"><span>{event.metaAcceso}</span> · <b>DRESS CODE:</b> <span>{event.metaDress}</span></div>

          <div className="sc-tagrow">
            {(event.tags || []).map((t, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <s>•</s>}
                <span>{t}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* overlays */}
      <div className="fr-corners"><i /><i /><i /><i /></div>
      <div className="fr-scan" />
      <div className="fr-grain" />
    </div>
  )
}

export const TEMPLATE = {
  id: 'scanner',
  name: 'Scanner · Archivo',
  Component: FlyerScanner,
  stageClass: 'fr-stage',
  size: (tweaks) => FORMATS[tweaks.format] || FORMATS.story,
  tweaksDefault: { palette: 'violeta', format: 'story', keywordFont: 'bungee', showChat: true, showPolas: true },
  eventDemo: {
    dateDay: 'SÁBADO', dateNum: '02', dateMonth: 'MAYO', time: '11 PM – 05 AM',
    fileTitle: 'ARCHIVO ENCONTRADO',
    caso: 'MIRADA 7.2B', ubic: 'PISTA PRINCIPAL', hora: '02:13 AM',
    impactPct: 99, peligro: 'PELIGROSIDAD: <em>ALTA</em>',
    objetivo: 'OBJETIVO IDENTIFICADO',
    titleLine1: 'ME ENCANTA', titleTu: 'TU', titleKeyword: 'SONRISA',
    concept: 'PERO ME ENAMORA MÁS <em>COMO BAILAS</em>.',
    polas: ['#REC', '#02A', '#02B', '#EC'],
    concursoTitle: 'CONCURSO',
    concursoText: 'Etiqueta a quien te roba la sonrisa y gánate:',
    prizes: ['1 BOTELLA PREMIUM', '4 ENTRADAS VIP', '+ SHOTS PARA TU MESA'],
    entLabel: 'ENTRADAS EN', entUrl: 'WWW.FRATE.CL', qrUrl: 'https://www.frate.cl',
    songTitle: 'SI ANTES TE HUBIERA CONOCIDO', songArtist: 'KAROL G',
    metaAcceso: 'ACCESO +18', metaDress: 'TU MEJOR VERSIÓN',
    tags: ['PERREO', 'AMIGOS', 'FLOW', 'LIBERTAD', 'HISTORIAS'],
  },
  samples: [
    { dateDay: 'SÁBADO', dateNum: '02', dateMonth: 'MAYO', caso: 'MIRADA 7.2B', titleKeyword: 'SONRISA', concept: 'PERO ME ENAMORA MÁS <em>COMO BAILAS</em>.', songTitle: 'SI ANTES TE HUBIERA CONOCIDO', songArtist: 'KAROL G', concursoText: 'Etiqueta a quien te roba la sonrisa y gánate:', peligro: 'PELIGROSIDAD: <em>ALTA</em>' },
    { dateDay: 'VIERNES', dateNum: '19', dateMonth: 'JUNIO', caso: 'MIRADA 3.9X', titleKeyword: 'MIRADA', concept: 'Y NO PUEDO <em>DEJAR DE VERTE</em>.', songTitle: 'CLASSY 101', songArtist: 'FEID, YOUNG MIKO', concursoText: 'Etiqueta a quien te descontrola y gánate:', peligro: 'PELIGROSIDAD: <em>EXTREMA</em>' },
    { dateDay: 'JUEVES', dateNum: '11', dateMonth: 'JULIO', caso: 'PISTA 5.5C', titleKeyword: 'CAOS', concept: 'Y ME ENCANTA <em>TU DESORDEN</em>.', songTitle: 'FERXXO 151', songArtist: 'FEID', concursoText: 'Etiqueta a tu cómplice de pista y gánate:', peligro: 'PELIGROSIDAD: <em>ALTA</em>' },
  ],
  controls: [
    { type: 'format' },
    { type: 'palette' },
    { type: 'seg', key: 'keywordFont', label: 'Fuente palabra clave', options: KW_LABELS },
    { type: 'toggle', key: 'showChat', label: 'Mostrar canción' },
    { type: 'toggle', key: 'showPolas', label: 'Mostrar polaroids' },
  ],
  regenCycle: { key: 'palette', values: Object.keys(PALETTES), random: true },
}

export default FlyerScanner
