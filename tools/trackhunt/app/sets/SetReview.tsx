"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { possibleCompilation, reviewFor, finalShazamTracks, suggestedReviewPoints, shazamTime, type ShazamSnapshot, type ShazamTrack } from "../../lib/shazam-assistant";
type Props = { shortReview: boolean; speedReview: boolean; snapshot: ShazamSnapshot; connected: boolean; busy: boolean; applyDisabled: boolean; onClose: () => void; onApply: () => Promise<void>; onAction: (action: string, body: object) => Promise<void> };
export default function SetReview({shortReview, speedReview, snapshot: s, connected, busy, applyDisabled, onClose, onApply, onAction}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.min(30, s.duration));
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [message, setMessage] = useState("");
  const [preparing,setPreparing]=useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const selected = finalShazamTracks(s);
  const suggested=suggestedReviewPoints(s);
  const unique = new Set(s.tracks.map(t => t.identity)).size;
  const confirmed = s.tracks.filter(t => reviewFor(s,t)?.decision === "confirmed").length;
  const rows = s.tracks.filter(t => {
    const r = reviewFor(s,t), state = r?.decision ?? "pending";
    return (filter === "all" || state === filter || (filter === "compilation" && possibleCompilation(t))) && `${r?.artist ?? t.artist} ${r?.title ?? t.title}`.toLowerCase().includes(query.toLowerCase());
  });
  const orphaned = (s.reviews ?? []).filter(r => !s.tracks.some(t => t.identity === r.originalIdentity && t.seconds <= r.seconds && t.lastSeen >= r.seconds));
  async function action(path: string, body: object) {
    setMessage("");
    try { await onAction(path, { ...body, id: s.id }); setMessage(path === "review" ? "Revisión guardada en el Mac. El resultado original se conserva." : "Tramo preparado. Sigue las instrucciones de captura indicadas abajo."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo guardar."); }
  }
  function choose(seconds: number) { setStart(Math.max(0, Math.floor(seconds - 6))); setEnd(Math.min(s.duration, Math.ceil(seconds + 18))); }
  async function prepareSuggested() {
    setPreparing(true);setMessage("");let count=0;
    try {
      for(const p of [...suggested].reverse()) {
        try {await onAction("reanalyze",{...p,id:s.id});count++;}
        catch(e) {
          const text=e instanceof Error?e.message:"No se pudo preparar el repaso.";
          if(text.includes("puntos todavía no consultados")) continue;
          throw new Error(text);
        }
      }
      setMessage(count ? `${count} muestras nuevas preparadas. Se conserva todo el historial. ${s.source==="youtube-tab" ? "Abre la extensión en el mismo video y pulsa Retomar captura interrumpida." : "Pulsa Reanudar."}` : "Estos puntos ya se consultaron. Elige otro tramo en la línea de tiempo; el historial se conserva.");
    }catch(e){setMessage(`${count} muestras quedaron preparadas. ${e instanceof Error?e.message:"Revisa la conexión."}`);}
    finally{setPreparing(false);}
  }
  return createPortal(<div className="set-review-shade"><div className="set-review" role="dialog" aria-modal="true" aria-labelledby="set-review-title" tabIndex={-1} ref={dialog} onKeyDown={e => {
    if(e.key === "Escape") onClose();
    if(e.key === "Tab") {
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]') ?? []);
      const first=elements[0], last=elements.at(-1);
      if(e.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)){ e.preventDefault();last?.focus(); }
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
    }
  }}>
    <header><div><span className="section-kicker">/ RECONOCIMIENTO · REVISIÓN</span><h2 id="set-review-title">{s.fileName}</h2><p>{s.source === "youtube-tab" ? "YouTube" : "Audio / video local"} · {shazamTime(s.duration)} · {s.status === "complete" ? "Barrido terminado" : "Trabajo en curso o pausado"}</p></div><button onClick={onClose} aria-label="Cerrar revisión">CERRAR ×</button></header>
    <div className="review-stats"><span><b>{s.tracks.length}</b> apariciones</span><span><b>{unique}</b> identidades Shazam</span><span><b>{confirmed}</b> confirmadas por ti</span><span><b>{s.tracks.filter(possibleCompilation).length}</b> posibles mixes / compilaciones</span><span><b>{s.unknown.length}</b> muestras sin coincidencia</span></div>
    <p className="review-save">{s.saveError || (s.savedAt ? `Guardado automático en este Mac · ${new Date(s.savedAt).toLocaleString()}` : "Conecta el asistente 0.4 para guardar.")}</p>
    <section aria-label="Línea de tiempo"><h3>Línea de tiempo del set</h3><p>Pulsa una marca para preparar ese tramo. Verde: detección · ámbar: muestra sin coincidencia. Las posiciones son aproximadas; las marcas no representan la duración de una canción.</p>
      <div className="review-timeline">{s.tracks.map(t=><button key={`${t.identity}:${t.seconds}`} className={`timeline-mark ${reviewFor(s,t)?.decision === "rejected" ? "rejected" : ""}`} style={{left:`${100*t.seconds/s.duration}%`}} title={`${shazamTime(t.seconds)} · ${t.artist} — ${t.title}`} aria-label={`Revisar ${shazamTime(t.seconds)} ${t.title}`} onClick={()=>choose(t.seconds)}/>)}{s.unknown.map(t=><button key={t} className="timeline-mark unknown" style={{left:`${100*t/s.duration}%`}} title={`${shazamTime(t)} sin coincidencia`} aria-label={`Hueco ${shazamTime(t)}`} onClick={()=>choose(t)}/>)}</div>
      <div className="timeline-axis"><span>0:00</span><span>{shazamTime(s.duration/2)}</span><span>{shazamTime(s.duration)}</span></div>
    </section>
    <section className="review-range"><h3>Volver a analizar solo un tramo</h3><p>Repaso de canciones individuales: consulta ventanas de 6 segundos en puntos nuevos. Puede recuperar otra canción cuando la muestra de 12 segundos identifica un mix; no garantiza acertar. Conserva las detecciones, correcciones y fragmentos pendientes. Requiere el asistente 0.4.1. Máximo 5 minutos por repaso.</p>
      <button disabled={preparing||busy||!connected||!shortReview||!speedReview||s.needsFile||!["complete","paused","error"].includes(s.status)||!suggested.length} onClick={()=>void prepareSuggested()}>{preparing?"PREPARANDO REPASO…":"PREPARAR REPASO DE HUECOS Y DUDOSAS"}</button>
      <p>La app propone hasta 16 muestras nuevas, separadas al menos 30 segundos. Prioriza el inicio y usa −5,5 % cuando la referencia es una posible compilación. No consulta servicios de pago ni reinicia el set.</p>
      {!shortReview && <p role="alert">Actualiza el asistente a 0.4.1 y vuelve a conectar para usar ventanas de 6 segundos. Tus resultados guardados se conservan.</p>}
      <label>Ajuste de la muestra<select aria-label="Ajuste de la muestra" value={speedMultiplier} onChange={e=>setSpeedMultiplier(Number(e.target.value))}><option value={1}>Velocidad original</option><option value={0.945} disabled={!speedReview}>Audio acelerado · reducir 5,5 % (experimental)</option></select></label>
      <p>Si varios fragmentos devuelven una compilación, prueba el ajuste en un tramo corto. Solo cambia la muestra enviada a Shazam: conserva los tiempos y el archivo o video original. Puede recuperar candidatos o producir errores; no confirma canciones automáticamente. Requiere asistente 0.4.2.</p>
      <div className="review-range-inputs"><label>Desde (segundos)<input type="number" min={0} max={s.duration} value={start} onChange={e=>setStart(Number(e.target.value))}/><small>{shazamTime(start)}</small></label><label>Hasta (segundos)<input type="number" min={0} max={s.duration} value={end} onChange={e=>setEnd(Number(e.target.value))}/><small>{shazamTime(end)}</small></label><button disabled={busy || !connected || !shortReview || (speedMultiplier !== 1 && !speedReview) || !["complete", "paused", "error"].includes(s.status) || s.needsFile || end<=start || start<0 || end>s.duration || end-start>300} onClick={()=>void action("reanalyze", {start,end,speedMultiplier})}>PREPARAR REPASO INDIVIDUAL</button></div>
      <p>{s.source === "youtube-tab" ? "Después de preparar: abre la extensión en este mismo video y pulsa «Retomar captura interrumpida». Chrome requiere ese clic para capturar la pestaña." : "Después de preparar: pulsa «Reanudar». Se lee únicamente el audio del tramo, sin reproducir el archivo."}</p>
      {s.needsFile && <button disabled={busy || !connected} onClick={()=>void action("relink",{})}>VINCULAR ARCHIVO ORIGINAL</button>}
      {["paused","error"].includes(s.status) && s.source !== "youtube-tab" && <button disabled={busy || !connected || s.needsFile} onClick={()=>void action("resume",{})}>REANUDAR</button>}
      <p>Si hay un barrido pendiente, el repaso se hace primero y vuelve a quedar pausado al terminar. No repite todo el set.</p>
      <small>{s.message}</small>
      <details><summary>Elegir una muestra sin coincidencia ({s.unknown.length})</summary><div className="review-gaps">{s.unknown.map(t=><button key={t} onClick={()=>choose(t)}>{shazamTime(t)}</button>)}</div></details>
    </section>
    <button disabled={applyDisabled || !connected} onClick={()=>void onApply()}>APLICAR REVISIÓN A LA LISTA DE RESULTADOS</button>
    <div role="status" className="review-message">{message}</div>
    <section><h3>Revisar y corregir coincidencias</h3><p>Confirma, corrige o descarta cada aparición. Las descartadas y las posibles compilaciones quedan fuera de la lista y de sus exportaciones. Una compilación solo se incluye si tú la confirmas; el original se conserva para revisar. Lista agrupada: {selected.length} canciones sin duplicados, {selected.filter(t=>t.recognitionReview).length} con una sola muestra por corroborar. Repetir una coincidencia no garantiza la versión exacta.</p>
      <div className="review-filters"><input aria-label="Buscar detecciones" placeholder="Buscar artista o canción…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Filtrar revisión" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas</option><option value="pending">Por revisar</option><option value="compilation">Posibles mixes / compilaciones</option><option value="confirmed">Confirmadas</option><option value="rejected">Descartadas</option></select></div>
      <div className="review-rows">{rows.map(t=><ReviewRow key={`${s.id}:${t.identity}:${t.seconds}`} snapshot={s} track={t} disabled={busy || !connected} onRange={()=>choose(t.seconds)} onSave={body=>action("review",body)}/>)}</div>
      {!rows.length && <p>No hay apariciones con este filtro.</p>}
      {orphaned.length>0 && <details><summary>{orphaned.length} revisiones anteriores conservadas sin detección compatible</summary>{orphaned.map((r,i)=><p key={i}>{shazamTime(r.seconds)} · {r.artist} — {r.title} · {r.decision}. No se aplica automáticamente a otra canción.</p>)}</details>}
    </section>
    <footer>Los respaldos se guardan en este Mac. No contienen el audio ni se sincronizan con otros equipos. Shazam puede confundir remixes o identificar otro mix; confirma la versión antes de usarla.</footer>
  </div></div>, document.body);
}
function ReviewRow({snapshot,track:t,disabled,onSave,onRange}:{snapshot:ShazamSnapshot;track:ShazamTrack;disabled:boolean;onSave:(body:object)=>Promise<void>;onRange:()=>void}) {
  const review=reviewFor(snapshot,t);
  const [artist,setArtist]=useState(review?.artist ?? t.artist),[title,setTitle]=useState(review?.title ?? t.title),[decision,setDecision]=useState(review?.decision ?? "pending");
  useEffect(()=>{setArtist(review?.artist ?? t.artist);setTitle(review?.title ?? t.title);setDecision(review?.decision ?? "pending");},[review?.artist,review?.title,review?.decision,t.artist,t.title]);
  return <form className="review-row" onSubmit={e=>{e.preventDefault();void onSave({seconds:review?.seconds ?? t.seconds,identity:t.identity,artist:artist.trim(),title:title.trim(),decision});}}>
    <div className="review-row-meta"><button type="button" onClick={onRange}>{shazamTime(t.seconds)} ↗</button><span>{t.hits} {t.hits===1?"muestra":"muestras"} · {snapshot.tracks.filter(x=>x.identity===t.identity).length>1?"reaparece en el set":"identidad sin repetición"}</span></div>
    {possibleCompilation(t) && <p role="note" className="review-message">POSIBLE MIX / COMPILACIÓN · No cuenta como canción individual para exportar hasta que la confirmes. Usa su marca de tiempo para preparar un repaso corto.</p>}
    <p className="review-original">Original Shazam: {t.artist} — {t.title}</p>
    {t.speedMultiplier && <p className="review-message">CANDIDATO CON AJUSTE −5,5 % · Verifica la canción y su versión. El tiempo corresponde al set original.</p>}
    <div className="review-edit"><label>Artista<input aria-label={`Artista en ${shazamTime(t.seconds)}`} value={artist} maxLength={500} onChange={e=>setArtist(e.target.value)} required/></label><label>Canción / versión<input aria-label={`Canción en ${shazamTime(t.seconds)}`} value={title} maxLength={500} onChange={e=>setTitle(e.target.value)} required/></label><label>Revisión<select aria-label={`Estado en ${shazamTime(t.seconds)}`} value={decision} onChange={e=>setDecision(e.target.value as typeof decision)}><option value="pending">Por revisar</option><option value="confirmed">Confirmada por mí</option><option value="rejected">Descartada</option></select></label><button disabled={disabled || !artist.trim() || !title.trim()} type="submit">GUARDAR</button></div>
  </form>;
}
