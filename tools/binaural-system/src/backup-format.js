import { validateProgram } from './patch.js';

const ARRAY_KEYS = new Set(['binauralPresets', 'binauralSessions', 'userMeditations', 'meditationVars', 'hiddenMeditations', 'binauralPrograms', 'binauralIntentions', 'binauralExtAudio']);
const SCALAR_KEYS = new Set(['binauralVolume', 'ttsBackend', 'ttsOaiVoice', 'ttsOaiModel', 'ttsElVoiceId']);
function inspect(value, depth = 0) {
  if (depth > 25) throw new Error('El respaldo tiene demasiados niveles.');
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('El respaldo contiene claves no permitidas.');
    inspect(item, depth + 1);
  }
}
export function validateBackup(input) {
  if (input?.app !== 'binaural-system' || input.version !== 1) throw new Error('El archivo no es un respaldo compatible de BINAURAL SYSTEM.');
  if (!input.state || typeof input.state !== 'object' || Array.isArray(input.state)) throw new Error('Faltan los ajustes del respaldo.');
  inspect(input);
  const state = {};
  for (const [key, value] of Object.entries(input.state)) {
    if (ARRAY_KEYS.has(key)) {
      if (value !== null && (!Array.isArray(value) || value.length > 5000)) throw new Error(`Colección inválida: ${key}.`);
      if (value) for (const item of value) {
        if (key === 'hiddenMeditations') { if (typeof item !== 'string') throw new Error('Meditación oculta inválida.'); continue; }
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string') throw new Error(`Registro inválido: ${key}.`);
        if (key === 'binauralPrograms') validateProgram(item);
        if (['binauralPresets', 'binauralIntentions', 'binauralExtAudio'].includes(key) && typeof item.name !== 'string') throw new Error('Falta el nombre de un registro.');
        if (key === 'userMeditations' && (typeof item.title !== 'string' || !Number.isFinite(+item.durationMin))) throw new Error('Meditación inválida.');
        if (key === 'meditationVars' && (typeof item.label !== 'string' || !['text', 'select', 'toggle'].includes(item.kind) || (item.kind === 'select' && (!Array.isArray(item.options) || !item.options.every(x => typeof x === 'string'))))) throw new Error('Variable de meditación inválida.');
      }
    } else if (key === 'studioPatch') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuración de estudio inválida.');
      for (const v of Object.values(value)) if (!['number', 'string'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v))) throw new Error('Parámetro de estudio inválido.');
    } else if (SCALAR_KEYS.has(key)) {
      if (!['number', 'string', 'boolean'].includes(typeof value)) throw new Error('Ajuste inválido.');
    } else continue;
    state[key] = value;
  }
  const files = input.files || [];
  if (!Array.isArray(files) || files.length > 100) throw new Error('Lista de audios inválida.');
  let size = 0;
  const ids = new Set();
  for (const f of files) {
    if (typeof f.id !== 'string' || !/^ext_[\w-]+$/.test(f.id) || ids.has(f.id) || typeof f.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data) || f.data.length % 4) throw new Error('Archivo de audio inválido.');
    if (typeof f.type !== 'string' || (f.type && !/^audio\/[\w.+-]+$/.test(f.type))) throw new Error('Tipo de archivo inválido.');
    ids.add(f.id); size += f.data.length;
    if (f.data.length > 36_000_000 || size > 140_000_000) throw new Error('El respaldo de audios supera el tamaño permitido.');
  }
  for (const audio of state.binauralExtAudio || []) if (!ids.has(audio.id)) throw new Error(`Falta el audio ${audio.name} en el respaldo.`);
  return { state, files };
}
