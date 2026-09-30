"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type Tab = "radar" | "similar" | "samples" | "method";
type Scope = "Chile" | "Latam" | "Global";
type SampleKind =
  | "kick"
  | "clap"
  | "shaker"
  | "timbal"
  | "horn"
  | "riser"
  | "siren"
  | "sub";

type Track = {
  id: string;
  title: string;
  artist: string;
  country: string;
  year: number;
  bpm: number;
  key: string;
  energy: number;
  score: number;
  momentum: string;
  utility: string;
  role: "Pico" | "Puente" | "Clásico" | "Scout";
  tags: string[];
  reason: string;
  url: string;
};

type SampleItem = {
  id: string;
  name: string;
  kind: SampleKind;
  family: string;
  length: string;
  bpm?: number;
  fileName: string;
  note: string;
};

const TRACKS: Track[] = [
  {
    id: "la-guaracha",
    title: "La Guaracha (Oh Oh Oh)",
    artist: "Manuel Turizo × Martinwhite",
    country: "CL × CO",
    year: 2026,
    bpm: 128,
    key: "8A",
    energy: 89,
    score: 96,
    momentum: "+42%",
    utility: "Coro inmediato",
    role: "Pico",
    tags: ["voz urbana", "crossover", "2026"],
    reason: "Une la escena chilena con una voz latina de alcance masivo.",
    url: "https://www.youtube.com/results?search_query=Manuel+Turizo+Martinwhite+La+Guaracha",
  },
  {
    id: "no-va-a-chocar",
    title: "No Va a Chocar",
    artist: "Norambuena × RealViviendo",
    country: "CL",
    year: 2026,
    bpm: 128,
    key: "7A",
    energy: 87,
    score: 92,
    momentum: "+31%",
    utility: "Puente urbano",
    role: "Scout",
    tags: ["nuevo", "Chile", "urbano"],
    reason: "Señal temprana con tempo de mezcla seguro y lenguaje local.",
    url: "https://open.spotify.com/search/No%20Va%20a%20Chocar%20Norambuena",
  },
  {
    id: "ay-bonita",
    title: "AY BONITA",
    artist: "Martinwhite × Santiago Berrio",
    country: "CL × CO",
    year: 2025,
    bpm: 128,
    key: "9A",
    energy: 91,
    score: 91,
    momentum: "+18%",
    utility: "Coro coreable",
    role: "Pico",
    tags: ["vocal", "festival", "Chile"],
    reason: "La voz transforma la base guaracha en una canción recordable.",
    url: "https://www.youtube.com/watch?v=t4dpBMIZke8",
  },
  {
    id: "chigon-2",
    title: "CHINGON 2",
    artist: "Martinwhite × Cachirula × Santa Fe Klan",
    country: "CL × MX",
    year: 2025,
    bpm: 127,
    key: "8A",
    energy: 94,
    score: 89,
    momentum: "+16%",
    utility: "Choque regional",
    role: "Pico",
    tags: ["México", "guaracha urbana", "vocal"],
    reason: "Cruza escenas y amplía el reconocimiento fuera de Chile.",
    url: "https://open.spotify.com/search/CHINGON%202%20Martinwhite",
  },
  {
    id: "pastillitas",
    title: "Pastillitas de Colores",
    artist: "DJ Rocka × Blue Mary",
    country: "CL",
    year: 2021,
    bpm: 127,
    key: "6A",
    energy: 93,
    score: 88,
    momentum: "estable",
    utility: "Reconocimiento CL",
    role: "Clásico",
    tags: ["DJ Rocka", "trompeta", "clásico"],
    reason: "Referencia local comprobada y ancla de familiaridad en pista.",
    url: "https://www.youtube.com/watch?v=C9Yv04WzgjY",
  },
  {
    id: "baila-conmigo",
    title: "Baila Conmigo",
    artist: "Dayvi × Victor Cardenas × Kelly Ruiz",
    country: "CO",
    year: 2019,
    bpm: 128,
    key: "10A",
    energy: 90,
    score: 87,
    momentum: "catálogo",
    utility: "Ancla universal",
    role: "Clásico",
    tags: ["fundacional", "viral", "Colombia"],
    reason: "El gran puente internacional de la guaracha electrónica moderna.",
    url: "https://www.youtube.com/results?search_query=Dayvi+Victor+Cardenas+Baila+Conmigo",
  },
  {
    id: "quieren-guaracha",
    title: "Quieren Guaracha",
    artist: "DJ Rocka × King Savagge",
    country: "CL",
    year: 2022,
    bpm: 128,
    key: "7A",
    energy: 95,
    score: 86,
    momentum: "estable",
    utility: "Grito de pista",
    role: "Clásico",
    tags: ["urbano", "Chile", "peak"],
    reason: "Fórmula chilena directa: consigna vocal y drop de alta energía.",
    url: "https://www.youtube.com/watch?v=NzuBop7AnjU",
  },
  {
    id: "me-provocas",
    title: "Me Provocas",
    artist: "Fumaratto × Valka",
    country: "CO",
    year: 2019,
    bpm: 127,
    key: "4A",
    energy: 92,
    score: 84,
    momentum: "catálogo",
    utility: "Hook clásico",
    role: "Clásico",
    tags: ["tribal house", "hook", "Colombia"],
    reason: "Firma sonora reconocible y probada en varios mercados.",
    url: "https://open.spotify.com/search/Me%20Provocas%20Fumaratto",
  },
  {
    id: "troka",
    title: "Troka",
    artist: "Jairo Vera × Juhn",
    country: "CL × PR",
    year: 2026,
    bpm: 126,
    key: "5A",
    energy: 84,
    score: 82,
    momentum: "+24%",
    utility: "Entrada cantada",
    role: "Puente",
    tags: ["urbano", "2026", "crossover"],
    reason: "Conecta una tanda urbana con la aceleración hacia guaracha.",
    url: "https://open.spotify.com/search/Troka%20Jairo%20Vera%20Juhn",
  },
  {
    id: "v16",
    title: "V16",
    artist: "Martinwhite",
    country: "CL",
    year: 2022,
    bpm: 126,
    key: "9A",
    energy: 86,
    score: 80,
    momentum: "recurrente",
    utility: "Identidad local",
    role: "Puente",
    tags: ["Chile", "carrete", "vocal"],
    reason: "Jerga, relato y símbolos locales: alta conexión emocional.",
    url: "https://open.spotify.com/search/V16%20Martinwhite",
  },
];

