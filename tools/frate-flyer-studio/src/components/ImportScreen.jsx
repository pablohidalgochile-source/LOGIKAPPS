// ═══════════════════════════════════════════════════════════════════
// ImportScreen — PASO 1: bandeja de Flyer Express + parámetros del
// evento + selección de plantilla/formato/paleta. NO se teclea nada.
// Lee flyer_express_packages.form_data (Supabase, solo lectura) y cae
// a la bandeja demo si no hay sesión/datos.
// Vara: screenshots/editor-0-importacion.png
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import '../editor/editor.css'
import { PALETTES } from '../lib/flyerData.js'
import { EDITOR_TEMPLATES, TEMPLATE_CATALOG, DEMO_INBOX, buildEvent } from '../editor/editorTemplates.js'
import { fetchInbox, supabaseAvailable } from '../lib/supabase.js'
import { rowToInboxItem } from '../lib/mapExpress.js'

// Bloque de dato con botón copiar
function DataBlock({ label, k, copied, onCopy, children }) {
  return (
    <div className="ed-imp-data-block">
      <div className="ed-imp-data-head">
        <span>{label}</span>
        <button className={'ed-imp-copy' + (copied === k ? ' ok' : '')} onClick={onCopy}>
          {copied === k ? '✓ Copiado' : '📋 Copiar'}
        </button>
      </div>
      {children}
    </div>
  )
}

