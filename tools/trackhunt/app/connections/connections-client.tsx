"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { capabilityLabels, providers, type CapabilityState, type ProviderDefinition } from "../../lib/connection-catalog";

type ConnectionStatus = {
  user: { displayName: string; email: string };
  storageReady: boolean;
  spotify: {
    configured: boolean;
    connected: boolean;
    accountName?: string;
    csrfToken?: string;
    reconnectBy?: string;
    expired?: boolean;
  };
  deezer: { configured: boolean; connected: boolean; accountName?: string; csrfToken?: string; reconnectBy?: string };
  callbackUrls: { spotify: string; deezer: string };
  services: {
    youtubePlaylists: boolean;
    automaticRemixSearch: boolean;
    soundcloudCatalog: boolean;
    audioRecognition: "configured" | "evaluation";
    mixRecognition: "configured" | "not-configured";
  };
};

type Playlist = {
  id: string;
  name: string;
  image: string;
  owner: string;
  total: number | null;
  spotifyUrl: string;
  collaborative: boolean;
};

const statusCopy: Record<CapabilityState, string> = {
  connected: "Activo",
  supported: "Disponible",
  provider: "En proveedor",
  partner: "Requiere alianza",
  unavailable: "No disponible",
};

function ProviderAction({ provider, status, disconnectingDeezer, onDisconnectDeezer }: { provider: ProviderDefinition; status: ConnectionStatus | null; disconnectingDeezer: boolean; onDisconnectDeezer: () => void }) {
  if (provider.id === "spotify") {
    if (status?.spotify.connected) return <span className="cx-connected-mark"><i /> CONECTADA</span>;
    if (status?.spotify.configured) return <a className="cx-action primary spotify" href="/api/connections/spotify/connect">Conectar Spotify ↗</a>;
    return <span className="cx-action disabled">Falta configurar la app</span>;
  }
  if (provider.id === "deezer") {
    if (status?.deezer.connected) return <div className="cx-card-connected"><span className="cx-connected-mark"><i /> {status.deezer.accountName || "CONECTADA"}</span><button type="button" disabled={disconnectingDeezer} onClick={onDisconnectDeezer}>{disconnectingDeezer ? "Desconectando…" : "Desconectar"}</button></div>;
    if (status?.deezer.configured) return <a className="cx-action primary deezer" href="/api/deezer/connect">Conectar Deezer ↗</a>;
  }
  return <a className="cx-action" href={provider.accountUrl} target="_blank" rel="noopener noreferrer">{provider.accountLabel} ↗</a>;
}

