import { deezerAccess } from "../../../../lib/deezer-server";
import { mutationSecurityError, noStoreJson, requireRequestUser } from "../../../../lib/request-security";

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
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  let access;
  try { access = await deezerAccess(user.userId); }
  catch { return noStoreJson({ error: "Conecta tu cuenta de Deezer primero." }, { status: 401 }); }
  const securityError = mutationSecurityError(request, access.csrfToken);
  if (securityError) return securityError;
  let body: { title?: string; trackIds?: number[] };
  try { body = await request.json(); }
  catch { return noStoreJson({ error: "Solicitud inválida" }, { status: 400 }); }
  const title = String(body.title ?? "Setlist importado").trim().slice(0, 80);
  const trackIds = [...new Set((body.trackIds ?? []).filter(Number.isFinite))].slice(0, 500);
  if (!trackIds.length) return noStoreJson({ error: "No hay canciones para añadir." }, { status: 400 });
  try {
    const created = await deezerPost("/user/me/playlists", access.token, { title });
    if (!created.id) throw new Error("Deezer no devolvió el identificador de la playlist.");
    await deezerPost(`/playlist/${created.id}/tracks`, access.token, { songs: trackIds.join(",") });
    return noStoreJson({ playlist: { id: created.id, link: `https://www.deezer.com/playlist/${created.id}` } });
  } catch (error) {
    return noStoreJson({ error: error instanceof Error ? error.message : "No se pudo crear la playlist" }, { status: 502 });
  }
}
