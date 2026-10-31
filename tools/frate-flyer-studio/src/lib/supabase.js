// ═══════════════════════════════════════════════════════════════════
// supabase.js — misma instancia/login que Flyer Express (solo lectura).
// La tabla flyer_express_packages tiene RLS: sin sesión devuelve [].
// ═══════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const TABLE = 'flyer_express_packages'

let _client = null
export function getClient() {
  if (!URL || !KEY) return null
  if (!_client) _client = createClient(URL, KEY)
  return _client
}

export const supabaseAvailable = !!(URL && KEY)

export async function getSession() {
  const sb = getClient()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session || null
}

export async function signIn(email, password) {
  const sb = getClient()
  if (!sb) throw new Error('Supabase no configurado')
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function signOut() {
  const sb = getClient()
  if (sb) await sb.auth.signOut()
}

export function onAuthStateChange(cb) {
  const sb = getClient()
  if (!sb) return { data: { subscription: { unsubscribe: () => {} } } }
  return sb.auth.onAuthStateChange(cb)
}

// Bandeja: eventos definidos en Flyer Express (no borrados), más nuevos primero
export async function fetchInbox() {
  const sb = getClient()
  if (!sb) return []
  const { data, error } = await sb
    .from(TABLE)
    .select('generated_at, selected_title, form_data, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(40)
  if (error) throw error
  return data || []
}