export default function ConnectionsClient({ initialName }: { initialName: string }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [category, setCategory] = useState<"all" | "streaming" | "store" | "dj-pool">("all");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadStatus = async () => {
    const response = await fetch("/api/connections/status", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo leer el estado de las cuentas.");
    setStatus(payload);
    return payload as ConnectionStatus;
  };

  const loadPlaylists = async (offset = 0, append = false) => {
    setBusy("playlists");
    try {
      const response = await fetch(`/api/connections/spotify/playlists?offset=${offset}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las playlists.");
      setPlaylists((current) => append ? [...current, ...payload.playlists] : payload.playlists);
      setNextOffset(payload.nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las playlists.");
    } finally { setBusy(""); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const result = params.get("spotify");
      const deezerResult = params.get("deezer");
      if (result === "connected") setNotice("Spotify quedó conectado de forma segura.");
      else if (result === "denied") setNotice("Cancelaste la autorización de Spotify; no se guardó nada.");
      else if (result) setError("No se pudo completar la conexión con Spotify. Intenta conectarla nuevamente.");
      if (deezerResult === "connected") setNotice("Deezer quedó conectado de forma segura.");
      else if (deezerResult === "denied") setNotice("Cancelaste la autorización de Deezer; no se guardó nada.");
      else if (deezerResult) setError("No se pudo completar la conexión con Deezer. Intenta conectarla nuevamente.");
      loadStatus().then((next) => { if (next.spotify.connected) void loadPlaylists(); }).catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo leer el estado."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const disconnect = async () => {
    if (!status?.spotify.connected || !status.spotify.csrfToken) return;
    setBusy("disconnect"); setError("");
    try {
      const response = await fetch("/api/connections/spotify/disconnect", {
        method: "POST",
        headers: { "x-trackhunt-csrf": status.spotify.csrfToken },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo desconectar Spotify.");
      setPlaylists([]); setNextOffset(null); setNotice("Spotify fue desconectado y sus tokens se eliminaron de Trackhunt.");
      await loadStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo desconectar Spotify."); }
    finally { setBusy(""); }
  };

  const disconnectDeezer = async () => {
    if (!status?.deezer.connected || !status.deezer.csrfToken) return;
    setBusy("disconnect-deezer"); setError("");
    try {
      const response = await fetch("/api/connections/deezer/disconnect", {
        method: "POST",
        headers: { "x-trackhunt-csrf": status.deezer.csrfToken },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo desconectar Deezer.");
      setNotice("Deezer fue desconectado y su token se eliminó de Trackhunt.");
      await loadStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo desconectar Deezer."); }
    finally { setBusy(""); }
  };

  const visibleProviders = useMemo(() => providers.filter((provider) => category === "all" || provider.category === category), [category]);
  const userName = status?.user.displayName || initialName;

  return <div className="cx-app">
    <header className="rh-header">
      <Link href="/" className="rh-brand" aria-label="Trackhunt, inicio"><span>TH</span> TRACKHUNT<span className="rh-brand-sub">DJ DIGGING TOOL</span></Link>
      <nav aria-label="Principal"><Link href="/">Versiones</Link><Link href="/sets">Sets</Link><Link href="/playlist-hunt">Playlist Hunt</Link><Link href="/quality">Mejor calidad</Link><Link className="cx-active" href="/connections">Conexiones</Link></nav>
    </header>

    <main className="cx-main">
      <section className="cx-hero">
        <div><span className="rh-kicker">CUENTAS / PLAYLISTS / FUENTES AUTORIZADAS</span><h1>Tu música, <em>conectada con criterio.</em></h1><p>Trae tus playlists, crea nuevas listas y abre tus pools de pago sin compartir contraseñas ni confundir streaming con archivos descargables.</p></div>
        <div className="cx-user"><span>SESIÓN DE TRACKHUNT</span><strong>{userName}</strong><small>Las conexiones quedan separadas por usuario y sus tokens se guardan cifrados.</small></div>
      </section>

      {(notice || error) && <button type="button" className={`cx-message ${error ? "error" : ""}`} onClick={() => { setNotice(""); setError(""); }}><span>{error ? "!" : "✓"}</span>{error || notice}<b>×</b></button>}

      <section className="cx-runtime" aria-labelledby="runtime-title">
        <div className="cx-runtime-head"><span className="cx-number">00</span><div><span className="rh-kicker">DIAGNÓSTICO EN VIVO</span><h2 id="runtime-title">Qué puede automatizar TrackHunt ahora</h2><p>El estado viene del servidor publicado. “Asistido” significa que siempre puedes abrir o exportar la búsqueda, aunque falte una conexión automática.</p></div></div>
        <div className="cx-runtime-grid">
          <div><span>DEEZER</span><strong className="ready">CATÁLOGO LISTO</strong><small>Búsqueda y enlaces para exportar.</small></div>
          <div><span>SPOTIFY</span><strong className={status?.spotify.connected ? "ready" : status?.spotify.configured ? "available" : "pending"}>{status?.spotify.connected ? "CONECTADA" : status?.spotify.configured ? "LISTA PARA CONECTAR" : "FALTA CONFIGURAR"}</strong><small>Playlists y metadatos, nunca audio.</small></div>
          <div><span>PLAYLISTS YOUTUBE</span><strong className={status?.services.youtubePlaylists ? "ready" : "pending"}>{status?.services.youtubePlaylists ? "AUTOMÁTICO" : "ASISTIDO"}</strong><small>Requiere la clave oficial para enumerarlas.</small></div>
          <div><span>REMIXES PÚBLICOS</span><strong className={status?.services.automaticRemixSearch || status?.services.soundcloudCatalog ? "ready" : "pending"}>{status?.services.automaticRemixSearch ? "BÚSQUEDA WEB" : status?.services.soundcloudCatalog ? "SOUNDCLOUD" : "ASISTIDO"}</strong><small>SoundCloud y Bandcamp cuando hay conexión.</small></div>
          <div><span>AUDIO CORTO</span><strong className={status?.services.audioRecognition === "configured" ? "ready" : "available"}>{status?.services.audioRecognition === "configured" ? "CONFIGURADO" : "EVALUACIÓN"}</strong><small>Identifica un fragmento autorizado de 12 segundos; el estado no comprueba cuota en vivo.</small></div>
          <div><span>MIX COMPLETO</span><strong className={status?.services.mixRecognition === "configured" ? "ready" : "pending"}>{status?.services.mixRecognition === "configured" ? "CONFIGURADO" : "LISTO PARA CONECTAR"}</strong><small>Valida proveedor, región y modo gratuito; la cuota se comprueba al usarlo.</small></div>
        </div>
      </section>

      <section className="cx-spotify-panel" aria-labelledby="spotify-title">
        <div className="cx-spotify-top">
          <div><span className="cx-number">01</span><div><span className="rh-kicker">CONEXIÓN DISPONIBLE</span><h2 id="spotify-title">Spotify como puente de playlists</h2></div></div>
          {status?.spotify.connected ? <div className="cx-account"><span><i /> CONECTADA</span><strong>{status.spotify.accountName}</strong><button type="button" disabled={busy === "disconnect"} onClick={disconnect}>{busy === "disconnect" ? "Desconectando…" : "Desconectar"}</button></div> : status?.spotify.configured ? <a className="cx-spotify-connect" href="/api/connections/spotify/connect"><span>♫</span><b>Conectar Spotify</b><small>Importar y crear playlists privadas</small><i>↗</i></a> : <div className="cx-not-configured"><strong>LISTA PARA ACTIVAR</strong><span>Falta añadir el Client ID de Spotify.</span></div>}
        </div>
        <div className="cx-boundary"><div><b>✓</b><span><strong>SÍ</strong> importar metadatos, biblioteca y playlists; buscar coincidencias y crear listas privadas.</span></div><div><b>×</b><span><strong>NO</strong> descargar, analizar, mejorar, mezclar ni enviar audio de Spotify a IA.</span></div></div>

        {status?.spotify.connected && <div className="cx-library">
          <div className="cx-library-head"><div><span className="rh-kicker">TU BIBLIOTECA</span><h3>Elige una playlist para llevarla a Sets</h3><p>Trackhunt importará título, artista, álbum, duración e ISRC cuando esté disponible. Spotify solo permite leer los temas de listas propias o colaborativas en este modo.</p></div><button type="button" onClick={() => loadPlaylists()} disabled={busy === "playlists"}>↻ Actualizar</button></div>
          {playlists.length ? <div className="cx-playlist-grid">{playlists.map((playlist) => <article key={playlist.id}>
            {playlist.image ? <img src={playlist.image} alt="" /> : <span className="cx-playlist-art">♫</span>}
            <div><small>{playlist.id === "liked" ? "BIBLIOTECA" : playlist.collaborative ? "COLABORATIVA" : playlist.owner || "PLAYLIST"}</small><h4>{playlist.name}</h4><p>{playlist.total == null ? "Canciones guardadas" : `${playlist.total} canciones`}</p></div>
            <div className="cx-playlist-actions"><Link href={`/sets?spotifyPlaylist=${encodeURIComponent(playlist.id)}`}>Importar a Sets →</Link>{playlist.spotifyUrl && <a href={playlist.spotifyUrl} target="_blank" rel="noopener noreferrer">Abrir Spotify ↗</a>}</div>
          </article>)}</div> : <div className="cx-loading">{busy === "playlists" ? "Cargando playlists…" : "No encontramos playlists importables."}</div>}
          {nextOffset !== null && <button className="cx-more" type="button" disabled={busy === "playlists"} onClick={() => loadPlaylists(nextOffset, true)}>Cargar más playlists</button>}
        </div>}
      </section>

      <section className="cx-directory" aria-labelledby="directory-title">
        <div className="cx-directory-head"><div><span className="cx-number">02</span><div><span className="rh-kicker">MAPA DE SERVICIOS</span><h2 id="directory-title">Cada cuenta hace algo distinto</h2><p>“Conectar”, “abrir”, “comprar” y “descargar” no significan lo mismo. Trackhunt muestra exactamente qué puede hacer hoy.</p></div></div><div className="cx-tabs" aria-label="Filtrar servicios">{([['all','Todos'],['streaming','Streaming'],['store','Tiendas'],['dj-pool','DJ pools']] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div></div>
        <div className="cx-grid">{visibleProviders.map((provider) => <article className="cx-card" key={provider.id} style={{ "--provider": provider.accent } as React.CSSProperties}>
          <div className="cx-card-head"><span>{provider.category === "dj-pool" ? "DJ POOL" : provider.category === "store" ? "TIENDA / SERVICIO" : "STREAMING"}</span><i /></div>
          <h3>{provider.name}</h3><p className="cx-summary">{provider.summary}</p>
          <div className="cx-capabilities">{Object.entries(provider.capabilities).map(([capability, state]) => <div key={capability}><span>{capabilityLabels[capability as keyof typeof capabilityLabels]}</span><b className={state}>{statusCopy[state]}</b></div>)}</div>
          <p className="cx-note">{provider.note}</p>
          <ProviderAction provider={provider} status={status} disconnectingDeezer={busy === "disconnect-deezer"} onDisconnectDeezer={disconnectDeezer} />
        </article>)}</div>
      </section>

      <section className="cx-safety">
        <div><span className="cx-number">03</span><div><span className="rh-kicker">REGLAS DE CONFIANZA</span><h2>Tu suscripción sigue siendo tuya.</h2></div></div>
        <div className="cx-safety-grid"><div><b>01</b><strong>Sin contraseñas</strong><p>Trackhunt usa autorización oficial. Los pools sin API se abren en su propia web.</p></div><div><b>02</b><strong>Tokens cifrados</strong><p>Los permisos se guardan del lado servidor y separados por usuario.</p></div><div><b>03</b><strong>Descarga real</strong><p>Solo mostramos descarga cuando la tienda o el pool entrega un archivo autorizado.</p></div><div><b>04</b><strong>Desconexión clara</strong><p>Puedes borrar el acceso local; también puedes revocarlo en la cuenta del proveedor.</p></div></div>
      </section>

      {!status?.spotify.configured && <details className="cx-owner-setup"><summary>Activar Spotify en esta instalación</summary><p>Crea una app en Spotify for Developers y registra exactamente esta URL de retorno:</p><code>{status?.callbackUrls.spotify || "https://trackhunt-dj.nanook.chatgpt.site/api/connections/spotify/callback"}</code><p>Después configura <code>SPOTIFY_CLIENT_ID</code>. Trackhunt usa PKCE y no necesita guardar tu contraseña de Spotify.</p><p>El modo de desarrollo admite un piloto limitado de usuarios autorizados; para un lanzamiento abierto Spotify exige revisión y acceso ampliado.</p></details>}
    </main>
    <footer className="rh-footer"><span>TRACKHUNT / CONEXIONES SIN ATAJOS OSCUROS.</span><Link href="/sets">Importar un set</Link><Link href="/quality">Buscar mejor calidad</Link></footer>
  </div>;
}
