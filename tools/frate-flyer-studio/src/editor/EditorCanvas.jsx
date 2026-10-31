// ═══════════════════════════════════════════════════════════════════
// EditorCanvas — el artboard de capas. Lo usan:
//   · Editor.jsx  (interactivo: drag/rotate/scale/dblclick/selección)
//   · App ?export=1&edoc= (headless a zoom 1 para Puppeteer)
// Render 1:1 del prototipo: cada capa absoluta con transform, contenido
// via html(EVENT) (dangerouslySetInnerHTML) o extras React.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react'
import '../flyers/base.css'
import '../flyers/scanner/scanner.css'
import '../flyers/scanner2/scanner2.css'
import '../flyers/times/frate-times.css'
import '../flyers/revista/revista.css'
import '../flyers/album/album.css'
import './editor.css'
import '../lib/image-slot.js'
import { FORMATS, KW_FONTS, paletteColors } from '../lib/flyerData.js'
import { qrSvg } from '../lib/qr.js'
import { EDITOR_TEMPLATES, FONT_MAP, barHtml } from './editorTemplates.js'

/* resuelve capas base + overrides + extras a una lista uniforme */
export function resolveLayers(doc) {
  const tpl = EDITOR_TEMPLATES[doc.templateId]
  const dyB = FORMATS[doc.format][1] - 1620 // desplazamiento del pie según formato
  const base = tpl.layers.map(l => {
    const o = doc.overrides[l.id] || {}
    const baseY = l.anchor === 'bottom' ? l.y + dyB : l.y
    const locked = o.locked ?? l.locked
    return {
      ...l, isExtra: false,
      name: o.nameOverride || l.name,
      x: o.x ?? l.x, y: o.y ?? baseY, w: o.w ?? l.w,
      rot: o.rot ?? 0, scale: o.scale ?? 1, opacity: o.opacity ?? 1,
      visible: o.visible ?? true, z: o.z ?? l.z, locked,
      filter: o.filter, fit: o.fit,
      selectable: l.selectable !== false && !locked,
    }
  })
  const extras = (doc.extras || []).map(e => ({ ...e, isExtra: true, selectable: true, role: '-' }))
  return base.concat(extras)
}

// Fase 4: filtros de imagen → string CSS filter
export function filterStr(f) {
  if (!f) return ''
  const p = []
  if (f.b != null && f.b !== 1) p.push(`brightness(${f.b})`)
  if (f.c != null && f.c !== 1) p.push(`contrast(${f.c})`)
  if (f.s != null && f.s !== 1) p.push(`saturate(${f.s})`)
  if (f.g) p.push(`grayscale(${f.g})`)
  if (f.blur) p.push(`blur(${f.blur}px)`)
  return p.join(' ')
}

