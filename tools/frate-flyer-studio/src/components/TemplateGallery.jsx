// ═══════════════════════════════════════════════════════════════════
// TemplateGallery — vista previa de las 6 plantillas hi-fi (contrato
// EVENT+TWEAKS). Es la vista de export directo por plantilla
// (?view=gallery · ?template= · ?data= · ?export=1).
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import TweaksPanel from './TweaksPanel.jsx'
import { TEMPLATES, TEMPLATE_ORDER } from '../flyers/registry.js'
import { loadInjected } from '../lib/flyerData.js'

const params = new URLSearchParams(window.location.search)
const INITIAL_TEMPLATE = TEMPLATES[params.get('template')] ? params.get('template') : 'rec'
const EXPORT_MODE = params.has('export')

export default function TemplateGallery({ onExit }) {
  const [templateId, setTemplateId] = useState(INITIAL_TEMPLATE)
  const meta = TEMPLATES[templateId]

  const [docs, setDocs] = useState(() => ({
    [INITIAL_TEMPLATE]: loadInjected(TEMPLATES[INITIAL_TEMPLATE].eventDemo, TEMPLATES[INITIAL_TEMPLATE].tweaksDefault),
  }))
  const doc = docs[templateId] || { event: meta.eventDemo, tweaks: meta.tweaksDefault }

  const [panelOpen, setPanelOpen] = useState(false)
  const [sampleIdx, setSampleIdx] = useState(0)

  function switchTemplate(id) {
    setDocs(prev => prev[id] ? prev : { ...prev, [id]: { event: { ...TEMPLATES[id].eventDemo }, tweaks: { ...TEMPLATES[id].tweaksDefault } } })
    setTemplateId(id)
    setSampleIdx(0)
  }

  function onTweak(k, v) {
    setDocs(prev => ({ ...prev, [templateId]: { ...prev[templateId], tweaks: { ...prev[templateId].tweaks, [k]: v } } }))
  }

  function regenDemo() {
    const next = (sampleIdx + 1) % meta.samples.length
    setSampleIdx(next)
    const cyc = meta.regenCycle
    setDocs(prev => {
      const cur = prev[templateId]
      let tweaks = cur.tweaks
      if (cyc) {
        const idx = cyc.values.indexOf(cur.tweaks[cyc.key])
        const jump = cyc.random ? 1 + Math.floor(Math.random() * (cyc.values.length - 1)) : 1
        tweaks = { ...tweaks, [cyc.key]: cyc.values[(idx + jump + cyc.values.length) % cyc.values.length] }
      }
      return { ...prev, [templateId]: { event: { ...cur.event, ...meta.samples[next] }, tweaks } }
    })
  }

  const [w, h] = meta.size(doc.tweaks)
  const [winW, setWinW] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const s = winW / w

  const Flyer = meta.Component

  return (
    <>
      <div className={meta.stageClass} style={{ height: h * s }}>
        <div style={{ transform: `scale(${s})`, transformOrigin: 'top center', flex: 'none' }}>
          <Flyer event={doc.event} tweaks={doc.tweaks} />
        </div>
      </div>

      {!EXPORT_MODE && (
        <>
          <div style={chrome.picker}>
            {onExit && <button onClick={onExit} style={{ ...chrome.pickBtn, color: '#00e5ff' }}>← Bandeja</button>}
            {TEMPLATE_ORDER.map(id => (
              <button key={id} onClick={() => switchTemplate(id)}
                style={{ ...chrome.pickBtn, ...(id === templateId ? chrome.pickBtnActive : {}) }}>{TEMPLATES[id].name}</button>
            ))}
          </div>

          {!panelOpen && (
            <button onClick={() => setPanelOpen(true)} style={chrome.tweaksBtn}>⚙ Tweaks</button>
          )}
          <TweaksPanel
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            controls={meta.controls}
            tweaks={doc.tweaks}
            onTweak={onTweak}
            onRegen={regenDemo}
          />
        </>
      )}
    </>
  )
}

const chrome = {
  picker: {
    position: 'fixed', top: 16, left: 16, zIndex: 9998,
    display: 'flex', flexDirection: 'column', gap: 4,
    background: 'rgba(10,8,14,.92)', border: '1px solid rgba(255,255,255,.14)',
    borderRadius: 12, padding: 8, backdropFilter: 'blur(8px)',
  },
  pickBtn: {
    padding: '7px 12px', borderRadius: 8, border: '1px solid transparent',
    background: 'transparent', color: '#b9b0bd', textAlign: 'left',
    fontFamily: "'Chakra Petch', sans-serif", fontWeight: 600,
    fontSize: 11, letterSpacing: '.06em', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  pickBtnActive: {
    background: 'rgba(255,45,120,.14)', color: '#ff2d78',
    border: '1px solid rgba(255,45,120,.35)',
  },
  tweaksBtn: {
    position: 'fixed', top: 16, right: 16, zIndex: 9998,
    padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
    background: 'rgba(10,8,14,.92)', color: '#f4eef2',
    border: '1px solid rgba(255,255,255,.14)',
    fontFamily: "'Chakra Petch', sans-serif", fontWeight: 700,
    fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase',
    backdropFilter: 'blur(8px)',
  },
}
