import { exportState, restoreState } from './store.js';
import { blobStore } from './blob-store.js';
import { validateBackup } from './backup-format.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const toBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onerror = reject;
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.readAsDataURL(blob);
});
const fromBase64 = file => {
  const raw = atob(file.data), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: file.type || 'audio/wav' });
};
export async function createBackup() {
  const state = exportState(), files = [];
  for (const audio of state.binauralExtAudio || []) {
    const blob = await blobStore.get(audio.id);
    if (!blob) throw new Error(`Falta el archivo ${audio.name}. Elimina su referencia o vuelve a cargarlo antes de respaldar.`);
    files.push({ id: audio.id, type: blob.type, data: await toBase64(blob) });
  }
  return { app: 'binaural-system', version: 1, createdAt: new Date().toISOString(), state, files };
}
export async function importBackup(payload) {
  const checked = validateBackup(payload);
  const previous = exportState(), originals = new Map(), added = [];
  // Validate and decode everything before modifying either database.
  const files = checked.files.map(f => ({ id: f.id, blob: fromBase64(f) }));
  localStorage.setItem('binaural-system:before-import:v1', JSON.stringify(previous));
  try {
    for (const file of files) {
      originals.set(file.id, await blobStore.get(file.id));
      await blobStore.put(file.id, file.blob); added.push(file.id);
    }
    restoreState(checked.state);
  } catch (error) {
    for (const id of added) {
      const old = originals.get(id);
      if (old) await blobStore.put(id, old); else await blobStore.del(id);
    }
    restoreState(previous);
    throw error;
  }
}
