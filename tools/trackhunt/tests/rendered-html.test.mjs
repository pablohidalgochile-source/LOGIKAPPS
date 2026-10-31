import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/", headers = {}, baseUrl = "http://localhost/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const handler = typeof worker === "function" ? worker : worker.fetch.bind(worker);
  return handler(
    new Request(new URL(pathname, baseUrl), { headers: { accept: "text/html", ...headers } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("redirects anonymous Sets visitors through the ChatGPT sign-in flow", async () => {
  const response = await render("/sets", {}, "https://trackhunt-dj.nanook.chatgpt.site/");
  assert.ok([302, 303, 307, 308].includes(response.status));
  assert.match(response.headers.get("location") ?? "", /\/signin-with-chatgpt\?return_to=%2Fsets/);
});

test("server-renders authenticated Sets empty, with the example available only on request", async () => {
  const response = await render("/sets", {
    "oai-authenticated-user-id": "test-user",
    "oai-authenticated-user-email": "dj@example.test",
  }, "https://trackhunt-dj.nanook.chatgpt.site/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /TRACKHUNT · SETS/);
  assert.match(html, /CONVIERTE UN SET/);
  assert.match(html, /PROBAR CON UN EJEMPLO/);
  assert.match(html, /NINGÚN SET CARGADO/);
  assert.doesNotMatch(html, /AFRO BROS @ LATINVILLAGE/);
  assert.doesNotMatch(html, /JHdNEzKVBoQ/);
  assert.doesNotMatch(html, /COPIAR TODO PARA DEEMIX/);
  assert.doesNotMatch(html, /NO EN DEEZER/);
  assert.match(html, /EXTRAER/);
  assert.match(html, /ENCONTRAR/);
  assert.match(html, /REVISAR/);
  assert.match(html, /EXPORTAR/);
  assert.match(html, /Una línea con todos los enlaces para Deemix/);
  assert.match(html, /La aplicación exporta metadatos, enlaces y consultas/);
  assert.match(html, /NO AUDIO RIPPING/);
  assert.doesNotMatch(html, /Descargar MP3/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("server-renders the authenticated connections hub without promising Spotify downloads", async () => {
  const response = await render("/connections", {
    "oai-authenticated-user-id": "test-user",
    "oai-authenticated-user-email": "dj@example.test",
    "oai-authenticated-user-full-name": "DJ%20Fixture",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tu música,/);
  assert.match(html, /Spotify como puente de playlists/);
  assert.match(html, /BPM Supreme/);
  assert.match(html, /DJ Compilations/);
  assert.match(html, /Promo Only/);
  assert.match(html, /Sin contraseñas/);
  assert.match(html, /\/api\/connections\/spotify\/callback/);
  assert.doesNotMatch(html, /descargar (?:audio )?desde Spotify/i);
  assert.doesNotMatch(html, /SPOTIFY_CLIENT_SECRET|CONNECTIONS_ENCRYPTION_KEY=/);
});

test("server-renders Trackhunt without fabricated remix results", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /TRACKHUNT/);
  assert.match(html, /Encuentra su próxima/);
  assert.match(html, /Identificar canción/);
  assert.match(html, /Qué está conectado/);
  assert.match(html, /DJ Compilations se abre como búsqueda asistida/);
  assert.match(html, /YouTube, Beatport y Traxsource/);
  assert.match(html, /href="\/quality"/);
  assert.doesNotMatch(html, /Remixer A|Remixer B|98%|99%/);
});

test("server-renders the honest local-first quality finder", async () => {
  const response = await render("/quality");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /QUALITY HUNT/);
  assert.match(html, /mejor calidad/i);
  assert.match(html, /Tengo el archivo/);
  assert.match(html, /Sé el nombre/);
  assert.match(html, /Tengo un enlace/);
  assert.match(html, /máximo 120 MB y 20 minutos · análisis local/);
  assert.match(html, /Una versión diferente nunca gana solo por ofrecer más bitrate/);
  assert.match(html, /Dos archivos pueden compartir título y artista, pero ser masters, remixes o duraciones diferentes/);
  assert.match(html, /href="\/sets"/);
  assert.doesNotMatch(html, /lossless (?:real|verificado)|Descargar MP3/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});
