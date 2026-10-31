// ═══════════════════════════════════════════════════════════════════
// FlyerREC — plantilla "REC / Diagnóstico forense" en React.
// Réplica 1:1 del prototipo hi-fi (Flyer REC Diagnostico.html): mismas
// clases y estructura DOM sobre base.css; los datos entran por props
// (EVENT + TWEAKS) en vez de fillData() imperativo.
// Vara de fidelidad: design_handoff_frate_flyers/screenshots/01-rec-diagnostico.png
// ═══════════════════════════════════════════════════════════════════
import { useMemo } from 'react'
import '../base.css'
import '../../lib/image-slot.js'
import {
  FORMATS, KW_FONTS, KW_LABELS, TITLE_STYLE_LABELS, SONG_STYLE_LABELS,
  paletteColors, PALETTES, REC_EVENT_DEMO, REC_TWEAKS_DEFAULT, REC_SAMPLES,
} from '../../lib/flyerData.js'
import { qrSvg } from '../../lib/qr.js'

// ── Canción: 3 estilos seleccionables (songStyle) ────────────────────
function Song({ event, style }) {
  const t = event.songTitle
  const a = event.songArtist
  if (style === 'spectrum') {
    // barras pseudo-aleatorias deterministas (misma semilla del prototipo)
    let seed = 11
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const bars = Array.from({ length: 30 }, (_, i) => (
      <i key={i} style={{ height: `${(22 + rnd() * 78).toFixed(0)}%` }} />
    ))
    return (
      <div className="song-spectrum">
        <div className="ss-label">AUDIO DETECTADO</div>
        <div className="ss-wave">{bars}</div>
        <div className="ss-title">{t}</div>
        <div className="ss-artist">{a}</div>
      </div>
    )
  }
  if (style === 'editorial') {
    return (
      <div className="song-editorial">
        <div className="se-kicker">SUENA EN LA PISTA</div>
        <div className="se-title">{t}</div>
        <div className="se-artist">— {a}</div>
      </div>
    )
  }
  return (
    <div className="song-player">
      <div className="sp-play">▶</div>
      <div className="sp-info">
        <div className="sp-kicker">SONANDO EN LA PISTA</div>
        <div className="sp-title">{t}</div>
        <div className="sp-artist">{a}</div>
        <div className="sp-bar"><i /></div>
      </div>
    </div>
  )
}

