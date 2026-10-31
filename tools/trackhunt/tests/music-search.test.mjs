import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const modelUrl = dataUrl(compile(await readFile(new URL("../lib/music-search.ts", import.meta.url), "utf8")));
const model = await import(modelUrl);

test("creates progressive search variants for accents, collaborators and YouTube handles", () => {
  const queries = model.musicSearchQueries({
    artist: "Hamilton x @Zaider x @TheProdigiez_",
    title: "Alma (Official Video)",
  });
  assert.equal(queries[0].query, "Hamilton x Zaider x TheProdigiez_ Alma");
  assert.ok(queries.some(row => row.strategy === "lead-artist" && row.query === "Alma Hamilton"));
  assert.ok(queries.some(row => row.strategy === "title-only" && row.query === "Alma"));
  assert.equal(new Set(queries.map(row => model.normalizeMusicText(row.query))).size, queries.length);
});

test("scores accents as identical but keeps artist and version conflicts for review", () => {
  const exact = model.scoreMusicCandidate(
    { artist: "Beéle x Farruko", title: "Santorini" },
    { artist: "Beele", title: "Santorini" },
  );
  assert.ok(exact.score >= .78);
  assert.equal(exact.versionConflict, false);

  const wrongArtist = model.scoreMusicCandidate(
    { artist: "Beéle", title: "Santorini" },
    { artist: "Another Artist", title: "Santorini" },
  );
  assert.ok(wrongArtist.score < .78);

  const missingRemix = model.scoreMusicCandidate(
    { artist: "Rihanna", title: "Only Girl (Club Remix)" },
    { artist: "Rihanna", title: "Only Girl" },
  );
  assert.equal(missingRemix.versionConflict, true);
  assert.ok(missingRemix.score < exact.score);
});

test("builds accent-insensitive words for FileZilla regular expressions", () => {
  assert.equal(model.accentInsensitiveRegexWord("Beéle"), "b[eéèêë][eéèêë]l[eéèêë]");
  const pattern = new RegExp(model.accentInsensitiveRegexWord("Maria"), "i");
  assert.equal(pattern.test("María"), true);
  assert.equal(pattern.test("Maria"), true);
});

test("Deezer route broadens the query, deduplicates candidates and returns alternatives", async () => {
  const routeSource = compile(await readFile(new URL("../app/api/deezer/search/route.ts", import.meta.url), "utf8"))
    .replace('from "../../../../lib/music-search"', `from ${JSON.stringify(modelUrl)}`);
  const route = await import(dataUrl(routeSource));
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    const query = new URL(String(url)).searchParams.get("q");
    requested.push(query);
    if (query === "Boza x Elena Rose Orion") return Response.json({ data: [] });
    return Response.json({ data: [
      { id: 10, title: "Orión", title_short: "Orión", link: "https://www.deezer.com/track/10", duration: 180, preview: "", artist: { name: "Boza" }, album: { title: "Orion" } },
      { id: 11, title: "Orion (Karaoke)", link: "https://www.deezer.com/track/11", duration: 180, preview: "", artist: { name: "Tribute Band" }, album: { title: "Karaoke" } },
    ] });
  };
  try {
    const response = await route.POST(new Request("https://trackhunt.test/api/deezer/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: [{ clientId: 7, artist: "Boza x Elena Rose", title: "Orion" }] }),
    }));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.results[0].match.id, 10);
    assert.ok(data.results[0].searchedQueries.length >= 2);
    assert.ok(requested.some(query => query === "Orion Boza Elena Rose"));
    assert.equal(data.results[0].alternatives.some(row => row.id === 11), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
