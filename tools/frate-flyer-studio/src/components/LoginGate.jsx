// LoginGate — la tabla del Express tiene RLS: sin sesión la bandeja
// llega vacía. Mismo login Supabase Auth del Express + opción demo.
import { useState } from 'react'
import '../editor/editor.css'
import { signIn } from '../lib/supabase.js'

export default function LoginGate({ onDemo }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!email || !password) { setError('Completa email y contraseña.'); return }
    setLoading(true); setError('')
    try {
      await signIn(email, password)
      // onAuthStateChange en App detecta la sesión
    } catch (err) {
      setError(err.message?.includes('Invalid login') ? 'Email o contraseña incorrectos.' : (err.message || 'Error al iniciar sesión.'))
    } finally { setLoading(false) }
  }

  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0d radial-gradient(120% 80% at 50% -10%, #17121d 0%, #0a0a0d 55%)' }}>
      <div className="ed-card" style={{ width: 380, maxWidth: '92vw' }}>
        <div className="ed-imp-brand" style={{ padding: 0, marginBottom: 4 }}>FLYER<span> STUDIO</span></div>
        <div className="ed-mini" style={{ marginBottom: 20 }}>Inicia sesión con tu cuenta de Flyer Express para leer la bandeja de eventos.</div>
        <form onSubmit={submit}>
          <div className="ed-field"><label>Email</label>
            <input className="ed-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" autoFocus disabled={loading} /></div>
          <div className="ed-field"><label>Contraseña</label>
            <input className="ed-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" disabled={loading} /></div>
          {error && <div className="ed-mini" style={{ color: '#ff5c9d', marginBottom: 10 }}>{error}</div>}
          <button className="ed-btn primary" type="submit" disabled={loading} style={{ width: '100%', padding: '11px' }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <button className="ed-btn ghost" onClick={onDemo} style={{ width: '100%', marginTop: 10 }}>
          Continuar con datos demo →
        </button>
      </div>
    </div>
  )
}
