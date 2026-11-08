import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const modelUrl = dataUrl(compile(await readFile(new URL("../lib/remix.ts", import.meta.url), "utf8")));
const model = await import(modelUrl);
const serverSource = compile(await readFile(new URL("../lib/remix-server.ts", import.meta.url), "utf8")).replace('from "./remix"', `from ${JSON.stringify(modelUrl)}`);
const { handleMusicRequest } = await import(dataUrl(serverSource));
const request = (action, body, headers = {}) => new Request(`https://trackhunt.test/api/remix/${action}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
test("public track URL allowlist rejects lookalikes, credentials, non-track and local URLs", () => {
  for (const url of ["http://soundcloud.com/user/track", "https://soundcloud.com.evil.test/user/track", "https://user:secret@soundcloud.com/user/track", "https://localhost/track/song", "https://bandcamp.com/search?q=a", "https://x.bandcamp.com/album/test", "https://soundcloud.com/a/sets"]) assert.equal(model.trackUrl(url), null);
  assert.equal(model.trackUrl("https://dj.bandcamp.com/track/song-remix?from=search").url, "https://dj.bandcamp.com/track/song-remix");
  assert.throws(() => model.mediaLink("https://youtube.com.evil.test/watch?v=3gOHvDP_vCs"));
  assert.equal(model.mediaLink("https://youtu.be/3gOHvDP_vCs?t=30").id, "3gOHvDP_vCs");
});
test("identity cleanup and conservative version matching", () => {
  assert.deepEqual(model.tentativeSong("Justin Timberlake - SexyBack (Official Video) ft. Timbaland"), { artist: "Justin Timberlake", title: "SexyBack" });
  const song = { artist: "Justin Timberlake", title: "SexyBack (feat. Timbaland)" };
  assert.equal(model.toVersion({ title: "Different Song Remix", url: "https://dj.bandcamp.com/track/song" }, song), null);
  assert.equal(model.toVersion({ title: "SexyBack", url: "https://dj.bandcamp.com/track/song" }, song), null);
  assert.equal(model.toVersion({ title: "Justin Timberlake - SexyBack (DJ Remix)", url: "https://dj.bandcamp.com/track/song" }, song).match, "title-artist");
  assert.equal(model.toVersion({ title: "SexyBack (DJ Flip)", url: "https://soundcloud.com/dj/song" }, song).match, "title");
  assert.equal(model.explorationTitle("LUV (Fingaz Re-Drum)"), "LUV");
  assert.equal(model.explorationTitle("Temperature"), "Temperature");
  for (const label of ["Re-Drum", "Intro", "Transition", "Blend", "Toneplay", "VIP", "Refix", "Dub"]) assert.equal(model.versionKind(`Song (${label})`), label);
  assert.equal(model.toVersion({ title: "Tory Lanez - LUV (Club Re-Drum)", url: "https://soundcloud.com/dj/luv" }, { artist: "Tory Lanez", title: "LUV (Fingaz Re-Drum)" }).kind, "Re-Drum");
});
test("not configured is distinct from no results and exposes no secrets", async () => {
  const response = await handleMusicRequest(request("search", { artist: "DNGR.", title: "Power" }), {});
  const data = await response.json();
  assert.deepEqual(data.versions, []);
  assert.deepEqual(data.sources.map(s => s.status), ["not-configured", "not-configured"]);
  const status = await handleMusicRequest(new Request("https://trackhunt.test/api/remix/status"), { BRAVE_SEARCH_API_KEY: "secret-value" });
  assert.doesNotMatch(await status.text(), /secret-value/);
});
test("name lookup uses Deezer without Apple and cleans collaboration markers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async raw => {
    const url = new URL(raw);
    assert.equal(url.hostname, "api.deezer.com");
    assert.equal(url.searchParams.get("q"), "Kapo Ryan Castro DÓNDE");
    return Response.json({ data: [
      { id: 123, title: "DÓNDE", artist: { name: "Kapo" } },
      { id: 124, title: "DÓNDE", artist: { name: "Kapo" } },
      { id: "invalid", title: "Fake", artist: { name: "Kapo" } },
    ] });
  };
  try {
    const response = await handleMusicRequest(request("identify", { mode: "name", value: "Kapo ft. Ryan Castro — DÓNDE" }), {});
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.songs.length, 1);
    assert.equal(data.songs[0].source, "Catálogo Deezer");
    assert.equal(data.songs[0].url, "https://www.deezer.com/track/123");
  } finally { globalThis.fetch = originalFetch; }
});
test("name lookup falls back to Apple when Deezer fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async raw => {
    if (new URL(raw).hostname === "api.deezer.com") throw new Error("offline");
    return Response.json({ results: [{ trackName: "Fallback Song", artistName: "Fallback Artist" }] });
  };
  try {
    const response = await handleMusicRequest(request("identify", { mode: "name", value: "Fallback Artist Fallback Song" }), {});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).songs[0].source, "Catálogo Apple Music");
  } finally { globalThis.fetch = originalFetch; }
});
test("invalid requests and cross-origin submissions are rejected", async () => {
  assert.equal((await handleMusicRequest(request("search", {}), {})).status, 400);
  assert.equal((await handleMusicRequest(request("identify", { mode: "link", value: "https://127.0.0.1/test" }), {})).status, 400);
  assert.equal((await handleMusicRequest(request("search", { title: "A", artist: "B" }, { origin: "https://evil.test" }), {})).status, 403);
  assert.equal((await handleMusicRequest(request("search", { title: "x".repeat(9000) }), {})).status, 413);
});
test("batch search preserves client identities and reports each track independently", async () => {
  const response = await handleMusicRequest(request("batch-search", { tracks: [
    { clientId: "set-row-8", title: "Power", artist: "DNGR." },
    { clientId: "set-row-9", title: "", artist: "Unknown" },
  ] }), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.limits.maxTracks, 10);
  assert.deepEqual(data.tracks.map(track => [track.clientId, track.title, track.artist, track.status]), [
    ["set-row-8", "Power", "DNGR.", "not-configured"],
    ["set-row-9", "", "Unknown", "invalid"],
  ]);
  assert.deepEqual(data.tracks[0].versions, []);
  assert.deepEqual(data.tracks[0].sources.map(source => source.status), ["not-configured", "not-configured"]);
  assert.equal(data.summary.requested, 2);
  assert.equal(data.summary["not-configured"], 1);
  assert.equal(data.summary.invalid, 1);
  assert.equal(data.summary.versions, 0);
});
test("batch search enforces a bounded non-empty list", async () => {
  assert.equal((await handleMusicRequest(request("batch-search", { tracks: [] }), {})).status, 400);
  const tooMany = Array.from({ length: 11 }, (_, index) => ({ clientId: `row-${index}`, title: `Song ${index}`, artist: "Artist" }));
  const response = await handleMusicRequest(request("batch-search", { tracks: tooMany }), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).maxTracks, 10);
});
test("batch search limits SoundCloud concurrency, shares its token and isolates provider failures", async () => {
  const originalFetch = globalThis.fetch;
  let tokenRequests = 0;
  let activeSearches = 0;
  let maxActiveSearches = 0;
  let sequence = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, "manual");
    if (String(url).includes("oauth/token")) {
      tokenRequests += 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json({ access_token: "fixture-token", expires_in: 3600 });
    }
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get("q");
    assert.equal(init.headers.authorization, "OAuth fixture-token");
    activeSearches += 1;
    maxActiveSearches = Math.max(maxActiveSearches, activeSearches);
    const current = sequence++;
    await new Promise(resolve => setTimeout(resolve, 10));
    activeSearches -= 1;
    if (query.includes("Batch Song 3")) return new Response("provider failure", { status: 503 });
    return Response.json({ collection: [
      { title: query, permalink_url: `https://soundcloud.com/fixture/remix-${current}`, description: query, user: { username: "Fixture DJ" } },
      { title: "Unrelated Remix", permalink_url: `https://soundcloud.com/fixture/unrelated-${current}` },
    ] });
  };
  try {
    const tracks = Array.from({ length: 5 }, (_, index) => ({ clientId: `client-${index}`, title: `Batch Song ${index}`, artist: `Batch Artist ${index}` }));
    const response = await handleMusicRequest(request("batch-search", { tracks }), { SOUNDCLOUD_CLIENT_ID: "batch-client", SOUNDCLOUD_CLIENT_SECRET: "batch-secret" });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(tokenRequests, 1);
    assert.ok(maxActiveSearches <= 3);
    assert.deepEqual(data.tracks.map(track => track.clientId), tracks.map(track => track.clientId));
    assert.deepEqual(data.tracks.map(track => track.status), ["ok", "ok", "ok", "partial", "ok"]);
    assert.deepEqual(data.tracks.map(track => track.versions.length), [1, 1, 1, 0, 1]);
    assert.deepEqual(data.tracks[3].sources.map(source => source.status), ["unavailable", "not-configured"]);
    assert.equal(data.summary.versions, 4);
  } finally { globalThis.fetch = originalFetch; }
});
test("configured web search filters unrelated results, deduplicates URLs and reports provider errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers["X-Subscription-Token"], "test-fixture-only");
    if (String(url).includes("bandcamp.com")) return new Response("limited", { status: 429 });
    return Response.json({ web: { results: [
      { title: "Justin Timberlake SexyBack Remix", url: "https://soundcloud.com/dj/sexyback" },
      { title: "Justin Timberlake SexyBack Remix", url: "https://soundcloud.com/dj/sexyback?tracking=true" },
      { title: "Justin Timberlake SexyBack Remix", url: "https://bad.test/x" },
      { title: "Unrelated Remix", url: "https://soundcloud.com/dj/unrelated" },
    ] } });
  };
  try {
    const data = await (await handleMusicRequest(request("search", { title: "SexyBack", artist: "Justin Timberlake" }), { BRAVE_SEARCH_API_KEY: "test-fixture-only" })).json();
    assert.equal(data.versions.length, 1);
    assert.equal(data.sources[0].status, "ok");
    assert.equal(data.sources[1].status, "unavailable");
    assert.match(data.sources[1].message, /límite/);
  } finally { globalThis.fetch = originalFetch; }
});
test("recognition rejects malformed audio before sending it to provider", async () => {
  const form = new FormData(); form.append("file", new Blob([new Uint8Array(2000)], { type: "audio/wav" }), "bad.wav");
  const response = await handleMusicRequest(new Request("https://trackhunt.test/api/remix/recognize", { method: "POST", body: form }), {});
  assert.equal(response.status, 400);
});

test("remix POST route authenticates and checks same-origin before spending provider quota", async () => {
  const source = await readFile(new URL("../app/api/remix/[action]/route.ts", import.meta.url), "utf8");
  assert.match(source, /requireRequestUser\(request\)/);
  assert.match(source, /user instanceof Response/);
  assert.match(source, /mutationSecurityError\(request[,)]/);
  assert.ok(source.indexOf("requireRequestUser(request)") < source.indexOf("return handle(request)"));
  assert.ok(source.indexOf("mutationSecurityError(request") < source.indexOf("return handle(request)"));
});
