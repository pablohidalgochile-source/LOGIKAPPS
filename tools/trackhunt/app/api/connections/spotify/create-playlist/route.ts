import { createSpotifyPlaylist, spotifyConnectionStatus, SpotifyRequestError } from "../../../../../lib/spotify-server";
import { mutationSecurityError, noStoreJson, requireRequestUser } from "../../../../../lib/request-security";

export async function POST(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const status = await spotifyConnectionStatus(user.userId);
  if (!status.connected) return noStoreJson({ error: "Conecta Spotify para crear la playlist." }, { status: 401 });
  const securityError = mutationSecurityError(request, status.csrfToken);
  if (securityError) return securityError;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return noStoreJson({ error: "Formato de solicitud inválido." }, { status: 415 });
  }
  let body: { name?: unknown; tracks?: unknown };
  try { body = await request.json(); } catch { return noStoreJson({ error: "Solicitud inválida." }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const tracks = Array.isArray(body.tracks) ? body.tracks.map((track) => {
    const value = track as { artist?: unknown; title?: unknown };
    return {
      artist: typeof value.artist === "string" ? value.artist.trim().slice(0, 160) : "",
      title: typeof value.title === "string" ? value.title.trim().slice(0, 200) : "",
    };
  }).filter((track) => track.artist && track.title).slice(0, 100) : [];
  if (!name || !tracks.length) return noStoreJson({ error: "Indica un nombre y al menos una canción." }, { status: 400 });
  try {
    return noStoreJson(await createSpotifyPlaylist(user.userId, { name, tracks }));
  } catch (error) {
    const known = error instanceof SpotifyRequestError ? error : null;
    return noStoreJson({ error: known?.message || "No se pudo crear la playlist." }, { status: known?.status || 500, headers: known?.retryAfter ? { "retry-after": known.retryAfter } : undefined });
  }
}

