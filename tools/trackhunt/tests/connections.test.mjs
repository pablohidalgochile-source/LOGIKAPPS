import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const oauth = await import(dataUrl(compile(await readFile(new URL("../lib/oauth-pkce.ts", import.meta.url), "utf8"))));
const secretBox = await import(dataUrl(compile(await readFile(new URL("../lib/secret-box.ts", import.meta.url), "utf8"))));
const catalog = await import(dataUrl(compile(await readFile(new URL("../lib/connection-catalog.ts", import.meta.url), "utf8"))));

test("PKCE matches the official vector and authorization uses the minimum Trackhunt scopes", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(await oauth.pkceChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const url = new URL(oauth.spotifyAuthorizationUrl({
    clientId: "client-fixture",
    redirectUri: "https://trackhunt.test/api/connections/spotify/callback",
    state: "state-fixture",
    challenge: "challenge-fixture",
    scopes: catalog.spotifyScopes,
  }));
  assert.equal(url.origin, "https://accounts.spotify.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "state-fixture");
  const scopes = new Set(url.searchParams.get("scope").split(" "));
  for (const expected of ["user-read-private", "playlist-read-private", "playlist-read-collaborative", "user-library-read", "playlist-modify-private"]) assert(scopes.has(expected));
  for (const forbidden of ["user-read-email", "streaming", "playlist-modify-public"]) assert(!scopes.has(forbidden));
});

test("OAuth randomness is long and return paths cannot escape Trackhunt", () => {
  assert(oauth.randomBase64Url(32).length >= 43);
  assert.notEqual(oauth.randomBase64Url(32), oauth.randomBase64Url(32));
  assert.equal(oauth.safeRelativeReturnTo("/sets?from=spotify"), "/sets?from=spotify");
  for (const value of ["https://evil.test/", "//evil.test/", "/api/connections/status", "/callback"]) {
    assert.equal(oauth.safeRelativeReturnTo(value), "/connections");
  }
});

test("AES-GCM tokens are opaque, bound to the user and reject tampering", async () => {
  const original = process.env.CONNECTIONS_ENCRYPTION_KEY;
  process.env.CONNECTIONS_ENCRYPTION_KEY = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString("base64url");
  try {
    const token = "spotify-access-token-fixture";
    const box = await secretBox.encryptSecret(token, "trackhunt:spotify:access:user-a");
    assert(!box.includes(token));
    assert.equal(await secretBox.decryptSecret(box, "trackhunt:spotify:access:user-a"), token);
    await assert.rejects(() => secretBox.decryptSecret(box, "trackhunt:spotify:access:user-b"));
    await assert.rejects(() => secretBox.decryptSecret(`${box.slice(0, -2)}aa`, "trackhunt:spotify:access:user-a"));
  } finally {
    if (original === undefined) delete process.env.CONNECTIONS_ENCRYPTION_KEY;
    else process.env.CONNECTIONS_ENCRYPTION_KEY = original;
  }
});

test("provider catalog distinguishes official connection, partner access and manual account links", () => {
  const byId = new Map(catalog.providers.map((provider) => [provider.id, provider]));
  assert.equal(byId.get("spotify").connection, "spotify");
  assert.equal(byId.get("beatport").connection, "partner");
  assert.equal(byId.get("beatsource").connection, "migration");
  for (const id of ["bpm-supreme", "dj-compilations", "djcity", "zipdj", "digital-dj-pool"]) {
    assert.equal(byId.get(id).connection, "link");
    assert.equal(byId.get(id).capabilities.download, "provider");
  }
  assert.equal(byId.get("dj-compilations").accountUrl, "https://dj-compilations.com/");
  assert.equal(byId.get("dj-compilations").capabilities.playlist, "unavailable");
  assert.equal(byId.get("dj-compilations").capabilities.play, "unavailable");
  assert.equal(byId.get("soundcloud").capabilities.download, "unavailable");
});

test("Spotify server uses 2026 playlist endpoints and never the retired tracks route", async () => {
  const source = await readFile(new URL("../lib/spotify-server.ts", import.meta.url), "utf8");
  assert.match(source, /\/me\/playlists/);
  assert.match(source, /SPOTIFY_TRACK_PAGE_SIZE = 50/);
  assert.match(source, /MAX_SPOTIFY_TRACK_PAGES = 200/);
  assert.match(source, /\/playlists\/\$\{encodeURIComponent\(created\.id\)\}\/items/);
  assert.doesNotMatch(source, /\/users\/\$\{|\/playlists\/\$\{encodeURIComponent\(created\.id\)\}\/tracks/);
});

test("Deezer OAuth no longer stores access tokens in browser cookies", async () => {
  const files = [
    "../app/api/deezer/connect/route.ts",
    "../app/api/deezer/callback/route.ts",
    "../app/api/deezer/status/route.ts",
    "../app/api/deezer/playlist/route.ts",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /deezer_access|deezer_oauth_state|set-cookie/i);
  const storage = await readFile(new URL("../lib/deezer-server.ts", import.meta.url), "utf8");
  assert.match(storage, /encryptSecret\(input\.accessToken/);
  assert.match(storage, /user_id: input\.userId/);
});
