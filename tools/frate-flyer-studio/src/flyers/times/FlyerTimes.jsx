// ═══════════════════════════════════════════════════════════════════
// FlyerTimes — "The Frate Times", portada de diario nocturno.
// Réplica de Flyer FRATE Times.html (frate-times.css). Papel prensa,
// editorial B/N + un acento (sello). Tweak: color del sello (--stamp).
// Vara: design_handoff_frate_flyers/screenshots/04-frate-times.png
// ═══════════════════════════════════════════════════════════════════
import './frate-times.css'
import '../../lib/image-slot.js'
import { seededBars } from '../../lib/flyerData.js'

const STAMPS = ['#ff2d78', '#e5342b', '#1f6dff', '#0f9d58', '#111111']

function FlyerTimes({ event, tweaks }) {
  const canvasStyle = { '--stamp': tweaks.stamp || '#ff2d78', width: 1080, height: 1620 }
  const barcode = seededBars(5, 40)
  const html = (k) => ({ __html: event[k] || '' })

  return (
    <div className="ft-canvas" id="canvas" style={canvasStyle}>
      <div className="ft-pad">

        {/* FOLIO */}
        <div className="ft-folio">
          <span>{event.vol}</span>
          <span className="c">{event.edicion}</span>
          <span>{event.precio}</span>
        </div>
        <div className="ft-rule dbl" />

        {/* MASTHEAD */}
        <div className="ft-mast"><h1>{event.masthead}</h1></div>
        <div className="ft-rule" />
        <div className="ft-dateline">
          <span><b>{event.place}</b></span>
          <span className="mid">{event.motto}</span>
          <span>{event.fecha}</span>
        </div>
        <div className="ft-rule" />

        {/* ÚLTIMA HORA */}
        <div className="ft-breaking">
          <span className="tag">{event.breakingTag}</span>
          <span className="txt">{event.breakingTxt}</span>
        </div>

        {/* TITULAR */}
        <div className="ft-head">
          <h2 dangerouslySetInnerHTML={html('headline')} />
          <div className="ft-deck">{event.deck}</div>
        </div>
        <div className="ft-byline">{event.byline}</div>

        {/* CUERPO */}
        <div className="ft-body">
          {/* Columna 1: texto */}
          <div className="ft-col">
            <p>{event.col1a}</p>
            <p>{event.col1b}</p>
            <div className="ft-quote">{event.quote}</div>
            <p>{event.col1c}</p>
            <p>{event.col1d}</p>
          </div>

          {/* Columna 2-3: foto + subtítulos */}
          <div className="ft-photo">
            <div className="ft-kicker">{event.kicker}</div>
            <image-slot id="ft-face" shape="rect" placeholder="ARRASTRA LA FOTO DE PORTADA" src={event.faceSrc || undefined} />
            <div className="halftone" />
            <div className="cap"><b>{event.capBold}</b> <span>{event.capText}</span></div>
            <div className="ft-classified">
              <h3>{event.classTitle}</h3>
              <p>{event.classText}</p>
              <div className="win"><span>{event.prize}</span></div>
            </div>
          </div>
        </div>

        {/* SECUNDARIAS */}
        <div className="ft-briefs">
          <div className="lbl">{event.briefsLbl}</div>
          <div className="cols">
            <div className="ft-brief"><div className="k">{event.b1k}</div><h4>{event.b1h}</h4><p>{event.b1p}</p></div>
            <div className="ft-brief"><div className="k">{event.b2k}</div><h4>{event.b2h}</h4><p>{event.b2p}</p></div>
            <div className="ft-brief"><div className="k">{event.b3k}</div><h4>{event.b3h}</h4><p>{event.b3p}</p></div>
          </div>
        </div>
        <div className="ft-foot">
          <div className="l"><b>{event.site}</b><br /><span>{event.meta}</span></div>
          <div className="brand"><div className="fr">{event.brand}</div><div className="sub">{event.brandSub}</div></div>
          <div className="price">
            <div className="ft-barcode">
              {barcode.map((b, i) => <i key={i} style={{ width: `${b.w}px`, opacity: b.o }} />)}
            </div>
          </div>
        </div>
      </div>

      {/* SELLO */}
      <div className="ft-stamp">
        <div className="in">
          <span className="big" dangerouslySetInnerHTML={html('stampBig')} />
          <span className="sm">{event.stampSm}</span>
          <span className="date">{event.stampDate}</span>
        </div>
      </div>
    </div>
  )
}

