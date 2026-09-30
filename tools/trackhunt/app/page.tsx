"use client";
import { useEffect, useRef, useState } from "react";
import { makeAudioClip } from "../lib/audio-clip";
import type { Song, SourceStatus, Version } from "../lib/remix";
import "./remix.css";

type Mode = "name" | "link" | "audio";
type Connections = { audioMode: string; webSearch: boolean; soundcloud: boolean };
type SearchResult = { versions: Version[]; sources: SourceStatus[]; searchedAt: string };
async function api(action: string, body: unknown) {
  const form = body instanceof FormData;
  const response = await fetch(`/api/remix/${action}`, { method: "POST", headers: form ? undefined : { "content-type": "application/json" }, body: form ? body : JSON.stringify(body), signal: AbortSignal.timeout(55_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la consulta.");
  return data;
}
function Artwork({ song }: { song: Song }) {
  const [failed, setFailed] = useState(false);
  return song.artwork && !failed ? <img className="rh-artwork" src={song.artwork} alt="" onError={() => setFailed(true)} /> : <span className="rh-artwork rh-artwork-empty" aria-hidden="true">♫</span>;
}
export default function RemixFinder() {
  const [mode, setMode] = useState<Mode>("name");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [clipStart, setClipStart] = useState(0);
  const [duration, setDuration] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [confirmed, setConfirmed] = useState<Song | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [connections, setConnections] = useState<Connections | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [platform, setPlatform] = useState("Todas");
  const [kind, setKind] = useState("Todas");
  const [selection, setSelection] = useState<Version[]>([]);
  const [onlySelected, setOnlySelected] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/remix/status", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setConnections).catch(error => { if (error.name !== "AbortError") setConnectionError(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!file) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(file); setAudioUrl(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  const choose = (next: Song) => {
    setSong(next); setResult(null); setConfirmed(null); setPreview(null); setOnlySelected(false); setError("");
    requestAnimationFrame(() => confirmation.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const identify = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setNotice(""); setCandidates([]); setSong(null); setConfirmed(null); setResult(null); setPreview(null);
    setBusy(mode === "audio" ? "Reconociendo fragmento…" : mode === "link" ? "Leyendo enlace…" : "Consultando catálogo…");
    try {
      if (mode === "audio") {
        if (!file) throw new Error("Selecciona un archivo de audio.");
        const clip = await makeAudioClip(file, clipStart); const form = new FormData(); form.append("file", clip, "fragment.wav");
        const data = await api("recognize", form); choose(data.song); setNotice(data.note);
      } else {
        const data = await api("identify", { mode, value });
        if (data.songs) setCandidates(data.songs);
        if (data.song) choose(data.isSet ? { ...data.song, title: "", artist: "" } : data.song);
        setNotice(data.note);
      }
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo identificar la canción."); }
    finally { setBusy(""); }
  };
  const search = async (event: React.FormEvent) => {
    event.preventDefault(); if (!song) return;
    setBusy("Buscando versiones…"); setError(""); setResult(null); setConfirmed({ ...song }); setPreview(null); setPlatform("Todas"); setKind("Todas"); setOnlySelected(false);
    try { setResult(await api("search", { title: song.title, artist: song.artist })); requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
    catch (error) { setError(error instanceof Error ? error.message : "No se pudo buscar."); }
    finally { setBusy(""); }
  };
  const editSong = (field: "title" | "artist", value: string) => { if (song) setSong({ ...song, [field]: value }); setResult(null); setConfirmed(null); setPreview(null); };
  const toggle = (row: Version) => setSelection(previous => previous.some(item => item.id === row.id) ? previous.filter(item => item.id !== row.id) : [...previous, row]);
  const exportSelection = () => {
    const cell = (text: string) => `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [["Versión", "Fuente", "Tipo", "Enlace"], ...selection.map(row => [row.title, row.platform, row.kind, row.url])].map(row => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "trackhunt-seleccion.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const visible = (onlySelected ? selection : result?.versions ?? []).filter(row => (platform === "Todas" || row.platform === platform) && (kind === "Todas" || row.kind === kind));
  const notConnected = result?.sources.every(source => source.status === "not-configured");
  return <div className="rh-app">
    <header className="rh-header"><a href="/" className="rh-brand" aria-label="Trackhunt, inicio"><span>TH</span> TRACKHUNT<span className="rh-brand-sub">DJ DIGGING TOOL</span></a><nav aria-label="Principal"><a href="#connections">Conexiones</a><a href="/sets">Sets → Deezer ↗</a></nav></header>
    <main className="rh-main">
      <div className="rh-intro"><span className="rh-kicker">UNA CANCIÓN. TODAS SUS POSIBILIDADES.</span><h1>Encuentra su próxima <em>versión.</em></h1><p>Trae la original. Explora sus remixes, edits, flips y extendeds.</p></div>
      <section className="rh-search-panel" aria-label="Identificar canción">
        <div className="rh-panel-top"><div className="rh-step"><span>01</span> ENCUENTRA LA ORIGINAL</div><span className="rh-small">Nombre → Identidad → Versiones</span></div>
        <div className="rh-tabs" aria-label="Tipo de entrada">{([['name','⌕','Nombre'],['link','↗','Enlace'],['audio','♫','Audio']] as const).map(([id, icon, label]) => <button type="button" key={id} aria-pressed={mode === id} disabled={Boolean(busy)} onClick={() => { setMode(id); setValue(""); setError(""); setNotice(""); setCandidates([]); }}><span aria-hidden="true">{icon}</span> {label}</button>)}</div>
        <form onSubmit={identify}>
          {mode !== "audio" ? <><label className="rh-label" htmlFor="entry">{mode === "name" ? "Canción o artista" : "Enlace de YouTube o SoundCloud"}</label><div className="rh-input-row"><input id="entry" value={value} onChange={e => setValue(e.target.value)} type={mode === "link" ? "url" : "text"} required minLength={2} maxLength={mode === "link" ? 2000 : 200} disabled={Boolean(busy)} placeholder={mode === "name" ? "Ej. Justin Timberlake — SexyBack" : "https://www.youtube.com/watch?v=…"} /><button className="rh-primary" disabled={Boolean(busy)}>{busy && busy !== "Buscando versiones…" ? busy : mode === "name" ? "Identificar canción ↗" : "Leer enlace ↗"}</button></div><p className="rh-help">{mode === "name" ? "Consulta el catálogo y elige la original. Si es un tema independiente, puedes introducirlo manualmente." : "Leemos los datos públicos del enlace. Un DJ set no identifica automáticamente la canción de cada minuto."}</p></> : <>
            <div className="rh-upload"><label className="rh-label" htmlFor="audio-file">Sube una canción o un fragmento · máximo 25 MB</label><input id="audio-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" disabled={Boolean(busy)} onChange={e => { const next = e.target.files?.[0] ?? null; setFile(null); setDuration(0); setClipStart(0); setError(""); if (next && next.size > 25 * 1024 * 1024) { setError("El archivo supera 25 MB. Recorta un fragmento antes de subirlo."); e.target.value = ""; } else setFile(next); }} />{audioUrl && <audio ref={audio} controls src={audioUrl} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} />}</div>
            <div className="rh-audio-options"><div><label className="rh-label" htmlFor="clip-start">Inicio del fragmento (segundos)</label><input id="clip-start" type="number" min="0" max={duration ? Math.max(0, Math.floor(duration - 3)) : undefined} step="1" value={clipStart} disabled={Boolean(busy)} onChange={e => setClipStart(Number(e.target.value))} /></div><button type="button" className="rh-secondary" disabled={!file || Boolean(busy)} onClick={() => setClipStart(Math.floor(audio.current?.currentTime ?? 0))}>Usar posición del reproductor</button><button className="rh-primary" disabled={!file || Boolean(busy)}>{busy && busy !== "Buscando versiones…" ? busy : "Reconocer 12 segundos ↗"}</button></div>
            <p className="rh-help">Al reconocer, envías solo el fragmento seleccionado a AudD. Trackhunt no guarda el archivo. {connections?.audioMode === "connected" ? "Servicio propio conectado." : "Modo evaluación: hasta 10 consultas diarias con el token público; disponibilidad sujeta a cuota."}</p>
          </>}
        </form>
        <button type="button" className="rh-text-button" disabled={Boolean(busy)} onClick={() => { choose({ title: mode === "name" ? value : "", artist: "", source: "Introducida manualmente" }); setCandidates([]); setNotice("Introduce el título de la original y su artista, sin el nombre del remixer."); }}>Ya conozco la canción: introducir título y artista →</button>
        <div role="status" aria-live="polite">{notice && <p className="rh-notice">{notice}</p>}{busy && <p className="rh-working"><span />{busy}</p>}</div>
        {error && <div className="rh-error" role="alert">{error}</div>}
        {candidates.length > 0 && <div className="rh-candidates"><h3>¿Cuál es la original?</h3><div className="rh-candidate-grid">{candidates.map((item, i) => <button type="button" key={`${item.artist}-${item.title}-${i}`} className={`rh-candidate ${song?.title === item.title && song?.artist === item.artist ? "active" : ""}`} onClick={() => choose(item)} disabled={Boolean(busy)}><Artwork song={item} /><span><strong>{item.title}</strong><small>{item.artist}</small></span><span aria-hidden="true">↗</span></button>)}</div><p className="rh-help">Resultados de Apple Music. No es un catálogo completo de todos los edits y bootlegs.</p></div>}
        {song && <div className="rh-confirm" ref={confirmation}><div className="rh-step"><span>02</span> CONFIRMA LA CANCIÓN ORIGINAL</div><p className="rh-help">{song.source} · Puedes corregir ambos campos.</p><form onSubmit={search} className="rh-confirm-form"><div><label className="rh-label" htmlFor="original-title">Título original</label><input id="original-title" value={song.title} onChange={e => editSong("title", e.target.value)} required maxLength={200} disabled={Boolean(busy)} placeholder="SexyBack" /></div><div><label className="rh-label" htmlFor="original-artist">Artista original</label><input id="original-artist" value={song.artist} onChange={e => editSong("artist", e.target.value)} required maxLength={160} disabled={Boolean(busy)} placeholder="Justin Timberlake" /></div><button className="rh-primary" disabled={Boolean(busy) || !song.title.trim() || !song.artist.trim()}>Buscar sus versiones ↗</button></form></div>}
      </section>
      <section className="rh-console" ref={results} aria-label="Resultados de versiones">
        <div className="rh-section-heading"><div><span className="rh-kicker">03 / TU MESA DE EXPLORACIÓN</span><h2>{confirmed ? <>Versiones de <span className="rh-accent">{confirmed.title}</span></> : "Versiones de la misma canción"}</h2>{confirmed && <p className="rh-help rh-original">{confirmed.artist} · Coincidencias por texto, no verificación acústica de cada remix.</p>}</div><span className="rh-count">{result ? String(result.versions.length).padStart(2, "0") : "—"}</span></div>
        <div className="rh-toolbar"><div><label htmlFor="platform">Fuente</label><select id="platform" value={platform} onChange={e => setPlatform(e.target.value)}><option>Todas</option><option>SoundCloud</option><option>Bandcamp</option></select></div><div><label htmlFor="kind">Versión</label><select id="kind" value={kind} onChange={e => setKind(e.target.value)}>{["Todas", "Remix", "Edit", "Bootleg", "Extended", "Flip", "Mashup", "Rework"].map(item => <option key={item}>{item}</option>)}</select></div><button type="button" className="rh-secondary rh-selection-toggle" aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>Mi selección ({selection.length})</button><button type="button" className="rh-text-button" disabled={!selection.length} onClick={exportSelection}>Exportar enlaces ↓</button></div>
        {result && <div className="rh-sources">{result.sources.map(source => <div className="rh-source-status" key={source.name}><span className={`rh-dot ${source.status}`} /><div><strong>{source.name}</strong><p>{source.message}</p></div><a href={source.searchUrl} target="_blank" rel="noopener noreferrer">Abrir búsqueda ↗</a></div>)}</div>}
        {visible.length ? <div className="rh-result-list">{visible.map((row, index) => <article className="rh-result" key={row.id}><div className="rh-result-main"><span className="rh-row-index">{String(index + 1).padStart(2, "0")}</span><div className="rh-result-info"><div className="rh-badges"><span className={row.platform === "SoundCloud" ? "sc" : "bc"}>{row.platform}</span><span>{row.kind}</span><span>{row.match === "title-artist" ? "Título + artista" : "Revisar artista"}</span></div><h3><a href={row.url} target="_blank" rel="noopener noreferrer">{row.title}</a></h3><p>{row.creator}</p>{row.evidence && <p className="rh-evidence">{row.evidence}</p>}<span className="rh-access">Descarga y precio: consultar en la fuente</span></div><div className="rh-result-actions">{row.platform === "SoundCloud" && <button type="button" className="rh-secondary" onClick={() => setPreview(preview === row.id ? null : row.id)}>{preview === row.id ? "Cerrar audio" : "▶ Escuchar"}</button>}<a className="rh-primary" href={row.url} target="_blank" rel="noopener noreferrer">Abrir pista ↗</a><button type="button" className="rh-text-button" aria-pressed={selection.some(item => item.id === row.id)} onClick={() => toggle(row)}>{selection.some(item => item.id === row.id) ? "✓ Seleccionada" : "+ Seleccionar"}</button></div></div>{preview === row.id && <iframe title={`Escuchar ${row.title}`} className="rh-player" height="166" allow="autoplay" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(row.url)}&auto_play=false&hide_related=true&show_comments=false`} />}</article>)}</div> : <div className="rh-empty"><span aria-hidden="true">{busy === "Buscando versiones…" ? "◌" : "↗"}</span><h3>{busy === "Buscando versiones…" ? "Consultando fuentes…" : onlySelected ? "Tu selección de esta sesión" : notConnected ? "Falta conectar la búsqueda automática." : result ? "No hay versiones para mostrar con estos filtros." : "Tu próxima mezcla empieza aquí."}</h3><p>{onlySelected ? "Selecciona versiones y exporta sus enlaces. La selección se vacía al recargar o cerrar esta página." : notConnected ? "Ya tenemos la canción original. Por ahora, abre las búsquedas de arriba o consulta cómo activar la conexión." : result ? "Puedes cambiar los filtros o buscar directamente en cada plataforma. La búsqueda no abarca todas las versiones existentes." : "Introduce un nombre, pega un enlace o sube audio. Confirma la original y compara sus versiones."}</p></div>}
        {result && <p className="rh-help">Consulta: {new Date(result.searchedAt).toLocaleString("es-CL")} · Sin duplicados de la misma URL. Distintas publicaciones se mantienen separadas.</p>}
        {selection.length > 0 && <p className="rh-help">Tu selección es temporal y solo dura esta sesión. Exporta los enlaces antes de salir. El archivo exportado no contiene audio.</p>}
      </section>
      <section className="rh-connections" id="connections"><div><span className="rh-kicker">TRANSPARENCIA DE FUENTES</span><h2>Qué está conectado</h2><p>Una búsqueda útil también te dice dónde no pudo buscar.</p></div><div className="rh-connection-grid"><div><span className="rh-connection-state">POR NOMBRE / ENLACE</span><h3>Catálogo + metadatos</h3><p>Apple Music, YouTube y SoundCloud. Confirmas el título antes de buscar sus versiones.</p></div><div><span className={`rh-connection-state ${connections?.audioMode === "connected" ? "ready" : "pending"}`}>{connectionError ? "ESTADO NO DISPONIBLE" : !connections ? "COMPROBANDO…" : connections.audioMode === "connected" ? "CONECTADO" : "EN EVALUACIÓN"}</span><h3>Reconocimiento de audio</h3><p>AudD identifica un fragmento. {connections?.audioMode === "connected" ? "Cuenta propia configurada." : "Token público de prueba, hasta 10 consultas al día. Para uso continuo se necesita una cuenta propia."}</p></div><div><span className={`rh-connection-state ${connections?.webSearch ? "ready" : "pending"}`}>{connectionError ? "ESTADO NO DISPONIBLE" : !connections ? "COMPROBANDO…" : connections.webSearch ? "CONECTADO" : connections.soundcloud ? "SOLO SOUNDCLOUD" : "CONEXIÓN PENDIENTE"}</span><h3>Búsqueda de versiones</h3><p>{connections?.webSearch ? "Índice web Brave para páginas públicas de Bandcamp y SoundCloud." : "Se necesita Brave Search API para reunir resultados de ambas plataformas. Los enlaces de búsqueda directa siguen disponibles."}</p></div></div>
        <details className="rh-setup"><summary>Cómo activar la búsqueda automática y el audio continuo</summary><p>1. Crea una cuenta en <a href="https://api-dashboard.search.brave.com/" target="_blank" rel="noopener noreferrer">Brave Search API ↗</a> y genera una clave de búsqueda web. Revisa su plan y coste antes de activarla.</p><p>2. Guarda esa clave como secreto del sitio con el nombre <code>BRAVE_SEARCH_API_KEY</code>. No la pegues en el buscador ni en una conversación.</p><p>3. Para reconocer audio sin depender del token público, crea tu cuenta en <a href="https://dashboard.audd.io/" target="_blank" rel="noopener noreferrer">AudD ↗</a> y configura <code>AUDD_API_TOKEN</code>.</p><p>Puedes pedirme ayuda para conectar estas cuentas de forma segura. Las conexiones todavía no configuradas no se presentan como fuentes consultadas.</p></details>
      </section>
    </main><footer className="rh-footer"><span>TRACKHUNT / HECHO PARA ENCONTRAR, ESCUCHAR Y ELEGIR.</span><a href="/sets">Abrir herramienta de sets y Deezer ↗</a></footer>
  </div>;
}
