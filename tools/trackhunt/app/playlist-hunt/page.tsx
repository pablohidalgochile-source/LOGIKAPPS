"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeAudioClip } from "../../lib/audio-clip";
import { addHuntHistory, readHuntSnapshot, type HuntSnapshot } from "../../lib/playlist-hunt-storage";
import type { HuntInput } from "../../lib/playlist-hunt";
import type { Song } from "../../lib/remix";
import { DEFAULT_CONTROLS, PRESETS, STAGES, buildJourney, exportFiles, identity, parseHuntInput, trackLinks, zipFiles, type Controls, type Feedback, type HuntResult, type HuntTrack } from "../../lib/playlist-hunt";
import "../remix.css";
import "./playlist-hunt.css";

type Preset = { name: string; context: string; controls: Controls };
type Connections = { user?: { email: string }; spotify?: { connected: boolean; csrfToken?: string }; deezer?: { connected: boolean; csrfToken?: string } };
async function post(path: string, body: unknown, csrf?: string) {
  const form = body instanceof FormData;
  const response = await fetch(path, { method: "POST", headers: { ...(!form ? { "content-type": "application/json" } : {}), ...(csrf ? { "x-trackhunt-csrf": csrf } : {}) }, body: form ? body : JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo completar la solicitud."); return data;
}
async function generateWithProgress(input: HuntInput, onProgress: (message: string) => void, signal: AbortSignal): Promise<HuntResult> {
  const response = await fetch("/api/playlist-hunt", { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify(input), signal: AbortSignal.any([signal, AbortSignal.timeout(270_000)]) });
  if (!response.ok) { const error = await response.json().catch(()=>({})); throw new Error(error.error || "No se pudo iniciar la generación."); }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) return response.json();
  const reader = response.body?.getReader(); if (!reader) throw new Error("La conexión no devolvió resultados.");
  const decoder = new TextDecoder(); let buffer = "", result: HuntResult | null = null, bytes = 0;
  function receive(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "result") result = event.result;
    if (event.type === "progress") onProgress(event.phase === "suggesting" ? `Ronda ${event.round}: buscando propuestas · ${event.accepted}/${event.target} canciones verificadas…` : `Ronda ${event.round}: ${event.checked} propuestas revisadas · ${event.accepted}/${event.target} canciones verificadas…`);
  }
  try {
    while (true) { const {done,value} = await reader.read(); if (done) break; bytes += value.length; if (bytes > 1_000_000) throw new Error("Respuesta demasiado grande."); buffer += decoder.decode(value,{stream:true}); let end; while ((end=buffer.indexOf("\n")) >= 0) { receive(buffer.slice(0,end)); buffer=buffer.slice(end+1); } }
    buffer += decoder.decode(); receive(buffer);
    if (!result) throw new Error("Se interrumpió la conexión. Tu playlist anterior sigue guardada.");
    return result;
  } finally { await reader.cancel().catch(()=>{}); }
}
function download(name: string, data: string | Uint8Array) {
  const blob = new Blob([typeof data === "string" ? data : new Uint8Array(data).buffer], { type: typeof data === "string" ? "text/plain;charset=utf-8" : "application/zip" });
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export default function PlaylistHunt() {
  const [mode, setMode] = useState<"name" | "link" | "audio">("name");
  const [referencePending, setReferencePending] = useState(false);
  const [query, setQuery] = useState("Kapo ft. Ryan Castro — DÓNDE");
  const [reference, setReference] = useState({ artist: "Kapo ft. Ryan Castro", title: "DÓNDE" });
  const [candidates, setCandidates] = useState<Song[]>([]), [file, setFile] = useState<File | null>(null), [clipStart, setClipStart] = useState(0);
  const [context, setContext] = useState(PRESETS[0].context), [controls, setControls] = useState<Controls>({ ...DEFAULT_CONTROLS });
  const [result, setResult] = useState<HuntResult | null>(null), [resultReference, setResultReference] = useState("");
  const [selection, setSelection] = useState<string[]>([]), [feedback, setFeedback] = useState<Feedback[]>([]), [presets, setPresets] = useState<Preset[]>([]);
  const [name, setName] = useState("NANOOK Caribbean Summer"), [presetName, setPresetName] = useState("");
  const [paths, setPaths] = useState<Record<string, string>>({}), [format, setFormat] = useState("pack.zip");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [storageKey, setStorageKey] = useState(""), [ready, setReady] = useState(false), [createdLink, setCreatedLink] = useState("");
  const [history, setHistory] = useState<HuntSnapshot[]>([]), [resultInput, setResultInput] = useState<HuntInput | null>(null), [snapshotId, setSnapshotId] = useState("");
  const [historyChoice, setHistoryChoice] = useState("");
  const generationController = useRef<AbortController | null>(null);
  const resultSection = useRef<HTMLElement>(null), busyRef = useRef(false);
  useEffect(() => () => generationController.current?.abort(), []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/connections/status"); const status: Connections = await response.json();
        if (!response.ok || !status.user?.email) throw new Error("No se pudo cargar tu sesión. Recarga la página o revisa Conexiones.");
        if (cancelled) return;
        const key = `trackhunt:playlist-hunt:v1:${status.user.email}`;
        try {
          const saved = JSON.parse(localStorage.getItem(key) || "null");
          if (saved && saved.version === 1) {
            if (saved.input) {
              const restored = parseHuntInput({ ...saved.input, feedback: saved.feedback });
              setReference(restored.reference); setQuery(`${restored.reference.artist} — ${restored.reference.title}`); setContext(restored.context); setControls(restored.controls); setFeedback(restored.feedback);
            }
            if (Array.isArray(saved.presets)) setPresets(saved.presets.slice(0, 30).flatMap((p: Preset) => {
              try { const valid = parseHuntInput({ reference: { artist: "preset", title: "preset" }, context: p.context, controls: p.controls }); return typeof p.name === "string" ? [{ name: p.name.slice(0, 80), context: valid.context, controls: valid.controls }] : []; } catch { return []; }
            }));
            const current = readHuntSnapshot({ ...saved, id:saved.snapshotId || crypto.randomUUID(), savedAt:new Date().toISOString(), input:saved.resultInput || saved.input });
            if (current) {
              setResultInput(current.input); setSnapshotId(current.id); setPaths(current.paths);
              setResult(current.result); setSelection(current.selection); setName(current.name); setResultReference(current.resultReference);
            }
          }
          if (Array.isArray(saved?.history)) setHistory(saved.history.map(readHuntSnapshot).filter((h: HuntSnapshot | null): h is HuntSnapshot => !!h).slice(0,10));
          setStorageKey(key);
        } catch { setNotice("El almacenamiento del navegador no está disponible. Puedes trabajar y descargar el pack, pero esta sesión no se guardará."); }
        setReady(true);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!storageKey || !ready || !reference.artist.trim() || !reference.title.trim()) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, input: { reference, context, controls }, feedback, presets, result, selection, name, resultReference, paths, history, resultInput, snapshotId })); }
    catch { queueMicrotask(() => setNotice("No se pudo guardar en este navegador. Descarga el pack para conservar la selección.")); }
  }, [storageKey, ready, reference, context, controls, feedback, presets, result, selection, name, resultReference, paths, history, resultInput, snapshotId]);
  async function action(label: string, run: () => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(label); setError(""); setNotice(""); setCreatedLink("");
    try { await run(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la acción."); }
    finally { busyRef.current = false; setBusy(""); }
  }
  function choose(song: Pick<Song, "artist" | "title">) { setReference({ artist: song.artist, title: song.title }); setReferencePending(false); if (mode === "name") setQuery(`${song.artist} — ${song.title}`); setCandidates([]); }
  function identify() { void action("Identificando referencia…", async () => {
    setCandidates([]);
    setReferencePending(true);
    setReference({ artist: "", title: "" });
    if (mode === "audio") {
      if (!file) throw new Error("Selecciona un archivo de audio.");
      const form = new FormData(); form.append("file", await makeAudioClip(file, clipStart), "fragment.wav");
      const data = await post("/api/remix/recognize", form); choose(data.song); setNotice(data.note);
    } else {
      const data = await post("/api/remix/identify", { mode, value: query });
      if (data.isSet) throw new Error("El enlace parece un set. Sube un fragmento de la canción o indica artista y título.");
      if (data.songs) setCandidates(data.songs); if (data.song) choose(data.song); setNotice(data.note || "Confirma la referencia.");
    }
  }); }
  function generate() { void action("Seleccionando canciones y comprobando catálogo…", async () => {
    if (referencePending) throw new Error("Confirma la nueva referencia: elige un resultado o completa artista y canción debajo.");
    if (!reference.artist.trim() || !reference.title.trim()) throw new Error("Completa artista y título.");
    if (controls.bpmMin > controls.bpmMax) throw new Error("El BPM mínimo no puede superar al máximo.");
    const input = parseHuntInput({ reference, context, controls, feedback });
    const controller = new AbortController(); generationController.current = controller;
    let next: HuntResult;
    try { next = await generateWithProgress(input, setBusy, controller.signal); }
    catch (e) { if (controller.signal.aborted) throw new Error("Generación cancelada. Tu playlist anterior se conserva."); throw e; }
    finally { generationController.current = null; }
    const id = crypto.randomUUID(), savedAt = new Date().toISOString();
    const selectedIds = next.tracks.filter(t=>t.catalogStatus === "verified").map(t=>t.id);
    setHistory(previous => {
      const old = result && resultInput ? readHuntSnapshot({ id: snapshotId || crypto.randomUUID(), savedAt, input:resultInput, result, selection, name, resultReference, paths }) : null;
      const retained = old ? addHuntHistory(previous, old) : previous;
      return addHuntHistory(retained, { id, savedAt, input, result:next, selection:selectedIds, name:next.name, resultReference:`${reference.artist} — ${reference.title}`, paths:{} });
    });
    setResultInput(input); setSnapshotId(id);
    setResult(next); setName(next.name); setResultReference(`${reference.artist} — ${reference.title}`); setSelection(next.tracks.filter(t => t.catalogStatus === "verified").map(t => t.id)); setPaths({});
    setNotice(`${next.tracks.length >= controls.count ? "Playlist completa" : "Playlist parcial"}: ${next.tracks.length} de ${controls.count} canciones verificadas. Revisa las versiones y los BPM pendientes antes de exportar.`);
    requestAnimationFrame(() => resultSection.current?.scrollIntoView({ behavior: "smooth" }));
  }); }
  function restoreHistory() {
    const saved = history.find(h=>h.id === historyChoice); if (!saved || busy || saved.id === snapshotId) return;
    if (result && resultInput) {
      const current = readHuntSnapshot({ id:snapshotId || crypto.randomUUID(), savedAt:new Date().toISOString(), input:resultInput, result, selection, name, resultReference, paths });
      if (current) setHistory(previous=>addHuntHistory(previous,current));
    }
    setReference(saved.input.reference); setQuery(`${saved.input.reference.artist} — ${saved.input.reference.title}`); setMode("name"); setReferencePending(false); setCandidates([]);
    setContext(saved.input.context); setControls(saved.input.controls); setResultInput(saved.input); setSnapshotId(saved.id); setResult(saved.result); setName(saved.name); setSelection(saved.selection); setPaths(saved.paths); setResultReference(saved.resultReference); setError(""); setNotice("Playlist restaurada con su selección y rutas locales. Tu feedback actual se conserva.");
  }
  function vote(t: HuntTrack, decision: Feedback["decision"]) {
    setFeedback(prev => [...prev.filter(f => identity(f.artist, f.title) !== t.id), { artist: t.artist, title: t.title, decision }].slice(-100));
    setSelection(prev => decision === "accept" ? [...new Set([...prev, t.id])] : prev.filter(id => id !== t.id));
  }
  const selected = result?.tracks.filter(t => selection.includes(t.id)) || [];
  function savePreset() {
    if (!presetName.trim()) { setError("Escribe un nombre para tu preset."); return; }
    const next = { name: presetName.trim().slice(0, 80), context, controls: { ...controls } };
    setPresets(prev => [...prev.filter(p => p.name !== next.name), next].slice(-30)); setPresetName(""); setNotice("Preset guardado en este navegador.");
  }
  function exportLocal() {
    if (!selected.length) return;
    const linked = selected.filter(t=>/^\/(?!\/)/.test(paths[t.id] || "") && !/[\r\n\0]/.test(paths[t.id]));
    if ((format === "playlist.m3u8" || format === "rekordbox.xml") && !linked.length) { setError("Vincula al menos un archivo propio para exportar M3U8 o Rekordbox. CSV, TXT y el pack de enlaces no necesitan archivos."); return; }
    setError("");
    const files = exportFiles(name, selected, paths);
    if (format === "pack.zip") download("playlist-hunt-pack.zip", zipFiles(files));
    else download(format, files[format as keyof typeof files]);
    setNotice(`Exportación preparada: ${selected.length} canciones; ${linked.length} archivos locales vinculados.`);
  }
  function platformExport(platform: "spotify" | "deezer") { void action(`Creando playlist en ${platform === "spotify" ? "Spotify" : "Deezer"}…`, async () => {
    const response = await fetch("/api/connections/status"), connection: Connections = await response.json();
    if (!response.ok || !connection[platform]?.connected) throw new Error(`Conecta ${platform === "spotify" ? "Spotify" : "Deezer"} en Conexiones antes de exportar.`);
    if (!name.trim() || !selected.length) throw new Error("Pon un nombre y selecciona canciones.");
    if (platform === "spotify") {
      const data = await post("/api/connections/spotify/create-playlist", { name, tracks: selected.map(t => ({ artist: t.artist, title: t.title })) }, connection.spotify?.csrfToken);
      setNotice(`Spotify: ${data.added} de ${selected.length} canciones añadidas. Revisa la lista en tu cuenta.`);
      const url = data.playlist?.url || data.playlist?.spotifyUrl || data.playlist?.external_urls?.spotify;
      if (typeof url === "string" && url.startsWith("https://open.spotify.com/playlist/")) setCreatedLink(url);
    } else {
      const ids = selected.map(t => t.deezerId).filter((id): id is number => !!id);
      if (ids.length !== selected.length) throw new Error("Para Deezer selecciona solo canciones verificadas; las demás siguen disponibles en el pack de enlaces.");
      const data = await post("/api/deezer/playlist", { title: name, trackIds: ids }, connection.deezer?.csrfToken);
      setNotice(`Deezer: playlist creada con ${ids.length} canciones.`);
      if (data.playlist?.link?.startsWith("https://www.deezer.com/playlist/")) setCreatedLink(data.playlist.link);
    }
  }); }
  const sliders = [["discovery", "Más parecido", "Más descubrimiento"], ["commercial", "Underground", "Comercial"], ["energy", "Relax", "Fiesta"], ["international", "Local", "Internacional"]] as const;
  return <div className="rh-app ph-app">

    <main className="rh-main">
      <section className="rh-intro ph-intro"><div><span className="rh-kicker">TU REFERENCIA → TU CRITERIO → TU PRÓXIMO SET</span><h1>PLAYLIST <em>HUNT.</em></h1><p>Una canción abre el camino.<br />Tú decides hasta dónde llevar la pista.</p></div><div className="ph-disc" aria-hidden="true"><span>TH<br /><small>SELECT / CONNECT / PLAY</small></span></div></section>
      <fieldset disabled={!!busy || !ready} className="ph-fieldset">
        <div className="ph-grid">
          <section className="rh-search-panel"><h2 className="rh-step"><span>01</span> LA REFERENCIA</h2>
            <div className="rh-tabs">{([["name", "Canción"], ["link", "YouTube"], ["audio", "Audio"]] as const).map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => { setMode(key); setQuery(key === "name" ? `${reference.artist} — ${reference.title}` : ""); }}>{label}</button>)}</div>
            {mode === "audio" ? <div className="rh-upload"><label className="rh-label" htmlFor="ph-file">Archivo de referencia · MP3, WAV o M4A</label><input id="ph-file" type="file" accept="audio/*" onChange={e => { setFile(e.target.files?.[0] || null); setReferencePending(true); }} /><label className="rh-label" htmlFor="ph-start">Inicio del fragmento (segundos)</label><input id="ph-start" type="number" min="0" value={clipStart} onChange={e => setClipStart(Number(e.target.value))} /><p className="rh-help">Se envían hasta 12 segundos al reconocimiento de Track Hunt. Hasta 120 MB / 20 minutos. Puedes corregir el resultado debajo.</p></div> : <><label className="rh-label" htmlFor="ph-query">{mode === "link" ? "Enlace de YouTube" : "Artista + canción"}</label><input id="ph-query" value={query} onChange={e => { setQuery(e.target.value); setReferencePending(true); }} placeholder={mode === "link" ? "https://www.youtube.com/watch?v=…" : "Kapo ft. Ryan Castro — DÓNDE"} /></>}
            <button className="rh-secondary ph-identify" onClick={identify}>{mode === "audio" ? "Reconocer fragmento" : "Buscar referencia"}</button>
            {!!candidates.length && <div className="rh-candidates"><h3>Elige la grabación</h3>{candidates.map((s, i) => <button className="rh-candidate ph-candidate" key={i} onClick={() => choose(s)}><span><strong>{s.title}</strong><small>{s.artist}</small></span><span>↗</span></button>)}</div>}
            <div className="ph-reference"><p className="rh-help">{referencePending ? "Nueva búsqueda pendiente: elige un resultado o completa artista y canción para usarla." : "Referencia para generar: confirma o corrige estos dos campos."}</p><label className="rh-label" htmlFor="ph-artist">Artista</label><input id="ph-artist" value={reference.artist} maxLength={160} onChange={e => { const next = { ...reference, artist: e.target.value }; setReference(next); setReferencePending(false); if (mode === "name") setQuery(`${next.artist} — ${next.title}`); }} /><label className="rh-label" htmlFor="ph-title">Canción</label><input id="ph-title" value={reference.title} maxLength={200} onChange={e => { const next = { ...reference, title: e.target.value }; setReference(next); setReferencePending(false); if (mode === "name") setQuery(`${next.artist} — ${next.title}`); }} /></div>
          </section>
          <section className="rh-search-panel"><h2 className="rh-step"><span>02</span> EL ADN DE TU SET</h2><div className="ph-presets">{[...PRESETS, ...presets].map((p, i) => <button className="rh-secondary" key={i} onClick={() => { setContext(p.context); setControls({ ...p.controls }); }}>{p.name}</button>)}</div>
            <label className="rh-label" htmlFor="ph-context">Contexto libre</label><textarea id="ph-context" rows={3} maxLength={2000} value={context} onChange={e => setContext(e.target.value)} />
            <div className="ph-sliders">{sliders.map(([key, left, right]) => <label key={key} className="ph-slider"><span>{left}<b>{controls[key]}</b>{right}</span><input type="range" min="0" max="100" value={controls[key]} aria-label={`${left} a ${right}`} onChange={e => setControls({ ...controls, [key]: Number(e.target.value) })} /></label>)}</div>
            <div className="ph-controls">{([["bpmMin", "BPM mínimo", 40, 220], ["bpmMax", "BPM máximo", 40, 220], ["count", "Canciones", 5, 50]] as const).map(([key, label, min, max]) => <label key={key} className="rh-label">{label}<input type="number" min={min} max={max} value={controls[key]} onChange={e => setControls({ ...controls, [key]: Number(e.target.value) })} /></label>)}</div>
            <label className="rh-label" htmlFor="ph-region">Tu escena local</label><input id="ph-region" value={controls.localRegion} maxLength={80} onChange={e => setControls({ ...controls, localRegion: e.target.value })} />
            <div className="ph-save"><input aria-label="Nombre de tu preset" value={presetName} maxLength={80} onChange={e => setPresetName(e.target.value)} placeholder="Nombre de tu preset" /><button className="rh-secondary" onClick={savePreset}>Guardar preset</button></div>
          </section>
        </div>
        <div className="ph-generate"><div><strong>{feedback.length} decisiones para afinar tu selección</strong><p className="rh-help">Presets, feedback, rutas e historial de hasta 10 playlists se guardan en este navegador. El contexto y la referencia se envían a OpenAI al generar.</p>{!!feedback.length && <button className="rh-text-button" onClick={() => setFeedback([])}>Olvidar feedback</button>}</div><button className="rh-primary" onClick={generate}>Generar playlist ↗</button></div>
      </fieldset>
      <div aria-live="polite">{busy && <p className="rh-working"><span />{busy} {generationController.current && <button type="button" className="rh-secondary" onClick={()=>generationController.current?.abort()}>Cancelar generación</button>}</p>}{notice && <p className="rh-notice">{notice} {createdLink && <a href={createdLink} target="_blank" rel="noreferrer">Abrir playlist ↗</a>}</p>}</div>{error && <p role="alert" className="rh-error">{error} {/conexi[oó]n|conect|clave|sesi[oó]n|OpenAI|Spotify|Deezer/i.test(error) && <Link href="/connections">Ver conexiones ↗</Link>}</p>}
      {!!history.length && <section className="rh-search-panel ph-history" aria-label="Playlists guardadas"><h2>Tu historial de playlists</h2><p className="rh-help">Hasta 10 generaciones en este navegador. Restaurar recupera selección, contexto y rutas de archivos.</p><div className="ph-export-row"><select aria-label="Playlist guardada" value={historyChoice} onChange={e=>setHistoryChoice(e.target.value)} disabled={!!busy}><option value="">Elegir una playlist…</option>{history.map(h=><option key={h.id} value={h.id} disabled={h.id === snapshotId}>{new Date(h.savedAt).toLocaleString()} · {h.id === snapshotId ? name : h.name} · {h.result.tracks.length} canciones{h.id === snapshotId ? " · actual" : ""}</option>)}</select><button className="rh-secondary" disabled={!!busy || !historyChoice || historyChoice === snapshotId} onClick={restoreHistory}>Restaurar playlist</button></div></section>}
      <section className="rh-console" ref={resultSection} aria-label="Playlist generada">
        <div className="rh-section-heading"><div><span className="rh-kicker">03 / LA SELECCIÓN</span><h2>Tu próximo viaje DJ</h2></div><span className="rh-count">{String(result?.tracks.length || 0).padStart(2, "0")}</span></div>
        {!result ? <div className="rh-empty"><span>↗</span><h3>El primer tema es solo el comienzo.</h3><p>La referencia DÓNDE y el preset Caribbean Summer están listos para probar.<br />Genera una playlist, escucha, selecciona y construye el viaje.</p></div> : <>
          <p className="rh-help">Referencia de esta playlist: {resultReference}</p><p className="rh-help">Lectura curatorial de IA · sin análisis acústico</p>{result.stats && <p className="rh-notice">{result.stats.verified}/{result.stats.requested} canciones verificadas · {result.stats.checked} propuestas revisadas · {result.stats.rounds} rondas</p>}<p>{result.summary}</p>
          <details open className="rh-setup"><summary>Datos pendientes y criterios</summary>{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>
          <fieldset disabled={!!busy} className="ph-fieldset"><div className="ph-toolbar"><button className="rh-primary" onClick={() => { setResult({ ...result, tracks: buildJourney(result.tracks) }); setNotice("Viaje ordenado por etapa, energía estimada y BPM disponible. Escucha las transiciones: no es una mezcla armónica verificada."); }}>Construir viaje DJ</button><button className="rh-secondary" onClick={() => setSelection(result.tracks.filter(t => t.catalogStatus === "verified" && !feedback.some(f => identity(f.artist, f.title) === t.id && f.decision === "reject")).map(t => t.id))}>Seleccionar verificadas</button><button className="rh-secondary" onClick={() => setSelection(prev => prev.filter(id => result.tracks.find(t => t.id === id)?.bpm != null))}>Excluir BPM pendientes</button><button className="rh-secondary" onClick={() => setSelection([])}>Vaciar selección</button></div>
          <div className="ph-stages">{STAGES.map(s => <span key={s}>{s}<b>{result.tracks.filter(t => t.stage === s).length}</b></span>)}</div>
          <div className="ph-tracks">{result.tracks.map((t, i) => {
            const decision = feedback.find(f => identity(f.artist, f.title) === t.id)?.decision, links = trackLinks(t);
            return <article key={t.id} className={`rh-result ph-track ${decision === "reject" ? "ph-rejected" : ""}`}><div className="ph-track-top"><label className="ph-select"><input type="checkbox" checked={selection.includes(t.id)} aria-label={`Seleccionar ${t.artist} ${t.title}`} onChange={e => setSelection(prev => e.target.checked ? [...new Set([...prev, t.id])] : prev.filter(id => id !== t.id))} /><span>{String(i + 1).padStart(2, "0")}</span></label><div className="ph-track-title"><div className="rh-badges"><span>{t.stage}</span><span>{t.catalogStatus === "verified" ? "IDENTIDAD VERIFICADA · DEEZER" : "SUGERENCIA POR VERIFICAR"}</span></div><h3>{t.title}</h3><p>{t.artist}</p></div><div className="ph-affinity"><strong>{t.similarity}%</strong><small>Afinidad IA</small></div></div>
              <div className="ph-metadata"><span>BPM <b>{t.bpm ?? "Pendiente"}</b>{t.bpm && <small>Deezer</small>}</span><span>KEY <b>{t.key ?? "Pendiente"}</b></span><span>ENERGÍA IA <b>{t.energy}/100</b></span><span>ESTILO IA <b>{t.genre}</b></span><span>REGIÓN / IDIOMA IA <b>{t.region} · {t.language}</b></span></div><p className="ph-reason">{t.reason}</p>
              <div className="ph-track-actions"><a href={links.deezer} target="_blank" rel="noreferrer">Deezer ↗</a><a href={links.spotify} target="_blank" rel="noreferrer">Buscar en Spotify ↗</a><a href={links.youtube} target="_blank" rel="noreferrer">Buscar en YouTube ↗</a><button className="rh-secondary" aria-pressed={decision === "accept"} onClick={() => vote(t, "accept")}>✓ Me sirve</button><button className="rh-secondary" aria-pressed={decision === "reject"} onClick={() => vote(t, "reject")}>✕ No encaja</button></div>
              <details className="ph-local"><summary>Vincular mi archivo para M3U / Rekordbox</summary><label className="rh-label">Ruta absoluta en tu ordenador<input value={paths[t.id] || ""} onChange={e => setPaths({ ...paths, [t.id]: e.target.value })} placeholder="/Volumes/MUSICA/cancion.mp3" /></label><p className="rh-help">No se sube ni se descarga el archivo. La ruta se incluye tal como la indiques y debes comprobar que existe.</p></details>
            </article>;
          })}</div>
          <section className="ph-export"><span className="rh-kicker">04 / LLEVA TU SET CONTIGO</span><h2>{selected.length} canciones seleccionadas</h2><label className="rh-label" htmlFor="ph-name">Nombre de la playlist</label><input id="ph-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} /><div className="ph-export-row"><select aria-label="Formato de exportación" value={format} onChange={e => setFormat(e.target.value)}><option value="pack.zip">Pack completo · ZIP</option><option value="playlist.csv">CSV</option><option value="playlist.txt">TXT</option><option value="enlaces-plataformas.csv">Spotify / Deezer / YouTube · enlaces</option><option value="playlist.m3u8">M3U8 · archivos vinculados</option><option value="rekordbox.xml">Rekordbox XML · archivos vinculados</option><option value="metadata.json">Metadatos JSON</option></select><button className="rh-primary" disabled={!selected.length} onClick={exportLocal}>Descargar exportación ↓</button></div><div className="ph-toolbar"><button className="rh-secondary" disabled={!selected.length} onClick={() => platformExport("spotify")}>Crear en mi Spotify ↗</button><button className="rh-secondary" disabled={!selected.length} onClick={() => platformExport("deezer")}>Crear en mi Deezer ↗</button><button className="rh-secondary" onClick={generate}>Refinar con mi feedback ↗</button></div><p className="rh-help">El pack contiene CSV, TXT, enlaces de búsqueda, JSON, M3U8, XML y guía de uso. M3U8/XML incluyen solo tus archivos vinculados. Serato: CSV/TXT como guía e importación manual de archivos; no se crea un .crate. YouTube: enlaces para crear tu lista manualmente. No incluye audio.</p></section></fieldset>
        </>}
      </section>
    </main><footer className="rh-footer"><span>TRACKHUNT / EL CRITERIO SIGUE SIENDO TUYO.</span><Link href="/connections">Gestionar conexiones ↗</Link></footer>
  </div>;
}
