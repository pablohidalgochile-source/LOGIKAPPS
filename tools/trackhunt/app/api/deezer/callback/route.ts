import { consumeOAuthFlow } from "../../../../lib/connections-store";
import { deezerRedirectUri, saveDeezerConnection } from "../../../../lib/deezer-server";
import { requireRequestUser } from "../../../../lib/request-security";

function redirectResult(request: Request, result: string) {
  const target = new URL("/connections", request.url);
  target.searchParams.set("deezer", result);
  return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store" } });
}
export async function GET(request: Request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const appId = process.env.DEEZER_APP_ID?.trim();
  const secret = process.env.DEEZER_APP_SECRET?.trim();
  if (!state) return redirectResult(request, "invalid-state");
  const flow = await consumeOAuthFlow(state, user.userId, "deezer");
  if (!flow) return redirectResult(request, "invalid-state");
  if (url.searchParams.get("error_reason")) return redirectResult(request, "denied");
  if (!code || !appId || !secret) return redirectResult(request, "not-configured");
  try {
    const tokenUrl = new URL("https://connect.deezer.com/oauth/access_token.php");
    tokenUrl.searchParams.set("app_id", appId);
    tokenUrl.searchParams.set("secret", secret);
    tokenUrl.searchParams.set("code", code);
    tokenUrl.searchParams.set("output", "json");
    tokenUrl.searchParams.set("redirect_uri", deezerRedirectUri(request));
    const response = await fetch(tokenUrl, { headers: { accept: "application/json" } });
    const payload = await response.json() as { access_token?: string; expires?: number; error?: unknown };
    if (!response.ok || !payload.access_token) throw new Error("Deezer did not return an access token.");
    const profileResponse = await fetch(`https://api.deezer.com/user/me?access_token=${encodeURIComponent(payload.access_token)}`, { headers: { accept: "application/json" } });
    const profile = await profileResponse.json() as { id?: number; name?: string; error?: unknown };
    if (!profileResponse.ok || profile.error) throw new Error("Deezer profile unavailable.");
    await saveDeezerConnection({ userId: user.userId, accessToken: payload.access_token, expiresIn: Number(payload.expires ?? 3600), profile });
    return redirectResult(request, "connected");
  } catch (error) {
    console.error("deezer_oauth_callback_failed", error instanceof Error ? error.message : error);
    return redirectResult(request, "error");
  }
}
