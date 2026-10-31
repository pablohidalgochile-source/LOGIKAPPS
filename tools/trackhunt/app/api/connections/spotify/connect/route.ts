import { createOAuthFlow } from "../../../../../lib/connections-store";
import { spotifyScopes } from "../../../../../lib/connection-catalog";
import { encryptSecret } from "../../../../../lib/secret-box";
import { pkceChallenge, randomBase64Url, safeRelativeReturnTo, spotifyAuthorizationUrl } from "../../../../../lib/oauth-pkce";
import { requireRequestUser } from "../../../../../lib/request-security";
import { spotifyIsConfigured, spotifyOAuthAad, spotifyRedirectUri } from "../../../../../lib/spotify-server";

export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId || !spotifyIsConfigured()) {
    return Response.json({ error: "Spotify aún no está configurado en Trackhunt." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(64);
  const returnTo = safeRelativeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const now = Date.now();
  await createOAuthFlow({
    state,
    user_id: user.userId,
    provider: "spotify",
    verifier_ciphertext: await encryptSecret(verifier, spotifyOAuthAad(user.userId)),
    return_to: returnTo,
    created_at: now,
    expires_at: now + 10 * 60 * 1000,
  });
  const location = spotifyAuthorizationUrl({
    clientId,
    redirectUri: spotifyRedirectUri(request),
    state,
    challenge: await pkceChallenge(verifier),
    scopes: spotifyScopes,
  });
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });
}

