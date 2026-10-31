/**
 * CanvasEditor — Editor interactivo de layers
 * El canvas ES el preview — drag, resize, animación, export PNG/WebM
 * Props:
 *   layers / onLayersChange       — estado controlado de layers
 *   background / onBackgroundChange
 *   format / onFormatChange
 *   showLayerPanel  (default true) — panel izquierdo de layers
 *   showPropsPanel  (default true) — panel derecho de propiedades
 *   showFormatPicker (default true)
 *   showExportBtn   (default true)
 *   displayWidth / displayHeight   — override tamaño del canvas de preview
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { FontPickerInline, ALL_FONTS } from './FontPicker.jsx'

// ─── FORMAT DEFINITIONS ───────────────────────────────────────────────────────
export const CANVAS_FORMATS = {
  story:     { label: '9:16 Story',    exportW: 1080, exportH: 1920, dW: 340, dH: 604 },
  poster:    { label: '2:3 Afiche',    exportW: 1080, exportH: 1620, dW: 392, dH: 588 },
  portrait:  { label: '4:5 Post',      exportW: 1080, exportH: 1350, dW: 420, dH: 525 },
  square:    { label: '1:1 Square',    exportW: 1080, exportH: 1080, dW: 420, dH: 420 },
  landscape: { label: '16:9 Wide',     exportW: 1920, exportH: 1080, dW: 520, dH: 293 },
}

// ─── LAYER FACTORY ────────────────────────────────────────────────────────────
export function makeLayer(type, overrides = {}) {
  const id = `L${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  const base = {
    id, type, visible: true, locked: false,
    x: 60, y: 80, w: 200, h: 60,
    rotation: 0, opacity: 1, zIndex: 1,
    anim: { type: 'none', delay: 0, dur: 600 },
  }
  if (type === 'text') Object.assign(base, {
    name: 'Texto', content: 'ESCRIBE AQUÍ',
    font: 'Bebas Neue', fontSize: 40, fontWeight: '700',
    color: '#ffffff', textAlign: 'center', lineHeight: 1.2, uppercase: true,
    shadow: false, shadowColor: '#000', shadowBlur: 10, shadowOX: 0, shadowOY: 3,
    outline: false, outlineColor: '#000', outlineW: 3,
  })
  else if (type === 'image') Object.assign(base, { name: 'Imagen', src: '', fit: 'cover', w: 200, h: 140 })
  else if (type === 'rect')  Object.assign(base, { name: 'Rect', fill: '#ff2d78', stroke: '', strokeW: 2, radius: 0, w: 200, h: 80 })
  else if (type === 'circle') Object.assign(base, { name: 'Círculo', fill: '#ff2d78', stroke: '', strokeW: 2, w: 100, h: 100 })
  else if (type === 'line')  Object.assign(base, { name: 'Línea', fill: '#ffffff', strokeW: 2, w: 200, h: 4 })
  return { ...base, name: base.name || type, ...overrides }
}

// ─── IMAGE CACHE ──────────────────────────────────────────────────────────────
const imgCache = new Map()
function getCachedImg(src) {
  if (!src) return null
  if (!imgCache.has(src)) { const i = new Image(); i.src = src; imgCache.set(src, i) }
  return imgCache.get(src)
}

// ─── EASING ──────────────────────────────────────────────────────────────────
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }

function animState(layer, p) {
  const a = layer.anim
  if (!a || a.type === 'none') return { al: 1, dx: 0, dy: 0, sc: 1 }
  const TOTAL = 2200
  const t0 = a.delay / TOTAL
  const t1 = Math.min(t0 + (a.dur ?? 600) / TOTAL, 1)
  const raw = p < t0 ? 0 : p > t1 ? 1 : (p - t0) / (t1 - t0)
  const e = easeInOut(raw)
  switch (a.type) {
    case 'fadeIn':    return { al: e, dx: 0,           dy: 0,            sc: 1 }
    case 'slideUp':   return { al: e, dx: 0,           dy: (1 - e) * 80, sc: 1 }
    case 'slideDown': return { al: e, dx: 0,           dy: -(1 - e) * 80, sc: 1 }
    case 'slideLeft': return { al: e, dx: (1 - e) * 80,  dy: 0,          sc: 1 }
    case 'slideRight':return { al: e, dx: -(1 - e) * 80, dy: 0,          sc: 1 }
    case 'scaleIn':   return { al: e, dx: 0,           dy: 0,            sc: 0.1 + e * 0.9 }
    default:          return { al: 1, dx: 0,           dy: 0,            sc: 1 }
  }
}

// ─── DRAW LAYERS ─────────────────────────────────────────────────────────────
export function drawLayersToCtx(ctx, layers, scale, animP = null) {
  const sorted = [...layers].filter(l => l.visible).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  for (const layer of sorted) {
    const { al, dx, dy, sc } = animP !== null ? animState(layer, animP) : { al: 1, dx: 0, dy: 0, sc: 1 }
    ctx.save()
    ctx.globalAlpha = (layer.opacity ?? 1) * al
    const lx = layer.x * scale + dx, ly = layer.y * scale + dy
    const lw = layer.w * scale, lh = layer.h * scale
    ctx.translate(lx + lw / 2, ly + lh / 2)
    ctx.rotate(((layer.rotation ?? 0) * Math.PI) / 180)
    ctx.scale(sc, sc)
    ctx.translate(-lw / 2, -lh / 2)

    if (layer.type === 'text') {
      const fs = (layer.fontSize ?? 24) * scale
      const raw = layer.content ?? ''
      const text = layer.uppercase ? raw.toUpperCase() : raw
      ctx.font = `${layer.fontWeight ?? '400'} ${fs}px "${layer.font ?? 'Arial'}",sans-serif`
      ctx.fillStyle = layer.color ?? '#fff'
      ctx.textAlign = layer.textAlign ?? 'left'
      ctx.textBaseline = 'top'
      if (layer.shadow) {
        ctx.shadowColor = layer.shadowColor ?? '#000'
        ctx.shadowBlur = (layer.shadowBlur ?? 8) * scale
        ctx.shadowOffsetX = (layer.shadowOX ?? 0) * scale
        ctx.shadowOffsetY = (layer.shadowOY ?? 2) * scale
      }
      const ax = layer.textAlign === 'center' ? lw / 2 : layer.textAlign === 'right' ? lw : 0
      const lhPx = fs * (layer.lineHeight ?? 1.2)
      let line = '', lineY = 0
      const flush = (l, y) => {
        if (layer.outline) {
          ctx.save()
          ctx.strokeStyle = layer.outlineColor ?? '#000'
          ctx.lineWidth = (layer.outlineW ?? 3) * scale
          ctx.lineJoin = 'round'
          ctx.shadowBlur = 0
          ctx.strokeText(l, ax, y)
          ctx.restore()
        }
        ctx.fillText(l, ax, y)
      }
      text.split(' ').forEach(word => {
        const test = line ? line + ' ' + word : word
        if (ctx.measureText(test).width > lw && line) { flush(line, lineY); line = word; lineY += lhPx }
        else line = test
      })
      flush(line, lineY)

    } else if (layer.type === 'image') {
      const img = getCachedImg(layer.src)
      if (img && img.complete && img.naturalWidth) {
        if (layer.fit === 'cover') {
          const s = Math.max(lw / img.width, lh / img.height)
          const sw = img.width * s, sh = img.height * s
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, lw, lh); ctx.clip()
          ctx.drawImage(img, (lw - sw) / 2, (lh - sh) / 2, sw, sh)
          ctx.restore()
        } else ctx.drawImage(img, 0, 0, lw, lh)
      } else {
        ctx.fillStyle = '#1a1a2a'; ctx.fillRect(0, 0, lw, lh)
        ctx.fillStyle = '#555'; ctx.font = `${10 * scale}px sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('imagen', lw / 2, lh / 2)
      }

    } else if (layer.type === 'rect') {
      const r = (layer.radius ?? 0) * scale
      ctx.beginPath()
      r > 0 ? ctx.roundRect(0, 0, lw, lh, r) : ctx.rect(0, 0, lw, lh)
      if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill() }
      if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = (layer.strokeW ?? 2) * scale; ctx.stroke() }

    } else if (layer.type === 'circle') {
      ctx.beginPath(); ctx.ellipse(lw / 2, lh / 2, lw / 2, lh / 2, 0, 0, Math.PI * 2)
      if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill() }
      if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = (layer.strokeW ?? 2) * scale; ctx.stroke() }

    } else if (layer.type === 'line') {
      ctx.beginPath(); ctx.moveTo(0, lh / 2); ctx.lineTo(lw, lh / 2)
      ctx.strokeStyle = layer.fill ?? '#fff'
      ctx.lineWidth = (layer.strokeW ?? 2) * scale
      ctx.stroke()
    }
    ctx.restore()
  }
}

// ─── DRAW BACKGROUND ─────────────────────────────────────────────────────────
export async function drawBackground(ctx, bg, W, H) {
  ctx.clearRect(0, 0, W, H)
  if (!bg || bg.type === 'color') {
    ctx.fillStyle = bg?.color ?? '#040406'
    ctx.fillRect(0, 0, W, H)
  } else if (bg.type === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    const stops = bg.stops ?? [['#040406', 0], ['#1a0010', 1]]
    stops.forEach(([c, s]) => g.addColorStop(s, c))
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  } else if (bg.type === 'image' && bg.src) {
    await new Promise(res => {
      const img = getCachedImg(bg.src)
      const draw = () => {
        if (img.complete && img.naturalWidth) {
          ctx.globalAlpha = bg.opacity ?? 1
          const s = Math.max(W / img.width, H / img.height)
          ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s)
          ctx.globalAlpha = 1
          if (bg.overlay ?? true) {
            ctx.fillStyle = `rgba(0,0,0,${bg.overlayOpacity ?? 0.45})`
            ctx.fillRect(0, 0, W, H)
          }
          res()
        } else { img.onload = () => { draw(); res() }; img.onerror = res }
      }
      draw()
    })
  }
}

// ─── HANDLE HIT TEST ─────────────────────────────────────────────────────────
const HR = 7
function getHandles(l) {
  return {
    TL: [l.x, l.y],           TC: [l.x + l.w / 2, l.y],    TR: [l.x + l.w, l.y],
    ML: [l.x, l.y + l.h / 2],                               MR: [l.x + l.w, l.y + l.h / 2],
    BL: [l.x, l.y + l.h],     BC: [l.x + l.w / 2, l.y + l.h], BR: [l.x + l.w, l.y + l.h],
  }
}
function hitHandle(l, mx, my) {
  for (const [k, [hx, hy]] of Object.entries(getHandles(l)))
    if (Math.abs(mx - hx) <= HR + 2 && Math.abs(my - hy) <= HR + 2) return k
  return null
}
function hitLayer(layers, mx, my) {
  const sorted = [...layers].filter(l => l.visible && !l.locked).sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
  for (const l of sorted)
    if (mx >= l.x && mx <= l.x + l.w && my >= l.y && my <= l.y + l.h) return l.id
  return null
}
function applyResize(l, handle, dx, dy) {
  let { x, y, w, h } = l
  switch (handle) {
    case 'TL': x += dx; y += dy; w -= dx; h -= dy; break
    case 'TC': y += dy; h -= dy; break
    case 'TR': w += dx; y += dy; h -= dy; break
    case 'ML': x += dx; w -= dx; break
    case 'MR': w += dx; break
    case 'BL': x += dx; w -= dx; h += dy; break
    case 'BC': h += dy; break
    case 'BR': w += dx; h += dy; break
    default: break
  }
  return { x, y, w: Math.max(w, 16), h: Math.max(h, 8) }
}
const HCURSOR = { TL: 'nw-resize', TC: 'n-resize', TR: 'ne-resize', ML: 'w-resize', MR: 'e-resize', BL: 'sw-resize', BC: 's-resize', BR: 'se-resize' }

// ─── SNAP / SMART GUIDES ─────────────────────────────────────────────────────
const SNAP_T = 5   // px threshold

function calcSnap(proposed, allLayers, dW, dH) {
  let { x, y, w, h } = proposed
  const guides = []

  // Guide positions: canvas edges + center + other layers' edges/centers
  const gxs = [0, dW / 2, dW]
  const gys = [0, dH / 2, dH]
  for (const ol of allLayers.filter(l => l.id !== proposed.id && l.visible)) {
    gxs.push(ol.x, ol.x + ol.w / 2, ol.x + ol.w)
    gys.push(ol.y, ol.y + ol.h / 2, ol.y + ol.h)
  }

  // Layer snap points (left, center, right)
  const xCandidates = [{ lv: x, offset: 0 }, { lv: x + w / 2, offset: w / 2 }, { lv: x + w, offset: w }]
  for (const { lv, offset } of xCandidates) {
    const closest = gxs.reduce((b, g) => Math.abs(g - lv) < Math.abs(b - lv) ? g : b, gxs[0])
    if (Math.abs(closest - lv) < SNAP_T) { x = closest - offset; guides.push({ axis: 'x', pos: closest }); break }
  }

  // Layer snap points (top, center, bottom)
  const yCandidates = [{ lv: y, offset: 0 }, { lv: y + h / 2, offset: h / 2 }, { lv: y + h, offset: h }]
  for (const { lv, offset } of yCandidates) {
    const closest = gys.reduce((b, g) => Math.abs(g - lv) < Math.abs(b - lv) ? g : b, gys[0])
    if (Math.abs(closest - lv) < SNAP_T) { y = closest - offset; guides.push({ axis: 'y', pos: closest }); break }
  }

  return { x, y, guides }
}

function drawUI(uiCtx, layers, selectedId, dW, dH, snapGuides = []) {
  uiCtx.clearRect(0, 0, dW, dH)

  // Draw snap guides
  for (const g of snapGuides) {
    uiCtx.save()
    uiCtx.strokeStyle = '#ff2d78'
    uiCtx.lineWidth = 1
    uiCtx.shadowColor = '#ff2d78'
    uiCtx.shadowBlur = 4
    uiCtx.beginPath()
    if (g.axis === 'x') { uiCtx.moveTo(g.pos, 0); uiCtx.lineTo(g.pos, dH) }
    else { uiCtx.moveTo(0, g.pos); uiCtx.lineTo(dW, g.pos) }
    uiCtx.stroke()
    uiCtx.restore()
  }

  const layer = layers.find(l => l.id === selectedId)
  if (!layer) return
  uiCtx.strokeStyle = '#00e5ff'
  uiCtx.lineWidth = 1.5
  uiCtx.setLineDash([4, 3])
  uiCtx.strokeRect(layer.x, layer.y, layer.w, layer.h)
  uiCtx.setLineDash([])
  for (const [, [hx, hy]] of Object.entries(getHandles(layer))) {
    uiCtx.fillStyle = '#fff'
    uiCtx.strokeStyle = '#00e5ff'
    uiCtx.lineWidth = 1.5
    uiCtx.beginPath()
    uiCtx.rect(hx - HR, hy - HR, HR * 2, HR * 2)
    uiCtx.fill(); uiCtx.stroke()
  }
}

const ANIM_TYPES = [
  { id: 'none', label: 'Sin animación' },
  { id: 'fadeIn', label: 'Fade In' },
  { id: 'slideUp', label: 'Slide desde abajo' },
  { id: 'slideDown', label: 'Slide desde arriba' },
  { id: 'slideLeft', label: 'Slide desde derecha' },
  { id: 'slideRight', label: 'Slide desde izquierda' },
  { id: 'scaleIn', label: 'Scale In' },
]

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function CanvasEditor({
  layers = [],
  onLayersChange,
  background = { type: 'color', color: '#040406' },
  onBackgroundChange,
  format = 'story',
  onFormatChange,
  showLayerPanel = true,
  showPropsPanel = true,
  showFormatPicker = true,
  showExportBtn = true,
  displayWidth,
  displayHeight,
}) {
  const fmt = CANVAS_FORMATS[format] ?? CANVAS_FORMATS.story
  const dW = displayWidth ?? fmt.dW
  const dH = displayHeight ?? fmt.dH
  const { exportW, exportH } = fmt
  const scale = dW / exportW

  const mainRef = useRef(null)
  const uiRef = useRef(null)
  const interactRef = useRef(null)
  const imgInputRef = useRef(null)
  const bgImgInputRef = useRef(null)
  const animRafRef = useRef(null)
  const animStartRef = useRef(null)

  const [selectedId, setSelectedId] = useState(null)
  const [dragState, setDragState] = useState(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animProgress, setAnimProgress] = useState(null)
  const [cursor, setCursor] = useState('default')
  const [isExporting, setIsExporting] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [snapGuides, setSnapGuides] = useState([])

  const selectedLayer = layers.find(l => l.id === selectedId) ?? null

  // ── Render ────────────────────────────────────────────────────────────────
  const renderMain = useCallback(async (animP = null) => {
    const canvas = mainRef.current
    if (!canvas) return
    canvas.width = dW; canvas.height = dH
    const ctx = canvas.getContext('2d')
    await drawBackground(ctx, background, dW, dH)
    // Layers are stored in display-space coords — scale=1 for preview, exportW/dW for export
    drawLayersToCtx(ctx, layers, 1, animP)
  }, [layers, background, dW, dH])

  const renderUI = useCallback(() => {
    const canvas = uiRef.current
    if (!canvas) return
    canvas.width = dW; canvas.height = dH
    drawUI(canvas.getContext('2d'), layers, selectedId, dW, dH, snapGuides)
  }, [layers, selectedId, dW, dH, snapGuides])

  useEffect(() => { renderMain(animProgress) }, [renderMain, animProgress])
  useEffect(() => { renderUI() }, [renderUI])

  // ── Animation ─────────────────────────────────────────────────────────────
  const startAnim = useCallback(() => {
    if (animRafRef.current) cancelAnimationFrame(animRafRef.current)
    setIsAnimating(true)
    animStartRef.current = performance.now()
    const DURATION = 2200
    const loop = (now) => {
      const p = Math.min((now - animStartRef.current) / DURATION, 1)
      setAnimProgress(p)
      renderMain(p)
      if (p < 1) animRafRef.current = requestAnimationFrame(loop)
      else { setIsAnimating(false); setAnimProgress(null) }
    }
    animRafRef.current = requestAnimationFrame(loop)
  }, [renderMain])

  // ── Export PNG ────────────────────────────────────────────────────────────
  const exportPNG = useCallback(async () => {
    setIsExporting(true)
    const canvas = document.createElement('canvas')
    canvas.width = exportW; canvas.height = exportH
    const ctx = canvas.getContext('2d')
    await drawBackground(ctx, background, exportW, exportH)
    drawLayersToCtx(ctx, layers, exportW / dW, null)
    const link = document.createElement('a')
    link.download = `frate-editor-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    setIsExporting(false)
  }, [layers, background, exportW, exportH, dW])

  // ── Export Video ──────────────────────────────────────────────────────────
  const exportVideo = useCallback(() => {
    const VW = Math.min(exportW, 1080)
    const VH = Math.round(VW * exportH / exportW)
    const canvas = document.createElement('canvas')
    canvas.width = VW; canvas.height = VH
    const ctx = canvas.getContext('2d')
    const vScale = VW / dW
    const DURATION = 4000
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const stream = canvas.captureStream(30)
    const chunks = []
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `frate-video-${Date.now()}.webm`; a.click()
      URL.revokeObjectURL(url)
    }
    rec.start()
    const start = performance.now()
    const draw = async () => {
      const elapsed = performance.now() - start
      if (elapsed >= DURATION) { rec.stop(); return }
      await drawBackground(ctx, background, VW, VH)
      drawLayersToCtx(ctx, layers, vScale, elapsed / DURATION)
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)
  }, [layers, background, exportW, exportH, dW])

  // ── Mouse ─────────────────────────────────────────────────────────────────
  function getMousePos(e) {
    const rect = interactRef.current.getBoundingClientRect()
    return { mx: (e.clientX - rect.left) / zoom, my: (e.clientY - rect.top) / zoom }
  }

  function handleMouseDown(e) {
    const { mx, my } = getMousePos(e)
    if (selectedLayer && !selectedLayer.locked) {
      const h = hitHandle(selectedLayer, mx, my)
      if (h) { setDragState({ mode: 'resize', handle: h, startMx: mx, startMy: my, snap: { ...selectedLayer } }); return }
    }
    const id = hitLayer(layers, mx, my)
    if (id) {
      setSelectedId(id)
      const l = layers.find(x => x.id === id)
      setDragState({ mode: 'move', startMx: mx, startMy: my, snap: { ...l } })
    } else setSelectedId(null)
  }

  function handleMouseMove(e) {
    const { mx, my } = getMousePos(e)
    if (!dragState) {
      if (selectedLayer) {
        const h = hitHandle(selectedLayer, mx, my)
        if (h) { setCursor(HCURSOR[h] ?? 'pointer'); return }
        if (mx >= selectedLayer.x && mx <= selectedLayer.x + selectedLayer.w && my >= selectedLayer.y && my <= selectedLayer.y + selectedLayer.h) { setCursor('move'); return }
      }
      setCursor(hitLayer(layers, mx, my) ? 'move' : 'default')
      return
    }
    const dx = mx - dragState.startMx, dy = my - dragState.startMy
    const snap = dragState.snap
    if (dragState.mode === 'move') {
      const proposed = { ...snap, x: snap.x + dx, y: snap.y + dy }
      const { x, y, guides } = calcSnap(proposed, layers, dW, dH)
      setSnapGuides(guides)
      onLayersChange(layers.map(l => l.id === snap.id ? { ...l, x, y } : l))
    } else if (dragState.mode === 'resize') {
      const updated = applyResize(snap, dragState.handle, dx, dy)
      onLayersChange(layers.map(l => l.id === snap.id ? { ...l, ...updated } : l))
    }
  }

  function handleMouseUp() { setDragState(null); setSnapGuides([]) }

  // ── Layer ops ─────────────────────────────────────────────────────────────
  function addLayer(type) {
    const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex ?? 0), 0)
    const l = makeLayer(type, { zIndex: maxZ + 1, x: 30 + Math.random() * 80, y: 30 + Math.random() * 80 })
    onLayersChange([...layers, l])
    setSelectedId(l.id)
  }
  function updateLayer(id, updates) {
    onLayersChange(layers.map(l => l.id === id ? { ...l, ...updates } : l))
  }
  function deleteLayer(id) {
    onLayersChange(layers.filter(l => l.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  function moveLayerZ(id, dir) {
    onLayersChange(layers.map(l => l.id === id ? { ...l, zIndex: (l.zIndex ?? 0) + dir } : l))
  }
  function handleImageUpload(e, forBg = false) {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      if (forBg) {
        onBackgroundChange?.({ ...background, type: 'image', src: ev.target.result })
      } else {
        const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex ?? 0), 0)
        const l = makeLayer('image', { src: ev.target.result, zIndex: maxZ + 1, w: dW * 0.8, h: dH * 0.5 })
        onLayersChange([...layers, l])
        setSelectedId(l.id)
      }
    }
    reader.readAsDataURL(file)
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* FORMAT PICKER */}
      {showFormatPicker && (
        <div style={s.formatBar}>
          {Object.entries(CANVAS_FORMATS).map(([key, f]) => (
            <button key={key} onClick={() => onFormatChange?.(key)}
              style={{ ...s.fmtBtn, ...(format === key ? s.fmtBtnActive : {}) }}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div style={s.layout}>
        {/* ── LAYER PANEL ── */}
        {showLayerPanel && (
          <div style={s.layerPanel}>
            <div style={s.panelTitle}>LAYERS</div>
            <div style={s.layerList}>
              {[...layers].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)).map(layer => (
                <div key={layer.id} onClick={() => setSelectedId(layer.id)}
                  style={{ ...s.layerRow, ...(selectedId === layer.id ? s.layerRowActive : {}), opacity: layer.visible ? 1 : 0.4 }}>
                  <span style={s.layerIcon}>
                    {layer.type === 'text' ? 'T' : layer.type === 'image' ? '🖼' : layer.type === 'rect' ? '▭' : layer.type === 'circle' ? '●' : '—'}
                  </span>
                  <span style={s.layerName}>{layer.name ?? layer.type}</span>
                  <div style={s.layerActions}>
                    <button style={s.layerBtn} onClick={e => { e.stopPropagation(); moveLayerZ(layer.id, 1) }}>↑</button>
                    <button style={s.layerBtn} onClick={e => { e.stopPropagation(); moveLayerZ(layer.id, -1) }}>↓</button>
                    <button style={s.layerBtn} onClick={e => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }) }}>{layer.visible ? '👁' : '○'}</button>
                    <button style={s.layerBtn} onClick={e => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }) }}>{layer.locked ? '🔒' : '🔓'}</button>
                    <button style={{ ...s.layerBtn, color: '#ff2d78' }} onClick={e => { e.stopPropagation(); deleteLayer(layer.id) }}>✕</button>
                  </div>
                </div>
              ))}
              {!layers.length && <div style={s.emptyLayers}>+ Agrega layers abajo</div>}
            </div>

            {/* Add layer */}
            <div style={s.addBar}>
              <div style={s.panelLabel}>+ AGREGAR</div>
              {[['text', 'T Texto'], ['image', '🖼 Foto'], ['rect', '▭ Rect'], ['circle', '● Círculo'], ['line', '— Línea']].map(([type, label]) => (
                <button key={type} style={s.addBtn}
                  onClick={() => type === 'image' ? imgInputRef.current?.click() : addLayer(type)}>
                  {label}
                </button>
              ))}
              <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, false)} />
            </div>

            {/* Background */}
            <div style={s.bgPanel}>
              <div style={s.panelLabel}>FONDO</div>
              <div style={s.bgBtns}>
                {['color', 'gradient', 'image'].map(t => (
                  <button key={t} style={{ ...s.bgBtn, ...(background.type === t ? s.bgBtnActive : {}) }}
                    onClick={() => onBackgroundChange?.({ ...background, type: t })}>
                    {t === 'color' ? 'Color' : t === 'gradient' ? 'Gradiente' : 'Foto'}
                  </button>
                ))}
              </div>
              {background.type === 'color' && (
                <div style={s.row}>
                  <input type="color" value={background.color ?? '#040406'}
                    onChange={e => onBackgroundChange?.({ ...background, color: e.target.value })} style={s.cp} />
                  <span style={s.bgLabel}>{background.color ?? '#040406'}</span>
                </div>
              )}
              {background.type === 'gradient' && (
                <div style={s.row}>
                  <input type="color" value={background.stops?.[0]?.[0] ?? '#040406'}
                    onChange={e => onBackgroundChange?.({ ...background, stops: [[e.target.value, 0], background.stops?.[1] ?? ['#1a0010', 1]] })} style={s.cp} />
                  <span style={{ color: '#555' }}>→</span>
                  <input type="color" value={background.stops?.[1]?.[0] ?? '#1a0010'}
                    onChange={e => onBackgroundChange?.({ ...background, stops: [background.stops?.[0] ?? ['#040406', 0], [e.target.value, 1]] })} style={s.cp} />
                </div>
              )}
              {background.type === 'image' && (
                <>
                  <button style={s.addBtn} onClick={() => bgImgInputRef.current?.click()}>
                    {background.src ? '✓ Cambiar foto' : '+ Foto de fondo'}
                  </button>
                  {background.src && (
                    <div style={{ marginTop: 6 }}>
                      <label style={s.propLabel}>Opacidad</label>
                      <input type="range" min="0.1" max="1" step="0.05" value={background.opacity ?? 1}
                        onChange={e => onBackgroundChange?.({ ...background, opacity: parseFloat(e.target.value) })} style={s.slider} />
                      <label style={s.propLabel}>
                        <input type="checkbox" checked={background.overlay ?? true}
                          onChange={e => onBackgroundChange?.({ ...background, overlay: e.target.checked })} />
                        {' '}Overlay oscuro
                      </label>
                      {(background.overlay ?? true) && (
                        <input type="range" min="0" max="0.9" step="0.05" value={background.overlayOpacity ?? 0.45}
                          onChange={e => onBackgroundChange?.({ ...background, overlayOpacity: parseFloat(e.target.value) })} style={s.slider} />
                      )}
                    </div>
                  )}
                  <input ref={bgImgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e, true)} />
                </>
              )}
            </div>
          </div>
        )}

        {/* ── CANVAS ── */}
        <div style={s.canvasCol}>
          {/* Zoom-aware canvas wrapper — wheel/trackpad zoom */}
          <div style={{ overflow: 'auto', maxWidth: '100%', maxHeight: 720 }}
            onWheel={(e) => {
              // Ctrl+wheel or pinch (deltaY with ctrlKey on Mac) → zoom
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                const delta = -e.deltaY * 0.01
                setZoom(z => {
                  const next = Math.max(0.1, Math.min(4, +(z + delta).toFixed(2)))
                  return next
                })
              }
            }}>
            <div style={{ width: dW * zoom, height: dH * zoom, position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${zoom})`, transformOrigin: 'top left', width: dW, height: dH }}>
                <canvas ref={mainRef} width={dW} height={dH}
                  style={{ display: 'block', borderRadius: 6, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
                <canvas ref={uiRef} width={dW} height={dH}
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', borderRadius: 6 }} />
                <div ref={interactRef}
                  style={{ position: 'absolute', top: 0, left: 0, width: dW, height: dH, cursor }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => { handleMouseUp(); setSnapGuides([]) }}
                />
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div style={s.toolbar}>
            {showExportBtn && (
              <>
                <button style={s.toolBtn} onClick={exportPNG} disabled={isExporting}>
                  {isExporting ? '⟳' : '⬇'} PNG
                </button>
                <button style={s.toolBtn} onClick={exportVideo}>🎬 Video</button>
              </>
            )}
            <button
              style={{ ...s.toolBtn, ...(isAnimating ? s.toolBtnActive : {}) }}
              onClick={isAnimating
                ? () => { cancelAnimationFrame(animRafRef.current); setIsAnimating(false); setAnimProgress(null) }
                : startAnim}>
              {isAnimating ? '⏹ Stop' : '▶ Animar'}
            </button>
            {/* Zoom controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 6, borderLeft: '1px solid #222230', paddingLeft: 8 }}>
              <button title="Zoom out" style={{ ...s.toolBtn, padding: '4px 8px', fontSize: 14 }} onClick={() => setZoom(z => Math.max(0.1, +(z - 0.15).toFixed(2)))}>−</button>
              <span style={{ ...s.dimLabel, minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button title="Zoom in" style={{ ...s.toolBtn, padding: '4px 8px', fontSize: 14 }} onClick={() => setZoom(z => Math.min(4, +(z + 0.15).toFixed(2)))}>+</button>
              <button title="Ajustar a pantalla" style={{ ...s.toolBtn, padding: '3px 7px', fontSize: 9 }} onClick={() => {
                // Fit canvas to current container (use parent of canvas wrapper)
                const wrapper = mainRef.current?.parentElement?.parentElement?.parentElement
                if (wrapper) {
                  const availW = wrapper.clientWidth - 24
                  const availH = Math.max(400, (wrapper.clientHeight || 720) - 80)
                  const fit = Math.min(availW / dW, availH / dH, 1)
                  setZoom(+fit.toFixed(2))
                }
              }}>⛶ FIT</button>
              {zoom !== 1 && <button style={{ ...s.toolBtn, padding: '3px 7px', fontSize: 9 }} onClick={() => setZoom(1)}>1:1</button>}
              <span style={{ fontSize: 9, color: '#555', marginLeft: 4 }}>⌘+scroll</span>
            </div>
            <span style={s.dimLabel}>{exportW}×{exportH}</span>
          </div>
        </div>

        {/* ── PROPERTIES PANEL ── */}
        {showPropsPanel && selectedLayer && (
          <div style={s.propsPanel}>
            <div style={s.panelTitle}>PROPIEDADES</div>

            <div style={s.propGroup}>
              <label style={s.propLabel}>Nombre</label>
              <input style={s.propInput} value={selectedLayer.name ?? ''}
                onChange={e => updateLayer(selectedLayer.id, { name: e.target.value })} />
            </div>

            {/* TRANSFORM */}
            <div style={s.propGroup}>
              <div style={s.propGroupTitle}>TRANSFORM</div>
              <div style={s.grid2}>
                {[['X', 'x'], ['Y', 'y'], ['W', 'w'], ['H', 'h']].map(([lbl, k]) => (
                  <div key={k}>
                    <label style={s.propLabel}>{lbl}</label>
                    <input type="number" style={s.propInput}
                      value={Math.round(selectedLayer[k] ?? 0)}
                      onChange={e => updateLayer(selectedLayer.id, { [k]: parseFloat(e.target.value) || 0 })} />
                  </div>
                ))}
              </div>
              <label style={s.propLabel}>Rotación {Math.round(selectedLayer.rotation ?? 0)}°</label>
              <input type="range" min="-180" max="180" style={s.slider}
                value={selectedLayer.rotation ?? 0}
                onChange={e => updateLayer(selectedLayer.id, { rotation: parseFloat(e.target.value) })} />
              <label style={s.propLabel}>Opacidad {Math.round((selectedLayer.opacity ?? 1) * 100)}%</label>
              <input type="range" min="0" max="1" step="0.01" style={s.slider}
                value={selectedLayer.opacity ?? 1}
                onChange={e => updateLayer(selectedLayer.id, { opacity: parseFloat(e.target.value) })} />
            </div>

            {/* TEXT */}
            {selectedLayer.type === 'text' && (
              <div style={s.propGroup}>
                <div style={s.propGroupTitle}>TEXTO</div>
                <label style={s.propLabel}>Contenido</label>
                <textarea style={{ ...s.propInput, minHeight: 52, resize: 'vertical' }}
                  value={selectedLayer.content ?? ''}
                  onChange={e => updateLayer(selectedLayer.id, { content: e.target.value })} />

                {/* FONT PICKER */}
                <FontPickerInline
                  value={selectedLayer.font ?? 'Bebas Neue'}
                  onChange={font => updateLayer(selectedLayer.id, { font })}
                />

                <div style={s.grid2}>
                  <div>
                    <label style={s.propLabel}>Tamaño</label>
                    <input type="number" min="6" max="300" style={s.propInput}
                      value={selectedLayer.fontSize ?? 40}
                      onChange={e => updateLayer(selectedLayer.id, { fontSize: parseFloat(e.target.value) || 40 })} />
                  </div>
                  <div>
                    <label style={s.propLabel}>Peso</label>
                    <select style={s.propInput}
                      value={selectedLayer.fontWeight ?? '700'}
                      onChange={e => updateLayer(selectedLayer.id, { fontWeight: e.target.value })}>
                      {['300', '400', '500', '600', '700', '800', '900'].map(w => <option key={w}>{w}</option>)}
                    </select>
                  </div>
                </div>

                <label style={s.propLabel}>Color</label>
                <div style={s.colorRow}>
                  <input type="color" style={s.cp} value={selectedLayer.color ?? '#fff'}
                    onChange={e => updateLayer(selectedLayer.id, { color: e.target.value })} />
                  {['#ffffff', '#ff2d78', '#ffd700', '#00e5ff', '#9b30ff', '#00e564', '#000'].map(c => (
                    <button key={c} style={{ ...s.colorDot, background: c, outline: selectedLayer.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                      onClick={() => updateLayer(selectedLayer.id, { color: c })} />
                  ))}
                </div>

                <div style={s.row}>
                  <label style={s.propLabel}>Alineación</label>
                  <select style={{ ...s.propInput, flex: 1 }}
                    value={selectedLayer.textAlign ?? 'center'}
                    onChange={e => updateLayer(selectedLayer.id, { textAlign: e.target.value })}>
                    <option value="left">Izquierda</option>
                    <option value="center">Centro</option>
                    <option value="right">Derecha</option>
                  </select>
                </div>

                <label style={s.propLabel}>
                  <input type="checkbox" checked={selectedLayer.uppercase ?? true}
                    onChange={e => updateLayer(selectedLayer.id, { uppercase: e.target.checked })} />
                  {' '}MAYÚSCULAS
                </label>

                <label style={{ ...s.propLabel, marginTop: 6 }}>
                  <input type="checkbox" checked={selectedLayer.shadow ?? false}
                    onChange={e => updateLayer(selectedLayer.id, { shadow: e.target.checked })} />
                  {' '}Sombra
                </label>
                {selectedLayer.shadow && (
                  <div style={s.grid2}>
                    <div>
                      <label style={s.propLabel}>Color</label>
                      <input type="color" style={s.cp} value={selectedLayer.shadowColor ?? '#000'}
                        onChange={e => updateLayer(selectedLayer.id, { shadowColor: e.target.value })} />
                    </div>
                    <div>
                      <label style={s.propLabel}>Blur</label>
                      <input type="number" min="0" max="50" style={s.propInput}
                        value={selectedLayer.shadowBlur ?? 8}
                        onChange={e => updateLayer(selectedLayer.id, { shadowBlur: parseFloat(e.target.value) })} />
                    </div>
                  </div>
                )}
                <label style={s.propLabel}>
                  <input type="checkbox" checked={selectedLayer.outline ?? false}
                    onChange={e => updateLayer(selectedLayer.id, { outline: e.target.checked })} />
                  {' '}Outline
                </label>
                {selectedLayer.outline && (
                  <div style={s.grid2}>
                    <div>
                      <label style={s.propLabel}>Color</label>
                      <input type="color" style={s.cp} value={selectedLayer.outlineColor ?? '#000'}
                        onChange={e => updateLayer(selectedLayer.id, { outlineColor: e.target.value })} />
                    </div>
                    <div>
                      <label style={s.propLabel}>Grosor</label>
                      <input type="number" min="1" max="20" style={s.propInput}
                        value={selectedLayer.outlineW ?? 3}
                        onChange={e => updateLayer(selectedLayer.id, { outlineW: parseFloat(e.target.value) })} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* IMAGE */}
            {selectedLayer.type === 'image' && (
              <div style={s.propGroup}>
                <div style={s.propGroupTitle}>IMAGEN</div>
                <button style={s.addBtn} onClick={() => imgInputRef.current?.click()}>
                  {selectedLayer.src ? '✓ Cambiar imagen' : '+ Subir imagen'}
                </button>
                <label style={{ ...s.propLabel, marginTop: 6 }}>Ajuste</label>
                <select style={s.propInput} value={selectedLayer.fit ?? 'cover'}
                  onChange={e => updateLayer(selectedLayer.id, { fit: e.target.value })}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Fill</option>
                </select>
              </div>
            )}

            {/* SHAPE */}
            {(selectedLayer.type === 'rect' || selectedLayer.type === 'circle') && (
              <div style={s.propGroup}>
                <div style={s.propGroupTitle}>FORMA</div>
                <label style={s.propLabel}>Relleno</label>
                <div style={s.colorRow}>
                  <input type="color" style={s.cp} value={selectedLayer.fill ?? '#ff2d78'}
                    onChange={e => updateLayer(selectedLayer.id, { fill: e.target.value })} />
                  <button style={{ ...s.colorDot, background: 'transparent', border: '1px solid #555', color: '#555', fontSize: 8 }}
                    onClick={() => updateLayer(selectedLayer.id, { fill: '' })}>∅</button>
                </div>
                <label style={s.propLabel}>Borde</label>
                <div style={s.colorRow}>
                  <input type="color" style={s.cp} value={selectedLayer.stroke || '#fff'}
                    onChange={e => updateLayer(selectedLayer.id, { stroke: e.target.value })} />
                  <input type="number" min="1" max="20" style={{ ...s.propInput, width: 50 }}
                    value={selectedLayer.strokeW ?? 2}
                    onChange={e => updateLayer(selectedLayer.id, { strokeW: parseFloat(e.target.value) })} />
                </div>
                {selectedLayer.type === 'rect' && (
                  <>
                    <label style={s.propLabel}>Radio esquinas</label>
                    <input type="range" min="0" max="60" style={s.slider}
                      value={selectedLayer.radius ?? 0}
                      onChange={e => updateLayer(selectedLayer.id, { radius: parseFloat(e.target.value) })} />
                  </>
                )}
              </div>
            )}

            {/* LINE */}
            {selectedLayer.type === 'line' && (
              <div style={s.propGroup}>
                <div style={s.propGroupTitle}>LÍNEA</div>
                <label style={s.propLabel}>Color</label>
                <input type="color" style={s.cp} value={selectedLayer.fill ?? '#fff'}
                  onChange={e => updateLayer(selectedLayer.id, { fill: e.target.value })} />
                <label style={s.propLabel}>Grosor px</label>
                <input type="number" min="1" max="30" style={s.propInput}
                  value={selectedLayer.strokeW ?? 2}
                  onChange={e => updateLayer(selectedLayer.id, { strokeW: parseFloat(e.target.value) })} />
              </div>
            )}

            {/* ANIMATION */}
            <div style={s.propGroup}>
              <div style={s.propGroupTitle}>ANIMACIÓN</div>
              <select style={s.propInput}
                value={selectedLayer.anim?.type ?? 'none'}
                onChange={e => updateLayer(selectedLayer.id, { anim: { ...(selectedLayer.anim ?? {}), type: e.target.value } })}>
                {ANIM_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              {(selectedLayer.anim?.type ?? 'none') !== 'none' && (
                <div style={s.grid2}>
                  <div>
                    <label style={s.propLabel}>Delay ms</label>
                    <input type="number" min="0" max="2000" step="50" style={s.propInput}
                      value={selectedLayer.anim?.delay ?? 0}
                      onChange={e => updateLayer(selectedLayer.id, { anim: { ...(selectedLayer.anim ?? {}), delay: parseInt(e.target.value) || 0 } })} />
                  </div>
                  <div>
                    <label style={s.propLabel}>Duración ms</label>
                    <input type="number" min="100" max="2000" step="50" style={s.propInput}
                      value={selectedLayer.anim?.dur ?? 600}
                      onChange={e => updateLayer(selectedLayer.id, { anim: { ...(selectedLayer.anim ?? {}), dur: parseInt(e.target.value) || 600 } })} />
                  </div>
                </div>
              )}
            </div>

            {/* Delete */}
            <button style={s.deleteBtn} onClick={() => deleteLayer(selectedLayer.id)}>
              ✕ Eliminar layer
            </button>
          </div>
        )}
        {showPropsPanel && !selectedLayer && (
          <div style={s.propsEmpty}>
            Selecciona un layer para editar sus propiedades
          </div>
        )}
      </div>
    </div>
  )
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 10, fontFamily: "'Space Grotesk', sans-serif", color: '#f0f0f8' },
  formatBar: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  fmtBtn: { padding: '5px 12px', borderRadius: 6, border: '1px solid #222230', background: 'transparent', color: '#9090aa', fontSize: 10, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" },
  fmtBtnActive: { background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' },
  layout: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  layerPanel: { width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid #1a1a2a', borderRadius: 10, padding: 10, maxHeight: 700, overflowY: 'auto' },
  panelTitle: { fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#555568', textTransform: 'uppercase' },
  panelLabel: { fontSize: 9, color: '#555568', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 3 },
  layerList: { display: 'flex', flexDirection: 'column', gap: 2, minHeight: 40 },
  layerRow: { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 5px', borderRadius: 5, cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.1s' },
  layerRowActive: { background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)' },
  layerIcon: { fontSize: 10, width: 14, textAlign: 'center', color: '#9090aa', flexShrink: 0 },
  layerName: { fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#d0d0e8' },
  layerActions: { display: 'flex', gap: 1, flexShrink: 0 },
  layerBtn: { background: 'transparent', border: 'none', color: '#555568', cursor: 'pointer', fontSize: 9, padding: '1px 2px', borderRadius: 2 },
  emptyLayers: { fontSize: 9, color: '#444458', textAlign: 'center', padding: '10px 0' },
  addBar: { display: 'flex', flexDirection: 'column', gap: 3, borderTop: '1px solid #1a1a2a', paddingTop: 6 },
  addBtn: { width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #222230', background: 'transparent', color: '#9090aa', fontSize: 10, cursor: 'pointer', textAlign: 'left', fontFamily: "'Space Grotesk', sans-serif" },
  bgPanel: { borderTop: '1px solid #1a1a2a', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 },
  bgBtns: { display: 'flex', gap: 3 },
  bgBtn: { flex: 1, padding: '4px 3px', borderRadius: 4, border: '1px solid #222230', background: 'transparent', color: '#9090aa', fontSize: 9, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" },
  bgBtnActive: { background: 'rgba(255,45,120,0.1)', color: '#ff2d78', border: '1px solid rgba(255,45,120,0.3)' },
  bgLabel: { fontSize: 9, color: '#555568', fontFamily: 'monospace' },
  row: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  canvasCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  toolbar: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  toolBtn: { padding: '6px 14px', borderRadius: 7, border: '1px solid #222230', background: 'rgba(255,255,255,0.04)', color: '#d0d0e8', fontSize: 11, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" },
  toolBtnActive: { background: 'rgba(255,45,120,0.15)', color: '#ff2d78', border: '1px solid rgba(255,45,120,0.4)' },
  dimLabel: { fontSize: 9, color: '#444456', letterSpacing: 1 },
  propsPanel: { width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, background: 'rgba(255,255,255,0.02)', border: '1px solid #1a1a2a', borderRadius: 10, padding: 10, maxHeight: 700, overflowY: 'auto' },
  propsEmpty: { width: 220, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333344', fontSize: 10, textAlign: 'center', padding: '20px 10px', fontStyle: 'italic' },
  propGroup: { display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6, borderTop: '1px solid #111120' },
  propGroupTitle: { fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: '#ff2d78', textTransform: 'uppercase' },
  propLabel: { fontSize: 9, color: '#6060aa', letterSpacing: '0.5px', display: 'block', cursor: 'pointer' },
  propInput: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #222230', borderRadius: 5, color: '#f0f0f8', padding: '5px 7px', fontSize: 11, fontFamily: "'Space Grotesk', sans-serif", boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 },
  slider: { width: '100%', accentColor: '#ff2d78' },
  colorRow: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  cp: { width: 28, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none' },
  colorDot: { width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 },
  deleteBtn: { marginTop: 6, width: '100%', padding: '7px', borderRadius: 6, border: '1px solid rgba(255,45,120,0.3)', background: 'transparent', color: '#ff2d78', fontSize: 11, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" },
}