export default function ImportScreen({ onCreate, session, onSignOut }) {
  const [inbox, setInbox] = useState(null)   // null = cargando
  const [source, setSource] = useState('supabase')
  const [selId, setSelId] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      if (supabaseAvailable && session) {
        try {
          const rows = await fetchInbox()
          if (!alive) return
          if (rows.length) {
            const items = rows.map((r, i) => rowToInboxItem(r, i))
            setInbox(items); setSelId(items[0].id); setSource('supabase')
            return
          }
        } catch (e) { console.warn('[Studio] fetchInbox falló:', e.message) }
      }
      if (!alive) return
      setInbox(DEMO_INBOX); setSelId(DEMO_INBOX[0].id); setSource('demo')
    }
    load()
    return () => { alive = false }
  }, [session])

  const pkg = inbox?.find(p => p.id === selId) || inbox?.[0]
  const ev = pkg?.event

  const [templateId, setTpl] = useState('rec')
  const [format, setFormat] = useState('poster')
  const [palette, setPalette] = useState('rec')
  const [showData, setShowData] = useState(false)
  const [copied, setCopied] = useState('')

  function copy(text, key) {
    if (!text) return
    navigator.clipboard?.writeText(String(text)).then(() => {
      setCopied(key); setTimeout(() => setCopied(''), 1400)
    })
  }

  useEffect(() => {
    if (!pkg) return
    const sug = EDITOR_TEMPLATES[pkg.suggest] ? pkg.suggest : 'rec'
    setTpl(sug)
    setPalette(EDITOR_TEMPLATES[sug].defaultPalette)
  }, [selId, inbox])

  if (!inbox) {
    return (
      <div className="ed-imp" style={{ placeItems: 'center', display: 'grid', gridTemplateColumns: '1fr' }}>
        <div className="ed-mini" style={{ fontSize: 14 }}>Cargando eventos desde Flyer Express…</div>
      </div>
    )
  }

  const meta = [
    ['Fecha', `${ev.dateDay} ${ev.dateNum} ${ev.dateMonth} · ${ev.time}`],
    ['Música', ev.songTitle ? `${ev.songTitle} — ${ev.songArtist}` : '(sin canción — evento conceptual)'],
    ['Concurso', `${ev.concursoText}`],
    ['Premios', (ev.prizes || []).map(p => `${p.n} ${p.label}`).join('  +  ')],
    ['Tags', (ev.tags || []).join(' · ')],
    ['Entradas', `${ev.entUrl}`],
    ['Redes', `${ev.handle}`],
  ]

  return (
    <div className="ed-imp">
      {/* Columna izquierda: bandeja de eventos */}
      <aside className="ed-imp-inbox">
        <div className="ed-imp-brand">FLYER<span> EXPRESS</span></div>
        <div className="ed-imp-inbox-h">Eventos definidos <b>{inbox.length}</b></div>
        <div className="ed-imp-list">
          {inbox.map(p => (
            <div key={p.id} className={'ed-imp-item' + (selId === p.id ? ' sel' : '')} onClick={() => setSelId(p.id)}>
              <div className="ed-imp-night">{p.event.dateDay.slice(0, 3)}<span>{p.event.dateNum}</span></div>
              <div className="ed-imp-item-body">
                <div className="ed-imp-item-title">{p.event.titleLine1} {p.event.titleTu} <b>{p.event.titleKeyword}</b></div>
                <div className="ed-imp-item-meta">{p.id} · {p.createdAt}</div>
              </div>
              <div className={'ed-imp-chip' + (p.status === 'Copy lista' ? ' ok' : '')}>{p.status}</div>
            </div>
          ))}
        </div>
        <div className="ed-imp-inbox-foot">
          Origen: <code>flyer_express_packages.form_data</code> · {source === 'supabase' ? 'Supabase (solo lectura)' : 'DEMO (sin conexión/datos)'}
          {session && <> · <a style={{ color: '#8a8792', cursor: 'pointer' }} onClick={onSignOut}>salir</a></>}
        </div>
      </aside>

      {/* Columna derecha: parámetros leídos + elección de flyer */}
      <main className="ed-imp-main">
        <div className="ed-imp-step">PASO 1 · IMPORTAR</div>
        <h1 className="ed-imp-h1">Parámetros del evento</h1>
        <div className="ed-imp-sub">Se cargaron desde Flyer Express. Elige el tipo de flyer y ábrelo en el editor.</div>

        <div className="ed-imp-summary">
          <div className="ed-imp-sum-kicker">{pkg.id} · {pkg.pkg} · {pkg.createdAt}</div>
          <div className="ed-imp-sum-title">{ev.titleLine1} {ev.titleTu} <em>{ev.titleKeyword}</em></div>
          <div className="ed-imp-sum-concept">{ev.concept}</div>
          <div className="ed-imp-sum-grid">
            {meta.map(([k, v]) => (
              <div className="ed-imp-sum-row" key={k}><span>{k}</span><b>{v}</b></div>
            ))}
          </div>

          <button className="ed-imp-datatoggle" onClick={() => setShowData(s => !s)}>
            {showData ? '▾ Ocultar datos completos' : '▸ Ver todos los datos del evento'}
          </button>

          {showData && (
            <div className="ed-imp-data">
              {ev._caption && (
                <DataBlock label="Caption Instagram" k="caption" copied={copied} onCopy={() => copy(ev._caption, 'caption')}>
                  <pre className="ed-imp-data-pre">{ev._caption}</pre>
                </DataBlock>
              )}
              {ev._lineup?.hasAny && (
                <DataBlock label="Line-up de la noche" k="lineup" copied={copied}
                  onCopy={() => copy([ev.lineupDjs && 'DJs: ' + ev.lineupDjs, ev.lineupPromos && 'Promos: ' + ev.lineupPromos, ev.lineupExtras && 'Extras: ' + ev.lineupExtras].filter(Boolean).join('\n'), 'lineup')}>
                  <div className="ed-imp-data-lu">
                    {ev.lineupDjs && <div><span>DJS</span><b>{ev.lineupDjs}</b></div>}
                    {ev.lineupPromos && <div><span>PROMOS</span><b>{ev.lineupPromos}</b></div>}
                    {ev.lineupExtras && <div><span>EXTRA</span><b>{ev.lineupExtras}</b></div>}
                  </div>
                </DataBlock>
              )}
              {ev._contestTarget && (
                <DataBlock label="A quién se etiqueta" k="target" copied={copied} onCopy={() => copy(ev._contestTarget, 'target')}>
                  <div className="ed-imp-data-txt">{ev._contestTarget}</div>
                </DataBlock>
              )}
              {ev._brief && (
                <DataBlock label="Brief de producción" k="brief" copied={copied} onCopy={() => copy(ev._brief, 'brief')}>
                  <pre className="ed-imp-data-pre">{ev._brief}</pre>
                </DataBlock>
              )}
              {!ev._caption && !ev._lineup?.hasAny && !ev._brief && (
                <div className="ed-imp-data-empty">Este evento aún no tiene caption, operación ni brief.</div>
              )}
            </div>
          )}
        </div>

        <div className="ed-imp-block-h">Elige el tipo de flyer</div>
        <div className="ed-imp-tpl-grid">
          {TEMPLATE_CATALOG.map(t => (
            <div key={t.id}
              className={'ed-imp-tpl' + (t.wired ? '' : ' off') + (templateId === t.id ? ' sel' : '')}
              onClick={() => { if (t.wired) { setTpl(t.id); setPalette(EDITOR_TEMPLATES[t.id].defaultPalette) } }}>
              <b>{t.name}</b>
              <small>{t.sub}</small>
              <span className="ed-imp-tag">{t.wired ? 'Editable' : 'En design system'}</span>
            </div>
          ))}
        </div>

        <div className="ed-imp-controls">
          <div className="ed-fg">
            <div className="ed-field"><label>Formato{EDITOR_TEMPLATES[templateId].fixedFormat ? ' (fijo en esta plantilla)' : ''}</label>
              <select className="ed-select" disabled={EDITOR_TEMPLATES[templateId].fixedFormat}
                value={EDITOR_TEMPLATES[templateId].fixedFormat ? 'poster' : format}
                onChange={e => setFormat(e.target.value)}>
                <option value="story">Historia 9:16</option>
                <option value="carousel">Carrusel 4:5</option>
                <option value="poster">Afiche 2:3</option>
              </select>
            </div>
          </div>
          <div className="ed-fg">
            <label className="ed-mini" style={{ display: 'block', marginBottom: 6 }}>Paleta (3 colores)</label>
            <div className="ed-pals">
              {Object.entries(PALETTES).map(([k, p]) => (
                <div key={k} className={'ed-pal' + (palette === k ? ' sel' : '')} title={p.name} onClick={() => setPalette(k)}>
                  {p.colors.map((c, i) => <i key={i} style={{ background: c }} />)}
                </div>
              ))}
            </div>
          </div>
          <button className="ed-btn primary ed-imp-go" onClick={() => {
            const tpl = EDITOR_TEMPLATES[templateId]
            onCreate({
              templateId,
              format: tpl.fixedFormat ? 'poster' : format,
              palette,
              keywordFont: tpl.keywordFontDefault || 'bungee',
              event: buildEvent(templateId, { ...ev }),
            })
          }}>
            Abrir en el editor →
          </button>
        </div>
      </main>
    </div>
  )
}
