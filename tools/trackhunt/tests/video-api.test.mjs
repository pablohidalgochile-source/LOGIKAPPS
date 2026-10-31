import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const parserUrl = dataUrl(compile(await readFile(new URL("../lib/video-tracklist.ts", import.meta.url), "utf8")));
const serverSource = compile(await readFile(new URL("../lib/youtube-video-server.ts", import.meta.url), "utf8"))
  .replaceAll('from "./video-tracklist"', `from ${JSON.stringify(parserUrl)}`);
const { handleVideoRequest, resetYoutubeAnalysisCache } = await import(dataUrl(serverSource));

function request(url) {
  return new Request("https://trackhunt.test/api/video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

function watchHtml({ id, description, title = "DJ Set", author = "DJ Test", playabilityStatus = { status: "OK" }, initial = {} }) {
  const player = {
    playabilityStatus,
    videoDetails: {
      title,
      author,
      shortDescription: description,
      thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] },
    },
  };
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script><script>var ytInitialData = ${JSON.stringify(initial)};</script>`;
}

test("uses YouTube Data API v3 when configured and caches successful analyses", async () => {
  resetYoutubeAnalysisCache();
  const id = "ApiKey12345";
  let fetchCalls = 0;
  let watchCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    fetchCalls += 1;
    const target = String(url);
    if (target.includes("/oembed")) return Response.json({ title: "Metadata", author_name: "Channel", thumbnail_url: "https://img.test/oembed.jpg" });
    if (target.includes("googleapis.com/youtube/v3/videos")) {
      assert.equal(init.headers["X-goog-api-key"], "server-secret");
      return Response.json({ items: [{
        snippet: {
          title: "Official Set",
          channelTitle: "Official DJ",
          description: "00:00 Artist One — Track One\n03:20 Artist Two — Track Two",
          thumbnails: { high: { url: "https://img.test/high.jpg" } },
        },
        status: { privacyStatus: "public", uploadStatus: "processed" },
      }] });
    }
    watchCalls += 1;
    throw new Error(`Unexpected URL: ${target}`);
  };

  const first = await handleVideoRequest(request(`https://youtu.be/${id}`), { YOUTUBE_API_KEY: "server-secret" }, { fetchImpl, retryDelayMs: 0 });
  assert.equal(first.status, 200);
  const payload = await first.json();
  assert.equal(payload.source, "youtube-data-api");
  assert.equal(payload.title, "Official Set");
  assert.deepEqual(payload.tracks.map(track => `${track.artist} - ${track.title}`), ["Artist One - Track One", "Artist Two - Track Two"]);
  assert.equal(watchCalls, 0);

  const beforeCacheRead = fetchCalls;
  const cached = await handleVideoRequest(request(`https://www.youtube.com/watch?v=${id}`), { YOUTUBE_API_KEY: "server-secret" }, { fetchImpl, retryDelayMs: 0 });
  assert.equal(cached.status, 200);
  assert.equal(fetchCalls, beforeCacheRead);
});

