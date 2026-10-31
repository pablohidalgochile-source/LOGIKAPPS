// ═══════════════════════════════════════════════════════════════════
// FlyerRevista — "PROHIBIDA", portada editorial premium tipo Vogue/i-D.
// Réplica de Flyer Revista.html (revista.css). Tweaks: foil (acento) +
// grade de la foto (filter sobre el image-slot).
// Vara: design_handoff_frate_flyers/screenshots/05-revista-prohibida.png
// ═══════════════════════════════════════════════════════════════════
import './revista.css'
import '../../lib/image-slot.js'
import { seededBars } from '../../lib/flyerData.js'

const ACCENTS = ['#d9b46a', '#ff2f6d', '#e7e3da', '#7cf2c8', '#b18cff']
const GRADES = {
  mono: 'grayscale(.85) contrast(1.12) brightness(.92)',
  warm: 'grayscale(.25) sepia(.25) contrast(1.06) brightness(.95)',
  cold: 'grayscale(.4) contrast(1.1) brightness(.94) hue-rotate(-12deg)',
  color: 'grayscale(0) contrast(1.05) saturate(1.05)',
}
const GRADE_LABELS = { mono: 'Mono', warm: 'Cálido', cold: 'Frío', color: 'Color' }

function FlyerRevista({ event, tweaks }) {
  const canvasStyle = { '--accent': tweaks.accent || '#d9b46a', width: 1080, height: 1620 }
  const barcode = seededBars(7, 34, 0.82)
  const html = (k) => ({ __html: event[k] || '' })

  return (
    <div className="rv-canvas" id="canvas" style={canvasStyle}>

      {/* FOTO */}
      <div className="rv-photo">
        <image-slot
          id="rv-face" shape="rect"
          placeholder="ARRASTRA LA FOTO DE PORTADA · FULL-BLEED"
          src={event.faceSrc || undefined}
          style={{ filter: GRADES[tweaks.grade] || GRADES.mono }}
        />
      </div>

      <div className="rv-frame" />

      <div className="rv-ui">
        {/* TOP */}
        <div className="rv-top">
          <span>{event.issueTop}</span>
          <span className="mid">{event.edicion}</span>
          <span>{event.ageTop}</span>
        </div>
        <div className="rv-hair" />

        {/* MASTHEAD */}
        <div className="rv-mast">
          <h1>{event.masthead}</h1>
          <div className="tagline">{event.tagline}</div>
        </div>

        {/* número marca de agua */}
        <div className="rv-issue">{event.issueBig}</div>

        {/* COVERLINES IZQ */}
        <div className="rv-side l">
          <div className="rv-cl"><div className="k">{event.l1k}</div><h3>{event.l1h}</h3><p>{event.l1p}</p></div>
          <div className="rv-cl"><div className="k">{event.l2k}</div><h3>{event.l2h}</h3><p>{event.l2p}</p></div>
          <div className="rv-cl"><div className="k">{event.l3k}</div><h3>{event.l3h}</h3><p>{event.l3p}</p></div>
        </div>

        {/* COVERLINES DER */}
        <div className="rv-side r">
          <div className="rv-cl"><div className="k">{event.r1k}</div><h3>{event.r1h}</h3><p>{event.r1p}</p></div>
          <div className="rv-cl"><div className="k">{event.r2k}</div><h3>{event.r2h}</h3><p>{event.r2p}</p></div>
        </div>

        {/* SELLO PROHIBIDA */}
        <div className="rv-seal">
          <svg className="ring" viewBox="0 0 176 176">
            <defs><path id="rvring" d="M88,14 a74,74 0 1,1 -0.1,0" /></defs>
            <text><textPath href="#rvring" startOffset="0">CONTENIDO EXCLUSIVO · SOLO SOCIOS · FRATE · </textPath></text>
          </svg>
          <div className="in">
            <div className="big" dangerouslySetInnerHTML={html('sealBig')} />
            <div className="sm">{event.sealSm}</div>
          </div>
        </div>

        {/* COVERLINE PRINCIPAL */}
        <div className="rv-hero">
          <div className="over">{event.heroOver}</div>
          <h2 dangerouslySetInnerHTML={html('heroTitle')} />
          <div className="sub">{event.heroSub}</div>
          <div className="credit">{event.heroCredit}</div>
        </div>

        {/* FOOTER */}
        <div className="rv-foot">
          <div className="info"><b>{event.site}</b><br /><span>{event.meta}</span></div>
          <div className="rv-price">
            <div>
              <div className="rv-barcode">
                {barcode.map((b, i) => <i key={i} style={{ width: `${b.w}px`, opacity: b.o }} />)}
              </div>
              <div className="lbl">{event.barLbl}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rv-grain" />
    </div>
  )
}

