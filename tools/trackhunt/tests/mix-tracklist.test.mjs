import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/mix-tracklist.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("maps all documented file states without throwing on unknown values", () => {
  assert.deepEqual(model.parseAcrCloudState(0), {
    status: "processing", state: "processing", rawState: 0, ready: false, terminal: false,
  });
  assert.deepEqual(model.parseAcrCloudState("1"), {
    status: "ready", state: "ready", rawState: 1, ready: true, terminal: true,
  });
  assert.equal(model.parseAcrCloudState(-1).state, "no-results");
  assert.equal(model.parseAcrCloudState(-2).state, "error");
  assert.equal(model.parseAcrCloudState(-3).state, "error");
  assert.deepEqual(model.parseAcrCloudState("finished"), {
    status: "unknown", state: "unknown", rawState: null, ready: false, terminal: false,
  });
});

test("parses music and cover matches, converts millisecond offsets, and sorts them", () => {
  const parsed = model.parseAcrCloudFileScan({
    data: [{
      state: 1,
      results: {
        music: [{
          offset: 185,
          title: "Second Song",
          artists: [{ name: "Artist B" }],
          score: 91,
          played_duration: 44,
          acrid: "b",
        }],
        cover_songs: [{
          play_offset_ms: 65000,
          title: "First Song",
          artists: ["Artist A", { name: "Guest" }],
          score: "88",
          played_duration_ms: 30000,
          acrid: "a",
        }],
      },
    }],
  });

  assert.equal(parsed.state, "ready");
  assert.deepEqual(parsed.tracks, [
    {
      time: "1:05", seconds: 65, artist: "Artist A & Guest", title: "First Song",
      provider: "acrcloud", source: "cover_song", score: 88, playedDuration: 30, acrid: "a",
    },
    {
      time: "3:05", seconds: 185, artist: "Artist B", title: "Second Song",
      provider: "acrcloud", source: "music", score: 91, playedDuration: 44, acrid: "b",
    },
  ]);
});

test("parses the official file-scanning wrapper with timing outside result metadata", () => {
  const parsed = model.parseAcrCloudFile({
    data: [{
      state: 1,
      results: {
        music: [{
          offset: 3112,
          played_duration: 27,
          type: "music",
          result: {
            title: "Dákiti",
            artists: [{ name: "Bad Bunny" }, { name: "Jhay Cortez" }],
            score: 99,
            acrid: "official-result-id",
          },
        }],
        cover_songs: [{
          offset: 3200,
          played_duration: 18,
          type: "cover_song",
          result: {
            title: "Dákiti (DJ Edit)",
            artists: [{ name: "Club Editor" }],
            score: 94,
            acrid: "official-cover-id",
          },
        }],
      },
    }],
  });

  assert.deepEqual(parsed.tracks, [
    {
      time: "51:52",
      seconds: 3112,
      artist: "Bad Bunny & Jhay Cortez",
      title: "Dákiti",
      provider: "acrcloud",
      source: "music",
      score: 99,
      playedDuration: 27,
      acrid: "official-result-id",
    },
    {
      time: "53:20",
      seconds: 3200,
      artist: "Club Editor",
      title: "Dákiti (DJ Edit)",
      provider: "acrcloud",
      source: "cover_song",
      score: 94,
      playedDuration: 18,
      acrid: "official-cover-id",
    },
  ]);
});

test("collapses consecutive detections and keeps the strongest metadata at the first offset", () => {
  const parsed = model.parseAcrCloudFileScan({
    state: 1,
    results: {
      music: [
        { offset: 12, title: "Canción", artists: [{ name: "DJ Uno" }], score: 75, played_duration: 24, acrid: "same" },
        { offset: 36, title: "Cancion", artists: [{ name: "DJ Uno feat. Dos" }], score: 96, played_duration: 12, acrid: "same" },
        { offset: 60, title: "Canción", artists: [{ name: "DJ Uno" }], score: 96, played_duration: 80, acrid: "same" },
      ],
    },
  });

  assert.equal(parsed.tracks.length, 1);
  assert.deepEqual(parsed.tracks[0], {
    time: "0:12", seconds: 12, artist: "DJ Uno", title: "Canción",
    provider: "acrcloud", source: "music", score: 96, playedDuration: 80, acrid: "same",
  });
});

test("deduplicates an overlapping music and cover result while preferring score", () => {
  const parsed = model.parseAcrCloudFileScan({
    state: 1,
    results: {
      music: [{ offset_seconds: 120, title: "Track", artists: [{ name: "Artist" }], score: 80, played_duration: 90 }],
      cover_songs: [{ offset_seconds: 122, title: "Track", artists: [{ name: "Artist" }], score: 98, played_duration: 30 }],
    },
  });
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].seconds, 120);
  assert.equal(parsed.tracks[0].source, "cover_song");
  assert.equal(parsed.tracks[0].score, 98);
});

test("preserves a genuine reprise of the same song after a substantial gap", () => {
  const parsed = model.parseAcrCloudFileScan({
    state: 1,
    results: {
      music: [
        { offset: 5, title: "Opening Theme", artist: "Selector", score: 90, played_duration: 60 },
        { offset: 605, title: "Opening Theme", artist: "Selector", score: 94, played_duration: 45 },
      ],
    },
  });
  assert.deepEqual(parsed.tracks.map((track) => track.seconds), [5, 605]);
});

test("accepts stringified results and ignores malformed rows defensively", () => {
  const parsed = model.parseAcrCloudFileScan({
    state: "1",
    results: JSON.stringify({
      music: [
        null,
        { offset: "bad", title: "No offset", artist: "Someone" },
        { offset: 0, metadata: { title: "Valid", artists: [{ name: "Someone" }] } },
      ],
      cover_songs: "not-an-array",
    }),
  });
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].title, "Valid");
  assert.deepEqual(model.parseAcrCloudFileScan(null), {
    status: "unknown", state: "unknown", rawState: null, ready: false, terminal: false, tracks: [],
  });
});

test("exports stable file and track helpers with safe duration and message details", () => {
  const payload = {
    data: [{
      state: -2,
      duration_ms: 123000,
      error_message: "Provider could not scan the file",
      results: { music: [] },
    }],
  };
  const parsed = model.parseAcrCloudFile(payload);
  assert.equal(parsed.status, "error");
  assert.equal(parsed.duration, 123);
  assert.equal(parsed.message, "Provider could not scan the file");
  assert.deepEqual(model.parseAcrCloudTracks(payload), []);
});
