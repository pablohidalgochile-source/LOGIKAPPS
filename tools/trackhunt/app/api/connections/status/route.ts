import { spotifyIsConfigured, spotifyConnectionStatus } from "../../../../lib/spotify-server";
import { deezerConnectionStatus, deezerIsConfigured } from "../../../../lib/deezer-server";
import { acrCloudAvailability } from "../../../../lib/acrcloud-server";
import { currentAcrCloudEnv } from "../../../../lib/acrcloud-runtime";
import { noStoreJson, requireRequestUser } from "../../../../lib/request-security";

export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const audioToken = process.env.AUDD_API_TOKEN?.trim() ?? "";
  const mixAvailability = acrCloudAvailability(currentAcrCloudEnv());
  let spotify;
  let deezer;
  let storageReady = true;
  try {
    [spotify, deezer] = await Promise.all([
      spotifyConnectionStatus(user.userId),
      deezerConnectionStatus(user.userId),
    ]);
  } catch (error) {
    console.error("connections_status_failed", error instanceof Error ? error.message : error);
    spotify = { connected: false as const };
    deezer = { connected: false as const };
    storageReady = false;
  }
  return noStoreJson({
    user: { displayName: user.displayName, email: user.email },
    storageReady,
    spotify: { configured: spotifyIsConfigured(), ...spotify },
    deezer: { configured: deezerIsConfigured(), ...deezer },
    callbackUrls: {
      spotify: `${process.env.TRACKHUNT_PUBLIC_ORIGIN?.replace(/\/$/, "") || new URL(request.url).origin}/api/connections/spotify/callback`,
      deezer: `${process.env.TRACKHUNT_PUBLIC_ORIGIN?.replace(/\/$/, "") || new URL(request.url).origin}/api/deezer/callback`,
    },
    services: {
      youtubePlaylists: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
      automaticRemixSearch: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
      soundcloudCatalog: Boolean(process.env.SOUNDCLOUD_CLIENT_ID?.trim() && process.env.SOUNDCLOUD_CLIENT_SECRET?.trim()),
      audioRecognition: audioToken && audioToken.toLowerCase() !== "test" ? "configured" : "evaluation",
      mixRecognition: mixAvailability.available ? "configured" : "not-configured",
    },
  });
}
