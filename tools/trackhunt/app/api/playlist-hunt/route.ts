import { env } from "cloudflare:workers";
import { parseHuntInput } from "../../../lib/playlist-hunt";
import { generateHunt, HuntError } from "../../../lib/playlist-hunt-server";
import { requireRequestUser, mutationSecurityError, noStoreJson } from "../../../lib/request-security";

// Short, bounded per-instance guard prevents double-clicks; upstream quota remains authoritative.
const active = new Map<string, number>();
export async function POST(request: Request) {
  const user = requireRequestUser(request); if (user instanceof Response) return user;
  const security = mutationSecurityError(request); if (security) return security;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return noStoreJson({ error: "Usa una solicitud JSON." }, { status: 415 });
  const now = Date.now(); for (const [id, time] of active) if (now - time > 180_000) active.delete(id);
  if (active.has(user.userId)) return noStoreJson({ error: "Ya hay una generación en curso. Espera su resultado." }, { status: 429 });
  let input;
  try {
    const reader = request.body?.getReader(); let bytes = 0, raw = ""; const decoder = new TextDecoder();
    if (reader) while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 48000) { await reader.cancel(); return noStoreJson({ error: "Solicitud demasiado grande." }, { status: 413 }); } raw += decoder.decode(chunk.value, { stream: true }); }
    raw += decoder.decode(); input = parseHuntInput(JSON.parse(raw));
  } catch (e) { return noStoreJson({ error: e instanceof Error ? e.message : "Solicitud inválida." }, { status: 400 }); }
  if (active.has(user.userId)) return noStoreJson({ error: "Ya hay una generación en curso." }, { status: 429 });
  active.set(user.userId, now);
  try {
    const bound = (env as unknown as Record<string, unknown>).OPENAI_API_KEY;
    return noStoreJson(await generateHunt(input, typeof bound === "string" ? bound : process.env.OPENAI_API_KEY || ""));
  } catch (e) { return noStoreJson({ error: e instanceof HuntError ? e.message : "No se pudo generar la playlist." }, { status: e instanceof HuntError ? e.status : 500 }); }
  finally { active.delete(user.userId); }
}
