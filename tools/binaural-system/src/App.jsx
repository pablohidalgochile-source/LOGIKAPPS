import React, { useEffect, useState } from 'react';
import Binaural from './Binaural.jsx';
import { useStore } from './store.js';
import { createBackup, importBackup, downloadBlob } from './backup.js';
import { Icon } from './icons.jsx';
import { validateBackup } from './backup-format.js';

class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <section role="alert" className="card error-screen"><h2>No se pudo abrir el estudio.</h2><p>{this.state.error.message}</p><p>Los originales de RESET DETOX no se han leído ni modificado.</p><button className="btn" onClick={() => location.reload()}>Volver a intentar</button></section>;
    return this.props.children;
  }
}

function GlobalPlayer() {
  const [snapshot, setSnapshot] = useState({});
  const [volume, setVolume] = useStore('binauralVolume', .22);
  useEffect(() => {
    const tick = () => {
      const engine = window._nanookEngine;
      setSnapshot({ playing: engine?.state === 'playing', stopping: engine?.state === 'stopping', patch: engine?.currentPatch, elapsed: engine?.elapsedSeconds() || 0, voice: window._ttsState, scape: window._nanookScape?.active });
    };
    const id = setInterval(tick, 350); tick(); return () => clearInterval(id);
  }, []);
  const { patch, playing, stopping, voice, scape } = snapshot;
  return <footer className="global-player" aria-label="Minirreproductor global">
    <div><div className="kicker">Binaural · {playing ? 'reproduciendo' : stopping ? 'deteniendo' : 'en pausa'}</div><div className="player-title">{patch?.name || (patch ? `${patch.leftHz} / ${patch.rightHz} Hz · Δ ${+patch.beatHz.toFixed(2)} Hz` : 'Tu espacio de escucha')}</div><span className="player-meta">{window.fmtTime?.(snapshot.elapsed) || '00:00'}{scape ? ` · ambiente ${scape}` : ''}</span></div>
    <div className="player-actions"><button type="button" className="btn" onClick={() => window._binauralTransport?.toggle()} disabled={stopping}><Icon.bolt size={15}/>{playing ? 'Detener binaural' : 'Iniciar binaural'}</button><button type="button" className="btn" onClick={() => window._binauralTransport?.stop()}>■ Detener todo</button></div>
    <label className="binaural-control"><span className="control-heading"><span>Volumen binaural</span><output>{Math.round(volume * 100)} %</output></span><input aria-label="Volumen binaural global" type="range" min="0" max="0.7" step="0.01" value={volume} onChange={e => setVolume(+e.target.value)}/></label>
    <div className="voice-global"><span className="kicker">Narración</span><div>{voice?.title || 'Sin narración'}</div>{voice && <div className="player-actions"><button className="btn btn-ghost" onClick={() => window.NanookTTS.toggle()}>{voice.paused ? 'Reanudar voz' : 'Pausar voz'}</button><button className="btn btn-ghost" onClick={() => window.NanookTTS.stop()}>Detener voz</button></div>}</div>
  </footer>;
}

function DataTools() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setMessage('Preparando respaldo con tus audios…');
    try { const payload = await createBackup(); downloadBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `binaural-system-${new Date().toISOString().slice(0, 10)}.json`); setMessage('Respaldo preparado: ajustes, biblioteca, sesiones y archivos de audio.'); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function restore(file) {
    if (!file) return;
    if (file.size > 150_000_000) { setMessage('El respaldo supera los 150 MB.'); return; }
    setBusy(true);
    try {
      const payload = JSON.parse(await file.text());
      // Validation occurs before showing a replacement prompt or modifying data.
      validateBackup(payload);
      if (!window.confirm('¿Restaurar este respaldo de BINAURAL SYSTEM? Reemplazará los ajustes y biblioteca de esta app. Se conserva una copia local anterior.')) return;
      window._binauralTransport?.stop();
      await importBackup(payload); location.reload();
    } catch (e) { setMessage('No se importó el archivo: ' + e.message); }
    finally { setBusy(false); }
  }
  return <details className="data-tools"><summary>Datos, respaldo y ayuda</summary><div className="data-tools-body"><p>Los datos y audios se guardan en este navegador. No se importan datos de RESET DETOX ni se sincronizan con una cuenta.</p><div className="player-actions"><button className="btn" onClick={save} disabled={busy}>Descargar respaldo completo</button><label className="btn file-picker">Restaurar respaldo<input type="file" accept=".json,application/json" disabled={busy} onChange={e => { restore(e.target.files?.[0]); e.target.value = ''; }}/></label></div><p role="status">{message}</p><p>El WAV del Estudio exporta la síntesis binaural, el tono central y el ruido. Los ambientes, archivos propios y voz no forman parte de ese WAV.</p><p>La narración del sistema no necesita cuenta. IA remota y voces OpenAI/ElevenLabs requieren una conexión propia que todavía no está configurada.</p></div></details>;
}

export default function App() {
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    const error = e => setStorageError(e.detail);
    window.addEventListener('binaural:storage-error', error);
    if (window._binauralStorageError) setStorageError(window._binauralStorageError);
    const dispose = () => { window._nanookEngine?.dispose(); window._nanookScape?.stop(false); window.NanookTTS?.stop(); };
    window.addEventListener('pagehide', dispose);
    return () => { window.removeEventListener('binaural:storage-error', error); window.removeEventListener('pagehide', dispose); dispose(); };
  }, []);
  return <div className="binaural-app"><header className="app-header"><div className="app-brand"><span className="brand-mark"><Icon.binaural size={24}/></span><div><strong>BINAURAL SYSTEM</strong><span>Laboratorio sonoro · módulo completo</span></div></div><span className="app-version">Versión local · 0.1</span></header>{storageError && <div className="storage-alert" role="alert">{storageError}<button className="btn btn-ghost" onClick={() => setStorageError('')}>Cerrar</button></div>}<Boundary><main className="app-main"><Binaural/></main><GlobalPlayer/></Boundary><DataTools/></div>;
}