export const TEMPLATE = {
  id: 'times',
  name: 'Frate Times',
  Component: FlyerTimes,
  stageClass: 'ft-stage',
  size: () => [1080, 1620],
  tweaksDefault: { stamp: '#0f9d58' },
  eventDemo: {
    vol: 'VOL. IV — Nº 042', edicion: 'EDICIÓN NOCTURNA', precio: 'EJEMPLAR GRATUITO',
    masthead: 'The Frate Times', place: 'CAMPUS CENTRAL · SANTIAGO', motto: '“El diario oficial de la noche”',
    fecha: 'SÁBADO 02 DE MAYO',
    breakingTag: 'ÚLTIMA HORA', breakingTxt: 'Se reportan sonrisas peligrosas en la pista principal',
    headline: 'ME ENCANTA <em>TU</em> SONRISA',
    deck: 'Testigos aseguran que “se les olvidó todo” apenas comenzó a sonar el perreo. Autoridades del campus piden asistir con actitud.',
    byline: 'POR LA REDACCIÓN DE PISTA · FOTOGRAFÍA: PAPARAZZI FRATE · SECCIÓN NOCTURNA',
    col1a: 'Todo comenzó pasadas las once. Fuentes cercanas a la pista confirman que el ambiente escaló minuto a minuto hasta volverse, según sus palabras, “absolutamente incontrolable”.',
    col1b: 'El caso —catalogado como MIRADA 7.2B— mantiene al campus en alerta romántica. Se recomienda no hacer contacto visual prolongado sin estar dispuesto a bailar.',
    quote: '“Nunca vi a nadie irse temprano.”',
    col1c: 'La redacción insiste: quien llega, se queda. Y quien se queda, vuelve el sábado siguiente.',
    col1d: 'Los reportes preliminares hablan de miradas cruzadas, canciones dedicadas y al menos un “nos vemos en FRATE” que lo cambió todo. Se esperan más antecedentes durante la madrugada.',
    kicker: 'EXCLUSIVA DE PORTADA',
    capBold: 'CAPTADA EN VIVO:', capText: 'la protagonista de la noche, momentos antes de que sonara su canción.',
    classTitle: 'CLASIFICADOS · CONCURSO',
    classText: 'SE BUSCA: la próxima portada. Etiqueta a quien debería salir en la edición del sábado.',
    prize: 'GANA CABINA + BOTELLA',
    briefsLbl: '— EN ESTA EDICIÓN —',
    b1k: 'SOCIEDAD', b1h: 'La pista no da abasto', b1p: 'Vecinos reportan perreo sostenido hasta el amanecer. No se descartan réplicas el sábado.',
    b2k: 'OPINIÓN', b2h: 'Cómo entrar en personaje', b2p: 'Editorial: llegar con actitud, perder la vergüenza y bailar como si nadie cobrara mañana.',
    b3k: 'CARTELERA', b3h: 'Agenda de la noche', b3p: '11 PM apertura · 01 AM show central · 05 AM cierre. Cupos limitados por edición.',
    site: 'WWW.FRATE.CL', meta: 'ACCESO +18 · DRESS CODE: TU MEJOR VERSIÓN',
    brand: 'FRATE', brandSub: 'CAMPUS CENTRAL',
    stampBig: 'EDICIÓN<br>LIMITADA', stampSm: 'CAMPUS CENTRAL', stampDate: '02 · MAYO',
  },
  samples: [
    { headline: 'ME ENCANTA <em>TU</em> SONRISA', breakingTxt: 'Se reportan sonrisas peligrosas en la pista principal', quote: '“Nunca vi a nadie irse temprano.”', fecha: 'SÁBADO 02 DE MAYO', stampDate: '02 · MAYO' },
    { headline: 'NADIE BAILA <em>COMO</em> TÚ', breakingTxt: 'Confirmado: la pista no da abasto con tanto flow', quote: '“Llegué por una hora y volví el jueves.”', fecha: 'VIERNES 15 DE MAYO', stampDate: '15 · MAYO' },
    { headline: 'NO TIENE <em>DUEÑ@</em>', breakingTxt: 'Alerta: exceso de actitud detectado en la entrada', quote: '“Vine a bailar, no a explicar.”', fecha: 'SÁBADO 07 DE JUNIO', stampDate: '07 · JUNIO' },
  ],
  controls: [
    { type: 'swatch', key: 'stamp', label: 'Sello / acento', colors: STAMPS },
  ],
  regenCycle: { key: 'stamp', values: STAMPS, random: false },
}

export default FlyerTimes
