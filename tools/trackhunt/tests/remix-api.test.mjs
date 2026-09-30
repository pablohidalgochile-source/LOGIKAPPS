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
});
test("not configured is distinct from no results and exposes no secrets", async () => {
  const response = await handleMusicRequest(request("search", { artist: "DNGR.", title: "Power" }), {});
  const data = await response.json();
  assert.deepEqual(data.versions, []);
  assert.deepEqual(data.sources.map(s => s.status), ["not-configured", "not-configured"]);
  const status = await handleMusicRequest(new Request("https://trackhunt.test/api/remix/status"), { BRAVE_SEARCH_API_KEY: "secret-value" });
  assert.doesNotMatch(await status.text(), /secret-value/);
});
test("invalid requests and cross-origin submissions are rejected", async () => {
  assert.equal((await handleMusicRequest(request("search", {}), {})).status, 400);
  assert.equal((await handleMusicRequest(request("identify", { mode: "link", value: "https://127.0.0.1/test" }), {})).status, 400);
  assert.equal((await handleMusicRequest(request("search", { title: "A", artist: "B" }, { origin: "https://evil.test" }), {})).status, 403);
  assert.equal((await handleMusicRequest(request("search", { title: "x".repeat(9000) }), {})).status, 413);
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
