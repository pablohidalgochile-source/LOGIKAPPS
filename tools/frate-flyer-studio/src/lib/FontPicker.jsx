/**
 * FontPicker — selector de fuente global, reutilizable en toda la app
 * Uso: <FontPicker value={font} onChange={setFont} />
 */
import { useState, useRef, useEffect } from 'react'

export const ALL_FONTS = [
  { name: 'Bebas Neue',     category: 'Display',   sample: 'FRATE 2025' },
  { name: 'Impact',         category: 'Display',   sample: 'FRATE 2025' },
  { name: 'Arial Black',    category: 'Display',   sample: 'FRATE 2025' },
  { name: 'Space Grotesk',  category: 'Sans-Serif', sample: 'Frate 2025' },
  { name: 'Space Mono',     category: 'Monospace',  sample: 'FRATE 2025' },
  { name: 'Helvetica',      category: 'Sans-Serif', sample: 'Frate 2025' },
  { name: 'Arial',          category: 'Sans-Serif', sample: 'Frate 2025' },
  { name: 'Verdana',        category: 'Sans-Serif', sample: 'Frate 2025' },
  { name: 'Georgia',        category: 'Serif',      sample: 'Frate 2025' },
  { name: 'Times New Roman',category: 'Serif',      sample: 'Frate 2025' },
  { name: 'Courier New',    category: 'Monospace',  sample: 'FRATE 2025' },
  { name: 'Trebuchet MS',   category: 'Sans-Serif', sample: 'Frate 2025' },
  { name: 'Palatino',       category: 'Serif',      sample: 'Frate 2025' },
]

const CATEGORIES = ['Todas', 'Display', 'Sans-Serif', 'Serif', 'Monospace']

export default function FontPicker({ value, onChange, size = 'sm', label = null }) {
  const [open, setOpen] = useState(false)
  const [filterCat, setFilterCat] = useState('Todas')
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = filterCat === 'Todas'
    ? ALL_FONTS
    : ALL_FONTS.filter(f => f.category === filterCat)

  const currentFont = ALL_FONTS.find(f => f.name === value) ?? ALL_FONTS[0]

  const isSmall = size === 'sm'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {label && <div style={fp.label}>{label}</div>}
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...fp.trigger,
          fontSize: isSmall ? 11 : 13,
          padding: isSmall ? '4px 10px' : '7px 14px',
          fontFamily: `"${currentFont.name}", sans-serif`,
        }}
      >
        <span style={{ fontFamily: `"${currentFont.name}", sans-serif` }}>
          {currentFont.name}
        </span>
        <span style={fp.arrow}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={fp.dropdown}>
          {/* Category filter */}
          <div style={fp.catBar}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                style={{
                  ...fp.catBtn,
                  ...(filterCat === cat ? fp.catBtnActive : {}),
                }}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* Font list */}
          <div style={fp.list}>
            {filtered.map(f => (
              <button
                key={f.name}
                onClick={() => { onChange(f.name); setOpen(false) }}
                style={{
                  ...fp.fontRow,
                  ...(value === f.name ? fp.fontRowActive : {}),
                }}
              >
                <span style={{ fontFamily: `"${f.name}", sans-serif`, fontSize: 16 }}>
                  {f.sample}
                </span>
                <span style={fp.fontName}>{f.name}</span>
                <span style={fp.fontCat}>{f.category}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Versión inline para usar dentro de paneles de propiedades
export function FontPickerInline({ value, onChange }) {
  return (
    <div style={fp.inlineWrap}>
      <div style={fp.inlineLabel}>Fuente</div>
      <select
        value={value ?? 'Bebas Neue'}
        onChange={e => onChange(e.target.value)}
        style={{
          ...fp.inlineSelect,
          fontFamily: `"${value ?? 'Bebas Neue'}", sans-serif`,
        }}
      >
        {ALL_FONTS.map(f => (
          <option key={f.name} value={f.name} style={{ fontFamily: `"${f.name}", sans-serif` }}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  )
}

const fp = {
  label: {
    fontSize: 9,
    color: '#6060aa',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #2a2a3a',
    borderRadius: 6,
    color: '#f0f0f8',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: "'Space Grotesk', sans-serif",
    transition: 'border-color 0.12s',
  },
  arrow: {
    fontSize: 8,
    color: '#666688',
    marginLeft: 4,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 9999,
    background: '#0c0c18',
    border: '1px solid #2a2a3a',
    borderRadius: 10,
    boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
    width: 280,
    marginTop: 4,
    overflow: 'hidden',
  },
  catBar: {
    display: 'flex',
    gap: 2,
    padding: '8px 8px 0',
    borderBottom: '1px solid #1a1a2a',
    paddingBottom: 6,
  },
  catBtn: {
    padding: '3px 8px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: '#666688',
    fontSize: 9,
    cursor: 'pointer',
    fontFamily: "'Space Grotesk', sans-serif",
    letterSpacing: '0.5px',
  },
  catBtnActive: {
    background: 'rgba(255,45,120,0.15)',
    color: '#ff2d78',
  },
  list: {
    maxHeight: 260,
    overflowY: 'auto',
    padding: '4px 0',
  },
  fontRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
    color: '#d0d0e8',
  },
  fontRowActive: {
    background: 'rgba(255,45,120,0.1)',
  },
  fontName: {
    fontSize: 10,
    color: '#666688',
    flex: 1,
    fontFamily: "'Space Grotesk', sans-serif",
  },
  fontCat: {
    fontSize: 8,
    color: '#444456',
    fontFamily: "'Space Grotesk', sans-serif",
    letterSpacing: '0.5px',
  },
  inlineWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  inlineLabel: {
    fontSize: 9,
    color: '#6060aa',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  inlineSelect: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #222230',
    borderRadius: 5,
    color: '#f0f0f8',
    padding: '6px 8px',
    fontSize: 12,
    boxSizing: 'border-box',
  },
}