const SAMPLE_ITEMS: SampleItem[] = [
  { id: "kick-01", name: "Kick Suelo 01", kind: "kick", family: "Drums", length: "1.0 s", fileName: "DJNANOOK_Kick_Suelo_01.wav", note: "Caída 146→48 Hz, cuerpo corto para 127–130 BPM." },
  { id: "clap-01", name: "Clap Aire 01", kind: "clap", family: "Drums", length: "0.8 s", fileName: "DJNANOOK_Clap_Aire_01.wav", note: "Tres ráfagas de ruido, centro despejado para voces." },
  { id: "shaker-128", name: "Shaker 128 Loop", kind: "shaker", family: "Percusión", length: "1 compás", bpm: 128, fileName: "DJNANOOK_Shaker_128bpm.wav", note: "Pulso de semicorcheas con acentos latinos." },
  { id: "timbal-01", name: "Timbal Corte 01", kind: "timbal", family: "Percusión", length: "1.2 s", fileName: "DJNANOOK_Timbal_Corte_01.wav", note: "Fill sintético de tres golpes para anunciar el drop." },
  { id: "horn-01", name: "Horn Neo Stab", kind: "horn", family: "Stabs", length: "0.75 s", fileName: "DJNANOOK_Horn_Neo_Stab.wav", note: "Acorde original inspirado en el rol de las trompetas clásicas." },
  { id: "riser-128", name: "Riser 4 Bars", kind: "riser", family: "FX", length: "7.5 s", bpm: 128, fileName: "DJNANOOK_Riser_4Bars_128bpm.wav", note: "Subida de cuatro compases, lista para un cambio de energía." },
  { id: "siren-01", name: "Siren Nanook 01", kind: "siren", family: "FX", length: "2.0 s", fileName: "DJNANOOK_Siren_01.wav", note: "Seno modulado original; funciona como llamada y respuesta." },
  { id: "sub-01", name: "Sub Drop 01", kind: "sub", family: "Bass", length: "2.5 s", fileName: "DJNANOOK_Sub_Drop_01.wav", note: "Descenso limpio 92→31 Hz para cierres y transiciones." },
];

const NAV: { id: Tab; label: string; index: string }[] = [
  { id: "radar", label: "Radar", index: "01" },
  { id: "similar", label: "Similitud", index: "02" },
  { id: "samples", label: "Samples", index: "03" },
  { id: "method", label: "Método", index: "04" },
];

