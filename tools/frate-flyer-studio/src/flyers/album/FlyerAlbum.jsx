// ═══════════════════════════════════════════════════════════════════
// FlyerAlbum — "Álbum de figuritas" (Colección Noche). Grilla de cromos
// con hueco troquelado + cromo especial holográfico + feature del evento.
// Réplica de Flyer Album.html (album.css).
// Vara: design_handoff_frate_flyers/screenshots/06-album-figuritas.png
// ═══════════════════════════════════════════════════════════════════
import './album.css'
import '../../lib/image-slot.js'

const ACCENTS = ['#ff3d7f', '#2ec4ff', '#ffd23d', '#39ff7d', '#a44bff']

function FlyerAlbum({ event, tweaks }) {
  const canvasStyle = { '--accent': tweaks.accent || '#ff3d7f', width: 1080, height: 1620 }
  const pct = Math.round(100 * (event.collected ?? 0) / (event.total || 5))

  return (
    <div className="al-canvas" id="canvas" style={canvasStyle}>
      <div className="al-pad">

        {/* CABECERA */}
        <div className="al-head">
          <span className="al-badge">{event.badge}</span>
          <span className="al-page">{event.page}</span>
        </div>
        <div className="al-title">
          <div className="k">{event.coleccion}</div>
          <h1>{event.title}</h1>
          <div className="sub">{event.sub}</div>
        </div>

        {/* GRILLA DE CROMOS */}
        <div className="al-grid">
          {(event.stickers || []).map((s, i) => (
            s.state === 'empty' ? (
              <div key={i} className="al-slot al-empty">
                <span className="num">{s.n}</span>
                <div className="ghost" />
                <div className="peg">PEGA AQUÍ</div>
                <div className="role">{s.role}</div>
              </div>
            ) : (
              <div key={i} className="al-slot">
                <span className="num">{s.n}</span>
                <image-slot id={`al-st-${i + 1}`} shape="rect" placeholder="figurita" />
                <div className="role">{s.role}</div>
              </div>
            )
          ))}

          {/* cromo especial (foil) */}
          <div className="al-slot foil">
            <span className="num">037</span>
            <span className="star">★</span>
            <image-slot id="al-foil" shape="rect" placeholder="cromo especial" src={event.faceSrc || undefined} />
            <div className="role">EDICIÓN LIMITADA</div>
          </div>

          {/* barra feature (evento) */}
          <div className="al-feature">
            <div className="al-feat-l">
              <div className="k">{event.featureKicker}</div>
              <h2>{event.featureTitle}</h2>
              <div className="concept">{event.featureConcept}</div>
            </div>
            <div className="al-feat-r">
              <div className="al-chip"><span className="ic">{event.dateNum}</span><span className="tx">{event.dateTxt}<small>{event.time}</small></span></div>
              <div className="al-chip"><span className="ic b3">{event.prizeIc}</span><span className="tx">{event.prize}<small>{event.prizeSub}</small></span></div>
              <div className="al-chip"><span className="ic b2">#</span><span className="tx">{event.contest}<small>{event.contestSub}</small></span></div>
            </div>
          </div>
        </div>

        {/* PIE */}
        <div className="al-foot">
          <div className="al-progress">
            <div className="lab"><span>{event.progLab}</span><span>{event.collected} / {event.total}</span></div>
            <div className="al-bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="al-brand">
            <div className="fr">{event.brand}</div>
            <div className="web">{event.web}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const TEMPLATE = {
  id: 'album',
  name: 'Álbum figuritas',
  Component: FlyerAlbum,
  stageClass: 'al-stage',
  size: () => [1080, 1620],
  tweaksDefault: { accent: '#ff3d7f' },
  eventDemo: {
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
    featureTitle: 'ME ENCANTA TU SONRISA',
    featureConcept: 'La figurita que todos quieren pegar.',
    dateNum: '02', dateTxt: 'SÁBADO 02 MAYO', time: '11 PM – 05 AM',
    prizeIc: '1', prize: 'BOTELLA PREMIUM', prizeSub: 'al completar el álbum',
    contest: 'ETIQUETA', contestSub: 'a quien te falta pegar',
    progLab: 'TU COLECCIÓN', collected: 2, total: 5,
    brand: 'FRATE', web: 'WWW.FRATE.CL',
  },
  samples: [
    { title: 'LA PISTA', featureTitle: 'ME ENCANTA TU SONRISA', coleccion: 'COLECCIÓN NOCHE 2026', dateTxt: 'SÁBADO 02 MAYO', dateNum: '02', collected: 2 },
    { title: 'EL AFTER', featureTitle: 'NADIE BAILA COMO TÚ', coleccion: 'COLECCIÓN INVIERNO 2026', dateTxt: 'VIERNES 15 MAYO', dateNum: '15', collected: 4 },
    { title: 'EL CRUSH', featureTitle: 'NO TIENE DUEÑ@', coleccion: 'COLECCIÓN LEYENDAS', dateTxt: 'SÁBADO 07 JUNIO', dateNum: '07', collected: 1 },
  ],
  controls: [
    { type: 'swatch', key: 'accent', label: 'Color colección', colors: ACCENTS },
  ],
  regenCycle: { key: 'accent', values: ACCENTS, random: false },
}

export default FlyerAlbum
