"use client";

import { useEffect, useRef, useState } from "react";
import { ASSISTANT_ORIGIN, parseAssistantSnapshot, finalShazamTracks, shazamTime, type ShazamSnapshot } from "../../lib/shazam-assistant";

import SetReview from "./SetReview";

type Props = { disabled: boolean; onImport: (snapshot: ShazamSnapshot) => Promise<void> };
export default function ShazamScanner({ disabled, onImport }: Props) {
  const [session, setSession] = useState<{ token: string; ready: boolean; review: boolean; shortReview: boolean; speedReview: boolean } | null>(null);
  const [snapshot, setSnapshot] = useState<ShazamSnapshot | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [jobs, setJobs] = useState<{id: string; name: string}[]>([]);
  const [step, setStep] = useState(60);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");
  const [importedId, setImportedId] = useState("");
  const [importedRevision, setImportedRevision] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const revision = snapshot ? `${snapshot.id}:${snapshot.completed}:${snapshot.status === "complete"}:${snapshot.revision ?? 0}` : "";
  const automaticRevision = snapshot ? `${snapshot.id}:${snapshot.completed}:${snapshot.total}:${snapshot.status === "complete"}` : "";
  const [importing, setImporting] = useState(false);
  const importRef = useRef(onImport);
  const consumed = useRef("");
  const mounted = useRef(true);
  importRef.current = onImport;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function request(path: string, body?: object, token = session?.token) {
    const response = await fetch(`${ASSISTANT_ORIGIN}/v1/${path}`, {
      method: body ? "POST" : "GET", credentials: "omit", cache: "no-store",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { "X-Trackhunt-Token": token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(["start", "relink"].includes(path) ? 115_000 : 8000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo comunicar con el asistente.");
    return data;
  }
  async function connect() {
    setWorking(true); setProblem("");
    try {
      const data = await request("session", undefined, "");
      if (data.service !== "trackhunt-shazam" || data.protocolVersion !== 1 || typeof data.token !== "string" ||
          !/^[0-9a-f-]{72}$/i.test(data.token) || typeof data.ready !== "boolean") throw new Error("Actualiza el asistente de Track Hunt para Mac.");
      if (!mounted.current) return;
      setSession({ token: data.token, ready: data.ready, review: data.review === true, shortReview: data.shortReview === true, speedReview: data.speedReview === true });
      if (data.review) setJobs(await request("jobs", undefined, data.token));
      if (!data.ready) setProblem("El asistente está conectado, pero es una versión antigua o le falta ShazamIO. Descarga la versión actualizada, cierra la anterior y vuelve a conectar.");
    } catch (error) {
      setSession(null);
      setProblem(error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")
        ? "No se pudo conectar con el asistente. Ábrelo en este Mac y permite el acceso a la red local si tu navegador lo solicita. Si el navegador integrado lo bloquea, abre Track Hunt en Safari o Chrome."
        : error instanceof Error ? error.message : "No se pudo conectar con el asistente.");
    } finally { if (mounted.current) setWorking(false); }
  }
  // Reconnect to the existing local job on opening Sets. This never starts a capture.
  useEffect(() => { void connect(); }, []);
  useEffect(() => {
    if (!session) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, failures = 0;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`${ASSISTANT_ORIGIN}/v1/status`, { credentials: "omit", cache: "no-store",
          headers: { "X-Trackhunt-Token": session!.token }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error("No se pudo consultar el barrido.");
        const next = parseAssistantSnapshot(await response.json());
        if (stopped) return;
        failures = 0; setSnapshot(next);
        if (next.status !== "idle") setStep(next.step);
      } catch {
        if (stopped) return;
        failures++;
        if (failures >= 3) {
          setProblem("Se perdió la conexión. El asistente puede seguir trabajando en tu Mac: vuelve a conectarlo para recuperar el progreso.");
          setSession(null); return;
        }
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [session]);
  useEffect(() => {
    if (!snapshot || !["complete", "paused", "error"].includes(snapshot.status) || !snapshot.tracks.length || disabled || importing || consumed.current === automaticRevision) return;
    consumed.current = automaticRevision; setImporting(true);
    void importRef.current(snapshot).then(() => { if (mounted.current) { setImportedId(snapshot.id); setImportedRevision(revision); setImportedCount(finalShazamTracks(snapshot).length); } })
      .catch(() => { if (mounted.current) setProblem("No se pudo incorporar la tracklist. Usa el botón para reintentar."); })
      .finally(() => { if (mounted.current) setImporting(false); });
  }, [snapshot, disabled, importing, revision, automaticRevision]);
  async function command(action: string, body?: object) {
    setWorking(true); setProblem("");
    try {
      await request(action, body ?? (action === "start" ? { step } : {}));
      setSnapshot(parseAssistantSnapshot(await request("status")));
      if (session?.review) setJobs(await request("jobs"));
    }
    catch (error) { setProblem(error instanceof Error ? error.message : "El asistente no respondió."); }
    finally { if (mounted.current) setWorking(false); }
  }
  async function importPartial() {
    if (!snapshot) return;
    setImporting(true);
    consumed.current = automaticRevision;
    try { await importRef.current(snapshot); setImportedId(snapshot.id); setImportedRevision(revision); setImportedCount(finalShazamTracks(snapshot).length); }
    catch { setProblem("No se pudo incorporar la tracklist. Puedes volver a intentarlo."); }
    finally { if (mounted.current) setImporting(false); }
  }
  const active = snapshot && ["scanning", "paused", "error"].includes(snapshot.status);
  const locked = disabled || working || importing;
  return <section className="shazam-scanner" aria-labelledby="shazam-title">
    <div className="section-kicker">/ SHAZAMIO · MAC + YOUTUBE</div>
    <h2 id="shazam-title">Reconocer el set por fragmentos</h2>
    <p>Analiza audio o video de tu Mac en silencio o usa la extensión de Chrome para recorrer YouTube en fragmentos de 12 segundos, sin salida a los altavoces. Las canciones aparecen aquí automáticamente al terminar.</p>
    <div className="shazam-setup">
      <a href="trackhunt-assistant://open" className="manual-toggle">Abrir asistente Mac ↗</a>
      <button type="button" className="sample-btn" onClick={() => void connect()} disabled={locked}>{working ? "CONECTANDO…" : session ? "VOLVER A CONECTAR" : "CONECTAR ASISTENTE"}</button>
      <a href="/ayuda-asistente.html" target="_blank" rel="noreferrer">Preparar asistente Mac 0.4.2</a>
    </div>
    <small>Gratis · sin Apple Developer · macOS 13 o posterior. ShazamIO es una integración no oficial: requiere internet y puede quedar temporalmente limitada por Shazam. El archivo se analiza en silencio en tu Mac; se envían huellas acústicas.</small>
    <details className="shazam-youtube">
      <summary>YouTube · instalar extensión de Chrome</summary>
      <p>Abre el asistente Mac 0.4.2. Descarga y descomprime la extensión; en <code>chrome://extensions</code> activa Modo de desarrollador, pulsa Cargar descomprimida y selecciona la carpeta descomprimida.</p>
      <p>Abre el set en YouTube, pulsa la extensión Track Hunt y elige Identificar este set. Captura solo esa pestaña, salta cada 30 o 60 segundos y pausa ante anuncios o errores. Mantén la pestaña y el asistente abiertos; conecta el asistente aquí para recibir los resultados.</p>
      <a href="/ayuda-asistente.html#chrome" target="_blank" rel="noreferrer">Instalar extensión Chrome 0.3.1 ↗</a>
      <p><small>No descarga ni guarda el set completo. Reproduce únicamente los fragmentos capturados, sin salida de audio. No usa el micrófono. Los anuncios o cambios del reproductor pueden requerir intervención.</small></p>
    </details>
    {session && <div className="shazam-controls">
      <label htmlFor="shazam-depth">PROFUNDIDAD<select id="shazam-depth" value={step} disabled={Boolean(active) || locked} onChange={e => setStep(Number(e.target.value))}>
        <option value={60}>Equilibrado · cada 60 segundos</option><option value={30}>Detallado · cada 30 segundos</option>
      </select></label>
      <button type="button" className="primary-btn" disabled={!session.ready || Boolean(active) || locked} onClick={() => void command("start")}>{working ? "REVISA LA VENTANA DEL MAC…" : "SELECCIONAR SET EN EL MAC"}</button>
    </div>}
    {session?.review && jobs.length > 0 && <label className="shazam-controls">TRABAJOS GUARDADOS EN ESTE MAC<select aria-label="Trabajos guardados" value={snapshot?.id ?? ""} disabled={Boolean(active) || locked} onChange={e => void command("load", {id: e.target.value})}><option value="" disabled>Elegir un set guardado</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}</select></label>}
    {problem && <p className="shazam-problem" role="alert">{problem}</p>}
    {snapshot && snapshot.status !== "idle" && <div className="shazam-job" aria-live="polite">
      <strong>{snapshot.fileName}</strong>
      <p>{snapshot.phase === "targeted" ? "Reanálisis del tramo elegido" : snapshot.phase === "refinement" ? "Repaso de huecos y cambios" : "Barrido inicial"} · posición {shazamTime(snapshot.currentSeconds)} / {shazamTime(snapshot.duration)}</p>
      <progress max={Math.max(1, snapshot.total)} value={snapshot.completed} aria-label="Fragmentos consultados" />
      <p>{snapshot.completed} / {snapshot.total} fragmentos · <b>{snapshot.tracks.length} apariciones detectadas</b> · {snapshot.unknown.length} fragmentos sin coincidencia</p>
      <p><strong>{snapshot.status === "complete" ? "BARRIDO TERMINADO" : snapshot.status === "scanning" ? "EN CURSO · RESULTADO PARCIAL" : "BARRIDO INTERRUMPIDO · RESULTADO PARCIAL"}</strong></p>
      <small>{snapshot.message}</small>
      {snapshot.savedAt && <small>{snapshot.saveError || `Guardado en este Mac · ${new Date(snapshot.savedAt).toLocaleString()}`}</small>}
      {snapshot.needsFile && <button type="button" disabled={locked} onClick={() => void command("relink")}>Volver a vincular archivo original</button>}
      {session?.review && <button className="review-open" type="button" onClick={() => setReviewOpen(true)}>ABRIR LÍNEA DE TIEMPO Y REVISIÓN ↗</button>}
      <div className="shazam-setup">
        {snapshot.status === "scanning" && <button type="button" disabled={locked} onClick={() => void command("pause")}>Pausar</button>}
        {["paused", "error"].includes(snapshot.status) && <button type="button" disabled={locked} onClick={() => void command("resume")}>Reanudar</button>}
        {active && <button type="button" disabled={locked} onClick={() => void command("cancel")}>Cancelar barrido</button>}
        {snapshot.tracks.length > 0 && snapshot.status !== "scanning" && <button type="button" disabled={locked} onClick={() => void importPartial()}>{importing ? "INCORPORANDO…" : importedRevision === revision ? "VOLVER A CARGAR RESULTADOS" : "USAR CANCIONES DETECTADAS"}</button>}
      </div>
      {importedId === snapshot.id && <p>Lista de resultados: <b>{importedCount} canciones sin duplicados</b>. {importedRevision !== revision ? "Hay cambios nuevos: vuelve a cargar los resultados para aplicar también tus correcciones." : "Todas las apariciones se conservan en la revisión."} Encontrar el enlace en Deezer no confirma que esa versión suene en el set.</p>}
      <details><summary>Ver detecciones actuales ({snapshot.tracks.length})</summary><ol>{snapshot.tracks.map((t, i) => <li key={`${t.identity}:${t.seconds}:${i}`}>{shazamTime(t.seconds)} · {t.artist} — {t.title}</li>)}</ol></details>
      {snapshot.unknown.length > 0 && <details><summary>Ver fragmentos sin coincidencia</summary><p>{snapshot.unknown.map(shazamTime).join(" · ")}</p></details>}
      <small>Los tiempos son detecciones aproximadas. El muestreo no garantiza reconocer todas las canciones ni la versión exacta de un remix.</small>
    </div>}
    {reviewOpen && snapshot && <SetReview speedReview={session?.speedReview === true} shortReview={session?.shortReview === true} snapshot={snapshot} connected={Boolean(session)} busy={working} applyDisabled={locked} onClose={() => setReviewOpen(false)} onApply={importPartial} onAction={async (action, body) => {
      setWorking(true); setProblem("");
      try { await request(action, body); const next = parseAssistantSnapshot(await request("status")); setSnapshot(next); if (next.saveError) throw new Error(next.saveError); }
      finally { setWorking(false); }
    }} />}
  </section>;
}