export const TEMPLATE = {
  id: 'revista',
  name: 'Revista PROHIBIDA',
  Component: FlyerRevista,
  stageClass: 'rv-stage',
  size: () => [1080, 1620],
  tweaksDefault: { accent: '#d9b46a', grade: 'mono' },
  eventDemo: {
    issueTop: 'Nº 04 · MAYO 2026', edicion: 'EDICIÓN NOCTURNA', ageTop: '+18 · CHILE',
    masthead: 'PROHIBIDA', tagline: 'REVISTA UNIVERSITARIA · FRATE CAMPUS CENTRAL', issueBig: '04',
    l1k: 'PORTADA', l1h: 'La chica de la pista', l1p: 'Perfil de quien nadie pudo dejar de mirar',
    l2k: 'TENDENCIA', l2h: 'Vestir para la madrugada', l2p: 'El código: tu mejor versión',
    l3k: 'PLAYLIST', l3h: 'Lo que sonará', l3p: 'Perreo, nostalgia y himnos de cierre',
    r1k: 'CONFIDENCIAL', r1h: 'Se busca portada', r1p: 'Etiqueta a tu candidat@ del mes',
    r2k: 'AGENDA', r2h: 'Sábado 02 · 11 PM', r2p: 'Pista central · cupos limitados',
    sealBig: 'PROHIBIDA<br>SU VENTA', sealSm: 'A ADULTOS ABURRIDOS',
    heroOver: 'EXCLUSIVA DEL MES', heroTitle: 'ME ENCANTA <em>TU</em> SONRISA',
    heroSub: 'La noche que todos fingen que no esperaban. Perfil íntimo de la pista, el deseo y el after.',
    heroCredit: 'FOTOGRAFÍA · FRATE STUDIO — ESTILISMO · LA NOCHE',
    site: 'WWW.FRATE.CL', meta: 'ACCESO +18 · DRESS CODE ESTRICTO', barLbl: 'FRATE · 02 · MAYO',
  },
  samples: [
    { heroTitle: 'ME ENCANTA <em>TU</em> SONRISA', heroOver: 'EXCLUSIVA DEL MES', l1h: 'La chica de la pista', issueBig: '04', issueTop: 'Nº 04 · MAYO 2026', barLbl: 'FRATE · 02 · MAYO' },
    { heroTitle: 'NADIE BAILA <em>COMO</em> TÚ', heroOver: 'PERFIL DE LA NOCHE', l1h: 'El rey del after', issueBig: '05', issueTop: 'Nº 05 · JUNIO 2026', barLbl: 'FRATE · 15 · JUNIO' },
    { heroTitle: 'NO TIENE <em>DUEÑ@</em>', heroOver: 'MANIFIESTO', l1h: 'Libertad en la pista', issueBig: '06', issueTop: 'Nº 06 · JULIO 2026', barLbl: 'FRATE · 07 · JULIO' },
  ],
  controls: [
    { type: 'swatch', key: 'accent', label: 'Foil (acento)', colors: ACCENTS },
    { type: 'seg', key: 'grade', label: 'Grade de foto', options: GRADE_LABELS },
  ],
  regenCycle: { key: 'accent', values: ACCENTS, random: false },
}

export default FlyerRevista
