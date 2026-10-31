import { useState } from 'react'
import CanvasEditor from '../lib/CanvasEditor.jsx'

// FlyerStudio plantilla-driven: recibe una plantilla ({ nombre, ratio,
// compose, background }) y los datos del evento. Compone las capas y monta
// el editor. Las ediciones manuales se conservan hasta que regeneres.
export default function FlyerStudio({ template, data, onBack }) {
  const [layers, setLayers] = useState(() => template.compose(data))
  const [background, setBackground] = useState(() => template.background(data))

  function regenerar() {
    if (!confirm('¿Regenerar el flyer desde los datos? Perderás las ediciones manuales.')) return
    setLayers(template.compose(data))
    setBackground(template.background(data))
  }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.headLeft}>
          {onBack && <button onClick={onBack} style={s.backBtn}>← Volver</button>}
          <div>
            <div style={s.title}>{template.nombre}</div>
            <div style={s.sub}>{data.titulo1 ? `${data.titulo1} ${data.titulo2 || ''}`.trim() : (data.titulo || 'Flyer')} · {layers.length} capas editables</div>
          </div>
        </div>
        <button onClick={regenerar} style={s.regenBtn}>↻ Regenerar</button>
      </div>

      <div style={s.editorWrap}>
        <CanvasEditor
          layers={layers}
          onLayersChange={setLayers}
          background={background}
          onBackgroundChange={setBackground}
          format={template.ratio || 'story'}
          showLayerPanel
          showPropsPanel
          showFormatPicker={false}
          showExportBtn
        />
      </div>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 22px', borderBottom: '1px solid #1a1a28', flexWrap: 'wrap' },
  headLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  backBtn: { padding: '7px 14px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#c0c0d8', fontSize: 12, cursor: 'pointer' },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2, color: '#f0f0f8', lineHeight: 1 },
  sub: { fontSize: 10, color: '#555568', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 },
  regenBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(155,48,255,0.4)', background: 'rgba(155,48,255,0.1)', color: '#9b30ff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  editorWrap: { padding: 18, overflow: 'auto' },
}