function FlyerREC({ event, tweaks }) {
  const pal = paletteColors(tweaks.palette)
  const [w, h] = FORMATS[tweaks.format] || FORMATS.story

  const canvasClass = [
    'fr-canvas',
    `fmt-${tweaks.format || 'story'}`,
    `kw-${tweaks.keywordFont || 'bungee'}`,
    tweaks.showChat ? '' : 'hide-chat',
    tweaks.showHud ? '' : 'hide-hud',
  ].filter(Boolean).join(' ')

  // Vars CSS del tema en el lienzo — el CSS del sistema hace el resto
  const canvasStyle = {
    '--accent': pal[0],
    '--accent-2': pal[1],
    '--accent-3': pal[2],
    '--f-keyword': KW_FONTS[tweaks.keywordFont] || KW_FONTS.bungee,
    width: w, height: h,
  }

  const analysisTotal = 30
  const analysisOn = Math.round(analysisTotal * (event.analysisPct ?? 99) / 100)
  const qrMarkup = useMemo(() => ({ __html: qrSvg(event.qrUrl || 'https://www.frate.cl') }), [event.qrUrl])

  return (
    <div className={canvasClass} id="canvas" style={canvasStyle}>

      {/* FONDO */}
      <div className="fr-photo">
        <image-slot id="frate-face" shape="rounded" radius="0" placeholder="ARRASTRA EL ROSTRO AQUÍ · FULL-BLEED" src={event.faceSrc || undefined} />
      </div>
      <div className="fr-flare" />

      {/* CONTENIDO */}
      <div className="fr-content">
        <div className="fr-topbar">
          <div className="fr-rec">
            <div className="fr-rec-row"><span className="fr-dot" /><span className="fr-rec-label">{event.rec}</span></div>
            <span className="fr-mono-sm">{event.fps}</span>
          </div>
          <div className="fr-logo-top"><img src="/assets/logo-fraternidad.png" alt="Fraternidad Campus Central" /></div>
          <div className="fr-cam">
            <div className="fr-battery"><i /><i /><i /><i /></div>
            <span className="fr-mono-sm">{event.timecode}</span>
            <span className="fr-mono-sm">{event.zone}</span>
          </div>
        </div>

        {/* FOOTER */}
        <div className="fr-footer">
          <div className="fr-foot-main">
            <div className="fr-date">
              <div className="fr-date-day">{event.dateDay}</div>
              <div className="fr-date-main"><span className="fr-date-num">{event.dateNum}</span><span className="fr-date-month">{event.dateMonth}</span></div>
              <div className="fr-date-time">{event.time}</div>
            </div>
            <div className="fr-logo-frate">
              <image-slot id="frate-logo" shape="rounded" radius="6" placeholder="LOGO FRATE (arrastra PNG/SVG)" src={event.logoSrc || undefined} />
            </div>
            <div className="fr-tags">
              {(event.tags || []).map((t, i) => (
                <div key={i}><span>{t[0]}</span>{t.slice(1)}</div>
              ))}
            </div>
          </div>

          <div className="fr-strip">
            <div className="fr-concurso">
              <h4>{event.concursoTitle}</h4>
              <p>{event.concursoText}</p>
              <div className="fr-prizes">
                {(event.prizes || []).map((p, i) => (
                  <span key={i} style={{ display: 'contents' }}>
                    {i > 0 && <span className="fr-plus">+</span>}
                    <div className="fr-prize"><b>{p.n}</b><small>{p.label}</small></div>
                  </span>
                ))}
              </div>
            </div>

            <div className="fr-mid">
              <div className="fr-song"><Song event={event} style={tweaks.songStyle} /></div>
              <div className="fr-handle">{event.handle}</div>
              <div className="fr-socials"><i>IG</i><i>TT</i><i>SP</i><i>YT</i></div>
            </div>

            <div className="fr-entradas">
              <div className="fr-qr" dangerouslySetInnerHTML={qrMarkup} />
              <div className="fr-qr-cap">ENTRADAS · <span>{event.qrCap}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* HUD IZQUIERDA */}
      <div className="fr-hud">
        <div className="fr-card">
          <div className="fr-card-row">
            <div className="fr-eye"><image-slot id="frate-eye" shape="circle" placeholder="ojo" style={{ width: '100%', height: '100%' }} src={event.eyeSrc || undefined} /></div>
            <div style={{ flex: 1 }}>
              <div className="fr-card-label">{event.hudEyeLabel}</div>
              <svg className="fr-heart-line" viewBox="0 0 160 24" preserveAspectRatio="none"><polyline points="0,12 30,12 40,3 50,21 60,7 70,15 80,12 110,12 120,5 128,17 136,12 160,12" /></svg>
            </div>
          </div>
        </div>
        <div className="fr-card"><div className="fr-card-label">{event.impactoLabel}</div><div className="fr-card-val fr-val-accent">{event.impacto}</div></div>
        <div className="fr-card"><div className="fr-card-label">{event.peligroLabel}</div><div className="fr-card-val">{event.peligro}</div></div>
        <div className="fr-card">
          <div className="fr-card-row"><span className="fr-pin">◈</span><div className="fr-card-label">{event.ubicLabel}</div></div>
          <div className="fr-card-val" style={{ fontSize: 24, marginTop: 6 }}>{event.ubic}</div>
          <div className="fr-card-label">{event.ubicSub}</div>
        </div>
        <div className="fr-card"><div className="fr-card-label">{event.horaLabel}</div><div className="fr-card-val fr-val-accent" style={{ fontSize: 26 }}>{event.hora}</div></div>
      </div>

      {/* CHAT */}
      <div className="fr-chat">
        <div className="fr-typing">{event.typing} <b /><b /><b /></div>
        {(event.chat || []).map((m, i) => (
          <div key={i} className={`fr-bubble ${m.side === 'out' ? 'fr-out' : 'fr-in'}`}>
            {m.text}
            <span className="t">{m.time}{m.seen && <span> <span className="fr-check">✓✓</span></span>}</span>
          </div>
        ))}
      </div>

      {/* TÍTULO */}
      <div className={`fr-title ts-${tweaks.titleStyle || 'aligned'}`}>
        <div className="fr-title-pre">{event.titlePre}</div>
        <div className="fr-title-1"><span>{event.titleLine1}</span> <span className="fr-title-tu">{event.titleTu}</span></div>
        <div className="fr-title-2"><span>{event.titleKeyword}</span><span className="fr-title-heart">♡</span></div>
        <div className="fr-concept" dangerouslySetInnerHTML={{ __html: event.concept || '' }} />
        <div className="fr-analysis">
          <div className="fr-analysis-label">{event.analysisLabel}</div>
          <div className="fr-bar">
            {Array.from({ length: analysisTotal }, (_, i) => (
              <span key={i} className={`seg${i < analysisOn ? '' : ' off'}`} />
            ))}
            <span className="pct">{event.analysisPct}%</span>
          </div>
        </div>
      </div>

      {/* frame + overlays */}
      <div className="fr-corners"><i /><i /><i /><i /></div>
      <div className="fr-scan" />
      <div className="fr-grain" />
    </div>
  )
}

export const TEMPLATE = {
  id: 'rec',
  name: 'REC · Diagnóstico',
  Component: FlyerREC,
  stageClass: 'fr-stage',
  size: (tweaks) => FORMATS[tweaks.format] || FORMATS.story,
  tweaksDefault: REC_TWEAKS_DEFAULT,
  eventDemo: REC_EVENT_DEMO,
  samples: REC_SAMPLES,
  controls: [
    { type: 'format' },
    { type: 'palette' },
    { type: 'seg', key: 'titleStyle', label: 'Presentación del título', options: TITLE_STYLE_LABELS },
    { type: 'seg', key: 'songStyle', label: 'Canción / artista', options: SONG_STYLE_LABELS },
    { type: 'seg', key: 'keywordFont', label: 'Fuente palabra clave', options: KW_LABELS },
    { type: 'toggle', key: 'showChat', label: 'Mostrar chat' },
    { type: 'toggle', key: 'showHud', label: 'Mostrar HUD' },
  ],
  regenCycle: { key: 'palette', values: Object.keys(PALETTES), random: true },
}

export default FlyerREC
