import { useCallback, useSyncExternalStore } from 'react';

export const STORE_PREFIX = 'binaural-system:v1:';
export const COLLECTIONS = new Set(['binauralPresets', 'binauralSessions', 'userMeditations', 'meditationVars', 'hiddenMeditations', 'binauralPrograms', 'binauralIntentions', 'binauralExtAudio']);
const cache = new Map();
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

function warn(message) {
  window._binauralStorageError = message;
  window.dispatchEvent(new CustomEvent('binaural:storage-error', { detail: message }));
}

export function validValue(key, value) {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  if (key === 'studioPatch') return value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)));
  if (COLLECTIONS.has(key)) return value === null || (Array.isArray(value) && value.length <= 5000 && value.every(item => key === 'hiddenMeditations' ? typeof item === 'string' : item && typeof item === 'object' && typeof item.id === 'string'));
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

export function readStore(key) {
  if (cache.has(key)) return cache.get(key);
  let value;
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (!validValue(key, parsed)) throw new Error('Formato inválido');
      value = parsed;
    }
  } catch {
    warn('No se pudo leer un ajuste guardado. Se usará su valor inicial.');
  }
  cache.set(key, value);
  return value;
}

export function writeStore(key, value) {
  const next = typeof value === 'function' ? value(readStore(key)) : value;
  if (!validValue(key, next)) throw new Error(`Formato inválido para ${key}.`);
  try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify(next)); }
  catch { warn('No se pudo guardar en este navegador. Los cambios quedan en memoria; descarga un respaldo.'); }
  cache.set(key, next);
  emit();
  return next;
}

export function useStore(key, initial) {
  if (readStore(key) === undefined) cache.set(key, initial);
  const getSnapshot = useCallback(() => readStore(key), [key]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback(next => writeStore(key, next), [key]);
  return [value, set];
}

export function exportState() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORE_PREFIX)) out[key.slice(STORE_PREFIX.length)] = readStore(key.slice(STORE_PREFIX.length));
  }
  for (const [key, value] of cache) if (value !== undefined && validValue(key, value)) out[key] = value;
  return out;
}

export function restoreState(state) {
  for (const key of Object.keys(exportState())) localStorage.removeItem(STORE_PREFIX + key);
  cache.clear();
  for (const [key, value] of Object.entries(state)) localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
  emit();
}

window.readStore = readStore;
window.writeStore = writeStore;
window._getStoreKey = () => 'binaural-system-v1';
window.addEventListener('storage', event => {
  if (event.key?.startsWith(STORE_PREFIX)) { cache.delete(event.key.slice(STORE_PREFIX.length)); emit(); }
});
