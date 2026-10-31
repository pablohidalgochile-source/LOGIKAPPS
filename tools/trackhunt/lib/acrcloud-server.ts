import { parseAcrCloudFileScan } from "./mix-tracklist";

export type AcrCloudEnv = {
  ACRCLOUD_ACCESS_TOKEN?: string;
  ACRCLOUD_CONTAINER_ID?: string;
  ACRCLOUD_REGION?: string;
  ACRCLOUD_FREE_TRIAL_ONLY?: string;
};

export type AcrCloudOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type JsonObject = Record<string, unknown>;

const REGIONS = new Set(["eu-west-1", "us-west-2", "ap-southeast-1"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const REQUEST_LIMIT_BYTES = 4096;
const RESPONSE_LIMIT_BYTES = 5_000_000;
const DEFAULT_TIMEOUT_MS = 20_000;

export class AcrCloudRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "AcrCloudRequestError";
  }
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function boundedString(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, maximum);
  return text || undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function safeState(value: unknown): number | undefined {
  const state = finiteNumber(value);
  return state !== undefined && [-3, -2, -1, 0, 1].includes(state) ? state : undefined;
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 10) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, 2000);
  if (Array.isArray(value)) {
    return value.slice(0, 2000)
      .map((item) => sanitizeJson(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  const object = record(value);
  if (!object) return undefined;
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(object).slice(0, 100)) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue;
    if (/token|secret|authorization|password|credential/i.test(key)) continue;
    const sanitized = sanitizeJson(item, depth + 1);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function credentials(env: AcrCloudEnv) {
  const accessToken = env.ACRCLOUD_ACCESS_TOKEN?.trim() ?? "";
  const containerId = env.ACRCLOUD_CONTAINER_ID?.trim() ?? "";
  const region = env.ACRCLOUD_REGION?.trim() ?? "";
  const zeroCost = env.ACRCLOUD_FREE_TRIAL_ONLY === "true";
  const configured = Boolean(
    accessToken &&
    accessToken.length <= 4096 &&
    /^\d{1,18}$/.test(containerId) &&
    REGIONS.has(region),
  );
  return { accessToken, containerId, region, zeroCost, configured };
}

export function acrCloudAvailability(env: AcrCloudEnv) {
  const config = credentials(env);
  return {
    available: config.configured && config.zeroCost,
    zeroCost: config.zeroCost,
  };
}

function requireProvider(env: AcrCloudEnv) {
  const config = credentials(env);
  if (!config.zeroCost) {
    throw new AcrCloudRequestError(
      "El análisis completo está bloqueado hasta confirmar el modo de prueba gratuita.",
      503,
      "FREE_TRIAL_GUARD_REQUIRED",
    );
  }
  if (!config.configured) {
    throw new AcrCloudRequestError(
      "El análisis de audio todavía no está conectado.",
      503,
      "MIX_ANALYSIS_NOT_CONFIGURED",
    );
  }
  return config;
}

export function canonicalYoutubeVideoUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let videoId: string | null = null;
  if (hostname === "youtu.be") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return null;
    videoId = parts[0];
  } else if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname)) {
    if (url.pathname !== "/watch") return null;
    videoId = url.searchParams.get("v");
  } else {
    return null;
  }
  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function validAcrCloudFileId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

async function readRequestJson(request: Request): Promise<JsonObject> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > REQUEST_LIMIT_BYTES) {
    throw new AcrCloudRequestError("Solicitud demasiado grande.", 413, "REQUEST_TOO_LARGE");
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > REQUEST_LIMIT_BYTES) {
        await reader.cancel();
        throw new AcrCloudRequestError("Solicitud demasiado grande.", 413, "REQUEST_TOO_LARGE");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const object = record(parsed);
    if (!object) throw new Error("not-object");
    return object;
  } catch {
    throw new AcrCloudRequestError("Solicitud inválida.", 400, "INVALID_REQUEST");
  }
}

