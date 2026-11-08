"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { inspectAudioFile, MAX_LOCAL_AUDIO_BYTES, type AudioQualityReport } from "../../lib/audio-quality";
import { makeAudioClip } from "../../lib/audio-clip";
import { copyDjCompilationsQuery } from "../../lib/dj-compilations";
import type { QualityCandidate, QualityIdentity, QualitySourceStatus, StoreSearch } from "../../lib/quality";
import "../remix.css";
import "./quality.css";

type Mode = "file" | "name" | "link";
type SearchResult = {
  identity: QualityIdentity;
  candidates: QualityCandidate[];
  stores: StoreSearch[];
  sources: QualitySourceStatus[];
  searchedAt: string;
};

const EMPTY_IDENTITY: QualityIdentity = { title: "", artist: "", version: "", album: "", isrc: "", source: "Confirmada por ti" };

async function api(path: string, body?: unknown) {
  const form = body instanceof FormData;
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: form || body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la consulta.");
  return data;
}

function guessedIdentity(fileName: string): QualityIdentity {
  const clean = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  const pieces = clean.split(/\s+[-–—]\s+/);
  if (pieces.length > 1) return { ...EMPTY_IDENTITY, artist: pieces.shift()!.trim(), title: pieces.join(" — ").trim(), source: "Nombre del archivo" };
  return { ...EMPTY_IDENTITY, title: clean, source: "Nombre del archivo" };
}

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = String(Math.floor(seconds % 60)).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
}