function downloadText(contents: string, name: string, type = "text/plain") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createAudioData(kind: SampleKind) {
  const sampleRate = 44100;
  const durations: Record<SampleKind, number> = {
    kick: 1,
    clap: 0.8,
    shaker: 1.875,
    timbal: 1.2,
    horn: 0.75,
    riser: 7.5,
    siren: 2,
    sub: 2.5,
  };
  const data = new Float32Array(Math.floor(sampleRate * durations[kind]));
  let seed = 177;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };

  if (kind === "kick") {
    let phase = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const freq = 48 + 98 * Math.exp(-t * 24);
      phase += (Math.PI * 2 * freq) / sampleRate;
      data[i] = Math.sin(phase) * Math.exp(-t * 7.2) + noise() * Math.exp(-t * 55) * 0.12;
    }
  }
  if (kind === "clap") {
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const burst = [0, 0.025, 0.053].reduce((sum, start) => sum + (t >= start ? Math.exp(-(t - start) * 38) : 0), 0);
      data[i] = (noise() - (i > 0 ? data[i - 1] * 0.12 : 0)) * burst * 0.42;
    }
  }
  if (kind === "shaker") {
    const step = 60 / 128 / 4;
    let previousNoise = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const local = t % step;
      const hit = Math.exp(-local * (t % (step * 4) < 0.01 ? 62 : 88));
      const current = noise();
      data[i] = (current - previousNoise) * hit * 0.22;
      previousNoise = current;
    }
  }
  if (kind === "timbal") {
    const hits = [0, 0.29, 0.5];
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = hits.reduce((sum, start, index) => {
        if (t < start) return sum;
        const local = t - start;
        const f = 430 + index * 92;
        return sum + Math.sin(Math.PI * 2 * f * local) * Math.exp(-local * 15) * 0.58;
      }, 0);
    }
  }
  if (kind === "horn") {
    const notes = [196, 246.94, 293.66];
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const attack = Math.min(1, t * 70);
      const envelope = attack * Math.exp(-t * 5.2);
      data[i] = notes.reduce((sum, f) => sum + (Math.sin(2 * Math.PI * f * t) + 0.34 * Math.sin(4 * Math.PI * f * t) + 0.16 * Math.sin(6 * Math.PI * f * t)), 0) * envelope * 0.16;
    }
  }
  if (kind === "riser") {
    let phase = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const progress = t / 7.5;
      const freq = 120 + 1040 * progress * progress;
      phase += (Math.PI * 2 * freq) / sampleRate;
      data[i] = (Math.sin(phase) * 0.28 + noise() * 0.16 * progress) * Math.pow(progress, 1.35);
    }
  }
  if (kind === "siren") {
    let phase = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const freq = 690 + Math.sin(t * Math.PI * 3.2) * 260;
      phase += (Math.PI * 2 * freq) / sampleRate;
      data[i] = Math.sin(phase) * Math.sin(Math.min(1, t * 8) * Math.PI / 2) * Math.exp(-t * 0.48) * 0.55;
    }
  }
  if (kind === "sub") {
    let phase = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const progress = t / 2.5;
      const freq = 31 + 61 * Math.pow(1 - progress, 2.2);
      phase += (Math.PI * 2 * freq) / sampleRate;
      data[i] = Math.sin(phase) * Math.sin(Math.min(1, t * 10) * Math.PI / 2) * Math.exp(-t * 1.05) * 0.72;
    }
  }

  let peak = 0;
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  if (peak > 0.95) for (let i = 0; i < data.length; i++) data[i] = (data[i] / peak) * 0.95;
  return { data, sampleRate };
}

