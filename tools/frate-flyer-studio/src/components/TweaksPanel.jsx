// Panel de Tweaks genérico — se arma desde template.controls (schema).
// Reusa las clases .tw-* / #tweaks de base.css (mismo look del prototipo).
// Tipos de control: 'format' | 'palette' | 'swatch' | 'seg' | 'toggle'
import { PALETTES, FORMAT_LABELS } from '../lib/flyerData.js'

function Seg({ options, value, onPick }) {
  return (
    <div className="tw-seg">
      {Object.entries(options).map(([k, label]) => (
        <button key={k} className={k === value ? 'sel' : ''} onClick={() => onPick(k)}>{label}</button>
      ))}
    </div>
  )
}

function Toggle({ on, onFlip }) {
  return <div className={`tw-toggle${on ? ' on' : ''}`} onClick={onFlip} />
}

function Control({ ctrl, tweaks, onTweak }) {
  if (ctrl.type === 'format') {
    return (
      <div className="tw-group">
        <label>Formato Instagram</label>
        <Seg options={FORMAT_LABELS} value={tweaks.format} onPick={v => onTweak('format', v)} />
      </div>
    )
  }
  if (ctrl.type === 'palette') {
    const paletteKey = Array.isArray(tweaks.palette) ? null : tweaks.palette
    return (
      <div className="tw-group">
        <label>Paleta (3 colores)</label>
        <div className="tw-swatches">
          {Object.entries(PALETTES).map(([k, p]) => (
            <div key={k} className={`tw-pal${k === paletteKey ? ' sel' : ''}`} title={p.name} onClick={() => onTweak('palette', k)}>
              {p.colors.map((c, i) => <i key={i} style={{ background: c }} />)}
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (ctrl.type === 'swatch') {
    return (
      <div className="tw-group">
        <label>{ctrl.label}</label>
        <div className="tw-swatches">
          {ctrl.colors.map(c => (
            <div key={c} className={`tw-sw${c === tweaks[ctrl.key] ? ' sel' : ''}`} style={{ background: c }} onClick={() => onTweak(ctrl.key, c)} />
          ))}
        </div>
      </div>
    )
  }
  if (ctrl.type === 'seg') {
    return (
      <div className="tw-group">
        <label>{ctrl.label}</label>
        <Seg options={ctrl.options} value={tweaks[ctrl.key]} onPick={v => onTweak(ctrl.key, v)} />
      </div>
    )
  }
  if (ctrl.type === 'toggle') {
    return (
      <div className="tw-group">
        <div className="tw-row"><span>{ctrl.label}</span><Toggle on={!!tweaks[ctrl.key]} onFlip={() => onTweak(ctrl.key, !tweaks[ctrl.key])} /></div>
      </div>
    )
  }
  return null
}

export default function TweaksPanel({ open, onClose, controls = [], tweaks, onTweak, onRegen }) {
  return (
    <div id="tweaks" className={open ? 'on' : ''}>
      <h3>Tweaks <button onClick={onClose}>×</button></h3>
      <div className="tw-group"><button className="tw-regen" onClick={onRegen}>⟳ Regenerar (demo)</button></div>
      {controls.map((ctrl, i) => <Control key={i} ctrl={ctrl} tweaks={tweaks} onTweak={onTweak} />)}
    </div>
  )
}
