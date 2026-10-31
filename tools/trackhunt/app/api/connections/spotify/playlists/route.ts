import { listSpotifyPlaylists, SpotifyRequestError } from "../../../../../lib/spotify-server";
import { noStoreJson, requireRequestUser } from "../../../../../lib/request-security";

export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  try {
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
    const payload = await listSpotifyPlaylists(user.userId, offset);
    return noStoreJson({
      playlists: [
        ...(offset === 0 ? [{ id: "liked", name: "Tus Me gusta", image: "", owner: "Spotify", total: null, spotifyUrl: "https://open.spotify.com/collection/tracks", collaborative: false }] : []),
        ...payload.items.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          image: playlist.images?.[0]?.url || "",
          owner: playlist.owner?.display_name || "",
          total: playlist.items?.total ?? playlist.tracks?.total ?? null,
          spotifyUrl: playlist.external_urls?.spotify || "",
          collaborative: playlist.collaborative,
        })),
      ],
      total: payload.total + 1,
      nextOffset: payload.next ? offset + 10 : null,
    });
  } catch (error) {
    const known = error instanceof SpotifyRequestError ? error : null;
    return noStoreJson({ error: known?.message || "No se pudieron cargar las playlists." }, { status: known?.status || 500, headers: known?.retryAfter ? { "retry-after": known.retryAfter } : undefined });
  }
}

