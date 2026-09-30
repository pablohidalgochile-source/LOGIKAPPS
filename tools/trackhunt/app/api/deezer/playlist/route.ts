function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function deezerPost(path: string, token: string, params: Record<string, string>) {
  const url = new URL(`https://api.deezer.com${path}`);
  url.searchParams.set("access_token", token);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { method: "POST", headers: { accept: "application/json" } });
  const payload = await response.json() as { id?: number; success?: boolean; error?: { message?: string } };
  if (!response.ok || payload.error) throw new Error(payload.error?.message || "Error de Deezer");
  return payload;
}

export async function POST(request: Request) {
  const encodedToken = readCookie(request, "deezer_access");
  if (!encodedToken) return Response.json({ error: "Conecta tu cuenta de Deezer primero." }, { status: 401 });
  const token = decodeURIComponent(encodedToken);

  let body: { title?: string; trackIds?: number[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const title = String(body.title ?? "Setlist importado").trim().slice(0, 80);
  const trackIds = [...new Set((body.trackIds ?? []).filter(Number.isFinite))].slice(0, 500);
  if (!trackIds.length) return Response.json({ error: "No hay canciones para añadir." }, { status: 400 });

  try {
    const created = await deezerPost("/user/me/playlists", token, { title });
    if (!created.id) throw new Error("Deezer no devolvió el identificador de la playlist.");
    await deezerPost(`/playlist/${created.id}/tracks`, token, { songs: trackIds.join(",") });
    return Response.json({ playlist: { id: created.id, link: `https://www.deezer.com/playlist/${created.id}` } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear la playlist" }, { status: 502 });
  }
}