function styleStringToObj(str, into = {}) {
  str.split(';').forEach(rule => {
    const [k, v] = rule.split(':')
    if (k && v) into[k.trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = v.trim()
  })
  return into
}

// Fase 3: mapea los overrides de estilo de un elemento → CSS inline
function applyElStyle(el, s) {
  if (!el || !s) return
  el.style.fontFamily = s.fontFamily || ''
  el.style.fontSize = s.fontSize ? s.fontSize + 'px' : ''
  el.style.fontWeight = s.fontWeight || ''
  el.style.textAlign = s.textAlign || ''
  el.style.color = s.color || ''
  el.style.lineHeight = s.lineHeight != null ? String(s.lineHeight) : ''
  el.style.letterSpacing = s.letterSpacing != null ? s.letterSpacing + 'em' : ''
  el.style.textTransform = s.uppercase ? 'uppercase' : ''
  el.style.textShadow = s.glow ? `0 0 18px ${s.glowColor || '#ff2d78'}, 0 0 42px ${(s.glowColor || '#ff2d78')}66` : ''
  el.style.background = s.background || ''
  el.style.border = s.borderWidth ? `${s.borderWidth}px solid ${s.borderColor || '#fff'}` : ''
  el.style.borderRadius = s.borderRadius ? s.borderRadius + 'px' : ''
  el.style.opacity = s.opacity != null ? String(s.opacity) : ''
  if ((s.background || s.borderWidth) && !el.style.padding) el.style.padding = '6px 12px'
}

export default function EditorCanvas({
  doc, zoom = 1, selId = null, guides = { vx: null, hy: null }, activeEl = null,
  layerEls = null, onLayerPointerDown, onLayerDblClick, onCanvasPointerDown,
  onRotateHandle, onResizeHandle, interactive = true, worldScaled = false,
}) {
  const tpl = EDITOR_TEMPLATES[doc.templateId]
  const [W, H] = FORMATS[doc.format]
  const layers = resolveLayers(doc)
  const pal = paletteColors(doc.palette)
  const rootRef = useRef(null)

  // QR + barras + overrides de estilo por elemento: tras cada render
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll('[data-bar]').forEach(el => {
      el.innerHTML = barHtml(parseInt(el.dataset.bar, 10) || 99, 24)
    })
    root.querySelectorAll('[data-qr]').forEach(el => {
      el.innerHTML = qrSvg(el.dataset.qr || 'https://www.frate.cl')
    })
    // Fase 3: aplicar styleOverrides a cada [data-edit] (por capa)
    const so = doc.styleOverrides || {}
    if (layerEls) {
      Object.entries(so).forEach(([key, s]) => {
        const [lid, field] = key.split('::')
        const node = layerEls.current?.[lid]?.querySelector(`[data-edit="${field}"]`)
        applyElStyle(node, s)
      })
      // marcar el elemento activo (contorno)
      if (interactive && activeEl) {
        const [lid, field] = activeEl.split('::')
        layerEls.current?.[lid]?.querySelector(`[data-edit="${field}"]`)?.classList.add('ed-el-active')
      }
    }
  }, [doc, activeEl, layerEls, interactive])

  // Vars CSS por plantilla (fr-* usa accent×3+keyword; ft/rv/al mapean la
  // paleta A/B/C a sus propias vars: --stamp, --accent2, --accent3…)
  const tplVars = tpl.cssVars
    ? tpl.cssVars(pal, doc.keywordFont)
    : { '--accent': pal[0], '--accent-2': pal[1], '--accent-3': pal[2], '--f-keyword': KW_FONTS[doc.keywordFont] || KW_FONTS.bungee }
  // El escalado (zoom) lo aplica el "mundo" en Editor.jsx → aquí el canvas va
  // a tamaño real. Fuera del editor (export headless) sí escala solo.
  const canvasStyle = { width: W, height: H, ...(worldScaled ? {} : { transform: `scale(${zoom})` }), ...tplVars }

  return (
    <div className={`ed-canvas ${tpl.canvasClass || 'fr-canvas'}`} id="ed-canvas" ref={rootRef} style={canvasStyle}
      onPointerDown={interactive ? onCanvasPointerDown : undefined}>
      {layers.map(layer => {
        if (!layer.visible) return null
        const st = {
          left: layer.x, top: layer.y, width: layer.w,
          height: layer.h || 'auto',
          transform: `rotate(${layer.rot}deg) scale(${layer.scale})`,
          opacity: layer.opacity, zIndex: layer.z,
        }
        if (layer.style) styleStringToObj(layer.style, st)
        if (layer.filter) st.filter = filterStr(layer.filter)
        const isSel = interactive && selId === layer.id
        let inner
        if (layer.isExtra && layer.type === 'text') {
          st.color = layer.color
          st.fontSize = layer.fontSize
          st.fontFamily = layer.font === 'keyword' ? (KW_FONTS[doc.keywordFont] || KW_FONTS.bungee) : (FONT_MAP[layer.font] || FONT_MAP.display)
          st.lineHeight = 1
          st.textShadow = '0 2px 14px rgba(0,0,0,.6)'
          inner = <div data-edit-extra="1">{layer.text}</div>
        } else if (layer.isExtra && layer.type === 'image') {
          inner = <img src={layer.src} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="" />
        } else {
          inner = <div style={{ width: '100%', height: layer.h ? '100%' : 'auto' }} dangerouslySetInnerHTML={{ __html: layer.html(doc.event) }} />
        }
        return (
          <div key={layer.id}
            ref={layerEls ? el => (layerEls.current[layer.id] = el) : undefined}
            className={'ed-layer' + (interactive && layer.selectable ? ' selectable' : '') + (layer.locked ? ' locked' : '')}
            style={st}
            onPointerDown={interactive ? e => onLayerPointerDown?.(e, layer) : undefined}
            onDoubleClick={interactive ? e => onLayerDblClick?.(e, layer) : undefined}>
            {inner}
            {isSel && (
              <div className="ed-sel">
                <div className="rotstem" />
                <div className="h rot" onPointerDown={e => onRotateHandle?.(e, layer)} />
                <div className="h br" onPointerDown={e => onResizeHandle?.(e, layer)} />
              </div>
            )}
          </div>
        )
      })}
      {interactive && guides.vx != null && <div className="ed-guide v" style={{ left: guides.vx }} />}
      {interactive && guides.hy != null && <div className="ed-guide h" style={{ top: guides.hy }} />}
    </div>
  )
}