function mutationError(request: Request): Response | null {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Origen de solicitud no autorizado." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Formato de solicitud inválido." }, 415);
  }
  return null;
}

function readErrorResponse(status: number): AcrCloudRequestError {
  if (status === 402 || status === 429) {
    return new AcrCloudRequestError(
      "La prueba gratuita no tiene cuota disponible. No se realizó ningún cobro.",
      429,
      "FREE_TRIAL_QUOTA_UNAVAILABLE",
    );
  }
  if (status === 401 || status === 403) {
    return new AcrCloudRequestError(
      "La conexión de análisis de audio no está autorizada.",
      503,
      "MIX_ANALYSIS_CONNECTION_INVALID",
    );
  }
  if (status === 404) {
    return new AcrCloudRequestError(
      "El análisis solicitado ya no está disponible.",
      404,
      "MIX_ANALYSIS_NOT_FOUND",
    );
  }
  return new AcrCloudRequestError(
    "El servicio de análisis de audio no respondió correctamente.",
    502,
    "MIX_ANALYSIS_PROVIDER_ERROR",
  );
}

async function responsePayload(response: Response): Promise<JsonObject> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT_BYTES) {
    throw new AcrCloudRequestError(
      "La respuesta del análisis fue demasiado grande.",
      502,
      "MIX_ANALYSIS_INVALID_RESPONSE",
    );
  }
  const text = await response.text();
  if (text.length > RESPONSE_LIMIT_BYTES) {
    throw new AcrCloudRequestError(
      "La respuesta del análisis fue demasiado grande.",
      502,
      "MIX_ANALYSIS_INVALID_RESPONSE",
    );
  }
  try {
    const parsed = JSON.parse(text);
    const object = record(parsed);
    if (!object) throw new Error("not-object");
    return object;
  } catch {
    throw new AcrCloudRequestError(
      "El servicio de análisis devolvió una respuesta inválida.",
      502,
      "MIX_ANALYSIS_INVALID_RESPONSE",
    );
  }
}

async function providerJson(
  url: string,
  init: RequestInit,
  options: AcrCloudOptions,
): Promise<JsonObject> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new AcrCloudRequestError(
      name === "TimeoutError" || name === "AbortError"
        ? "El análisis de audio tardó demasiado en responder."
        : "No se pudo conectar con el análisis de audio.",
      name === "TimeoutError" || name === "AbortError" ? 504 : 502,
      name === "TimeoutError" || name === "AbortError" ? "MIX_ANALYSIS_TIMEOUT" : "MIX_ANALYSIS_UNAVAILABLE",
    );
  }
  if (!response.ok) throw readErrorResponse(response.status);
  return responsePayload(response);
}

function providerRecord(payload: JsonObject, expectedId?: string): JsonObject {
  const data = payload.data;
  const candidates = Array.isArray(data) ? data : [data];
  const found = candidates
    .map(record)
    .find((item) => item && (!expectedId || (
      typeof item.id === "string" && item.id.toLowerCase() === expectedId.toLowerCase()
    )));
  if (!found) {
    throw new AcrCloudRequestError(
      "El servicio de análisis devolvió una respuesta incompleta.",
      502,
      "MIX_ANALYSIS_INVALID_RESPONSE",
    );
  }
  return found;
}

function sanitizedFile(value: JsonObject) {
  const id = boundedString(value.id, 64);
  if (!validAcrCloudFileId(id)) {
    throw new AcrCloudRequestError(
      "El servicio de análisis devolvió un identificador inválido.",
      502,
      "MIX_ANALYSIS_INVALID_RESPONSE",
    );
  }
  const state = safeState(value.state);
  if (state === undefined) {
    throw new AcrCloudRequestError(
      "El servicio de análisis devolvió un estado inválido.",
      502,
      "MIX_ANALYSIS_INVALID_RESPONSE",
    );
  }
  const output: JsonObject = { id, state };
  const name = boundedString(value.name, 300);
  const duration = finiteNumber(value.duration);
  const createdAt = boundedString(value.created_at, 80);
  const updatedAt = boundedString(value.updated_at, 80);
  let rawResults = value.results;
  if (typeof rawResults === "string") {
    try { rawResults = JSON.parse(rawResults); } catch { rawResults = undefined; }
  }
  const results = sanitizeJson(rawResults);
  if (name) output.name = name;
  if (duration !== undefined && duration >= 0) output.duration = duration;
  if (createdAt) output.created_at = createdAt;
  if (updatedAt) output.updated_at = updatedAt;
  if (record(results)) output.results = results;
  return output;
}

