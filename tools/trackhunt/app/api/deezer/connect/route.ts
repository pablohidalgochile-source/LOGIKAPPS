import { createOAuthFlow } from "../../../../lib/connections-store";
import { deezerIsConfigured, deezerOAuthAad, deezerRedirectUri } from "../../../../lib/deezer-server";
import { randomBase64Url } from "../../../../lib/oauth-pkce";
import { requireRequestUser } from "../../../../lib/request-security";
import { encryptSecret } from "../../../../lib/secret-box";

export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const appId = process.env.DEEZER_APP_ID;
  if (!appId || !deezerIsConfigured()) {
    return Response.json({
      error: "Falta configurar DEEZER_APP_ID y DEEZER_APP_SECRET en el servidor.",
    }, { status: 503 });
  }

  const state = randomBase64Url(32);
  const now = Date.now();
  await createOAuthFlow({
    state,
    user_id: user.userId,
    provider: "deezer",
    verifier_ciphertext: await encryptSecret("deezer", deezerOAuthAad(user.userId)),
    return_to: "/connections",
    created_at: now,
    expires_at: now + 10 * 60 * 1000,
  });
  const auth = new URL("https://connect.deezer.com/oauth/auth.php");
  auth.searchParams.set("app_id", appId);
  auth.searchParams.set("redirect_uri", deezerRedirectUri(request));
  auth.searchParams.set("perms", "basic_access,manage_library");
  auth.searchParams.set("state", state);

  return new Response(null, { status: 302, headers: { location: auth.toString(), "cache-control": "no-store" } });
}
