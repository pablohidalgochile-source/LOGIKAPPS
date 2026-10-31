// ═══════════════════════════════════════════════════════════════════
// Editor — PASO 2, editor tipo Photoshop (port 1:1 del prototipo
// editor/app.jsx + panels.jsx). Fit-to-screen al abrir, toolbar
// vertical, tabs Capas/Propiedades/Tweaks, historial, badge de zoom.
// Vara: screenshots/editor-2-capas / -3-propiedades / -4-tweaks
// ═══════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback } from 'react'
import './editor.css'
import { FORMATS, PALETTES, paletteColors } from '../lib/flyerData.js'
import { EDITOR_TEMPLATES, EDITOR_SAMPLES } from './editorTemplates.js'
import EditorCanvas, { resolveLayers } from './EditorCanvas.jsx'

/* ---------- Toolbar (herramientas) ---------- */
function Toolbar({ tool, setTool, act }) {
  const T = (id, icon, title, on) => (
    <button key={id} className={'ed-tool' + (tool === id ? ' active' : '')} title={title}
      onClick={() => (on ? on() : setTool(id))}>{icon}</button>
  )
  return (
    <div className="ed-tools">
      {T('select', '▹', 'Seleccionar / mover (V)')}
      {T('text', 'T', 'Agregar texto', act.addText)}
      {T('image', '🖼', 'Agregar imagen', act.addImage)}
      <div className="ed-tool-sep" />
      {T('dup', '⧉', 'Duplicar', act.duplicate)}
      {T('del', '🗑', 'Borrar', act.remove)}
      <div className="ed-tool-sep" />
      {T('alignH', '⊟', 'Centrar horizontal', act.alignH)}
      {T('alignV', '⊞', 'Centrar vertical', act.alignV)}
      <div className="ed-tool-sep" />
      {T('undo', '↺', 'Deshacer', act.undo)}
      {T('redo', '↻', 'Rehacer', act.redo)}
      <div className="ed-tool-sep" />
      {T('zin', '＋', 'Acercar', act.zoomIn)}
      {T('zout', '－', 'Alejar', act.zoomOut)}
      {T('zfit', '⤢', 'Ajustar', act.zoomFit)}
    </div>
  )
}

