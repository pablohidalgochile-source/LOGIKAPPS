import { importSpotifyPlaylist, SpotifyRequestError } from "../../../../../lib/spotify-server";
import { noStoreJson, requireRequestUser } from "../../../../../lib/request-security";

export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const playlistId = new URL(request.url).searchParams.get("playlistId") ?? "";
  try {
    return noStoreJson(await importSpotifyPlaylist(user.userId, playlistId));
  } catch (error) {
    const known = error instanceof SpotifyRequestError ? error : null;
    return noStoreJson({ error: known?.message || "No se pudo importar la playlist." }, { status: known?.status || 500, headers: known?.retryAfter ? { "retry-after": known.retryAfter } : undefined });
  }
}

