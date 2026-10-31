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
const quality = await import(dataUrl(qualitySource));
const djCompilations = await import(djCompilationsUrl);
const audio = await import(dataUrl(compile(await readFile(new URL("../lib/audio-quality.ts", import.meta.url), "utf8"))));

const measurement = (patch = {}) => ({
  fileName: "Artist - Track.mp3",
  extension: "mp3",
  mimeType: "audio/mpeg",
  bytes: 9_600_000,
  duration: 240,
  sampleRate: 44_100,
  channels: 2,
  estimatedKbps: 320,
  peakDbfs: -0.8,
  rmsDbfs: -12,
  crestFactorDb: 11.2,
  clippedPercent: 0,
  ...patch,
});

test("quality text normalization is stable for accents and punctuation", () => {
  assert.equal(quality.normalizeQualityText("  María — Edición (Ácida)!  "), "maria edicion acida");
  assert.equal(quality.normalizeQualityText("Beyoncé feat. JAY-Z"), "beyonce feat jay z");
});

test("DJ Compilations receives a clean manual query without inventing a deep link", () => {
  assert.equal(djCompilations.DJ_COMPILATIONS_HOME, "https://dj-compilations.com/");
  assert.equal(
    djCompilations.djCompilationsQuery({ artist: "Beyoncé & JAY-Z", title: "Déjà Vu #1", version: "Extended Mix" }),
    "Beyoncé & JAY-Z Déjà Vu #1 Extended Mix",
  );
});

test("identity scoring prioritizes the exact version and penalizes a different edit", () => {
  const wanted = { artist: "Artist Name", title: "Night Drive", version: "Extended Mix" };
  const exact = quality.identityScore(wanted, { artist: "Artist Name", title: "Night Drive", version: "Extended Mix" });
  const original = quality.identityScore(wanted, { artist: "Artist Name", title: "Night Drive", version: "Original Mix" });
  const otherArtist = quality.identityScore(wanted, { artist: "Another Artist", title: "Night Drive", version: "Extended Mix" });

  assert.equal(exact, 1);
  assert(exact > original, "the requested Extended Mix must outrank the Original Mix");
  assert(exact > otherArtist, "an exact artist match must improve the identity score");
  assert.equal(quality.matchLabel(exact), "exact");
  assert.equal(quality.matchLabel(original), "review");
  assert.equal(quality.matchLabel(otherArtist), "review");

  const noVersionWanted = quality.identityScore(
    { artist: "Artist Name", title: "Night Drive" },
    { artist: "Artist Name", title: "Night Drive Remix" },
  );
  assert(noVersionWanted < 0.68, "an unsolicited remix must require review");
});

test("an unmarked catalog title can be the original, while a named alternate mix requires review", () => {
  const wanted = { artist: "Daft Punk", title: "One More Time", version: "Original Mix" };
  const unmarkedOriginal = quality.identityScore(wanted, { artist: "Daft Punk", title: "One More Time" });
  const twelveMix = quality.identityScore(wanted, { artist: "Daft Punk", title: "One More Time (12 Mix)" });
  assert.equal(quality.matchLabel(unmarkedOriginal), "exact");
  assert.equal(quality.matchLabel(twelveMix), "review");
  assert(unmarkedOriginal > twelveMix);
});

test("match labels preserve the public confidence thresholds", () => {
  assert.equal(quality.matchLabel(0.88), "exact");
  assert.equal(quality.matchLabel(0.879), "likely");
  assert.equal(quality.matchLabel(0.68), "likely");
  assert.equal(quality.matchLabel(0.679), "review");
});

test("quality result URLs use HTTPS and an explicit provider allowlist", () => {
  assert.equal(quality.safeQualityUrl("https://music.apple.com/cl/album/example/1"), "https://music.apple.com/cl/album/example/1");
  assert.equal(quality.safeQualityUrl("https://artist.bandcamp.com/track/example?from=search"), "https://artist.bandcamp.com/track/example?from=search");
  assert.equal(quality.safeQualityUrl("https://www.deezer.com/track/123"), "https://www.deezer.com/track/123");

  for (const unsafe of [
    "http://beatport.com/track/example/1",
    "https://beatport.com.evil.test/track/example/1",
    "https://user:secret@qobuz.com/album/example",
    "https://soundcloud.com:444/artist/track",
    "https://127.0.0.1/track",
    "javascript:alert(1)",
  ]) assert.equal(quality.safeQualityUrl(unsafe), null, unsafe);
});

test("store searches retain the exact version and expose authorized destinations", () => {
  const stores = quality.buildStoreSearches({ artist: "Artist Name", title: "Night Drive", version: "Extended Mix", isrc: "CLAAA2600001" });
  assert.deepEqual(stores.map((store) => store.provider), ["Beatport", "DJ Compilations", "Bandcamp", "Traxsource", "Juno Download", "Qobuz", "SoundCloud"]);
  assert.deepEqual(stores.map((store) => store.priority), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(stores.map((store) => store.url)).size, stores.length);
  for (const store of stores) {
    assert.match(store.url, /^https:\/\//);
    assert(store.note.length > 20);
    if (store.provider === "DJ Compilations") {
      assert.equal(store.url, "https://dj-compilations.com/");
      assert.equal(store.query, "Artist Name Night Drive Extended Mix");
      assert(!store.query.includes("CLAAA2600001"));
      assert.equal(store.action, "copy-open");
    } else {
      const decoded = decodeURIComponent(store.url);
      assert.match(decoded, /Artist Name Night Drive Extended Mix/);
    }
  }
});

test("file extensions are normalized without trusting arbitrary suffixes", () => {
  assert.equal(audio.fileExtension("TRACK.MP3"), "mp3");
  assert.equal(audio.fileExtension("Artist - Track.final.FLAC"), "flac");
  assert.equal(audio.fileExtension("sin-extension"), "");
  assert.equal(audio.fileExtension("flac"), "", "a filename without a dot must not be treated as a FLAC container");
  assert.equal(audio.fileExtension("track.verylongextension"), "");
});

test("audio assessment distinguishes useful MP3, damaged audio and lossless containers", () => {
  const djFile = audio.assessAudioQuality(measurement());
  assert(djFile.score >= 70 && djFile.score <= 85);
  assert.match(djFile.grade, /potencial|adecuado/i);
  assert(djFile.warnings.some((warning) => /preliminar/i.test(warning)));
  assert.match(djFile.verdict, /perfil técnico|fuente oficial/i);

  const damaged = audio.assessAudioQuality(measurement({ estimatedKbps: 128, sampleRate: 32_000, channels: 1, clippedPercent: 0.5 }));
  assert.match(damaged.grade, /bajo|mejorar/i);
  assert(damaged.score < djFile.score);
  assert(damaged.warnings.some((warning) => /44,1 kHz/.test(warning)));
  assert(damaged.warnings.some((warning) => /mono/.test(warning)));
  assert(damaged.warnings.some((warning) => /clipping/.test(warning)));

  const wav = audio.assessAudioQuality(measurement({ fileName: "Track.wav", extension: "wav", mimeType: "audio/wav", estimatedKbps: 1_411 }));
  assert.match(wav.grade, /lossless.*verificar/i);
  assert(wav.warnings.some((warning) => /no demuestra/i.test(warning)), "a lossless container must not be presented as verified provenance");
  assert.match(wav.verdict, /comprobar espectro y procedencia/i);
  assert.equal(audio.MAX_LOCAL_AUDIO_BYTES, 120 * 1024 * 1024);
  assert.equal(audio.MAX_LOCAL_AUDIO_SECONDS, 20 * 60);
});