test("enumerates a paginated YouTube playlist and derives only defensible credits", async () => {
  resetYoutubeAnalysisCache();
  const playlistId = "PLTrackHunt123";
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    requests.push(target);
    assert.equal(init.headers["X-goog-api-key"], "playlist-secret");
    assert.equal(target.searchParams.has("key"), false);
    if (target.pathname.endsWith("/playlists")) {
      return Response.json({ items: [{
        snippet: {
          title: "Friday DJ Crate",
          channelTitle: "DJ Test",
          thumbnails: { high: { url: "https://img.test/playlist.jpg" } },
        },
        status: { privacyStatus: "public" },
        contentDetails: { itemCount: 5 },
      }] });
    }
    if (target.pathname.endsWith("/playlistItems") && !target.searchParams.has("pageToken")) {
      return Response.json({
        nextPageToken: "page-two",
        items: [
          { snippet: { position: 0, title: "Artist One — Track One (Official Audio)", videoOwnerChannelTitle: "Label" }, status: { privacyStatus: "public" } },
          { snippet: { position: 1, title: "Private video" }, status: { privacyStatus: "private" } },
          { snippet: { position: 2, title: "Track Two [Official Music Video]", videoOwnerChannelTitle: "Artist Two - Topic" }, status: { privacyStatus: "public" } },
        ],
      });
    }
    if (target.pathname.endsWith("/playlistItems") && target.searchParams.get("pageToken") === "page-two") {
      return Response.json({ items: [
        { snippet: { position: 3, title: "Unknown White Label", videoOwnerChannelTitle: "Random Uploads" }, status: { privacyStatus: "public" } },
        { snippet: { position: 4, title: "Artist One — Track One (Official Audio)", videoOwnerChannelTitle: "Label" }, status: { privacyStatus: "public" } },
      ] });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  const response = await handleVideoRequest(
    request(`https://www.youtube.com/playlist?list=${playlistId}`),
    { YOUTUBE_API_KEY: "playlist-secret" },
    { fetchImpl, retryDelayMs: 0 },
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.source, "youtube-playlist-api");
  assert.equal(payload.title, "Friday DJ Crate");
  assert.equal(payload.channel, "DJ Test");
  assert.equal(payload.thumbnail, "https://img.test/playlist.jpg");
  assert.deepEqual(payload.tracks.map(track => [track.artist, track.title]), [
    ["Artist One", "Track One"],
    ["Artist Two", "Track Two"],
    ["Artista por identificar", "Unknown White Label"],
    ["Artist One", "Track One"],
  ]);
  assert.equal(requests.filter(url => url.pathname.endsWith("/playlistItems")).length, 2);
});

test("treats list= as a playlist even when the URL also contains a video", async () => {
  resetYoutubeAnalysisCache();
  let called = false;
  const response = await handleVideoRequest(
    request("https://www.youtube.com/watch?v=ApiKey12345&list=PLTrackHunt123"),
    {},
    { fetchImpl: async () => { called = true; return new Response(); } },
  );
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.code, "YOUTUBE_PLAYLIST_API_KEY_REQUIRED");
  assert.equal(payload.retryable, false);
  assert.equal(payload.canPaste, true);
  assert.match(payload.error, /YOUTUBE_API_KEY/);
  assert.equal(called, false);
});

test("analyzes the explicit video in a YouTube automatic-radio watch URL", async () => {
  resetYoutubeAnalysisCache();
  const id = "JHdNEzKVBoQ";
  const requests = [];
  const fetchImpl = async url => {
    const target = String(url);
    requests.push(target);
    if (target.includes("/oembed")) return Response.json({ title: "Radio Seed", author_name: "DJ", thumbnail_url: "https://img.test/radio.jpg" });
    if (target.includes("/watch?")) {
      return new Response(watchHtml({ id, description: "00:00 Artist One — Track One" }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };
  const response = await handleVideoRequest(
    request("https://www.youtube.com/watch?v=JHdNEzKVBoQ&list=RDJHdNEzKVBoQ&start_radio=1"),
    {},
    { fetchImpl, retryDelayMs: 0 },
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.source, "youtube-description");
  assert.deepEqual(payload.tracks.map(track => [track.artist, track.title]), [["Artist One", "Track One"]]);
  assert.equal(requests.some(url => url.includes("googleapis.com/youtube/v3/playlists")), false);
});

test("reports a standalone automatic playlist with an actionable error", async () => {
  resetYoutubeAnalysisCache();
  const fetchImpl = async url => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/playlists")) return Response.json({ error: { message: "playlistOperationUnsupported" } }, { status: 400 });
    throw new Error(`Unexpected URL: ${target}`);
  };
  const response = await handleVideoRequest(
    request("https://www.youtube.com/playlist?list=RDApiKey12345"),
    { YOUTUBE_API_KEY: "playlist-secret" },
    { fetchImpl, retryDelayMs: 0 },
  );
  const payload = await response.json();
  assert.equal(response.status, 422);
  assert.equal(payload.code, "YOUTUBE_PLAYLIST_NOT_ACCESSIBLE");
  assert.match(payload.error, /radio automática/i);
  assert.match(payload.error, /video individual|playlist pública/i);
});

test("video API route authenticates and checks same-origin before spending provider quota", async () => {
  const source = await readFile(new URL("../app/api/video/route.ts", import.meta.url), "utf8");
  assert.match(source, /requireRequestUser\(request\)/);
  assert.match(source, /user instanceof Response/);
  assert.match(source, /mutationSecurityError\(request\)/);
  assert.ok(source.indexOf("requireRequestUser(request)") < source.indexOf("handleVideoRequest(request"));
  assert.ok(source.indexOf("mutationSecurityError(request)") < source.indexOf("handleVideoRequest(request"));
});

test("authentication failures expose a stable sign-in error without enabling manual bypass", async () => {
  const source = await readFile(new URL("../lib/request-security.ts", import.meta.url), "utf8");
  assert.match(source, /code: "AUTH_REQUIRED"/);
  assert.match(source, /canPaste: false/);
  const setsSource = await readFile(new URL("../app/sets/page.tsx", import.meta.url), "utf8");
  assert.match(setsSource, /\/signin-with-chatgpt\?return_to=%2Fsets/);
  assert.match(setsSource, /target="_top"/);
});

test("rejects malformed playlist parameters before making network requests", async () => {
  resetYoutubeAnalysisCache();
  let called = false;
  const response = await handleVideoRequest(
    request("https://www.youtube.com/playlist?list=%20%20"),
    { YOUTUBE_API_KEY: "playlist-secret" },
    { fetchImpl: async () => { called = true; return new Response(); } },
  );
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.code, "INVALID_YOUTUBE_PLAYLIST_URL");
  assert.equal(payload.canPaste, false);
  assert.equal(called, false);
});

test("retries a temporary 429 once and then extracts the public description", async () => {
  resetYoutubeAnalysisCache();
  const id = "Retry123456";
  let watchCalls = 0;
  const retrySignals = [];
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.includes("/oembed")) return Response.json({ title: "Retry Set", author_name: "DJ Retry", thumbnail_url: "https://img.test/retry.jpg" });
    watchCalls += 1;
    retrySignals.push(init.signal);
    if (watchCalls === 1) return new Response("limited", { status: 429 });
    return new Response(watchHtml({ id, description: "00:00 Sean Paul — Temperature" }), { status: 200, headers: { "content-type": "text/html" } });
  };

  const response = await handleVideoRequest(request(`https://youtube.com/watch?v=${id}`), {}, { fetchImpl, retryDelayMs: 0 });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(watchCalls, 2);
  assert.notEqual(retrySignals[0], retrySignals[1]);
  assert.equal(payload.source, "youtube-description");
  assert.equal(payload.tracks[0].artist, "Sean Paul");
  assert.equal(payload.tracks[0].title, "Temperature");
});

