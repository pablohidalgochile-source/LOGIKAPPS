"use client";

import { useMemo, useState } from "react";

type DeezerMatch = {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  link: string;
  duration: number;
  preview: string;
  score: number;
};

type TrackStatus = "idle" | "searching" | "matched" | "review" | "missing";

type Track = {
  id: number;
  time: string;
  seconds: number;
  artist: string;
  title: string;
  selected: boolean;
  status: TrackStatus;
  deezer?: DeezerMatch;
};

type VideoAnalysis = {
  title: string;
  channel: string;
  thumbnail: string;
  source: "youtube-credits" | "youtube-description" | "manual";
  tracks: Array<Pick<Track, "time" | "seconds" | "artist" | "title">>;
};

const SAMPLE_VIDEO = "https://www.youtube.com/watch?v=JHdNEzKVBoQ";

const SAMPLE_TRACKS: Track[] = [
  { id: 1, time: "01:27", seconds: 87, artist: "HydroBoyz", title: "Hindabuilding", selected: true, status: "idle" },
  { id: 2, time: "02:41", seconds: 161, artist: "Calvin Harris, Disciples", title: "How Deep Is Your Love (Disciples & Unorthodox Remix)", selected: true, status: "idle" },
  { id: 3, time: "03:11", seconds: 191, artist: "J Balvin, Willy William", title: "Mi Gente (Alesso Remix)", selected: true, status: "idle" },
  { id: 4, time: "07:00", seconds: 420, artist: "Ricky Martin", title: "María (Spanglish Extended)", selected: true, status: "idle" },
  { id: 5, time: "09:07", seconds: 547, artist: "Mastiksoul", title: "Manya e Grande (Original Mix)", selected: true, status: "idle" },
  { id: 6, time: "11:58", seconds: 718, artist: "Prince Royce, KARYO", title: "I Want It That Way (KARYO Remix)", selected: true, status: "idle" },
  { id: 7, time: "13:52", seconds: 832, artist: "Rihanna", title: "Only Girl (In The World)", selected: true, status: "idle" },
  { id: 8, time: "14:28", seconds: 868, artist: "Neru Americano, Scro Q Cuia", title: "Tic Taa", selected: true, status: "idle" },
  { id: 9, time: "18:15", seconds: 1095, artist: "Nari", title: "Diamond", selected: true, status: "idle" },
  { id: 10, time: "18:56", seconds: 1136, artist: "M3B8", title: "Rolle Flow", selected: true, status: "idle" },
];

const SAMPLE_META: VideoAnalysis = {
  title: "AFRO BROS @ LATINVILLAGE — SPECIAL CLOSING SET",
  channel: "Afro Bros",
  thumbnail: "https://i.ytimg.com/vi/JHdNEzKVBoQ/hqdefault.jpg",
  source: "youtube-credits",
  tracks: SAMPLE_TRACKS,
};

function secondsFromTime(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseTracklist(text: string): Track[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^https?:\/\//i.test(line))
    .map((line, index) => {
      const timeMatch = line.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(?:[-–—|:]\s*)?/);
      const time = timeMatch?.[1] ?? "--:--";
      const clean = line.replace(/^\[?(?:\d{1,2}:)?\d{1,2}:\d{2}\]?\s*(?:[-–—|:]\s*)?/, "").trim();
      const pieces = clean.split(/\s+[-–—]\s+/);
      const artist = pieces.length > 1 ? pieces.shift()! : "Artista por identificar";
      const title = pieces.length ? pieces.join(" — ") : clean;
      return {
        id: index + 1,
        time,
        seconds: time === "--:--" ? 0 : secondsFromTime(time),
        artist,
        title,
        selected: true,
        status: "idle" as const,
      };
    })
    .filter((track) => track.title);
}

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
}