export async function startAcrCloudFileScan(
  canonicalUrl: string,
  env: AcrCloudEnv,
  options: AcrCloudOptions = {},
) {
  const safeUrl = canonicalYoutubeVideoUrl(canonicalUrl);
  if (!safeUrl) {
    throw new AcrCloudRequestError(
      "Pega el enlace de un video individual de YouTube.",
      400,
      "INVALID_YOUTUBE_URL",
    );
  }
  const config = requireProvider(env);
  const endpoint = `https://api-${config.region}.acrcloud.com/api/fs-containers/${config.containerId}/files`;
  const payload = await providerJson(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ data_type: "platforms", url: safeUrl }),
  }, options);
  const file = sanitizedFile(providerRecord(payload));
  return { id: file.id as string, state: file.state as number };
}

export async function getAcrCloudFileScan(
  id: string,
  env: AcrCloudEnv,
  options: AcrCloudOptions = {},
) {
  if (!validAcrCloudFileId(id)) {
    throw new AcrCloudRequestError("Identificador de análisis inválido.", 400, "INVALID_ANALYSIS_ID");
  }
  const config = requireProvider(env);
  const endpoint = `https://api-${config.region}.acrcloud.com/api/fs-containers/${config.containerId}/files/${id}`;
  const payload = await providerJson(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.accessToken}`,
    },
  }, options);
  return sanitizedFile(providerRecord(payload, id));
}

function errorResponse(error: unknown): Response {
  if (error instanceof AcrCloudRequestError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  console.warn("Trackhunt mix analysis failure:", error instanceof Error ? error.message : "unknown");
  return json({
    error: "No se pudo completar el análisis de audio.",
    code: "MIX_ANALYSIS_UNAVAILABLE",
  }, 502);
}

export async function handleAcrCloudConfigRequest(request: Request, env: AcrCloudEnv) {
  if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Origen de solicitud no autorizado." }, 403);
  }
  return json(acrCloudAvailability(env));
}

export async function handleAcrCloudStartRequest(
  request: Request,
  env: AcrCloudEnv,
  options: AcrCloudOptions = {},
) {
  const securityError = mutationError(request);
  if (securityError) return securityError;
  try {
    const body = await readRequestJson(request);
    const canonicalUrl = canonicalYoutubeVideoUrl(body.url);
    if (!canonicalUrl) {
      throw new AcrCloudRequestError(
        "Pega el enlace de un video individual de YouTube.",
        400,
        "INVALID_YOUTUBE_URL",
      );
    }
    const job = await startAcrCloudFileScan(canonicalUrl, env, options);
    return json({ ...job, canonicalUrl });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAcrCloudStatusRequest(
  request: Request,
  env: AcrCloudEnv,
  options: AcrCloudOptions = {},
) {
  if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Origen de solicitud no autorizado." }, 403);
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!validAcrCloudFileId(id)) {
    return json({ error: "Identificador de análisis inválido.", code: "INVALID_ANALYSIS_ID" }, 400);
  }
  try {
    const result = await getAcrCloudFileScan(id, env, options);
    const parsed = parseAcrCloudFileScan(result);
    return json({
      id,
      state: parsed.rawState,
      status: parsed.status,
      tracks: parsed.tracks,
      name: typeof result.name === "string" ? result.name : undefined,
      duration: parsed.duration,
      message: parsed.message,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
