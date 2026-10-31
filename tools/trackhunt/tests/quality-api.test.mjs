import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const musicSearchUrl = dataUrl(compile(await readFile(new URL("../lib/music-search.ts", import.meta.url), "utf8")));
const djCompilationsUrl = dataUrl(compile(await readFile(new URL("../lib/dj-compilations.ts", import.meta.url), "utf8"))
  .replace('from "./music-search"', `from ${JSON.stringify(musicSearchUrl)}`));
const qualitySource = compile(await readFile(new URL("../lib/quality.ts", import.meta.url), "utf8"))
  .replace('from "./dj-compilations"', `from ${JSON.stringify(djCompilationsUrl)}`);
const qualityUrl = dataUrl(qualitySource);
const remixUrl = dataUrl(compile(await readFile(new URL("../lib/remix.ts", import.meta.url), "utf8")));
const serverSource = compile(await readFile(new URL("../lib/quality-server.ts", import.meta.url), "utf8"))
  .replace('from "./quality"', `from ${JSON.stringify(qualityUrl)}`)
  .replace('from "./remix"', `from ${JSON.stringify(remixUrl)}`);
const { handleQualityRequest } = await import(dataUrl(serverSource));

function request(action, body, headers = {}) {
  return new Request(`https://trackhunt.test/api/quality/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("quality status describes capabilities without exposing credentials", async () => {
  const response = await handleQualityRequest(
    new Request("https://trackhunt.test/api/quality/status"),
    { BRAVE_SEARCH_API_KEY: "fixture-secret-key" },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.doesNotMatch(text, /fixture-secret-key/);
  assert.deepEqual(JSON.parse(text), { publicCatalogs: true, webSearch: true });
});

test("quality API rejects unsupported methods, cross-origin calls and malformed bodies", async () => {
  assert.equal((await handleQualityRequest(new Request("https://trackhunt.test/api/quality/search"), {})).status, 405);
  assert.equal((await handleQualityRequest(request("search", { title: "Track", artist: "Artist" }, { origin: "https://evil.test" }), {})).status, 403);
  assert.equal((await handleQualityRequest(request("search", "{"), {})).status, 400);
  assert.equal((await handleQualityRequest(request("search", {}, { "content-length": "10001" }), {})).status, 413);
  assert.equal((await handleQualityRequest(request("search", { title: "", artist: "" }), {})).status, 400);
  assert.equal((await handleQualityRequest(request("missing", {}), {})).status, 404);
});

test("link identification accepts canonical media URLs and diverts long sets", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(String(url));
    assert.equal(init.redirect, "manual");
    if (String(url).includes("set-example")) return Response.json({ title: "DJ Example - Sunset DJ Set", thumbnail_url: "https://i.ytimg.com/example.jpg" });
    return Response.json({ title: "Artist Name - Night Drive (Official Video)", thumbnail_url: "https://i.ytimg.com/example.jpg" });
  };
  try {
    const identified = await handleQualityRequest(request("identify", { url: "https://youtu.be/3gOHvDP_vCs?t=30" }), {});
    assert.equal(identified.status, 200);
    const data = await identified.json();
    assert.equal(data.identity.artist, "Artist Name");
    assert.equal(data.identity.title, "Night Drive");
    assert.equal(data.identity.source, "Metadatos de YouTube");
    assert.match(seen[0], /youtube\.com\/oembed/);

    const longSet = await handleQualityRequest(request("identify", { url: "https://www.youtube.com/watch?v=set-example" }), {});
    assert.equal(longSet.status, 422);
    assert.match((await longSet.json()).error, /set o mix largo/i);
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const url of [
    "https://youtube.com.evil.test/watch?v=3gOHvDP_vCs",
    "https://www.youtube.com/playlist?list=PL1234567890",
    "https://127.0.0.1/audio",
  ]) assert.equal((await handleQualityRequest(request("identify", { url }), {})).status, 400);
});

test("catalog search returns only close, allowlisted candidates and direct store searches", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    assert.equal(init.redirect, "manual");
    if (String(url).startsWith("https://itunes.apple.com/search")) return Response.json({ results: [
      { trackId: 11, trackName: "Night Drive (Extended Mix)", artistName: "Artist Name", collectionName: "Night Drive", trackViewUrl: "https://music.apple.com/cl/album/night-drive/11", artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/test/100x100bb.jpg" },
      { trackId: 12, trackName: "Completely Different", artistName: "Other", trackViewUrl: "https://music.apple.com/cl/album/other/12" },
      { trackId: 13, trackName: "Night Drive (Extended Mix)", artistName: "Artist Name", trackViewUrl: "https://evil.test/track/13" },
    ] });
    if (String(url).startsWith("https://api.deezer.com/search")) return Response.json({ data: [
      { id: 21, title: "Night Drive", title_version: "Extended Mix", artist: { name: "Artist Name" }, album: { title: "Night Drive", cover_medium: "https://cdn-images.dzcdn.net/images/cover/test/250x250.jpg" }, link: "https://www.deezer.com/track/21" },
      { id: 22, title: "Wrong Song", artist: { name: "Somebody Else" }, album: { title: "Wrong" }, link: "https://www.deezer.com/track/22" },
    ] });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const response = await handleQualityRequest(request("search", {
      artist: "Artist Name",
      title: "Night Drive",
      version: "Extended Mix",
      source: "Test",
    }), {});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.candidates.length, 2);
    assert.deepEqual(data.candidates.map((row) => row.provider).sort(), ["Apple Music", "Deezer"]);
    assert(data.candidates.every((row) => row.match === "exact" && row.identityScore === 1));
    assert(data.candidates.every((row) => !row.url.includes("evil.test")));
    assert.equal(data.stores.length, 7);
    assert.deepEqual(data.stores.find((store) => store.provider === "DJ Compilations"), {
      provider: "DJ Compilations",
      url: "https://dj-compilations.com/",
      role: "dj-pool",
      note: "Copia la consulta y abre tu sesión del pool. Revisa la versión exacta y descarga solo desde tu cuenta.",
      priority: 2,
      query: "Artist Name Night Drive Extended Mix",
      action: "copy-open",
    });
    assert.equal(data.sources.find((source) => source.name === "Tiendas en la web").status, "not-configured");
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("configured web discovery filters unsafe and unrelated results and keeps the key server-side", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, "manual");
    if (String(url).startsWith("https://itunes.apple.com/search")) return Response.json({ results: [] });
    if (String(url).startsWith("https://api.deezer.com/search")) return Response.json({ data: [] });
    if (String(url).startsWith("https://api.search.brave.com/")) {
      assert.equal(init.headers["X-Subscription-Token"], "fixture-secret-key");
      return Response.json({ web: { results: [
        { title: "Artist Name Night Drive Web Fixture Extended Mix", url: "https://www.beatport.com/track/night-drive/123", description: "Official extended release" },
        { title: "Artist Name Night Drive Web Fixture Extended Mix", url: "https://beatport.com.evil.test/track/123", description: "Spoof" },
        { title: "Unrelated record", url: "https://www.beatport.com/track/unrelated/999", description: "Other artist" },
      ] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const response = await handleQualityRequest(request("search", {
      artist: "Artist Name",
      title: "Night Drive Web Fixture",
      version: "Extended Mix",
      source: "Test",
    }), { BRAVE_SEARCH_API_KEY: "fixture-secret-key" });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.doesNotMatch(text, /fixture-secret-key/);
    const data = JSON.parse(text);
    assert.equal(data.candidates.length, 1);
    assert.equal(data.candidates[0].sourceName, "Beatport");
    assert.match(data.candidates[0].qualityNote, /confirma formato/i);
    assert.equal(data.sources.find((source) => source.name === "Tiendas en la web").status, "ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("web discovery cannot manufacture exact artist evidence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://itunes.apple.com/search")) return Response.json({ results: [] });
    if (String(url).startsWith("https://api.deezer.com/search")) return Response.json({ data: [] });
    if (String(url).startsWith("https://api.search.brave.com/")) return Response.json({ web: { results: [
      { title: "Artist Evidence Fixture Extended Mix", url: "https://www.beatport.com/track/evidence-fixture/456", description: "Exclusive club release in high quality" },
    ] } });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const response = await handleQualityRequest(request("search", {
      artist: "Distinctive Artist",
      title: "Artist Evidence Fixture",
      version: "Extended Mix",
      source: "Test",
    }), { BRAVE_SEARCH_API_KEY: "artist-evidence-key" });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert(data.candidates.every((candidate) => candidate.match !== "exact"), "a result that never mentions the artist cannot be an exact identity match");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("quality cache never returns another request's album, ISRC or source", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://itunes.apple.com/search")) return Response.json({ results: [] });
    if (String(url).startsWith("https://api.deezer.com/search")) return Response.json({ data: [] });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const core = { artist: "Cache Isolation Artist", title: "Cache Isolation Track", version: "Original Mix" };
    const first = await (await handleQualityRequest(request("search", {
      ...core,
      album: "First user's private reference",
      isrc: "CLAAA2600001",
      source: "First request",
    }), {})).json();
    assert.equal(first.identity.isrc, "CLAAA2600001");

    const second = await (await handleQualityRequest(request("search", {
      ...core,
      album: "Second user's reference",
      isrc: "CLBBB2600002",
      source: "Second request",
    }), {})).json();
    assert.equal(second.identity.album, "Second user's reference");
    assert.equal(second.identity.isrc, "CLBBB2600002");
    assert.equal(second.identity.source, "Second request");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider failures remain visible while direct store searches stay usable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
  try {
    const response = await handleQualityRequest(request("search", {
      artist: "Failure Fixture Artist",
      title: "Failure Fixture Track",
      source: "Test",
    }), {});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.candidates.length, 0);
    assert.equal(data.stores.length, 7);
    assert.equal(data.sources.find((source) => source.name === "Apple Music").status, "unavailable");
    assert.equal(data.sources.find((source) => source.name === "Deezer").status, "unavailable");
    assert.equal(data.sources.find((source) => source.name === "Tiendas en la web").status, "not-configured");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
