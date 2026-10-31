import { isLoopbackUrl } from "./request-host";

export type RequestUser = { userId: string; email: string; displayName: string };

export function requestUser(request: Request): RequestUser | null {
  const userId = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim();
  if (!userId || !email) return null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let displayName = email;
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { /* keep email */ }
  }
  return { userId, email, displayName };
}

export function requireRequestUser(request: Request): RequestUser | Response {
  const authenticated = requestUser(request);
  if (authenticated) return authenticated;
  if (isLoopbackUrl(request.url)) {
    return {
      userId: "trackhunt-local-owner",
      email: "local@trackhunt.invalid",
      displayName: "TrackHunt local",
    };
  }
  return Response.json({
    error: "Tu sesión de ChatGPT no llegó a TrackHunt. Inicia sesión y vuelve a intentarlo.",
    code: "AUTH_REQUIRED",
    retryable: false,
    canPaste: false,
  }, { status: 401 });
}

export function mutationSecurityError(request: Request, csrfExpected?: string, maxBodyBytes = 128_000): Response | null {
  const origin = request.headers.get("origin");
  const expected = process.env.TRACKHUNT_PUBLIC_ORIGIN?.replace(/\/$/, "") || new URL(request.url).origin;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== expected || fetchSite === "cross-site") {
    return Response.json({ error: "Origen de solicitud no autorizado." }, { status: 403 });
  }
  if (csrfExpected && request.headers.get("x-trackhunt-csrf") !== csrfExpected) {
    return Response.json({ error: "La sesión de seguridad venció. Recarga la página." }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBodyBytes) return Response.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  return null;
}

export function noStoreJson(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