function bytesLabel(bytes: number) {
  return bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function matchText(match: QualityCandidate["match"]) {
  return match === "exact" ? "ALTA SIMILITUD DE TEXTO" : match === "likely" ? "CANDIDATO POR TEXTO" : "REVISAR";
}

export default function QualityFinder() {
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [report, setReport] = useState<AudioQualityReport | null>(null);
  const [identity, setIdentity] = useState<QualityIdentity>({ ...EMPTY_IDENTITY });
  const [link, setLink] = useState("");
  const [clipStart, setClipStart] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [webSearchConnected, setWebSearchConnected] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const results = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/quality/status").then((response) => response.json()).then((data) => setWebSearchConnected(Boolean(data.webSearch))).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!file) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset(nextMode: Mode) {
    setMode(nextMode);
    setFile(null);
    setReport(null);
    setIdentity({ ...EMPTY_IDENTITY });
    setLink("");
    setClipStart(0);
    setError("");
    setNotice("");
    setResult(null);
  }

  async function selectFile(next: File | null) {
    setFile(null);
    setReport(null);
    setResult(null);
    setError("");
    setNotice("");
    setClipStart(0);
    if (!next) return;
    if (next.size > MAX_LOCAL_AUDIO_BYTES) {
      setError("El archivo supera 120 MB. La futura aplicación Mac admitirá bibliotecas y archivos mayores.");
      return;
    }
    setFile(next);
    setIdentity(guessedIdentity(next.name));
    setBusy("Midiendo el archivo en tu navegador…");
    try {
      const nextReport = await inspectAudioFile(next);
      setReport(nextReport);
      setNotice("Diagnóstico terminado. El archivo completo no salió de tu computador.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo analizar el archivo.");
    } finally {
      setBusy("");
    }
  }

  async function identifyFile() {
    if (!file) return;
    setBusy("Identificando un fragmento de 12 segundos…");
    setError("");
    try {
      const clip = await makeAudioClip(file, clipStart);
      const form = new FormData();
      form.append("file", clip, "fragment.wav");
      const data = await api("/api/remix/recognize", form);
      setIdentity({ ...EMPTY_IDENTITY, ...data.song, version: identity.version, album: data.song.album ?? identity.album, isrc: data.song.isrc ?? identity.isrc });
      setNotice("Canción identificada. Confirma la versión exacta antes de buscar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo identificar el fragmento.");
    } finally {
      setBusy("");
    }
  }

  async function identifyLink(event: FormEvent) {
    event.preventDefault();
    setBusy("Leyendo el enlace…");
    setError("");
    setResult(null);
    try {
      const data = await api("/api/quality/identify", { url: link });
      setIdentity({ ...EMPTY_IDENTITY, ...data.identity });
      setNotice(data.note);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer el enlace.");
    } finally {
      setBusy("");
    }
  }

  async function searchQuality(event: FormEvent) {
    event.preventDefault();
    setBusy("Buscando candidatos y fuentes para comparar…");
    setError("");
    setResult(null);
    try {
      const data = await api("/api/quality/search", identity);
      setResult(data);
      setNotice("Búsqueda terminada. Primero confirma identidad; después compara calidad.");
      requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo buscar una fuente mejor.");
    } finally {
      setBusy("");
    }
  }

  const showIdentity = mode === "name" || Boolean(identity.title || identity.artist);

  return <div className="rh-app qh-app">


    <main className="qh-main">
      <section className="qh-heading">
        <div><span className="rh-kicker">QUALITY HUNT / MISMA VERSIÓN, MEJOR FUENTE</span><h1>Busca una fuente <em>potencialmente mejor.</em></h1><p>Analiza lo que tienes, define la edición buscada y compara fuentes autorizadas antes de procesar artificialmente el audio.</p></div>
        <div className="qh-principle"><strong>REGLA 01</strong><span>Una versión diferente nunca gana solo por ofrecer más bitrate.</span></div>
      </section>

      <section className="qh-workbench" aria-label="Buscar una fuente de mejor calidad">
        <div className="qh-mode-tabs" role="tablist" aria-label="Punto de partida">
          <button type="button" role="tab" aria-selected={mode === "file"} onClick={() => reset("file")}>Tengo el archivo</button>
          <button type="button" role="tab" aria-selected={mode === "name"} onClick={() => reset("name")}>Sé el nombre</button>
          <button type="button" role="tab" aria-selected={mode === "link"} onClick={() => reset("link")}>Tengo un enlace</button>
        </div>

        {mode === "file" && <div className="qh-file-flow">
          <label className="qh-drop" htmlFor="quality-file">
            <span className="qh-drop-icon" aria-hidden="true">♫</span>
            <strong>{file ? file.name : "Selecciona una canción de tu biblioteca"}</strong>
            <small>MP3, M4A, WAV, FLAC u OGG · máximo 120 MB y 20 minutos · análisis local</small>
            <input id="quality-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aif,.aiff" disabled={Boolean(busy)} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
          </label>
          {audioUrl && <div className="qh-player-row"><audio ref={audio} controls src={audioUrl} /><button className="rh-secondary" type="button" onClick={() => setClipStart(Math.floor(audio.current?.currentTime ?? 0))}>Usar esta posición para identificar</button><label>Fragmento desde <input type="number" min="0" step="1" value={clipStart} onChange={(event) => setClipStart(Number(event.target.value))} /> s</label></div>}
        </div>}

        {mode === "link" && <form className="qh-link-form" onSubmit={identifyLink}>
          <label htmlFor="quality-link">Enlace de una canción individual de YouTube o SoundCloud</label>
          <div><input id="quality-link" type="url" required value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" /><button className="rh-primary" disabled={Boolean(busy)}>Leer enlace</button></div>
          <p>Los enlaces se usan para identificar metadatos. Trackhunt no descarga ni separa el audio de esas plataformas.</p>
        </form>}

        {report && <section className="qh-report" aria-label="Diagnóstico del archivo">
          <div className="qh-score" style={{ "--score": `${report.score}%` } as CSSProperties}><div><strong>{report.extension.toUpperCase() || "AUDIO"}</strong></div><small>{report.grade}</small></div>
          <div className="qh-verdict"><span className="rh-kicker">PERFIL TÉCNICO PRELIMINAR</span><h2>{report.verdict}</h2><p>Medido: {report.measured.join(", ")}. Estimado: {report.estimated.join(", ")}.</p></div>
          <div className="qh-metrics">
            <div><span>Formato</span><strong>{report.extension.toUpperCase() || "—"}</strong></div>
            <div><span>Bitrate estimado</span><strong>{report.estimatedKbps} kbps</strong></div>
            <div><span>Frecuencia de análisis</span><strong>{(report.sampleRate / 1000).toFixed(1)} kHz</strong></div>
            <div><span>Canales</span><strong>{report.channels}</strong></div>
            <div><span>Duración</span><strong>{durationLabel(report.duration)}</strong></div>
            <div><span>Tamaño</span><strong>{bytesLabel(report.bytes)}</strong></div>
            <div><span>Pico muestreado</span><strong>{report.peakDbfs} dBFS</strong></div>
            <div><span>Crest factor estimado</span><strong>{report.crestFactorDb} dB</strong></div>
          </div>
          {report.warnings.length > 0 && <ul className="qh-warnings">{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <button className="rh-secondary qh-recognize" type="button" disabled={Boolean(busy) || !file} onClick={identifyFile}>Identificar esta grabación con 12 segundos</button>
          <p className="qh-privacy">El análisis técnico ocurre en tu navegador. Al pulsar “Identificar” se envía al servicio un fragmento WAV de hasta 12 segundos; si el archivo dura menos, se enviará completo.</p>
        </section>}

        {showIdentity && <form className="qh-identity" onSubmit={searchQuality}>
          <div className="qh-section-title"><span>02</span><div><strong>DEFINE LA GRABACIÓN BUSCADA</strong><p>Incluye “Extended”, remixer, edit o remaster cuando corresponda. Los resultados siguen requiriendo tu confirmación.</p></div></div>
          <div className="qh-identity-grid">
            <label>Artista<input required value={identity.artist} onChange={(event) => setIdentity({ ...identity, artist: event.target.value })} placeholder="Artista" /></label>
            <label>Título<input required value={identity.title} onChange={(event) => setIdentity({ ...identity, title: event.target.value })} placeholder="Canción" /></label>
            <label>Versión buscada<input value={identity.version ?? ""} onChange={(event) => setIdentity({ ...identity, version: event.target.value })} placeholder="Original Mix, Extended, Remix…" /></label>
            <label>Álbum o sello<input value={identity.album ?? ""} onChange={(event) => setIdentity({ ...identity, album: event.target.value })} placeholder="Opcional" /></label>
            <label>ISRC de referencia<input value={identity.isrc ?? ""} onChange={(event) => setIdentity({ ...identity, isrc: event.target.value.toUpperCase() })} placeholder="Opcional · requiere confirmación" maxLength={15} /></label>
          </div>
          <button className="rh-primary qh-search" disabled={Boolean(busy) || !identity.artist.trim() || !identity.title.trim()}>Buscar candidatos y fuentes autorizadas</button>
          <p className="qh-privacy">Al buscar, estos metadatos se consultan en Apple, Deezer y, si está conectado, el índice web; las carátulas se cargan desde sus catálogos. El audio no se envía.</p>
        </form>}

        <div aria-live="polite" role="status">{busy && <p className="rh-working"><span />{busy}</p>}{notice && <p className="rh-notice">{notice}</p>}</div>
        {error && <div className="rh-error" role="alert">{error}</div>}
      </section>

      <section className="qh-results" ref={results} aria-label="Fuentes encontradas">
        <div className="qh-results-heading"><div><span className="rh-kicker">03 / COMPARA IDENTIDAD ANTES QUE CALIDAD</span><h2>{result ? <>Resultados para <em>{result.identity.title}</em></> : "Aquí aparecerán las fuentes candidatas"}</h2></div>{result && <span>{result.candidates.length} candidatos</span>}</div>

        {!result ? <div className="qh-empty"><strong>Primero necesitamos saber exactamente qué grabación buscas.</strong><p>Dos archivos pueden compartir título y artista, pero ser masters, remixes o duraciones diferentes.</p></div> : <>
          <div className="qh-source-strip">{result.sources.map((source) => <div key={source.name}><span className={`qh-status ${source.status}`} /> <strong>{source.name}</strong><p>{source.message}</p></div>)}</div>
          {result.candidates.length > 0 && <div className="qh-candidates">{result.candidates.map((candidate) => <article key={candidate.id} className={`qh-candidate qh-${candidate.match}`}>
            {candidate.artwork ? <img src={candidate.artwork} alt="" /> : <span className="qh-cover" aria-hidden="true">♫</span>}
            <div className="qh-candidate-copy"><div className="qh-candidate-meta"><span>{candidate.sourceName ?? candidate.provider}</span><span>{matchText(candidate.match)} · {Math.round(candidate.identityScore * 100)}%</span></div><h3>{candidate.title}</h3><p>{candidate.artist}{candidate.album ? ` · ${candidate.album}` : ""}</p><ul>{candidate.evidence.filter(Boolean).slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul><small>{candidate.qualityNote}</small></div>
            <a className="rh-primary" href={candidate.url} target="_blank" rel="noopener noreferrer">Abrir fuente</a>
          </article>)}</div>}

          <div className="qh-store-heading"><div><span className="rh-kicker">TIENDAS Y POOLS EXTERNOS</span><h2>Comprueba edición, licencia y formato en cada fuente</h2></div><p>{webSearchConnected ? "La búsqueda web automática está conectada. Los pools privados se abren de forma asistida." : "Estos enlaces funcionan aunque la búsqueda automática todavía no esté conectada."}</p></div>
          <div className="qh-stores">{result.stores.map((store) => <a
            key={store.provider}
            href={store.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (store.action !== "copy-open" || !store.query) return;
              void copyDjCompilationsQuery(store.query)
                .then((copied) => setNotice(copied ? `Consulta copiada para ${store.provider}: ${store.query}` : `Se abrió ${store.provider}. Copia allí: ${store.query}`));
            }}
          ><span>{String(store.priority).padStart(2, "0")}</span><div><strong>{store.provider}</strong><p>{store.note}</p></div><b>{store.action === "copy-open" ? "Copiar + abrir" : "Abrir"}</b></a>)}</div>
          <p className="qh-disclaimer">Trackhunt no afirma que un resultado sea mejor solo porque diga FLAC, WAV o 320 kbps. Compra o descarga únicamente desde una fuente autorizada y vuelve a analizar el archivo para comprobar la mejora.</p>
        </>}
      </section>
    </main>

    <footer className="rh-footer"><span>TRACKHUNT / IDENTIDAD POR CONFIRMAR + PERFIL TÉCNICO PRELIMINAR.</span><a href="/">Buscar remixes</a><a href="/sets">Analizar sets</a><a href="/connections">Conectar cuentas</a></footer>
  </div>;
}