function escapeCsv(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function saveFile(name: string, content: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9áéíóúñ_-]+/gi, "-").replace(/^-|-$/g, "") || "track";
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState(SAMPLE_VIDEO);
  const [manualText, setManualText] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [tracks, setTracks] = useState<Track[]>(SAMPLE_TRACKS);
  const [video, setVideo] = useState<VideoAnalysis>(SAMPLE_META);
  const [playlistName, setPlaylistName] = useState("Afro Bros · LatinVillage Set");
  const [busy, setBusy] = useState<"extract" | "match" | null>(null);
  const [notice, setNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const selected = useMemo(() => tracks.filter((track) => track.selected), [tracks]);
  const matched = useMemo(() => selected.filter((track) => track.deezer), [selected]);
  const deemixPayload = useMemo(
    () => matched.map((track) => track.deezer!.link).join(";"),
    [matched],
  );
  const totalDuration = useMemo(
    () => matched.reduce((total, track) => total + (track.deezer?.duration ?? 0), 0),
    [matched],
  );

  async function matchOnDeezer(sourceTracks: Track[]) {
    if (!sourceTracks.length) return;
    setBusy("match");
    setTracks(sourceTracks.map((track) => ({ ...track, status: "searching" })));

    try {
      const response = await fetch("/api/deezer/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queries: sourceTracks.map((track) => ({
            clientId: track.id,
            artist: track.artist,
            title: track.title,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo consultar Deezer");
      const byId = new Map<number, DeezerMatch | null>(
        payload.results.map((item: { clientId: number; match: DeezerMatch | null }) => [item.clientId, item.match]),
      );
      const resolved = sourceTracks.map((track) => {
        const deezer = byId.get(track.id) || undefined;
        return {
          ...track,
          deezer,
          status: deezer ? (deezer.score >= 0.72 ? "matched" : "review") : "missing",
        } as Track;
      });
      setTracks(resolved);
      const count = resolved.filter((track) => track.deezer).length;
      setNotice(`${count} de ${resolved.length} pistas encontradas en Deezer`);
    } catch (error) {
      setTracks(sourceTracks.map((track) => ({ ...track, status: "missing" })));
      setNotice(error instanceof Error ? error.message : "No se pudo consultar Deezer");
    } finally {
      setBusy(null);
    }
  }

  async function analyzeVideo() {
    if (!videoUrl.trim() && !manualText.trim()) {
      setNotice("Pega un enlace de video o una lista de canciones.");
      return;
    }

    setBusy("extract");
    try {
      let analysis: VideoAnalysis;
      if (manualText.trim()) {
        const parsed = parseTracklist(manualText);
        if (!parsed.length) throw new Error("No pude leer pistas en el texto pegado.");
        analysis = {
          title: "Tracklist importado",
          channel: "Importación manual",
          thumbnail: "",
          source: "manual",
          tracks: parsed,
        };
      } else {
        const response = await fetch("/api/video", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: videoUrl.trim() }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo analizar el video");
        analysis = payload;
      }

      const nextTracks: Track[] = analysis.tracks.map((track, index) => ({
        ...track,
        id: index + 1,
        selected: true,
        status: "idle",
      }));
      setVideo(analysis);
      setTracks(nextTracks);
      setPlaylistName(analysis.title.slice(0, 72));
      setNotice(`${nextTracks.length} referencias extraídas del video`);
      await matchOnDeezer(nextTracks);
      window.setTimeout(() => document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (error) {
      if (videoUrl.includes("JHdNEzKVBoQ")) {
        setVideo(SAMPLE_META);
        setTracks(SAMPLE_TRACKS);
        setNotice("Usando los créditos verificados de la sesión de ejemplo.");
        await matchOnDeezer(SAMPLE_TRACKS);
      } else {
        setNotice(error instanceof Error ? error.message : "No se pudo analizar el video");
      }
    } finally {
      setBusy(null);
    }
  }

  function toggleTrack(id: number) {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, selected: !track.selected } : track));
  }

  function removeTrack(id: number) {
    setTracks((current) => current.filter((track) => track.id !== id));
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice("No se pudo copiar. Usa la descarga TXT como alternativa.");
    }
  }

  function exportList(format: "csv" | "m3u" | "json" | "txt") {
    const safeName = safeFileName(playlistName || "playlist");
    if (format === "csv") {
      const header = ["timestamp", "artista_original", "track_original", "artista_deezer", "track_deezer", "url_deezer"];
      const rows = selected.map((track) => [
        track.time, track.artist, track.title, track.deezer?.artist ?? "", track.deezer?.title ?? "", track.deezer?.link ?? "",
      ]);
      saveFile(`${safeName}.csv`, [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n"), "text/csv;charset=utf-8");
    } else if (format === "m3u") {
      const lines = ["#EXTM3U", ...matched.flatMap((track) => [
        `#EXTINF:${track.deezer!.duration},${track.deezer!.artist} - ${track.deezer!.title}`,
        track.deezer!.link,
      ])];
      saveFile(`${safeName}.m3u`, lines.join("\n"), "audio/x-mpegurl;charset=utf-8");
    } else if (format === "json") {
      saveFile(`${safeName}.json`, JSON.stringify({ name: playlistName, source: videoUrl, tracks: selected }, null, 2), "application/json");
    } else {
      saveFile(`${safeName}-DEEMIX-PEGAR.txt`, deemixPayload, "text/plain;charset=utf-8");
    }
    setExportOpen(false);
    setNotice(`Lista exportada en ${format.toUpperCase()}`);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Setlist to Deezer, inicio">
          <span className="brand-mark">S→D</span>
          <span>SETLIST TO DEEZER</span>
        </a>
        <nav className="nav-links" aria-label="Navegación principal">
          <a href="/">Buscar remixes</a>
          <a href="#workflow">Cómo funciona</a>
          <a href="#results">Resultado</a>
          <a href="#legal">Uso legal</a>
        </nav>
        <a className="deezer-status connected" href="#deemix-export">
          <span /> Exportar para Deemix
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy-block">
          <div className="eyebrow"><span /> VIDEO → TRACKLIST → DEEZER</div>
          <h1>CONVIERTE UN SET<br />EN UNA <em>PLAYLIST.</em></h1>
          <p>
            Recupera los créditos públicos de un video, encuentra las canciones en Deezer,
            corrige coincidencias y genera una sola línea lista para pegar en Deemix.
          </p>
        </div>

        <div className="analyzer-card">
          <label htmlFor="video-url">ENLACE DEL VIDEO</label>
          <div className="url-line">
            <span>▶</span>
            <input
              id="video-url"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>
          <button className="manual-toggle" type="button" onClick={() => setShowManual((value) => !value)}>
            {showManual ? "− Ocultar tracklist manual" : "+ Pegar tracklist o transcripción"}
          </button>
          {showManual && (
            <textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder={"00:00 Artista — Canción\n03:18 Artista — Canción (Remix)"}
              aria-label="Tracklist manual"
            />
          )}
          <button className="primary-btn" type="button" onClick={analyzeVideo} disabled={busy !== null}>
            {busy === "extract" ? "EXTRAYENDO…" : busy === "match" ? "BUSCANDO EN DEEZER…" : "ANALIZAR VIDEO"}
            <span>↗</span>
          </button>
          <small>La app analiza metadatos y créditos públicos. No descarga ni copia el audio del video.</small>
        </div>
      </section>

      <section className="workflow" id="workflow">
        <div><b>01</b><strong>EXTRAER</strong><span>Créditos, descripción o lista pegada</span></div>
        <div><b>02</b><strong>ENCONTRAR</strong><span>Coincidencias en el catálogo Deezer</span></div>
        <div><b>03</b><strong>REVISAR</strong><span>Selección y control de versiones</span></div>
        <div><b>04</b><strong>EXPORTAR</strong><span>Una línea con todos los enlaces para Deemix</span></div>
      </section>

      <section className="results" id="results">
        <div className="section-heading">
          <div>
            <div className="section-kicker">/ RESULTADO DEL ANÁLISIS</div>
            <h2>{video.title}</h2>
            <p>{video.channel} · {tracks.length} referencias · Fuente: {video.source.replaceAll("-", " ")}</p>
          </div>
          <div className="result-stats">
            <div><strong>{tracks.length}</strong><span>EXTRAÍDAS</span></div>
            <div><strong>{matched.length}</strong><span>EN DEEZER</span></div>
            <div><strong>{Math.round(totalDuration / 60)}</strong><span>MINUTOS</span></div>
          </div>
        </div>

        <div className="workspace">
          <div className="track-panel">
            <div className="track-toolbar">
              <label className="select-all">
                <input
                  type="checkbox"
                  checked={tracks.length > 0 && tracks.every((track) => track.selected)}
                  onChange={(event) => setTracks((current) => current.map((track) => ({ ...track, selected: event.target.checked })))}
                />
                SELECCIONAR TODO
              </label>
              <button type="button" onClick={() => matchOnDeezer(tracks)} disabled={busy !== null}>↻ Buscar nuevamente</button>
            </div>

            <div className="track-head" aria-hidden="true">
              <span>TIEMPO / ORIGINAL</span><span>COINCIDENCIA DEEZER</span><span>ESTADO</span><span />
            </div>
            <div className="track-list">
              {tracks.map((track) => (
                <article className={`track-row ${track.selected ? "selected" : ""}`} key={track.id}>
                  <div className="original-track">
                    <input type="checkbox" checked={track.selected} onChange={() => toggleTrack(track.id)} aria-label={`Seleccionar ${track.title}`} />
                    <span className="timestamp">{track.time}</span>
                    <div><small>{track.artist}</small><strong>{track.title}</strong></div>
                  </div>
                  <div className="deezer-match">
                    {track.deezer ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={track.deezer.cover} alt="" />
                        <div><small>{track.deezer.artist}</small><strong>{track.deezer.title}</strong><span>{track.deezer.album}</span></div>
                        <a className="open-track" href={track.deezer.link} target="_blank" rel="noreferrer" aria-label={`Abrir ${track.deezer.title} en Deezer`}>↗</a>
                      </>
                    ) : (
                      <div className="no-match">{track.status === "searching" ? "Buscando…" : "Sin coincidencia automática"}</div>
                    )}
                  </div>
                  <span className={`status status-${track.status}`}>
                    {track.status === "matched" ? "COINCIDE" : track.status === "review" ? "REVISAR" : track.status === "searching" ? "BUSCANDO" : track.status === "missing" ? "NO ENCONTRADA" : "PENDIENTE"}
                  </span>
                  <button className="remove-track" type="button" onClick={() => removeTrack(track.id)} aria-label={`Quitar ${track.title}`}>×</button>
                </article>
              ))}
            </div>
          </div>

          <aside className="playlist-builder" id="deemix-export">
            <div className="deezer-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="section-kicker">/ DEEMIX · PEGAR TODO</div>
            <p className="single-link-intro">El mismo formato que ya te funcionó: todos los enlaces de Deezer en una sola línea, separados por punto y coma.</p>
            <label htmlFor="playlist-name">NOMBRE DEL ARCHIVO</label>
            <input id="playlist-name" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} maxLength={80} />
            <div className="playlist-summary">
              <div><span>Seleccionadas</span><b>{selected.length}</b></div>
              <div><span>Con match</span><b>{matched.length}</b></div>
              <div><span>Duración</span><b>{durationLabel(totalDuration)}</b></div>
            </div>
            <label htmlFor="deemix-payload">ENLACES PARA DEEMIX · UNA SOLA LÍNEA</label>
            <textarea
              className="deemix-payload"
              id="deemix-payload"
              value={deemixPayload}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Analiza un video para generar los enlaces."
            />
            <button
              className="create-btn"
              type="button"
              onClick={() => copyText(deemixPayload, `${matched.length} enlaces copiados para pegar en Deemix`)}
              disabled={!deemixPayload}
            >
              ⧉ COPIAR TODO PARA DEEMIX <span>↗</span>
            </button>
            <button
              className="deemix-download"
              type="button"
              onClick={() => exportList("txt")}
              disabled={!deemixPayload}
            >
              ↓ DESCARGAR TXT PARA PEGAR
            </button>
            <div className="export-wrap">
              <button className="export-btn" type="button" onClick={() => setExportOpen((value) => !value)}>MÁS FORMATOS</button>
              {exportOpen && (
                <div className="export-menu">
                  <button type="button" onClick={() => exportList("txt")}>TXT · Una línea con ;</button>
                  <button type="button" onClick={() => exportList("csv")}>CSV · Hoja de cálculo</button>
                  <button type="button" onClick={() => exportList("m3u")}>M3U · Reproductores</button>
                  <button type="button" onClick={() => exportList("json")}>JSON · Datos completos</button>
                </div>
              )}
            </div>
            <p>No necesitas conectar una cuenta ni configurar OAuth. Copia la línea completa o descarga el TXT y pégalo en el buscador de Deemix. La app solo prepara enlaces; no descarga audio.</p>
          </aside>
        </div>
      </section>

      <section className="legal-strip" id="legal">
        <strong>DESCARGA RESPONSABLE</strong>
        <p>La aplicación exporta metadatos y enlaces. Deezer prohíbe almacenar o descargar localmente el audio desde su API; solo admite previews de 30 segundos fuera del reproductor autorizado.</p>
        <span>NO AUDIO RIPPING</span>
      </section>

      <footer>
        <div className="brand"><span className="brand-mark">S→D</span><span>SETLIST TO DEEZER</span></div>
        <p>HECHO PARA DJS, SELECTORES Y CRATE DIGGERS.</p>
        <a href="https://developers.deezer.com/guidelines" target="_blank" rel="noreferrer">REGLAS DE DEEZER ↗</a>
      </footer>

      {notice && (
        <button className="toast" type="button" onClick={() => setNotice("")} aria-label="Cerrar aviso">
          <span>✓</span>{notice}<b>×</b>
        </button>
      )}
    </main>
  );
}