test("turns a server-side YouTube block into an actionable structured error", async () => {
  resetYoutubeAnalysisCache();
  const id = "Block1234AA";
  const fetchImpl = async url => String(url).includes("/oembed")
    ? Response.json({ title: "Visible Set", author_name: "Visible DJ", thumbnail_url: "https://img.test/visible.jpg" })
    : new Response("forbidden", { status: 403 });

  const response = await handleVideoRequest(request(`https://www.youtube.com/watch?v=${id}`), {}, { fetchImpl, retryDelayMs: 0 });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.code, "YOUTUBE_ACCESS_LIMITED");
  assert.equal(payload.retryable, false);
  assert.equal(payload.canPaste, true);
  assert.equal(payload.metadata.title, "Visible Set");
  assert.match(payload.error, /bloqueó la lectura automática/i);
});

test("retries when reading a successful response body fails", async () => {
  resetYoutubeAnalysisCache();
  const id = "BodyRd12ABC";
  let watchCalls = 0;
  const fetchImpl = async url => {
    const target = String(url);
    if (target.includes("/oembed")) return Response.json({ title: "Body Retry", author_name: "DJ", thumbnail_url: "https://img.test/body.jpg" });
    watchCalls += 1;
    if (watchCalls === 1) {
      return { status: 200, ok: true, text: async () => { throw new Error("stream reset"); } };
    }
    return new Response(watchHtml({ id, description: "00:00 Artist — Recovered Track" }), { status: 200 });
  };

  const response = await handleVideoRequest(request(`https://youtu.be/${id}`), {}, { fetchImpl, retryDelayMs: 0 });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(watchCalls, 2);
  assert.equal(payload.tracks[0].title, "Recovered Track");
});

test("enforces one overall deadline and reports a distinct timeout", async () => {
  resetYoutubeAnalysisCache();
  const id = "Timeout12AB";
  const fetchImpl = async (url, init) => {
    if (String(url).includes("/oembed")) return Response.json({ title: "Slow Set", author_name: "DJ", thumbnail_url: "https://img.test/slow.jpg" });
    return new Promise((resolve, reject) => {
      const keepAlive = setTimeout(() => resolve(new Response("late", { status: 504 })), 500);
      init.signal.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        const error = new Error("timed out");
        error.name = "TimeoutError";
        reject(error);
      }, { once: true });
    });
  };

  const started = Date.now();
  const response = await handleVideoRequest(request(`https://youtu.be/${id}`), {}, { fetchImpl, retryDelayMs: 0, overallTimeoutMs: 15 });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.code, "YOUTUBE_TIMEOUT");
  assert.equal(payload.retryable, true);
  assert.ok(Date.now() - started < 250);
});

