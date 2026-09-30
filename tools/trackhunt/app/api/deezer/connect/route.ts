function callbackUrl(request: Request) {
  return process.env.DEEZER_REDIRECT_URI || new URL("/api/deezer/callback", request.url).toString();
}

export async function GET(request: Request) {
  const appId = process.env.DEEZER_APP_ID;
  if (!appId) {
    return Response.json({
      error: "Falta configurar DEEZER_APP_ID y DEEZER_APP_SECRET en el servidor.",
    }, { status: 503 });
  }

  const state = crypto.randomUUID();
  const auth = new URL("https://connect.deezer.com/oauth/auth.php");
  auth.searchParams.set("app_id", appId);
  auth.searchParams.set("redirect_uri", callbackUrl(request));
  auth.searchParams.set("perms", "basic_access,manage_library");
  auth.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: auth.toString(),
      "set-cookie": `deezer_oauth_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    },
  });
}
