import { consumeOAuthFlow } from "../../../../../lib/connections-store";
import { safeRelativeReturnTo } from "../../../../../lib/oauth-pkce";
import { decryptSecret } from "../../../../../lib/secret-box";
import { requireRequestUser } from "../../../../../lib/request-security";
import {
  exchangeSpotifyCode,
  fetchSpotifyProfile,
  saveSpotifyConnection,
  spotifyOAuthAad,
  spotifyRedirectUri,
} from "../../../../../lib/spotify-server";

function redirectResult(request: Request, returnTo: string, result: string) {
  const target = new URL(safeRelativeReturnTo(returnTo), request.url);
  target.searchParams.set("spotify", result);
  return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  if (!state) return redirectResult(request, "/connections", "invalid-state");
  let flow;
  try {
    flow = await consumeOAuthFlow(state, user.userId, "spotify");
  } catch (error) {
    console.error("spotify_oauth_storage_failed", error instanceof Error ? error.message : error);
    return redirectResult(request, "/connections", "storage-error");
  }
  if (!flow) return redirectResult(request, "/connections", "invalid-state");
  if (url.searchParams.get("error")) return redirectResult(request, flow.return_to, "denied");
  const code = url.searchParams.get("code");
  if (!code) return redirectResult(request, flow.return_to, "missing-code");
  try {
    const verifier = await decryptSecret(flow.verifier_ciphertext, spotifyOAuthAad(user.userId));
    const token = await exchangeSpotifyCode({ code, verifier, redirectUri: spotifyRedirectUri(request) });
    const profile = await fetchSpotifyProfile(token.access_token!);
    await saveSpotifyConnection({ userId: user.userId, token, profile });
    return redirectResult(request, flow.return_to, "connected");
  } catch (error) {
    console.error("spotify_oauth_callback_failed", error instanceof Error ? error.message : error);
    return redirectResult(request, flow.return_to, "error");
  }
}

