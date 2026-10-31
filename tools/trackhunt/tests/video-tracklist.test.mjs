import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../lib/video-tracklist.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const credit = (artist, title) => ({ time: "--:--", seconds: 0, artist, title });

test("infers a title-first YouTube description and preserves DJ version descriptors", () => {
  const raw = model.tracksFromDescription([
    "0:00 - Lion King Riddim - Onderkoffer",
    "5:52 - Traffic Blocking - General Degree",
    "11:35 - Yo Voy - Thombs & BROSS Remix - Zion & Lennox ft. Daddy Yankee",
  ].join("\n"));
  const credits = [
    credit("General Degree", "Traffic Blocking"),
    credit("Zion & Lennox ft. Daddy Yankee", "Yo Voy"),
  ];
  const oriented = model.orientDescriptionTracks(raw, credits);
  assert.deepEqual(
    oriented.map(({ artist, title }) => ({ artist, title })),
    [
      { artist: "Onderkoffer", title: "Lion King Riddim" },
      { artist: "General Degree", title: "Traffic Blocking" },
      { artist: "Zion & Lennox ft. Daddy Yankee", title: "Yo Voy (Thombs & BROSS Remix)" },
    ],
  );
  const merged = model.uniqueTracks(oriented, credits);
  assert.equal(merged.filter(row => row.title === "Traffic Blocking").length, 1);
  assert.equal(merged.find(row => row.title === "Traffic Blocking").time, "5:52");
});

test("keeps an artist-first description when music credits support it", () => {
  const raw = model.tracksFromDescription("00:00 Sean Paul — Temperature\n03:10 CKay — love nwantiti");
  const oriented = model.orientDescriptionTracks(raw, [credit("Sean Paul", "Temperature"), credit("CKay", "love nwantiti")]);
  assert.equal(oriented[0].artist, "Sean Paul");
  assert.equal(oriented[0].title, "Temperature");
});

test("manual tracklists support either declared column order", () => {
  const titleFirst = model.parseTracklistText("00:00 Temperature — Sean Paul", "title-artist");
  const artistFirst = model.parseTracklistText("00:00 Sean Paul — Temperature", "artist-title");
  assert.deepEqual(titleFirst[0], artistFirst[0]);
});

test("title-first orientation does not duplicate an existing remix name", () => {
  const raw = model.tracksFromDescription("03:11 Mi Gente (Alesso Remix) — Alesso Remix — J Balvin Willy William");
  const oriented = model.orientDescriptionTracks(raw, [credit("J Balvin Willy William", "Mi Gente (Alesso Remix)")]);
  assert.equal(oriented[0].artist, "J Balvin Willy William");
  assert.equal(oriented[0].title, "Mi Gente (Alesso Remix)");
});

test("removes a duplicated version suffix already published by YouTube credits", () => {
  const merged = model.uniqueTracks([
    credit("J Balvin", "Mi Gente (Alesso Remix) (Alesso Remix)"),
  ]);
  assert.equal(merged[0].title, "Mi Gente (Alesso Remix)");
});

test("converts playlist titles conservatively without treating a normal uploader as the artist", () => {
  assert.deepEqual(
    model.trackFromPlaylistMetadata({ title: "Beyoncé — CUFF IT (Official Audio)", ownerChannel: "Uploader" }),
    { time: "--:--", seconds: 0, artist: "Beyoncé", title: "CUFF IT" },
  );
  assert.deepEqual(
    model.trackFromPlaylistMetadata({ title: "One More Time [Official Audio]", ownerChannel: "Daft Punk - Topic" }),
    { time: "--:--", seconds: 0, artist: "Daft Punk", title: "One More Time" },
  );
  assert.deepEqual(
    model.trackFromPlaylistMetadata({ title: "Unknown White Label", ownerChannel: "Random DJ Uploads" }),
    { time: "--:--", seconds: 0, artist: "Artista por identificar", title: "Unknown White Label" },
  );
});

test("drops unavailable playlist items and strips unsafe control characters", () => {
  assert.equal(model.trackFromPlaylistMetadata({ title: "Private video", ownerChannel: "YouTube" }), null);
  assert.equal(model.trackFromPlaylistMetadata({ title: "Deleted video", ownerChannel: "YouTube" }), null);
  assert.deepEqual(
    model.trackFromPlaylistMetadata({ title: "Artist\u202e — Track\u0000 Name", ownerChannel: "Uploader" }),
    { time: "--:--", seconds: 0, artist: "Artist", title: "Track Name" },
  );
});
