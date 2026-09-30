function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

function callbackUrl(request: Request) {
  return process.env.DEEZER_REDIRECT_URI || new URL("/api/deezer/callback", request.url).toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const expectedState = readCookie(request, "deezer_oauth_state");
  const appId = process.env.DEEZER_APP_ID;
  const secret = process.env.DEEZER_APP_SECRET;

  if (!code || !returnedState || !expectedState || returnedState !== decodeURIComponent(expectedState)) {
    return Response.json({ error: "La sesión de conexión con Deezer no es válida." }, { status: 400 });
  }
  if (!appId || !secret) return Response.json({ error: "Deezer no está configurado." }, { status: 503 });

  const tokenUrl = new URL("https://connect.deezer.com/oauth/access_token.php");
  tokenUrl.searchParams.set("app_id", appId);
  tokenUrl.searchParams.set("secret", secret);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("output", "json");
  tokenUrl.searchParams.set("redirect_uri", callbackUrl(request));

  const response = await fetch(tokenUrl);
  const payload = await response.json() as { access_token?: string; expires?: number; error?: unknown };
  if (!response.ok || !payload.access_token) {
    return Response.json({ error: "Deezer no entregó un token de acceso." }, { status: 502 });
  }

  const target = new URL("/", request.url);
  target.searchParams.set("deezer", "connected");
  const responseHeaders = new Headers({ location: target.toString() });
  responseHeaders.append(
    "set-cookie",
    `deezer_access=${encodeURIComponent(payload.access_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.max(300, payload.expires ?? 3600)}${url.protocol === "https:" ? "; Secure" : ""}`,
  );
  responseHeaders.append("set-cookie", "deezer_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  return new Response(null, {
    status: 302,
    headers: responseHeaders,
  });
}
