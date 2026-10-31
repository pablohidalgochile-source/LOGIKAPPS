// ═══════════════════════════════════════════════════════════════════
// FRATE FLYER STUDIO — App (router del flujo de 3 pasos)
//
//   PASO 0  Flyer Express (externa) → Supabase flyer_express_packages
//   PASO 1  ImportScreen: bandeja + parámetros + selección de flyer
//   PASO 2  Editor tipo Photoshop (capas, fit-to-screen, export)
//
// Rutas por URL:
//   ?view=gallery                → galería de las 6 plantillas hi-fi
//   ?template=&data=&export=1    → render plantilla para Puppeteer
//   ?edoc=<base64(doc)>&export=1 → render doc del EDITOR para Puppeteer
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react'
import LoginGate from './components/LoginGate.jsx'
import ImportScreen from './components/ImportScreen.jsx'
import TemplateGallery from './components/TemplateGallery.jsx'
import Editor from './editor/Editor.jsx'
import EditorCanvas from './editor/EditorCanvas.jsx'
import { FORMATS } from './lib/flyerData.js'
import { getSession, onAuthStateChange, signOut, supabaseAvailable } from './lib/supabase.js'

const params = new URLSearchParams(window.location.search)

// ── Modo export del EDITOR (doc completo con overrides) ──────────────
function EditorDocExport({ b64 }) {
  const doc = useMemo(() => {
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(b64))))
      return {
        templateId: d.templateId || 'rec', format: d.format || 'poster',
        palette: d.palette || 'rec', keywordFont: d.keywordFont || 'bungee',
        event: d.event || {}, overrides: d.layout_overrides || d.overrides || {}, extras: d.extras || [],
      }
    } catch (e) { return null }
  }, [b64])
  if (!doc) return <div style={{ color: '#f66', padding: 20 }}>edoc inválido</div>
  const [W, H] = FORMATS[doc.format]
  return (
    <div style={{ width: W, height: H, position: 'relative' }}>
      <EditorCanvas doc={doc} zoom={1} interactive={false} />
    </div>
  )
}

export default function App() {
  // Rutas headless / galería (constantes por carga — sin hooks aquí)
  if (params.has('edoc')) return <EditorDocExport b64={params.get('edoc')} />
  if (params.get('view') === 'gallery' || params.has('template')) {
    return <TemplateGallery onExit={() => { window.location.href = window.location.pathname }} />
  }
  return <MainFlow />
}

// ── Flujo principal: Login → Importación → Editor ────────────────────
function MainFlow() {
  const [session, setSession] = useState(undefined)   // undefined = verificando
  const [demoMode, setDemoMode] = useState(false)
  const [doc, setDoc] = useState(null)                // doc abierto en el editor

  useEffect(() => {
    if (!supabaseAvailable) { setDemoMode(true); setSession(null); return }
    getSession().then(s => setSession(s))
    const { data: { subscription } } = onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="ed-shell" />

  if (!session && !demoMode) {
    return <div className="ed-shell"><LoginGate onDemo={() => setDemoMode(true)} /></div>
  }

  if (doc) {
    return (
      <div className="ed-shell">
        <Editor initialDoc={doc} onBack={() => setDoc(null)} />
      </div>
    )
  }

  return (
    <div className="ed-shell">
      <ImportScreen
        session={session}
        onSignOut={() => { signOut(); setDemoMode(false) }}
        onCreate={({ templateId, format, palette, keywordFont, event }) =>
          setDoc({
            templateId, format, palette, keywordFont: keywordFont || 'bungee', event,
            // sin canción → capa "Canción" oculta · sin operación → capa "Line-up" oculta
            overrides: {
              ...(!event.songTitle ? { song: { visible: false } } : {}),
              ...(!event._lineup?.hasAny ? { lineup: { visible: false } } : {}),
            },
            extras: [],
          })}
      />
    </div>
  )
}
