import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const hostUrl = dataUrl(compile(await readFile(new URL("../lib/request-host.ts", import.meta.url), "utf8")));
const securitySource = compile(await readFile(new URL("../lib/request-security.ts", import.meta.url), "utf8"))
  .replaceAll('from "./request-host"', `from ${JSON.stringify(hostUrl)}`);
const { requireRequestUser } = await import(dataUrl(securitySource));

test("allows the local TrackHunt owner only on explicit loopback URLs", () => {
  for (const url of ["http://127.0.0.1:4391/api/video", "http://localhost:3000/api/video", "http://[::1]:4391/api/video"]) {
    const user = requireRequestUser(new Request(url));
    assert.equal(user.userId, "trackhunt-local-owner");
  }
});

test("keeps hosted TrackHunt protected when identity headers are absent", async () => {
  const result = requireRequestUser(new Request("https://trackhunt-dj.nanook.chatgpt.site/api/video"));
  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).code, "AUTH_REQUIRED");
});

test("prefers authenticated Site identity over the local fallback", () => {
  const user = requireRequestUser(new Request("http://127.0.0.1:4391/api/video", {
    headers: {
      "oai-authenticated-user-id": "real-user",
      "oai-authenticated-user-email": "dj@example.test",
    },
  }));
  assert.equal(user.userId, "real-user");
  assert.equal(user.email, "dj@example.test");
});