/* ---------- Panel de Capas (Fase 2: drag-reorder + acciones) ---------- */
function LayersPanel({ layers, selectedId, onSelect, onToggleVis, onUp, onDown, onToFront, onToBack, onReorder, onDuplicate, onToggleLock, onRename, onDelete }) {
  const ordered = [...layers].sort((a, b) => b.z - a.z)   // frente arriba
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [editingName, setEditingName] = useState(null)

  function onRowPointerDown(e, id) {
    if (e.target.closest('.ic') || e.target.closest('input')) return
    setDragId(id)
    const rows = e.currentTarget.parentElement
    function move(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.ed-lyr')
      setOverId(el?.dataset?.id || null)
    }
    function up(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.ed-lyr')
      const toId = el?.dataset?.id
      if (toId && toId !== id) {
        const r = el.getBoundingClientRect()
        onReorder(id, toId, ev.clientY > r.top + r.height / 2)   // soltó en mitad inferior = debajo
      }
      setDragId(null); setOverId(null)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const sel = ordered.find(l => l.id === selectedId)
  return (
    <div className="ed-panel">
      <div className="ed-sec">Capas ({layers.length})</div>
      {sel && (
        <div className="ed-lyr-actions">
          <button title="Traer al frente" onClick={() => onToFront(sel.id)}>⤒</button>
          <button title="Subir (⌘])" onClick={() => onUp(sel.id)}>▲</button>
          <button title="Bajar (⌘[)" onClick={() => onDown(sel.id)}>▼</button>
          <button title="Enviar al fondo" onClick={() => onToBack(sel.id)}>⤓</button>
          <span className="sep" />
          <button title="Duplicar (⌘D)" onClick={() => onDuplicate(sel.id)}>⧉</button>
          <button title={sel.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => onToggleLock(sel.id)}>{sel.locked ? '🔒' : '🔓'}</button>
          <button title="Borrar" className="danger" onClick={() => onDelete(sel.id)}>🗑</button>
        </div>
      )}
      <div className="ed-lyr-list">
        {ordered.map(l => (
          <div key={l.id} data-id={l.id}
            className={'ed-lyr' + (selectedId === l.id ? ' sel' : '') + (dragId === l.id ? ' dragging' : '') + (overId === l.id && dragId ? ' over' : '')}
            onClick={() => onSelect(l.id)}
            onPointerDown={e => onRowPointerDown(e, l.id)}>
            <span className="grip" title="Arrastra para reordenar">⠿</span>
            <span className="ic" onClick={e => { e.stopPropagation(); onToggleVis(l.id) }}>{l.visible ? '👁' : '◌'}</span>
            {editingName === l.id ? (
              <input className="nm-edit" autoFocus defaultValue={l.name}
                onClick={e => e.stopPropagation()}
                onBlur={e => { onRename(l.id, e.target.value); setEditingName(null) }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
            ) : (
              <span className="nm" onDoubleClick={e => { e.stopPropagation(); setEditingName(l.id) }}>
                {l.locked && '🔒 '}{l.name}
              </span>
            )}
            {l.role && l.role !== '-' ? <span className="badge">{l.role}</span> : null}
            {l.isExtra ? <span className="ic" onClick={e => { e.stopPropagation(); onDelete(l.id) }}>✕</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Fase 3: controles de estilo por elemento ---------- */
const FONT_CHOICES = [
  ['', 'Original'], ["'Anton',sans-serif", 'Anton (display)'], ["'Bebas Neue',sans-serif", 'Bebas'],
  ["'Chakra Petch',sans-serif", 'Chakra Petch'], ["'Oswald',sans-serif", 'Oswald'],
  ["'Share Tech Mono',monospace", 'Mono'], ["'Bungee',cursive", 'Bungee'],
  ["'Permanent Marker',cursive", 'Marker'], ["'Playfair Display',serif", 'Playfair'],
  ["'Bodoni Moda',serif", 'Bodoni'], ["'Luckiest Guy',cursive", 'Luckiest Guy'],
]
function ElementStylePanel({ elKey, st, onStyle, onReset, onDone }) {
  const field = String(elKey.split('::')[1] || 'elemento')
  const num = (label, key, min, max, step, unit, def) => (
    <div className="ed-field" key={key}>
      <label>{label}: {st[key] != null ? Math.round(st[key] * (step < 1 ? 100 : 1)) + (unit || '') : '—'}</label>
      <input className="ed-range" type="range" min={min} max={max} step={step}
        value={st[key] ?? def} onChange={e => onStyle({ [key]: parseFloat(e.target.value) })} />
    </div>
  )
  return (
    <div className="ed-panel">
      <div className="ed-el-head">
        <div><div className="ed-sec" style={{ margin: 0 }}>Elemento</div><div className="ed-el-name">{field}</div></div>
        <button className="ed-btn ghost" style={{ padding: '4px 9px', fontSize: 11 }} onClick={onDone}>↩ Capa</button>
      </div>

      <div className="ed-sec">Texto</div>
      <div className="ed-field"><label>Fuente</label>
        <select className="ed-select" value={st.fontFamily ?? ''} onChange={e => onStyle({ fontFamily: e.target.value })}>
          {FONT_CHOICES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
        </select></div>
      {num('Tamaño', 'fontSize', 8, 260, 1, 'px', 40)}
      <div className="ed-row2">
        <div className="ed-field"><label>Peso</label>
          <select className="ed-select" value={st.fontWeight ?? ''} onChange={e => onStyle({ fontWeight: e.target.value })}>
            {['', '300', '400', '500', '600', '700', '800', '900'].map(w => <option key={w} value={w}>{w || 'Orig.'}</option>)}
          </select></div>
        <div className="ed-field"><label>Alineación</label>
          <select className="ed-select" value={st.textAlign ?? ''} onChange={e => onStyle({ textAlign: e.target.value })}>
            {['', 'left', 'center', 'right'].map(a => <option key={a} value={a}>{a || 'Orig.'}</option>)}
          </select></div>
      </div>
      <div className="ed-field"><label>Color de texto</label>
        <div className="ed-color-row">
          <input type="color" className="ed-cp" value={st.color || '#ffffff'} onChange={e => onStyle({ color: e.target.value })} />
          {['#ffffff', '#ff2d78', '#00e5ff', '#b14bff', '#ffd23d', '#39ff7d', '#000000'].map(c =>
            <button key={c} className="ed-swatch" style={{ background: c }} onClick={() => onStyle({ color: c })} />)}
        </div></div>
      {num('Interlineado', 'lineHeight', 0.7, 2, 0.05, '', 1.1)}
      {num('Espaciado', 'letterSpacing', -0.05, 0.5, 0.01, '', 0)}
      <label className="ed-check"><input type="checkbox" checked={st.uppercase || false} onChange={e => onStyle({ uppercase: e.target.checked })} /> MAYÚSCULAS</label>
      <label className="ed-check"><input type="checkbox" checked={st.glow || false} onChange={e => onStyle({ glow: e.target.checked })} /> Sombra / glow</label>
      {st.glow && (
        <div className="ed-field"><label>Color del glow</label>
          <input type="color" className="ed-cp" value={st.glowColor || '#ff2d78'} onChange={e => onStyle({ glowColor: e.target.value })} /></div>
      )}

      <div className="ed-sec">Caja / fondo</div>
      <div className="ed-field"><label>Fondo</label>
        <div className="ed-color-row">
          <input type="color" className="ed-cp" value={st.background || '#000000'} onChange={e => onStyle({ background: e.target.value })} />
          <button className="ed-btn ghost" style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => onStyle({ background: '' })}>Sin fondo</button>
        </div></div>
      <div className="ed-row2">
        <div className="ed-field"><label>Borde</label>
          <input type="color" className="ed-cp" value={st.borderColor || '#ffffff'} onChange={e => onStyle({ borderColor: e.target.value })} /></div>
        {num('Grosor', 'borderWidth', 0, 12, 1, 'px', 0)}
      </div>
      {num('Radio esquinas', 'borderRadius', 0, 60, 1, 'px', 0)}
      {num('Opacidad', 'opacity', 0.1, 1, 0.05, '', 1)}

      <button className="ed-btn" style={{ width: '100%', marginTop: 14 }} onClick={onReset}>↺ Restablecer este elemento</button>
      <div className="ed-mini" style={{ marginTop: 8 }}>Editas <b style={{ color: '#fff' }}>{field}</b>. El texto se cambia con doble clic sobre el flyer.</div>
    </div>
  )
}

/* ---------- Panel de Propiedades ---------- */
function PropsPanel({ sel, onChange, activeEl, activeStyle, onElStyle, onElReset, onElDone }) {
  if (activeEl) return <ElementStylePanel elKey={activeEl} st={activeStyle} onStyle={onElStyle} onReset={onElReset} onDone={onElDone} />
  if (!sel) return <div className="ed-panel"><div className="ed-mini">Selecciona una capa (o un elemento del flyer) para editar.</div></div>
  const num = (label, key, min, max, step, unit) => (
    <div className="ed-field" key={key}>
      <label>{label}: {Math.round((sel[key] ?? 0) * (step < 1 ? 100 : 1))}{unit || ''}</label>
      <input className="ed-range" type="range" min={min} max={max} step={step}
        value={sel[key] ?? 0} onChange={e => onChange({ [key]: parseFloat(e.target.value) })} />
    </div>
  )
  return (
    <div className="ed-panel">
      <div className="ed-sec">{sel.name}</div>
      <div className="ed-row2">
        <div className="ed-field"><label>X</label>
          <input className="ed-input" type="number" value={Math.round(sel.x)} onChange={e => onChange({ x: parseFloat(e.target.value) || 0 })} /></div>
        <div className="ed-field"><label>Y</label>
          <input className="ed-input" type="number" value={Math.round(sel.y)} onChange={e => onChange({ y: parseFloat(e.target.value) || 0 })} /></div>
      </div>
      {num('Rotación', 'rot', -180, 180, 1, '°')}
      {num('Escala', 'scale', 0.2, 3, 0.01)}
      {num('Opacidad', 'opacity', 0, 1, 0.01)}
      {sel.type === 'text' && sel.isExtra && (
        <div>
          <div className="ed-sec">Texto</div>
          <div className="ed-field"><label>Contenido</label>
            <input className="ed-input" value={sel.text || ''} onChange={e => onChange({ text: e.target.value })} /></div>
          {num('Tamaño', 'fontSize', 12, 260, 1, 'px')}
          <div className="ed-field"><label>Fuente</label>
            <select className="ed-select" value={sel.font || 'display'} onChange={e => onChange({ font: e.target.value })}>
              <option value="display">Display (Anton)</option>
              <option value="hud">HUD (Chakra)</option>
              <option value="mono">Mono</option>
              <option value="keyword">Lettering</option>
            </select></div>
          <div className="ed-field"><label>Color</label>
            <input type="color" style={{ width: '100%', height: 34, background: '#0d0d11', border: '1px solid #2a2a33', borderRadius: 7 }}
              value={sel.color || '#ffffff'} onChange={e => onChange({ color: e.target.value })} /></div>
        </div>
      )}

      {/* Fase 4 — ajustes de imagen (rostro, polaroids, logos, fotos subidas) */}
      {sel.type === 'image' && <ImageAdjust sel={sel} onChange={onChange} />}

      {sel.type !== 'text' && sel.type !== 'image' && (
        <div className="ed-mini" style={{ marginTop: 8 }}>
          Haz <b style={{ color: '#fff' }}>clic en un texto del flyer</b> para configurarlo (fuente, color, tamaño…),
          o doble clic para escribir. El color base lo define el rol <b style={{ color: '#fff' }}>{sel.role}</b> en Tweaks.
        </div>
      )}
    </div>
  )
}

/* Fase 4 — panel de ajustes de imagen */
function ImageAdjust({ sel, onChange }) {
  const f = sel.filter || {}
  const setF = (patch) => onChange({ filter: { ...f, ...patch } })
  const slider = (label, key, min, max, step, def, pct) => (
    <div className="ed-field" key={key}>
      <label>{label}: {Math.round((f[key] ?? def) * (pct ? 100 : 1))}{pct ? '%' : ''}</label>
      <input className="ed-range" type="range" min={min} max={max} step={step}
        value={f[key] ?? def} onChange={e => setF({ [key]: parseFloat(e.target.value) })} />
    </div>
  )
  const PRESETS = {
    'Original': {}, 'B&N': { g: 1, c: 1.1 }, 'Cálido': { s: 1.2, b: 1.05, c: 1.05 },
    'Frío': { s: 0.85, b: 0.96, c: 1.08 }, 'Alto contraste': { c: 1.35, s: 1.1 }, 'Suave': { c: 0.92, b: 1.05 },
  }
  return (
    <div>
      <div className="ed-sec">Imagen</div>
      <div className="ed-field"><label>Preset</label>
        <div className="ed-preset-row">
          {Object.entries(PRESETS).map(([name, p]) =>
            <button key={name} className="ed-preset" onClick={() => onChange({ filter: p })}>{name}</button>)}
        </div>
      </div>
      {slider('Brillo', 'b', 0.3, 2, 0.02, 1, true)}
      {slider('Contraste', 'c', 0.3, 2, 0.02, 1, true)}
      {slider('Saturación', 's', 0, 2, 0.02, 1, true)}
      {slider('Blanco y negro', 'g', 0, 1, 0.05, 0, true)}
      {slider('Desenfoque', 'blur', 0, 12, 0.5, 0, false)}
      {sel.isExtra && (
        <div className="ed-field"><label>Ajuste</label>
          <select className="ed-select" value={sel.fit || 'contain'} onChange={e => onChange({ fit: e.target.value })}>
            <option value="contain">Contener</option>
            <option value="cover">Cubrir</option>
            <option value="fill">Estirar</option>
          </select></div>
      )}
      <div className="ed-mini" style={{ marginTop: 6 }}>Para encuadrar la foto: <b style={{ color: '#fff' }}>doble clic</b> sobre ella en el flyer y arrastra.</div>
    </div>
  )
}

/* ---------- Panel de Tweaks ---------- */
function TweaksTab({ doc, onSet, onRegen }) {
  const tpl = EDITOR_TEMPLATES[doc.templateId]
  const custom = Array.isArray(doc.palette) ? doc.palette : (PALETTES[doc.palette] || PALETTES.rec).colors
  const setCustom = (i, v) => { const c = [...custom]; c[i] = v; onSet('palette', c) }
  return (
    <div className="ed-panel">
      <div className="ed-sec">Paleta (3 colores)</div>
      <div className="ed-pals">
        {Object.entries(PALETTES).map(([k, p]) => (
          <div key={k} className={'ed-pal' + (doc.palette === k ? ' sel' : '')} title={p.name} onClick={() => onSet('palette', k)}>
            {p.colors.map((c, i) => <i key={i} style={{ background: c }} />)}
          </div>
        ))}
      </div>
      <div className="ed-colors">
        {custom.map((c, i) => <input key={i} type="color" value={c} onChange={e => setCustom(i, e.target.value)} title={['Dominante (A)', 'Secundario (B)', 'Detalle (C)'][i]} />)}
      </div>
      <div className="ed-mini" style={{ marginTop: 6 }}>A = título · B = HUD/archivo · C = concurso/fecha/tags</div>

      {!tpl.fixedFormat && (
        <>
          <div className="ed-sec">Formato</div>
          <div className="ed-seg">
            {[['story', '9:16'], ['carousel', '4:5'], ['poster', '2:3']].map(([k, l]) => (
              <button key={k} className={doc.format === k ? 'sel' : ''} onClick={() => onSet('format', k)}>{l}</button>
            ))}
          </div>
        </>
      )}

      {!tpl.noKeywordFont && (
        <>
          <div className="ed-sec">Fuente palabra clave</div>
          <div className="ed-seg">
            {[['bungee', 'Urbano'], ['marker', 'Marcador'], ['spray', 'Spray']].map(([k, l]) => (
              <button key={k} className={doc.keywordFont === k ? 'sel' : ''} onClick={() => onSet('keywordFont', k)}>{l}</button>
            ))}
          </div>
        </>
      )}

      <div className="ed-sec">Regeneración</div>
      <button className="ed-btn" style={{ width: '100%' }} onClick={onRegen}>⟳ Regenerar (demo)</button>
      <div className="ed-mini" style={{ marginTop: 8 }}>Cambia textos + paleta de ejemplo, como haría la app con una nueva generación.</div>
    </div>
  )
}

/* ---------- Modal de exportación ---------- */
function ExportModal({ doc, onClose }) {
  const payload = { templateId: doc.templateId, format: doc.format, palette: doc.palette, keywordFont: doc.keywordFont, event: doc.event, layout_overrides: doc.overrides, extras: doc.extras }
  const json = JSON.stringify(payload, null, 2)
  const download = () => { const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json); a.download = 'frate-flyer.json'; a.click() }
  return (
    <div className="ed-modal-bg" onClick={onClose}>
      <div className="ed-modal" onClick={e => e.stopPropagation()}>
        <h3>Exportar diseño</h3>
        <p>
          Este JSON es el diseño completo (template + datos + overrides). Para el PNG final 1080px:
          descárgalo y corre <code style={{ color: '#7fe0a0' }}>npm run export -- --doc=frate-flyer.json</code> (Puppeteer conserva glow/grain/blend).
        </p>
        <textarea readOnly value={json} />
        <div className="ed-modal-actions">
          <button className="ed-btn" onClick={() => window.print()}>Imprimir / PDF</button>
          <button className="ed-btn" onClick={download}>Descargar JSON</button>
          <button className="ed-btn primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 5
const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

/* ═══════════════════ EDITOR ═══════════════════ */
export default function Editor({ initialDoc, onBack, onSave, topOffset = 0 }) {
  const [doc, setDocState] = useState(initialDoc)
  const [selId, setSelId] = useState(null)
  const [activeEl, setActiveEl] = useState(null)   // sub-elemento en edición: "layerId::campo"
  const [tool, setTool] = useState('select')
  const [tab, setTab] = useState('layers')
  const [W, H] = FORMATS[doc.format]
  const [zoom, setZoom] = useState(0.3)
  const [pan, setPan] = useState({ x: 0, y: 0 })   // offset del "mundo" en px de pantalla
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [snapping, setSnapping] = useState(true)
  const [guides, setGuides] = useState({ vx: null, hy: null })
  const [showExport, setShowExport] = useState(false)

  const docRef = useRef(doc); useEffect(() => { docRef.current = doc }, [doc])
  const zoomRef = useRef(zoom); useEffect(() => { zoomRef.current = zoom }, [zoom])
  const panRef = useRef(pan); useEffect(() => { panRef.current = pan }, [pan])
  const past = useRef([]); const future = useRef([])
  const layerEls = useRef({})
  const fileInput = useRef(null)
  const editingRef = useRef(false)
  const wrapRef = useRef(null)   // viewport del lienzo (mide el espacio real)

  /* ---- fit real: mide el viewport, centra, nunca corta ---- */
  const fitView = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const availW = wrap.clientWidth - 80
    const availH = wrap.clientHeight - 80
    const z = clampZoom(Math.min(availW / W, availH / H))
    setZoom(z)
    setPan({ x: (wrap.clientWidth - W * z) / 2, y: (wrap.clientHeight - H * z) / 2 })
  }, [W, H])

  // Fit al montar y cuando cambia el formato; re-fit si cambia el tamaño del viewport
  useEffect(() => { fitView() }, [doc.format])
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    let first = true
    const ro = new ResizeObserver(() => { if (first) { first = false; return } })
    ro.observe(wrap)
    const onWinResize = () => fitView()
    window.addEventListener('resize', onWinResize)
    return () => { ro.disconnect(); window.removeEventListener('resize', onWinResize) }
  }, [fitView])

  // Zoom hacia un punto de pantalla (mx,my relativos al viewport)
  const zoomTo = useCallback((nz, mx, my) => {
    const z0 = zoomRef.current, p0 = panRef.current
    const z = clampZoom(nz)
    setPan({ x: mx - ((mx - p0.x) / z0) * z, y: my - ((my - p0.y) / z0) * z })
    setZoom(z)
  }, [])

  const setDoc = (m, hist = true) => setDocState(prev => { if (hist) { past.current.push(prev); if (past.current.length > 80) past.current.shift(); future.current = [] } return typeof m === 'function' ? m(prev) : m })
  const histPush = () => { past.current.push(docRef.current); if (past.current.length > 80) past.current.shift(); future.current = [] }
  const setLive = (m) => setDocState(prev => (typeof m === 'function' ? m(prev) : m))
  const undo = () => setDocState(prev => { if (!past.current.length) return prev; future.current.push(prev); return past.current.pop() })
  const redo = () => setDocState(prev => { if (!future.current.length) return prev; past.current.push(prev); return future.current.pop() })

  const patchLayer = (id, patch, hist = true) => {
    const isExtra = docRef.current.extras.some(e => e.id === id)
    const fn = prev => isExtra
      ? { ...prev, extras: prev.extras.map(e => e.id === id ? { ...e, ...patch } : e) }
      : { ...prev, overrides: { ...prev.overrides, [id]: { ...prev.overrides[id], ...patch } } }
    hist ? setDoc(fn) : setLive(fn)
  }

  const layers = resolveLayers(doc)
  const sel = layers.find(l => l.id === selId) || null

  /* ═══ FASE 3 — estilo por sub-elemento ═══ */
  // key = "layerId::campo". setLive (sin historial) para sliders fluidos.
  function setElStyle(key, patch) {
    setLive(prev => ({ ...prev, styleOverrides: { ...(prev.styleOverrides || {}), [key]: { ...((prev.styleOverrides || {})[key]), ...patch } } }))
  }
  function clearElStyle(key) {
    setDoc(prev => { const so = { ...(prev.styleOverrides || {}) }; delete so[key]; return { ...prev, styleOverrides: so } })
  }
  const activeStyle = (doc.styleOverrides || {})[activeEl] || {}

  /* ---- arrastre / escala / rotación ---- */
  function startDrag(e, layer) {
    if (editingRef.current || !layer.selectable) return
    e.preventDefault(); e.stopPropagation()
    setSelId(layer.id)
    // sub-elemento bajo el cursor → activarlo para configurar su estilo
    const elNode = e.target.closest('[data-edit]')
    if (elNode) { setActiveEl(layer.id + '::' + elNode.dataset.edit); setTab('props') }
    else setActiveEl(null)
    histPush()
    const sx = e.clientX, sy = e.clientY, ox = layer.x, oy = layer.y
    const el = layerEls.current[layer.id]
    const hh = el ? el.getBoundingClientRect().height / zoom : 60
    function move(ev) {
      let nx = ox + (ev.clientX - sx) / zoom, ny = oy + (ev.clientY - sy) / zoom
      let gv = null, gh = null
      if (snapping) {
        const cx = nx + layer.w / 2, cy = ny + hh / 2, TH = 9 / zoom
        if (Math.abs(cx - W / 2) < TH) { nx = W / 2 - layer.w / 2; gv = W / 2 }
        else if (Math.abs(nx) < TH) { nx = 0; gv = 0 }
        else if (Math.abs(nx + layer.w - W) < TH) { nx = W - layer.w; gv = W }
        if (Math.abs(cy - H / 2) < TH) { ny = H / 2 - hh / 2; gh = H / 2 }
        else if (Math.abs(ny) < TH) { ny = 0; gh = 0 }
      }
      setGuides({ vx: gv, hy: gh })
      patchLayer(layer.id, { x: nx, y: ny }, false)
    }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGuides({ vx: null, hy: null }) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function startResize(e, layer) {
    e.preventDefault(); e.stopPropagation(); histPush()
    const el = layerEls.current[layer.id]; const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1; const s0 = layer.scale
    function move(ev) { const d = Math.hypot(ev.clientX - cx, ev.clientY - cy); patchLayer(layer.id, { scale: Math.max(0.2, Math.min(3, s0 * d / d0)) }, false) }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function startRotate(e, layer) {
    e.preventDefault(); e.stopPropagation(); histPush()
    const el = layerEls.current[layer.id]; const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx); const r0 = layer.rot
    function move(ev) { const a = Math.atan2(ev.clientY - cy, ev.clientX - cx); let deg = r0 + (a - a0) * 180 / Math.PI; if (snapping && Math.abs(deg % 15) < 4) deg = Math.round(deg / 15) * 15; patchLayer(layer.id, { rot: deg }, false) }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  /* ---- edición de texto in-situ ---- */
  function onLayerDblClick(e, layer) {
    const t = e.target.closest('[data-edit],[data-edit-extra]')
    if (!t) return
    e.stopPropagation(); editingRef.current = true
    t.setAttribute('contenteditable', 'true'); t.focus()
    const range = document.createRange(); range.selectNodeContents(t)
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(range)
    function done() {
      t.removeAttribute('contenteditable'); editingRef.current = false
      t.removeEventListener('blur', done)
      const val = t.textContent
      if (t.dataset.editExtra) patchLayer(layer.id, { text: val })
      else setDoc(prev => ({ ...prev, event: { ...prev.event, [t.dataset.edit]: val } }))
    }
    t.addEventListener('blur', done)
  }

  /* ---- acciones toolbar ---- */
  const nextZ = () => Math.max(0, ...layers.map(l => l.z)) + 1
  const act = {
    addText: () => { const id = 't' + Date.now(); setDoc(prev => ({ ...prev, extras: [...prev.extras, { id, name: 'Texto', type: 'text', x: W / 2 - 160, y: H / 2 - 40, w: 320, rot: 0, scale: 1, opacity: 1, visible: true, z: nextZ(), text: 'TEXTO NUEVO', fontSize: 64, color: '#ffffff', font: 'display' }] })); setSelId(id); setTab('props') },
    addImage: () => fileInput.current && fileInput.current.click(),
    duplicate: () => { if (!sel || !sel.isExtra) return; const id = 'c' + Date.now(); setDoc(prev => ({ ...prev, extras: [...prev.extras, { ...sel, id, x: sel.x + 24, y: sel.y + 24, z: nextZ(), isExtra: undefined, selectable: undefined }] })); setSelId(id) },
    remove: () => { if (!sel) return; if (sel.isExtra) { setDoc(prev => ({ ...prev, extras: prev.extras.filter(e => e.id !== sel.id) })); setSelId(null) } else patchLayer(sel.id, { visible: false }) },
    alignH: () => { if (sel) patchLayer(sel.id, { x: W / 2 - sel.w / 2 }) },
    alignV: () => { if (!sel) return; const el = layerEls.current[sel.id]; const hh = el ? el.getBoundingClientRect().height / zoom : 60; patchLayer(sel.id, { y: H / 2 - hh / 2 }) },
    undo, redo,
    zoomIn: () => { const w = wrapRef.current; zoomTo(zoomRef.current * 1.2, w ? w.clientWidth / 2 : 0, w ? w.clientHeight / 2 : 0) },
    zoomOut: () => { const w = wrapRef.current; zoomTo(zoomRef.current / 1.2, w ? w.clientWidth / 2 : 0, w ? w.clientHeight / 2 : 0) },
    zoomFit: fitView,
    zoom100: () => { const w = wrapRef.current; zoomTo(1, w ? w.clientWidth / 2 : 0, w ? w.clientHeight / 2 : 0) },
  }

  function onFile(e) {
    const f = e.target.files[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = () => { const id = 'i' + Date.now(); setDoc(prev => ({ ...prev, extras: [...prev.extras, { id, name: 'Imagen', type: 'image', x: W / 2 - 160, y: H / 2 - 160, w: 320, h: 320, rot: 0, scale: 1, opacity: 1, visible: true, z: nextZ(), src: rd.result }] })); setSelId(id) }
    rd.readAsDataURL(f); e.target.value = ''
  }

  const setTweak = (k, v) => { histPush(); setLive(prev => ({ ...prev, [k]: v })) }
  function regen() {
    const s = EDITOR_SAMPLES[Math.floor(Math.random() * EDITOR_SAMPLES.length)]
    const keys = Object.keys(PALETTES)
    const npal = keys[Math.floor(Math.random() * keys.length)]
    setDoc(prev => ({ ...prev, palette: npal, event: { ...prev.event, ...s } }))
  }

  /* ═══ FASE 2 — reorden de capas (índice real, no z±2) ═══ */
  // Reasigna z = índice a TODAS las capas en el orden dado (base→overrides, extra→objeto)
  function applyOrder(orderedIds) {
    setDoc(prev => {
      const overrides = { ...prev.overrides }
      const baseIds = new Set(EDITOR_TEMPLATES[prev.templateId].layers.map(l => l.id))
      const extrasById = Object.fromEntries(prev.extras.map(e => [e.id, e]))
      const nextExtras = []
      orderedIds.forEach((id, i) => {
        const z = i + 1
        if (baseIds.has(id)) overrides[id] = { ...overrides[id], z }
        else if (extrasById[id]) nextExtras.push({ ...extrasById[id], z })
      })
      // conservar extras que no estuvieran en la lista (por si acaso)
      prev.extras.forEach(e => { if (!orderedIds.includes(e.id)) nextExtras.push(e) })
      return { ...prev, overrides, extras: nextExtras }
    })
  }
  const orderedTopFirst = () => [...layers].sort((a, b) => b.z - a.z).map(l => l.id)  // como el panel
  function moveLayer(id, dir) {   // dir -1 = subir (más al frente) · +1 = bajar
    const arr = orderedTopFirst()
    const i = arr.indexOf(id), j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    applyOrder([...arr].reverse())   // applyOrder espera fondo→frente
  }
  function toFront(id) { const arr = orderedTopFirst().filter(x => x !== id); applyOrder([...arr].reverse().concat(id)) }
  function toBack(id)  { const arr = orderedTopFirst().filter(x => x !== id); applyOrder([id, ...[...arr].reverse()]) }
  function reorderByDrag(fromId, toId, below) {
    const arr = orderedTopFirst().filter(x => x !== fromId)
    let idx = arr.indexOf(toId); if (idx < 0) idx = 0
    arr.splice(below ? idx + 1 : idx, 0, fromId)
    applyOrder([...arr].reverse())
  }

  function duplicateLayer(id) {
    const l = layers.find(x => x.id === id); if (!l) return
    const nid = 'c' + Date.now()
    if (l.isExtra) {
      const src = doc.extras.find(e => e.id === id)
      setDoc(prev => ({ ...prev, extras: [...prev.extras, { ...src, id: nid, x: (src.x || 0) + 24, y: (src.y || 0) + 24, z: nextZ() }] }))
    } else {
      // capa base → se clona como extra "imagen del render" no es viable; clonamos como texto/imagen si aplica
      // (para capas de plantilla, duplicar = crear un texto editable con su nombre — atajo útil)
      setDoc(prev => ({ ...prev, extras: [...prev.extras, { id: nid, name: l.name + ' (copia)', type: 'text', x: l.x + 24, y: l.y + 24, w: l.w, rot: l.rot, scale: l.scale, opacity: 1, visible: true, z: nextZ(), text: l.name.toUpperCase(), fontSize: 48, color: '#ffffff', font: 'display' }] }))
    }
    setSelId(nid)
  }
  const toggleLock = (id) => { const l = layers.find(x => x.id === id); patchLayer(id, { locked: !l.locked }) }
  const renameLayer = (id, name) => patchLayer(id, { nameOverride: name })

  /* ═══ FASE 1 — rueda (zoom hacia cursor / pan) + barra espaciadora ═══ */
  function onWheel(e) {
    const wrap = wrapRef.current; if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {         // ⌘/ctrl o pinch de trackpad → zoom
      e.preventDefault()
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.0018), e.clientX - rect.left, e.clientY - rect.top)
    } else {                              // rueda/trackpad → pan
      e.preventDefault()
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }
  // pan con barra espaciadora (mano) o botón central del mouse
  function onCanvasPointerDownWrap(e) {
    if (spaceDown || e.button === 1) {
      e.preventDefault()
      setPanning(true)
      const sx = e.clientX, sy = e.clientY, p0 = { ...panRef.current }
      const move = ev => setPan({ x: p0.x + (ev.clientX - sx), y: p0.y + (ev.clientY - sy) })
      const up = () => { setPanning(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }
  }

  // ── Atajos de teclado ──────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (editingRef.current) return
      const mod = e.metaKey || e.ctrlKey
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.code === 'Space') { setSpaceDown(true); return }
      if (mod && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); act.zoomIn(); return }
      if (mod && e.key === '-') { e.preventDefault(); act.zoomOut(); return }
      if (mod && e.key === '0') { e.preventDefault(); act.zoom100(); return }
      if (e.key === 'f' || e.key === 'F') { fitView(); return }
      if (selIdRef.current) {
        if (mod && e.key === ']') { e.preventDefault(); moveLayer(selIdRef.current, -1); return }
        if (mod && e.key === '[') { e.preventDefault(); moveLayer(selIdRef.current, 1); return }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act.remove(); return }
        if (mod && e.key === 'd') { e.preventDefault(); duplicateLayer(selIdRef.current); return }
      }
    }
    function onKeyUp(e) { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
  }, [])
  const selIdRef = useRef(selId); useEffect(() => { selIdRef.current = selId }, [selId])

  return (
    <div className="ed-app">
      <div className="ed-top">
        <div className="brand">FRATE<span>·</span></div>
        <div className="tname">{EDITOR_TEMPLATES[doc.templateId].name} · {doc.format}</div>
        <div className="grow" />
        <div className="ed-toggle-row" style={{ gap: 8 }}>
          <span className="ed-mini">Snapping</span>
          <div className={'ed-toggle' + (snapping ? ' on' : '')} onClick={() => setSnapping(s => !s)} />
        </div>
        <button className="ed-btn ghost" onClick={onBack}>← Bandeja</button>
        {onSave && <button className="ed-btn" onClick={() => onSave(doc)}>💾 Guardar</button>}
        <button className="ed-btn primary" onClick={() => setShowExport(true)}>Exportar</button>
      </div>

      <div className="ed-body">
        <Toolbar tool={tool} setTool={setTool} act={act} />

        <div className={'ed-canvas-wrap' + (spaceDown ? ' pan-ready' : '') + (panning ? ' panning' : '')}
          ref={wrapRef} onWheel={onWheel} onPointerDown={onCanvasPointerDownWrap}>
          <div className="ed-world" style={{ width: W, height: H, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
            <EditorCanvas
              doc={doc} zoom={zoom} worldScaled selId={selId} guides={guides}
              activeEl={activeEl}
              layerEls={layerEls}
              onLayerPointerDown={startDrag}
              onLayerDblClick={onLayerDblClick}
              onCanvasPointerDown={() => { if (!editingRef.current && !spaceDown) { setSelId(null); setActiveEl(null) } }}
              onRotateHandle={startRotate}
              onResizeHandle={startResize}
            />
          </div>
          <input ref={fileInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          <div className="ed-zoombadge">
            <button onClick={act.zoomOut} title="Alejar (⌘−)">−</button>
            <span onClick={act.zoomFit} title="Ajustar a pantalla (F)">{Math.round(zoom * 100)}%</span>
            <button onClick={act.zoomIn} title="Acercar (⌘+)">+</button>
            <button className="fit" onClick={act.zoomFit} title="Ajustar (F)">⤢ Ajustar</button>
            <button className="fit" onClick={act.zoom100} title="Tamaño real (⌘0)">1:1</button>
          </div>
          <div className="ed-canvas-hint">⌘ + rueda = zoom · barra espaciadora = mover · F = ajustar</div>
        </div>

        <div className="ed-right">
          <div className="ed-tabs">
            {[['layers', 'Capas'], ['props', 'Propiedades'], ['tweaks', 'Tweaks']].map(([k, l]) => (
              <div key={k} className={'ed-tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</div>
            ))}
          </div>
          {tab === 'layers' && <LayersPanel layers={layers} selectedId={selId} onSelect={id => { setSelId(id); setActiveEl(null) }}
            onToggleVis={id => { const l = layers.find(x => x.id === id); patchLayer(id, { visible: !l.visible }) }}
            onUp={id => moveLayer(id, -1)} onDown={id => moveLayer(id, 1)}
            onToFront={toFront} onToBack={toBack} onReorder={reorderByDrag}
            onDuplicate={duplicateLayer} onToggleLock={toggleLock} onRename={renameLayer}
            onDelete={id => { setDoc(prev => ({ ...prev, extras: prev.extras.filter(e => e.id !== id) })); if (selId === id) setSelId(null) }} />}
          {tab === 'props' && <PropsPanel sel={sel} onChange={patch => patchLayer(selId, patch)}
            activeEl={activeEl} activeStyle={activeStyle}
            onElStyle={patch => setElStyle(activeEl, patch)} onElReset={() => clearElStyle(activeEl)}
            onElDone={() => setActiveEl(null)} />}
          {tab === 'tweaks' && <TweaksTab doc={doc} onSet={setTweak} onRegen={regen} />}
        </div>
      </div>

      {showExport && <ExportModal doc={doc} onClose={() => setShowExport(false)} />}
    </div>
  )
}