test("keeps the acoustic escape hatch visible when YouTube metadata times out", async () => {
  const setsSource = await readFile(new URL("../app/sets/page.tsx", import.meta.url), "utf8");
  assert.match(setsSource, /ACOUSTIC_FALLBACK_CODES/);
  assert.match(setsSource, /"YOUTUBE_TIMEOUT"/);
  assert.match(setsSource, /canUseAcousticFallback \|\| hasPartialPublicCredits \|\| acousticJob/);
  assert.match(setsSource, /YouTube no respondió; el análisis acústico sigue disponible/);
});

test("distinguishes a real video with no public tracklist", async () => {
  resetYoutubeAnalysisCache();
  const id = "NoTrack12AB";
  const fetchImpl = async url => String(url).includes("/oembed")
    ? Response.json({ title: "No Tracklist", author_name: "DJ", thumbnail_url: "https://img.test/no-tracks.jpg" })
    : new Response(watchHtml({ id, description: "Gracias por escuchar este set." }), { status: 200 });

  const response = await handleVideoRequest(request(`https://youtube.com/watch?v=${id}`), {}, { fetchImpl, retryDelayMs: 0 });
  const payload = await response.json();
  assert.equal(response.status, 422);
  assert.equal(payload.code, "NO_PUBLIC_TRACKLIST");
  assert.equal(payload.retryable, false);
  assert.equal(payload.canPaste, true);
});

test("uses public music credits even when YouTube requires login for playback", async () => {
  resetYoutubeAnalysisCache();
  const id = "Credits12AB";
  const initial = {
    horizontalCardListRenderer: {
      header: { richListHeaderRenderer: { title: { simpleText: "Música" } } },
      cards: [{
        videoAttributeViewModel: {
          title: "Mi Gente (Alesso Remix) (Alesso Remix)",
          subtitle: "J Balvin",
        },
      }],
    },
  };
  const fetchImpl = async url => String(url).includes("/oembed")
    ? Response.json({ title: "Public Set", author_name: "DJ", thumbnail_url: "https://img.test/credits.jpg" })
    : new Response(watchHtml({
      id,
      description: "",
      playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Accede para confirmar que no eres un bot" },
      initial,
    }), { status: 200 });

  const response = await handleVideoRequest(request(`https://youtube.com/watch?v=${id}`), {}, { fetchImpl, retryDelayMs: 0 });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.source, "youtube-credits");
  assert.equal(payload.tracks[0].title, "Mi Gente (Alesso Remix)");
  assert.equal(payload.coverage.status, "partial");
  assert.equal(payload.coverage.reason, "youtube-public-credits");
  assert.match(payload.coverage.message, /1 crédito musical/);
});

test("does not truncate YouTube public credits after ten tracks", async () => {
  resetYoutubeAnalysisCache();
  const id = "CredMore123";
  const initial = {
    horizontalCardListRenderer: {
      header: { richListHeaderRenderer: { title: { simpleText: "Música" } } },
      cards: Array.from({ length: 14 }, (_, index) => ({
        videoAttributeViewModel: {
          title: `Track ${index + 1}`,
          subtitle: `Artist ${index + 1}`,
        },
      })),
    },
  };
  const fetchImpl = async url => String(url).includes("/oembed")
    ? Response.json({ title: "Long Set", author_name: "DJ", thumbnail_url: "https://img.test/long.jpg" })
    : new Response(watchHtml({ id, description: "", initial }), { status: 200 });

  const response = await handleVideoRequest(request(`https://youtube.com/watch?v=${id}`), {}, { fetchImpl, retryDelayMs: 0 });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.tracks.length, 14);
  assert.equal(payload.tracks.at(-1).title, "Track 14");
  assert.equal(payload.coverage.status, "partial");
});

test("rejects malformed YouTube links before making network requests", async () => {
  resetYoutubeAnalysisCache();
  let called = false;
  const response = await handleVideoRequest(request("https://youtube.example/watch?v=bad"), {}, { fetchImpl: async () => { called = true; return new Response(); } });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.code, "INVALID_YOUTUBE_URL");
  assert.equal(payload.canPaste, false);
  assert.equal(called, false);
});
