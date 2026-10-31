import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const runtimeSource = await readFile(new URL("../lib/acrcloud-runtime.ts", import.meta.url), "utf8");
const routeUrls = [
  "../app/api/mix/config/route.ts",
  "../app/api/mix/start/route.ts",
  "../app/api/mix/status/route.ts",
  "../app/api/connections/status/route.ts",
];

test("ACRCloud runtime values come from Cloudflare bindings with a local fallback", () => {
  assert.match(runtimeSource, /cloudflare:workers/);
  assert.match(runtimeSource, /bindings\[key\]/);
  assert.match(runtimeSource, /process\.env\[key\]/);
});

test("every hosted ACRCloud route uses the runtime binding adapter", async () => {
  for (const routeUrl of routeUrls) {
    const source = await readFile(new URL(routeUrl, import.meta.url), "utf8");
    assert.match(source, /currentAcrCloudEnv\(\)/, routeUrl);
    assert.doesNotMatch(source, /process\.env\.ACRCLOUD_/, routeUrl);
  }
});