function wavBlob(data: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + data.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, data.length * 2, true);
  let offset = 44;
  for (const value of data) {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

function estimateAudio(buffer: AudioBuffer) {
  const channel = buffer.getChannelData(0);
  const maxSamples = Math.min(channel.length, buffer.sampleRate * 75);
  const hop = 1024;
  const energy: number[] = [];
  let totalSquare = 0;
  for (let start = 0; start < maxSamples - hop; start += hop) {
    let sum = 0;
    for (let i = start; i < start + hop; i++) {
      sum += channel[i] * channel[i];
      totalSquare += channel[i] * channel[i];
    }
    energy.push(Math.sqrt(sum / hop));
  }
  const onset = energy.map((value, index) => Math.max(0, value - (energy[index - 1] ?? value)));
  const rate = buffer.sampleRate / hop;
  let bestBpm = 128;
  let bestScore = -Infinity;
  for (let bpm = 85; bpm <= 170; bpm++) {
    const lag = Math.round((rate * 60) / bpm);
    let score = 0;
    for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  const rms = Math.sqrt(totalSquare / Math.max(1, maxSamples));
  const energyScore = Math.max(20, Math.min(99, Math.round(rms * 235)));
  return { bpm: bestBpm, energy: energyScore, duration: buffer.duration };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("samples");
  const [scope, setScope] = useState<Scope>("Chile");
  const [trackQuery, setTrackQuery] = useState("");
  const [styleQuery, setStyleQuery] = useState("Guaracha Chile");
  const [seedInput, setSeedInput] = useState("");
  const [seedId, setSeedId] = useState("ay-bonita");
  const [customSeed, setCustomSeed] = useState<{ title: string; bpm: number; energy: number; duration: number } | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [sampleFamily, setSampleFamily] = useState("Todos");
  const [playing, setPlaying] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const samplePlayback = useRef<{ id: string; source: AudioBufferSourceNode; context: AudioContext } | null>(null);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const currentSeed = TRACKS.find((track) => track.id === seedId) ?? TRACKS[2];
  const seedProfile = customSeed
    ? { title: customSeed.title, artist: "Archivo local", bpm: customSeed.bpm, key: "por revisar", energy: customSeed.energy }
    : currentSeed;

  const radarTracks = useMemo(() => {
    const query = trackQuery.trim().toLowerCase();
    return TRACKS.filter((track) => {
      const scopeMatch = scope === "Global" || (scope === "Chile" ? track.country.includes("CL") : true);
      const queryMatch = !query || `${track.title} ${track.artist} ${track.tags.join(" ")}`.toLowerCase().includes(query);
      return scopeMatch && queryMatch;
    });
  }, [scope, trackQuery]);

  const similarityTracks = useMemo(() => {
    return TRACKS.filter((track) => customSeed || track.id !== currentSeed.id)
      .map((track) => {
        const tempoDistance = Math.abs(track.bpm - seedProfile.bpm);
        const energyDistance = Math.abs(track.energy - seedProfile.energy);
        const keyBonus = !customSeed && track.key.slice(-1) === currentSeed.key.slice(-1) ? 3 : 0;
        const match = Math.max(58, Math.min(98, Math.round(97 - tempoDistance * 2.4 - energyDistance * 0.42 + keyBonus)));
        return { ...track, match };
      })
      .sort((a, b) => b.match - a.match)
      .slice(0, 7);
  }, [customSeed, currentSeed, seedProfile.bpm, seedProfile.energy]);

  const searchStyle = () => {
    setActiveTab("radar");
    setScope(styleQuery.toLowerCase().includes("chile") ? "Chile" : "Latam");
    flash(`Filtro de demo: ${styleQuery || "Guaracha"}`);
  };

  const analyzeSeed = () => {
    setAnalyzing(true);
    const normalized = seedInput.toLowerCase();
    const found = TRACKS.find((track) => normalized.includes(track.title.toLowerCase().split(" ")[0]) || normalized.includes(track.artist.toLowerCase().split(" ")[0]));
    window.setTimeout(() => {
      setCustomSeed(null);
      if (found) setSeedId(found.id);
      setAnalyzing(false);
      setActiveTab("similar");
      flash(found ? `Referencia encontrada: ${found.title}` : "No hubo coincidencia. Se conserva la referencia de demo actual.");
    }, 720);
  };

  const analyzeFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) { flash("Elige un audio de hasta 50 MB."); return; }
    setAnalyzing(true);
    let context: AudioContext | undefined;
    try {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      context = new AudioContextClass();
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const analysis = estimateAudio(decoded);
      await context.close();
      setCustomSeed({ title: file.name.replace(/\.[^.]+$/, ""), ...analysis });
      setActiveTab("similar");
      flash(`Audio analizado: ${analysis.bpm} BPM estimados`);
    } catch {
      flash("No pude leer ese audio. Prueba WAV, MP3 o M4A.");
    } finally {
      if (context && context.state !== "closed") await context.close();
      setAnalyzing(false);
    }
  };

  const toggleTrack = (id: string) => {
    setAdded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const exportCrate = () => {
    const selection = TRACKS.filter((track) => added.includes(track.id));
    const rows = [
      ["Orden", "Artista", "Título", "BPM", "Key", "Rol", "Nanook Score", "Fuente"],
      ...selection.map((track, index) => [index + 1, track.artist, track.title, track.bpm, track.key, track.role, track.score, track.url]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadText(csv, "DJ_Nanook_Guaracha_Hit_Crate.csv", "text/csv;charset=utf-8");
    flash("Crate exportado en CSV");
  };

  const playSample = async (sample: SampleItem) => {
    const previous = samplePlayback.current;
    if (previous) {
      samplePlayback.current = null;
      previous.source.stop();
      await previous.context.close();
      setPlaying(null);
      if (previous.id === sample.id) return;
    }
    try {
      const { data, sampleRate } = createAudioData(sample.kind);
      const context = new AudioContext();
      const buffer = context.createBuffer(1, data.length, sampleRate);
      buffer.copyToChannel(data, 0);
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = 0.72;
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      samplePlayback.current = { id: sample.id, source, context };
      setPlaying(sample.id);
      source.onended = () => {
        if (samplePlayback.current?.source === source) { samplePlayback.current = null; setPlaying(null); }
        if (context.state !== "closed") void context.close();
      };
      source.start();
    } catch { flash("No se pudo reproducir el sample en este navegador."); }
  };

  const downloadSample = (sample: SampleItem) => {
    const generated = createAudioData(sample.kind);
    const url = URL.createObjectURL(wavBlob(generated.data, generated.sampleRate));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sample.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    flash(`${sample.name} descargado · WAV 44.1 kHz / 16-bit`);
  };

  const visibleSamples = SAMPLE_ITEMS.filter((sample) => sampleFamily === "Todos" || sample.family === sampleFamily);

  return (
    <div className="app-shell">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" onClick={() => setActiveTab("radar")} aria-label="Ir al radar">
          <span className="brand-mark">N</span>
          <span><strong>DJ NANOOK</strong><small>HIT INTELLIGENCE</small></span>
        </button>
        <nav className="main-nav" aria-label="Navegación principal">
          {NAV.map((item) => (
            <button key={item.id} className={activeTab === item.id ? "active" : ""} onClick={() => setActiveTab(item.id)}>
              <span>{item.index}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="live-status"><i /> MODO LOCAL <span>DEMO</span></div>
      </header>

      <p className="portable-notice">PROTOTIPO LOCAL · Los ocho samples se sintetizan en tu navegador. El radar usa diez referencias de demostración: cifras, puntuaciones y afinidades ilustrativas, sin tendencias en vivo ni IA. El análisis de archivos solo estima BPM y energía. Exporta antes de cerrar; la selección no se guarda entre sesiones.</p>
      <main>
        {activeTab === "radar" && (
          <>
            <section className="hero-section">
              <div className="hero-copy">
                <p className="eyebrow"><span>●</span> CATÁLOGO DE DEMOSTRACIÓN</p>
                <h1>NO BUSQUES<br />CANCIONES.<br /><em>DETECTA EL MOMENTO.</em></h1>
                <p className="hero-lede">Explora diez referencias de muestra y crea un CSV. Los indicadores de este prototipo no proceden de mediciones en vivo.</p>
                <div className="style-search">
                  <label htmlFor="style-search">FILTRAR ESCENA DE DEMO</label>
                  <div>
                    <input id="style-search" value={styleQuery} onChange={(event) => setStyleQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && searchStyle()} />
                    <button onClick={searchStyle}>VER DEMO <span>↗</span></button>
                  </div>
                </div>
                <div className="hero-tags"><span>CHILE PRIMERO</span><span>LATAM + GLOBAL</span><span>LISTO PARA DJ</span></div>
              </div>
              <div className="signal-orbit" aria-label="Huella sonora de guaracha electrónica">
                <div className="orbit-label top"><small>TEMPO</small><strong>127–130</strong><span>BPM</span></div>
                <div className="orbit-label right"><small>ENERGÍA</small><strong>92</strong><span>/ 100</span></div>
                <div className="orbit-label bottom"><small>NÚCLEO</small><strong>CL × CO</strong><span>URBANO</span></div>
                <div className="record-disc"><div><b>GUARACHA</b><span>ELECTRÓNICA</span><small>RADAR 001</small></div></div>
                <div className="pulse-line" />
              </div>
            </section>

            <section className="snapshot-grid" aria-label="Resumen del radar">
              <article><span>01</span><small>REFERENCIAS DE DEMO</small><strong>10</strong><p>metadatos ilustrativos</p></article>
              <article><span>02</span><small>VENTANA DE TEMPO</small><strong>127<span>BPM</span></strong><p>mezcla estable en club</p></article>
              <article><span>03</span><small>HITS EN WATCHLIST</small><strong>10</strong><p>3 nuevos · 4 clásicos</p></article>
              <article className="accent"><span>04</span><small>CRATE ACTUAL</small><strong>{added.length}<span>TRACKS</span></strong><button onClick={exportCrate}>EXPORTAR CSV ↓</button></article>
            </section>

            <section className="radar-section">
              <div className="section-heading">
                <div><p className="eyebrow">RADAR 001 / GUARACHA ELECTRÓNICA</p><h2>Referencias para probar el flujo.</h2></div>
                <div className="scope-switch" aria-label="Alcance geográfico">
                  {(["Chile", "Latam", "Global"] as Scope[]).map((item) => <button key={item} className={scope === item ? "active" : ""} onClick={() => setScope(item)}>{item}</button>)}
                </div>
              </div>
              <div className="radar-layout">
                <div className="track-panel">
                  <div className="table-tools">
                    <label><span>⌕</span><input value={trackQuery} onChange={(event) => setTrackQuery(event.target.value)} placeholder="Filtrar artista, track o etiqueta" /></label>
                    <span>NANOOK SCORE ↓</span>
                  </div>
                  <div className="track-table" role="table" aria-label="Ranking de hits">
                    <div className="track-row track-head" role="row"><span>#</span><span>TRACK</span><span>BPM / KEY</span><span>SEÑAL</span><span>ROL</span><span /></div>
                    {radarTracks.map((track, index) => (
                      <div className="track-row" role="row" key={track.id}>
                        <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                        <div className="track-title"><a href={track.url} target="_blank" rel="noreferrer">{track.title}</a><small>{track.artist} · {track.country}</small></div>
                        <div className="tempo"><strong>{track.bpm}</strong><small>{track.key}</small></div>
                        <div className="score"><strong>{track.score}</strong><span><i style={{ width: `${track.score}%` }} /></span><small>{track.momentum}</small></div>
                        <span className={`role role-${track.role.toLowerCase().replace("á", "a")}`}>{track.role}</span>
                        <button className={added.includes(track.id) ? "crate-button added" : "crate-button"} onClick={() => toggleTrack(track.id)} aria-label={`${added.includes(track.id) ? "Quitar" : "Agregar"} ${track.title}`}>
                          {added.includes(track.id) ? "✓" : "+"}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="score-note">Nanook Score combina velocidad, cruce de mercados, utilidad DJ, permanencia y evidencia editorial. No representa streams oficiales.</p>
                </div>
                <aside className="dna-panel">
                  <p className="eyebrow">ADN DE LA ESCENA</p>
                  <h3>Guaracha<br /><em>Chile 2026</em></h3>
                  <div className="dna-stat"><span>Base tribal house</span><strong>31%</strong><i><b style={{ width: "31%" }} /></i></div>
                  <div className="dna-stat"><span>Voz urbana / hook</span><strong>29%</strong><i><b style={{ width: "29%" }} /></i></div>
                  <div className="dna-stat"><span>Percusión latina</span><strong>24%</strong><i><b style={{ width: "24%" }} /></i></div>
                  <div className="dna-stat"><span>FX + tensión EDM</span><strong>16%</strong><i><b style={{ width: "16%" }} /></i></div>
                  <div className="dna-insight"><span>HALLAZGO</span><p>En Chile, la voz dejó de ser adorno: ahora hace que la guaracha funcione como canción urbana.</p></div>
                  <button onClick={() => setActiveTab("method")}>VER ESTUDIO COMPLETO →</button>
                </aside>
              </div>
            </section>
          </>
        )}

        {activeTab === "similar" && (
          <section className="workspace-section similarity-page">
            <div className="page-intro">
              <p className="eyebrow">COMPARADOR LOCAL / DEMO</p>
              <h1>Una canción entra.<br /><em>El próximo set aparece.</em></h1>
              <p>Busca por nombre dentro de la demo o carga un audio propio. Solo se estiman tempo y energía; la comparación usa las cifras ilustrativas del catálogo y no identifica canciones por audio.</p>
            </div>
            <div className="seed-console">
              <div className="seed-input-block">
                <label htmlFor="seed-url">NOMBRE DE UNA REFERENCIA DE DEMO</label>
                <div><input id="seed-url" placeholder="Ej: AY BONITA — Martinwhite" value={seedInput} onChange={(event) => setSeedInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && analyzeSeed()} /><button onClick={analyzeSeed} disabled={analyzing}>{analyzing ? "BUSCANDO…" : "BUSCAR EN DEMO →"}</button></div>
                <div className="upload-divider"><span>O</span></div>
                <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={(event) => event.target.files?.[0] && void analyzeFile(event.target.files[0])} />
                <button className="upload-button" onClick={() => fileInputRef.current?.click()}>↑ SUBIR AUDIO LOCAL <span>MP3 · WAV · M4A</span></button>
                <small>Máximo 50 MB. El audio se analiza localmente y no se sube a un servidor.</small>
              </div>
              <div className="seed-profile">
                <div className="mini-record"><span>{customSeed ? "FILE" : "SEED"}</span></div>
                <div><small>SEMILLA ACTIVA</small><h3>{seedProfile.title}</h3><p>{"artist" in seedProfile ? seedProfile.artist : "Archivo local"}</p></div>
                <dl><div><dt>BPM</dt><dd>{seedProfile.bpm}</dd></div><div><dt>KEY</dt><dd>{seedProfile.key}</dd></div><div><dt>ENERGÍA</dt><dd>{seedProfile.energy}</dd></div></dl>
              </div>
            </div>
            <div className="similarity-layout">
              <div className="match-list">
                <div className="section-heading compact"><div><p className="eyebrow">RUTA SUGERIDA</p><h2>7 comparaciones orientativas</h2></div><button className="outline-button" onClick={() => { setAdded(similarityTracks.map((track) => track.id)); flash("Ruta completa agregada al crate"); }}>+ AGREGAR RUTA</button></div>
                {similarityTracks.map((track, index) => (
                  <article className="match-card" key={track.id}>
                    <span className="match-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="match-ring" style={{ "--match": `${track.match * 3.6}deg` } as CSSProperties}><strong>{track.match}</strong><small>%</small></div>
                    <div className="match-main"><a href={track.url} target="_blank" rel="noreferrer">{track.title}</a><p>{track.artist}</p><span>{track.reason}</span></div>
                    <div className="match-metrics"><span><small>BPM</small>{track.bpm}</span><span><small>KEY</small>{track.key}</span><span><small>ROL</small>{track.role}</span></div>
                    <button className={added.includes(track.id) ? "crate-button added" : "crate-button"} onClick={() => toggleTrack(track.id)}>{added.includes(track.id) ? "✓" : "+"}</button>
                  </article>
                ))}
              </div>
              <aside className="weights-panel">
                <p className="eyebrow">COMPARACIÓN ORIENTATIVA</p><h3>Qué calcula esta demo</h3><div className="dj-rule"><p>Ordena diez referencias por distancia de BPM y energía, con un ajuste sencillo de la tonalidad anotada. Las cifras de las canciones son ilustrativas. No analiza timbre, voces ni playlists, y la afinidad no es una probabilidad.</p></div>
                <button onClick={exportCrate}>DESCARGAR CRATE CSV ↓</button>
              </aside>
            </div>
          </section>
        )}

        {activeTab === "samples" && (
          <section className="workspace-section sample-page">
            <div className="page-intro split-intro">
              <div><p className="eyebrow">NANOOK SAMPLE VAULT / VOL. 001</p><h1>Sonidos clásicos.<br /><em>Material original.</em></h1></div>
              <div><p>Ocho samples generados desde cero para trabajar la gramática de la guaracha sin copiar grabaciones ajenas.</p><div className="license-badge">SÍNTESIS LOCAL · WAV 44.1 KHZ · 16-BIT</div></div>
            </div>
            <div className="sample-toolbar">
              <div className="family-tabs">{["Todos", "Drums", "Percusión", "Stabs", "FX", "Bass"].map((family) => <button key={family} className={sampleFamily === family ? "active" : ""} onClick={() => setSampleFamily(family)}>{family}</button>)}</div>
              <span>{visibleSamples.length} ARCHIVOS</span>
            </div>
            <div className="sample-grid">
              {visibleSamples.map((sample, index) => (
                <article className="sample-card" key={sample.id}>
                  <div className="sample-top"><span>{String(index + 1).padStart(2, "0")}</span><small>{sample.family.toUpperCase()}</small><button onClick={() => void playSample(sample)} aria-label={`Reproducir ${sample.name}`}>{playing === sample.id ? "■" : "▶"}</button></div>
                  <div className={`wave wave-${sample.kind}`} aria-hidden="true">{Array.from({ length: 34 }, (_, bar) => <i key={bar} style={{ height: `${18 + ((bar * 17 + index * 11) % 70)}%` }} />)}</div>
                  <h3>{sample.name}</h3><p>{sample.note}</p>
                  <div className="sample-meta"><span>{sample.length}</span>{sample.bpm && <span>{sample.bpm} BPM</span>}<span>MONO</span></div>
                  <button className="download-button" onClick={() => downloadSample(sample)}>DESCARGAR WAV <span>↓</span></button>
                </article>
              ))}
            </div>
            <div className="sample-principle"><strong>GRAMÁTICA CLÁSICA</strong><p>Kick con caída grave + shaker insistente + percusión latina + stab de metales + tensión de cuatro compases. La identidad nace del arreglo; el sample por sí solo no hace el género.</p></div>
          </section>
        )}

        {activeTab === "method" && (
          <section className="workspace-section method-page">
            <div className="page-intro split-intro">
              <div><p className="eyebrow">ESTUDIO 001 / GUARACHA ELECTRÓNICA EN CHILE</p><h1>Definir bien el estilo<br /><em>es encontrar mejor.</em></h1></div>
              <div><p>Este mapa separa la guaracha electrónica de Medellín y su evolución chilena de la guaracha cubana, la cumbia antigua y el tribal guarachero mexicano.</p><span className="updated-stamp">CURADURÍA · 10 AGO 2026</span></div>
            </div>
            <div className="lineage">
              <article><span>1990s</span><strong>TRIBAL HOUSE</strong><p>House de club con foco percusivo y tensión repetitiva.</p></article><i>→</i>
              <article><span>2010s · CO</span><strong>ALETEO / ZAPATEO</strong><p>Base tribal, percusión latina, trompetas y baile de pies.</p></article><i>→</i>
              <article className="active"><span>2020s · CL</span><strong>GUARACHA URBANA</strong><p>Voz protagonista, jerga chilena, hooks cortos y cruces con urbano.</p></article><i>→</i>
              <article><span>AHORA</span><strong>CROSSOVER LATINO</strong><p>Colaboraciones regionales y estructura lista para playlists globales.</p></article>
            </div>
            <div className="study-grid">
              <article className="study-card definition"><p className="eyebrow">DEFINICIÓN OPERATIVA</p><h2>¿Qué llamamos “guaracha” aquí?</h2><p>Una familia de electrónica latina de pista, normalmente alrededor de 127–130 BPM, nacida del cruce entre tribal house y elementos colombianos. En Chile se vuelve más vocal, urbana y comprimida: el drop sigue importando, pero el coro es la memoria.</p><div className="not-this"><strong>NO CONFUNDIR CON</strong><span>Guaracha cubana tradicional</span><span>Cumbia chilena antigua</span><span>Guaracha santiagueña</span><span>3Ball mexicano</span></div></article>
              <article className="study-card sound"><p className="eyebrow">HUELLA SONORA</p><h2>Los ocho marcadores</h2><ol><li><span>01</span>Kick de club seco y grave</li><li><span>02</span>Shaker / maraca insistente</li><li><span>03</span>Timbales, congas y fills</li><li><span>04</span>Stabs de trompeta o synth</li><li><span>05</span>Bajo simple y funcional</li><li><span>06</span>Risers de 4–8 compases</li><li><span>07</span>Drop de llamada y respuesta</li><li><span>08</span>Hook vocal chileno / latino</li></ol></article>
              <article className="study-card scoring"><p className="eyebrow">NANOOK SCORE / 100</p><h2>Ejemplo de criterios editoriales</h2><div className="formula-row"><span>Velocidad</span><i><b style={{ width: "28%" }} /></i><strong>28</strong></div><div className="formula-row"><span>Cruce de mercados</span><i><b style={{ width: "22%" }} /></i><strong>22</strong></div><div className="formula-row"><span>Utilidad DJ</span><i><b style={{ width: "20%" }} /></i><strong>20</strong></div><div className="formula-row"><span>Persistencia</span><i><b style={{ width: "16%" }} /></i><strong>16</strong></div><div className="formula-row"><span>Señal editorial</span><i><b style={{ width: "14%" }} /></i><strong>14</strong></div><p className="formula-note">El número de streams solo no decide. Un hit para DJ debe crecer, cruzar escenas, mezclarse bien y sobrevivir más de una semana viral.</p></article>
              <article className="study-card workflow"><p className="eyebrow">MÉTODO REPLICABLE</p><h2>Funciona con cualquier estilo</h2><ol className="workflow-list"><li><b>01</b><span><strong>DEFINIR</strong>Separar el estilo de sus homónimos.</span></li><li><b>02</b><span><strong>MAPEAR</strong>Escena, ciudades, DJs, sellos y playlists.</span></li><li><b>03</b><span><strong>MEDIR</strong>Velocidad, permanencia y cruce.</span></li><li><b>04</b><span><strong>ESCUCHAR</strong>Validar intro, drop, hook y reacción.</span></li><li><b>05</b><span><strong>ORDENAR</strong>Construir una curva de energía útil.</span></li></ol></article>
            </div>
            <div className="sources-section">
              <div><p className="eyebrow">FUENTES ABIERTAS DEL ESTUDIO</p><h2>Lecturas del prototipo original.</h2></div>
              <div className="source-links">
                <a href="https://hmc.chartmetric.com/regional-latin-music-genres-evolution/" target="_blank" rel="noreferrer"><span>ORIGEN + EXPANSIÓN</span>Chartmetric · Guaracha electrónica ↗</a>
                <a href="https://www.emol.com/noticias/Espectaculos/2026/03/15/1194257/martin-white-apuesta-guaracha.html" target="_blank" rel="noreferrer"><span>ESCENA CHILENA</span>EMOL · Evolución vocal de Martinwhite ↗</a>
                <a href="https://www.youtube.com/watch?v=C9Yv04WzgjY" target="_blank" rel="noreferrer"><span>REFERENCIA LOCAL</span>DJ Rocka · Pastillitas de Colores ↗</a>
                <a href="https://volt.fm/playlist/574160/best-of-guaracha" target="_blank" rel="noreferrer"><span>WATCHLIST</span>Best of Guaracha · playlist viva ↗</a>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer><div className="brand mini"><span className="brand-mark">N</span><span><strong>DJ NANOOK</strong><small>HIT INTELLIGENCE</small></span></div><p>Radar 001 · Guaracha Electrónica · Chile / Latam</p><span>HECHO PARA ENCONTRAR EL PRÓXIMO MOMENTO</span></footer>
      <div className={toast ? "toast visible" : "toast"} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
