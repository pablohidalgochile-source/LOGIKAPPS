import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const parserUrl = dataUrl(compile(await readFile(new URL("../lib/mix-tracklist.ts", import.meta.url), "utf8")));
const serverSource = compile(await readFile(new URL("../lib/acrcloud-server.ts", import.meta.url), "utf8"))
  .replace('from "./mix-tracklist"', `from ${JSON.stringify(parserUrl)}`);
const server = await import(dataUrl(serverSource));

const FILE_ID = "fd0cbc13-bb69-41ed-abbb-1ed6f25c3b02";
const SECRET = "fixture-access-token-never-return";
const env = {
  ACRCLOUD_ACCESS_TOKEN: SECRET,
  ACRCLOUD_CONTAINER_ID: "10005",
  ACRCLOUD_REGION: "us-west-2",
  ACRCLOUD_FREE_TRIAL_ONLY: "true",
};

function startRequest(body, headers = {}) {
  return new Request("https://trackhunt.test/api/mix/start", {
    method: "POST",
    headers: {
      origin: "https://trackhunt.test",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("canonicalizes one YouTube video and strips playlists, timestamps and tracking", () => {
  assert.equal(
    server.canonicalYoutubeVideoUrl("https://www.youtube.com/watch?v=FA_ybS3oGSM&t=3112s&list=RDFA_ybS3oGSM&utm_source=test"),
    "https://www.youtube.com/watch?v=FA_ybS3oGSM",
  );
  assert.equal(
    server.canonicalYoutubeVideoUrl("https://youtu.be/FA_ybS3oGSM?si=tracking&t=90"),
    "https://www.youtube.com/watch?v=FA_ybS3oGSM",
  );
  for (const value of [
    "http://www.youtube.com/watch?v=FA_ybS3oGSM",
    "https://youtube.com.evil.test/watch?v=FA_ybS3oGSM",
    "https://user:password@youtube.com/watch?v=FA_ybS3oGSM",
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@channel",
    "https://www.youtube.com/watch?v=short",
    "https://127.0.0.1/watch?v=FA_ybS3oGSM",
  ]) assert.equal(server.canonicalYoutubeVideoUrl(value), null, value);
});

test("configuration reports only availability and the explicit zero-cost guard", async () => {
  const enabled = await server.handleAcrCloudConfigRequest(
    new Request("https://trackhunt.test/api/mix/config"),
    env,
  );
  assert.equal(enabled.status, 200);
  assert.equal(enabled.headers.get("cache-control"), "no-store");
  const enabledText = await enabled.text();
  assert.doesNotMatch(enabledText, new RegExp(SECRET));
  assert.deepEqual(JSON.parse(enabledText), { available: true, zeroCost: true });

  const incomplete = await server.handleAcrCloudConfigRequest(
    new Request("https://trackhunt.test/api/mix/config"),
    { ACRCLOUD_FREE_TRIAL_ONLY: "true", ACRCLOUD_ACCESS_TOKEN: SECRET },
  );
  assert.deepEqual(await incomplete.json(), { available: false, zeroCost: true });
});

test("start is explicit, same-origin, JSON-only and refuses to run without the free-trial guard", async () => {
  let calls = 0;
  const options = { fetchImpl: async () => { calls += 1; return Response.json({}); } };
  assert.equal((await server.handleAcrCloudStartRequest(new Request("https://trackhunt.test/api/mix/start"), env, options)).status, 405);
  assert.equal((await server.handleAcrCloudStartRequest(startRequest({ url: "https://youtu.be/FA_ybS3oGSM" }, { origin: "https://evil.test" }), env, options)).status, 403);
  assert.equal((await server.handleAcrCloudStartRequest(startRequest({ url: "https://youtu.be/FA_ybS3oGSM" }, { "content-type": "text/plain" }), env, options)).status, 415);
  assert.equal((await server.handleAcrCloudStartRequest(startRequest("{"), env, options)).status, 400);
  assert.equal((await server.handleAcrCloudStartRequest(startRequest({ url: "https://youtube.com.evil.test/watch?v=FA_ybS3oGSM" }), env, options)).status, 400);

  const guarded = await server.handleAcrCloudStartRequest(
    startRequest({ url: "https://youtu.be/FA_ybS3oGSM" }),
    { ...env, ACRCLOUD_FREE_TRIAL_ONLY: "false" },
    options,
  );
  assert.equal(guarded.status, 503);
  assert.equal((await guarded.json()).code, "FREE_TRIAL_GUARD_REQUIRED");
  assert.equal(calls, 0);
});

test("start submits only the canonical URL to the selected ACRCloud region", async () => {
  let seen;
  const response = await server.handleAcrCloudStartRequest(
    startRequest({ url: "https://www.youtube.com/watch?v=FA_ybS3oGSM&t=3112s&list=RDFA_ybS3oGSM" }),
    env,
    { fetchImpl: async (url, init) => {
      seen = { url: String(url), init };
      return Response.json({ data: { id: FILE_ID, state: 0, uid: 19, cid: 10005, secret: SECRET } });
    } },
  );
  assert.equal(response.status, 200);
  assert.equal(seen.url, "https://api-us-west-2.acrcloud.com/api/fs-containers/10005/files");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.redirect, "manual");
  assert.equal(seen.init.headers.authorization, `Bearer ${SECRET}`);
  assert.deepEqual(JSON.parse(seen.init.body), {
    data_type: "platforms",
    url: "https://www.youtube.com/watch?v=FA_ybS3oGSM",
  });
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(SECRET));
  assert.deepEqual(JSON.parse(text), {
    id: FILE_ID,
    state: 0,
    canonicalUrl: "https://www.youtube.com/watch?v=FA_ybS3oGSM",
  });
});

test("status validates its UUID, sanitizes the provider record and returns normalized tracks", async () => {
  let seen;
  const response = await server.handleAcrCloudStatusRequest(
    new Request(`https://trackhunt.test/api/mix/status?id=${FILE_ID}`),
    env,
    { fetchImpl: async (url, init) => {
      seen = { url: String(url), init };
      return Response.json({ data: {
        id: FILE_ID,
        uid: 19,
        cid: 10005,
        uri: "youtube:video:FA_ybS3oGSM",
        name: "FRATE VIERNES 9 OCTUBRE",
        duration: 7468,
        state: 1,
        authorization: SECRET,
        results: { music: [{
          offset: 14,
          played_duration: 180,
          result: {
            title: "Temperature",
            artists: [{ name: "Sean Paul" }],
            score: 100,
            acrid: "fixture-acrid",
            secret: SECRET,
          },
        }] },
      } });
    } },
  );
  assert.equal(response.status, 200);
  assert.equal(seen.url, `https://api-us-west-2.acrcloud.com/api/fs-containers/10005/files/${FILE_ID}`);
  assert.equal(seen.init.method, "GET");
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(SECRET));
  const data = JSON.parse(text);
  assert.equal(data.id, FILE_ID);
  assert.equal(data.state, 1);
  assert.equal(data.status, "ready");
  assert.equal(data.name, "FRATE VIERNES 9 OCTUBRE");
  assert.equal(data.duration, 7468);
  assert.deepEqual(data.tracks.map((track) => ({ time: track.time, seconds: track.seconds, artist: track.artist, title: track.title })), [
    { time: "0:14", seconds: 14, artist: "Sean Paul", title: "Temperature" },
  ]);
  assert.equal(data.result, undefined);

  let calls = 0;
  const invalid = await server.handleAcrCloudStatusRequest(
    new Request("https://trackhunt.test/api/mix/status?id=not-a-uuid"),
    env,
    { fetchImpl: async () => { calls += 1; return Response.json({}); } },
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);
});

test("provider quota, authentication and malformed responses are sanitized", async () => {
  for (const [providerStatus, expectedStatus, code] of [
    [429, 429, "FREE_TRIAL_QUOTA_UNAVAILABLE"],
    [402, 429, "FREE_TRIAL_QUOTA_UNAVAILABLE"],
    [401, 503, "MIX_ANALYSIS_CONNECTION_INVALID"],
    [500, 502, "MIX_ANALYSIS_PROVIDER_ERROR"],
  ]) {
    const response = await server.handleAcrCloudStartRequest(
      startRequest({ url: "https://youtu.be/FA_ybS3oGSM" }),
      env,
      { fetchImpl: async () => new Response(`private provider detail ${SECRET}`, { status: providerStatus }) },
    );
    const text = await response.text();
    assert.equal(response.status, expectedStatus);
    assert.equal(JSON.parse(text).code, code);
    assert.doesNotMatch(text, new RegExp(SECRET));
  }

  const malformed = await server.handleAcrCloudStartRequest(
    startRequest({ url: "https://youtu.be/FA_ybS3oGSM" }),
    env,
    { fetchImpl: async () => Response.json({ data: { id: "invalid", state: 0 } }) },
  );
  assert.equal(malformed.status, 502);
  assert.equal((await malformed.json()).code, "MIX_ANALYSIS_INVALID_RESPONSE");
});

test("all mix routes require an authenticated ChatGPT user", async () => {
  for (const path of ["config", "start", "status"]) {
    const source = await readFile(new URL(`../app/api/mix/${path}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /requireRequestUser\(request\)/);
    assert.match(source, /user instanceof Response/);
  }
});
