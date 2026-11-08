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
  const now = Date.now(); for (const [id, time] of active) if (now - time > 300_000) active.delete(id);
  if (active.has(user.userId)) return noStoreJson({ error: "Ya hay una generación en curso. Espera su resultado." }, { status: 429 });
  let input;
  try {
    const reader = request.body?.getReader(); let bytes = 0, raw = ""; const decoder = new TextDecoder();
    if (reader) while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 48000) { await reader.cancel(); return noStoreJson({ error: "Solicitud demasiado grande." }, { status: 413 }); } raw += decoder.decode(chunk.value, { stream: true }); }
    raw += decoder.decode(); input = parseHuntInput(JSON.parse(raw));
  } catch (e) { return noStoreJson({ error: e instanceof Error ? e.message : "Solicitud inválida." }, { status: 400 }); }
  if (active.has(user.userId)) return noStoreJson({ error: "Ya hay una generación en curso." }, { status: 429 });
  active.set(user.userId, now);
  const bound = (env as unknown as Record<string, unknown>).OPENAI_API_KEY;
  const key = typeof bound === "string" ? bound : process.env.OPENAI_API_KEY || "";
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder(), abort = new AbortController();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
        try {
          const result = await generateHunt(input, key, fetch, progress => send({ type: "progress", ...progress }), abort.signal);
          send({ type: "result", result });
        } catch (e) { send({ type: "error", error: e instanceof HuntError ? e.message : "No se pudo generar la playlist." }); }
        finally { active.delete(user.userId); if (!closed) { closed = true; controller.close(); } }
      },
      cancel() { closed = true; abort.abort(); },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-content-type-options": "nosniff" } });
  }
  try { return noStoreJson(await generateHunt(input, key)); }
  catch (e) { return noStoreJson({ error: e instanceof HuntError ? e.message : "No se pudo generar la playlist." }, { status: e instanceof HuntError ? e.status : 500 }); }
  finally { active.delete(user.userId); }
}
