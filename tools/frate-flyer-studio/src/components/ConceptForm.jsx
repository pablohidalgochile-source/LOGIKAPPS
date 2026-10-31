import { useState, useRef } from 'react'

// Comprime una imagen a máx 1200px lado mayor → dataURL JPEG.
function compressImage(file, maxPx = 1200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width: w, height: h } = img
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx }
          else { w = Math.round(w * maxPx / h); h = maxPx }
        }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ConceptForm({ initial, onSubmit }) {
  const [titulo, setTitulo] = useState(initial?.titulo || '')
  const [fecha, setFecha] = useState(initial?.fecha || '')
  const [concurso, setConcurso] = useState(initial?.concurso || '')
  const [premio, setPremio] = useState(initial?.premio || '')
  const [instagram, setInstagram] = useState(initial?.instagram || '@fraternidadcampuscentral')
  const [foto, setFoto] = useState(initial?.foto || '')
  const [loadingFoto, setLoadingFoto] = useState(false)
  const fileRef = useRef(null)

  async function handleFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoadingFoto(true)
    try {
      const src = await compressImage(file)
      setFoto(src)
    } catch { /* ignore */ }
    setLoadingFoto(false)
    e.target.value = ''
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!titulo.trim()) return
    onSubmit({ titulo: titulo.trim(), fecha, concurso: concurso.trim(), premio: premio.trim(), instagram: instagram.trim(), foto })
  }

  const ready = titulo.trim().length > 0

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.head}>
          <span style={s.bolt}>🎨</span>
          <div>
            <div style={s.title}>FRATE FLYER STUDIO</div>
            <div style={s.sub}>Concepto → Portada editable</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>
            Título del evento *
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: 2 PA' 2" style={s.input} autoFocus />
          </label>

          <div style={s.row2}>
            <label style={s.label}>
              Fecha
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={s.input} />
            </label>
            <label style={s.label}>
              Instagram
              <input value={instagram} onChange={e => setInstagram(e.target.value)} style={s.input} />
            </label>
          </div>

          <label style={s.label}>
            Concurso (corto, para el flyer)
            <textarea value={concurso} onChange={e => setConcurso(e.target.value)} placeholder="Etiqueta a esa mala influencia" style={{ ...s.input, minHeight: 54, resize: 'vertical' }} />
          </label>

          <label style={s.label}>
            Premio
            <input value={premio} onChange={e => setPremio(e.target.value)} placeholder="4 VIP + Botella" style={s.input} />
          </label>

          {/* Foto */}
          <div style={s.fotoBox}>
            <div style={s.fotoLabel}>📸 Foto de fondo (opcional)</div>
            {foto ? (
              <div style={s.fotoPreviewWrap}>
                <img src={foto} alt="foto" style={s.fotoPreview} />
                <div style={s.fotoActions}>
                  <button type="button" onClick={() => fileRef.current?.click()} style={s.miniBtn}>Cambiar</button>
                  <button type="button" onClick={() => setFoto('')} style={{ ...s.miniBtn, color: '#ff6b9d', borderColor: 'rgba(255,45,120,0.3)' }}>Quitar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={loadingFoto} style={s.uploadBtn}>
                {loadingFoto ? 'Cargando...' : '+ Subir foto'}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFoto} />
          </div>

          <button type="submit" disabled={!ready} style={{ ...s.submit, ...(ready ? {} : s.submitDisabled) }}>
            Crear flyer →
          </button>
        </form>
      </div>
    </div>
  )
}

const s = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, background: 'rgba(10,10,20,0.95)', border: '1px solid #1a1a2e', borderRadius: 16, padding: '32px 30px', boxShadow: '0 0 60px rgba(255,45,120,0.07), 0 20px 60px rgba(0,0,0,0.6)' },
  head: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 },
  bolt: { fontSize: 30, filter: 'drop-shadow(0 0 10px rgba(255,45,120,0.6))' },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: '#f0f0f8', lineHeight: 1 },
  sub: { fontSize: 10, color: '#555568', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: 15 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: '#6666aa', textTransform: 'uppercase' },
  input: { background: 'rgba(255,255,255,0.04)', border: '1px solid #222236', borderRadius: 8, padding: '10px 12px', color: '#e0e0f0', fontSize: 13, outline: 'none' },
  fotoBox: { padding: 14, background: 'rgba(155,48,255,0.04)', border: '1px solid rgba(155,48,255,0.15)', borderRadius: 10 },
  fotoLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: '#9b30ff', textTransform: 'uppercase', marginBottom: 10 },
  uploadBtn: { width: '100%', padding: '12px', borderRadius: 8, border: '1px dashed #333350', background: 'transparent', color: '#9090aa', fontSize: 12, cursor: 'pointer' },
  fotoPreviewWrap: { display: 'flex', gap: 12, alignItems: 'center' },
  fotoPreview: { width: 64, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #2a2a3e' },
  fotoActions: { display: 'flex', flexDirection: 'column', gap: 6 },
  miniBtn: { padding: '5px 12px', borderRadius: 6, border: '1px solid #2a2a3e', background: 'transparent', color: '#c0c0d8', fontSize: 11, cursor: 'pointer' },
  submit: { marginTop: 6, padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #ff2d78, #9b30ff)', color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' },
  submitDisabled: { opacity: 0.4, cursor: 'not-allowed' },
}
