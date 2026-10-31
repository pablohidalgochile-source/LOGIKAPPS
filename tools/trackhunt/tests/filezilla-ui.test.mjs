import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScript(sourceUrl, replacements = []) {
  const source = await readFile(sourceUrl, "utf8");
  let compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [from, to] of replacements) compiled = compiled.replaceAll(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const queueSourceUrl = new URL("../lib/filezilla-queue.ts", import.meta.url);
const queueSource = await readFile(queueSourceUrl, "utf8");
const queueCompiled = ts.transpileModule(queueSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const queueDataUrl = `data:text/javascript;base64,${Buffer.from(queueCompiled).toString("base64")}`;
const ui = await importTypeScript(new URL("../lib/filezilla-ui.ts", import.meta.url), [
  ['"./filezilla-queue"', JSON.stringify(queueDataUrl)],
]);

test("parses absolute paths, credential-bearing FTP URLs and FileZilla-style TSV without retaining credentials", () => {
  const parsed = ui.parseRemoteListing([
    "/AUDIO/2026/Direct Mix.mp3",
    "ftp://dj:secret@pool.example.test/AUDIO/2026/Encoded%20Mix.flac",
    "TSV Song.wav\t123456\t/AUDIO/2025/October",
    "/AUDIO/2026/Direct Mix.mp3",
    "/AUDIO/2026/not-audio.txt",
  ].join("\n"));

  assert.equal(parsed.rejected, 1);
  assert.deepEqual(parsed.candidates, [
    { id: "remote-1", remoteDirectory: "/AUDIO/2026", remoteName: "Direct Mix.mp3" },
    { id: "remote-2", remoteDirectory: "/AUDIO/2026", remoteName: "Encoded Mix.flac" },
    { id: "remote-3", remoteDirectory: "/AUDIO/2025/October", remoteName: "TSV Song.wav" },
  ]);
  assert.doesNotMatch(JSON.stringify(parsed), /secret|dj@|pool\.example/i);
});

test("renames every final destination across suffix, casefold and Unicode normalization collisions", () => {
  const names = ui.uniqueLocalNames([
    { remoteName: "song.mp3" },
    { remoteName: "song.mp3" },
    { remoteName: "song-2.mp3" },
    { remoteName: "Straße.mp3" },
    { remoteName: "STRASSE.mp3" },
    { remoteName: "Café.mp3" },
    { remoteName: "Cafe\u0301.mp3" },
  ]);

  assert.deepEqual(names, [
    "song.mp3",
    "song-2.mp3",
    "song-2-2.mp3",
    "Straße.mp3",
    "STRASSE-2.mp3",
    "Café.mp3",
    "Cafe\u0301-2.mp3",
  ]);
  const collisionKeys = names.map((name) => name.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC"));
  assert.equal(new Set(collisionKeys).size, names.length);
});

test("accepts the boundary and rejects listings above 2 MB or 10000 lines", () => {
  assert.equal(ui.ftpListingLimitProblem("a".repeat(ui.MAX_FTP_LIST_BYTES)), "");
  assert.match(ui.ftpListingLimitProblem("a".repeat(ui.MAX_FTP_LIST_BYTES + 1)), /2 MB/);

  const tenThousandLines = `${"track\n".repeat(ui.MAX_FTP_LIST_LINES - 1)}track`;
  const tenThousandAndOneLines = `${tenThousandLines}\ntrack`;
  assert.equal(ui.ftpListingLimitProblem(tenThousandLines), "");
  assert.match(ui.ftpListingLimitProblem(tenThousandAndOneLines), /10\.000 líneas/);

  assert.match(ui.ftpListingLimitProblem("á".repeat(1_000_001)), /2 MB/);
});
