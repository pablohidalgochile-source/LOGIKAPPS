import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import {
  createStudioApi,
  createLiveState,
  liveValue,
  updateLive,
  validateExport,
  loadCatalog,
} from "./server.mjs";
const root =
  process.env.FRATV_TEST_ROOT || resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(
  await readFile(join(root, "handoff/manifest.json"), "utf8"),
);
const initial = {
  mode: "countdown",
  durationMs: 10000,
  valueMs: 10000,
  running: false,
  visible: true,
  updatedAt: 1000,
};
test("La pausa y continuación conservan el reloj compartido sin deriva al consultar", () => {
  const started = updateLive(initial, { action: "start" }, 1000);
  assert.equal(liveValue(started, 3500), 7500);
  const paused = updateLive(started, { action: "pause" }, 3500);
  assert.equal(liveValue(paused, 9000), 7500);
  const continued = updateLive(paused, { action: "start" }, 9000);
  assert.equal(liveValue(continued, 10000), 6500);
  assert.equal(liveValue(continued, 999999), 0);
});
test("La configuración importada conserva duración, modo y hora objetivo", () => {
  assert.equal(
    createLiveState({ mode: "countdown", durationMs: 120000 }, 1000).valueMs,
    120000,
  );
  assert.equal(
    createLiveState({ mode: "countdown", durationMs: 0 }, 1000).valueMs,
    0,
  );
  assert.equal(
    createLiveState({ mode: "countdown", durationMs: 86400000 }, 1000)
      .durationMs,
    86400000,
  );
  assert.equal(
    createLiveState({ mode: "elapsed", durationMs: 120000 }, 1000).valueMs,
    0,
  );
  assert.equal(
    createLiveState(
      { mode: "countdown", targetTime: 6000, durationMs: 120000 },
      1000,
    ).valueMs,
    5000,
  );
  assert.equal(createLiveState({ targetTime: 500 }, 1000).valueMs, 0);
  assert.equal(createLiveState({ targetTime: 500 }, 1000).running, false);
  assert.equal(
    createLiveState({ targetTime: 1000 + 48 * 3600000 }, 1000).valueMs,
    48 * 3600000,
  );
  assert.equal(
    updateLive(
      initial,
      {
        action: "configure",
        mode: "countdown",
        targetTime: 1000 + 48 * 3600000,
      },
      1000,
    ).valueMs,
    48 * 3600000,
  );
  assert.throws(() =>
    createLiveState({ targetTime: 1000 + 367 * 86400000 }, 1000),
  );
  assert.throws(() => createLiveState({ targetTime: "fecha inválida" }, 1000));
  for (const durationMs of [-1, 86400001, Infinity, "incorrecto"])
    assert.throws(() => createLiveState({ durationMs }));
});
test("Hora objetivo, reinicio y cronómetro son modos reales", () => {
  const target = updateLive(
    initial,
    { action: "configure", mode: "countdown", targetTime: 11000 },
    1000,
  );
  assert.equal(liveValue(target, 6000), 5000);
  const elapsed = updateLive(
    initial,
    { action: "configure", mode: "elapsed", durationMs: 0 },
    1000,
  );
  assert.equal(
    liveValue(updateLive(elapsed, { action: "start" }, 1000), 4000),
    3000,
  );
  assert.equal(updateLive(target, { action: "reset" }, 6000).valueMs, 10000);
  assert.throws(() =>
    updateLive(initial, {
      action: "configure",
      mode: "countdown",
      durationMs: -1,
    }),
  );
});
const input = {
  items: [
    {
      id: "inicio",
      channel: "prueba",
      label: "Inicio",
      resourceId: "countdown",
      url: "/media/resources/countdown.html?aspecto=16%3A9",
      aspect: "16:9",
      time: 0,
      durationMs: 0,
    },
  ],
  formats: ["html"],
  project: { schema: "fratv-project", version: 1 },
};
test("Valida recursos y rechaza destinos ajenos, tiempos y formatos inválidos", () => {
  assert.equal(validateExport(input, manifest).items.length, 1);
  assert.throws(() =>
    validateExport(
      { ...input, items: [{ ...input.items[0], url: "http://example.com/" }] },
      manifest,
    ),
  );
  assert.throws(() =>
    validateExport(
      { ...input, items: [{ ...input.items[0], durationMs: Infinity }] },
      manifest,
    ),
  );
  assert.throws(() => validateExport({ ...input, formats: ["exe"] }, manifest));
});
test("HTTP: estado persistente, control compartido, ZIP portátil y cancelación de cola", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fratv-backend-test-"));
  let api = createStudioApi({ root, storageDir: dir });
  const server = createServer((req, res) =>
    api.middleware(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, method = body ? "POST" : "GET") => {
    const response = await fetch(origin + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const imported = (
      await call("/api/live/importado?mode=countdown&durationMs=120000")
    ).data;
    assert.equal(imported.durationMs, 120000);
    assert.equal(imported.valueMs, 120000);
    assert.equal(
      (await call("/api/live/importado?mode=elapsed&durationMs=7000")).data
        .mode,
      "countdown",
    );
    assert.equal((await call("/api/live/invalid?durationMs=-1")).status, 400);
    await call("/api/live/prueba", {
      action: "configure",
      mode: "countdown",
      durationMs: 60000,
    });
    await call("/api/live/prueba", { action: "start" });
    const a = (await call("/api/live/prueba")).data,
      b = (await call("/api/live/prueba")).data;
    assert(Math.abs(a.valueMs - b.valueMs) < 100);
    await call("/api/live/prueba", { action: "pause" });
    const before = (await call("/api/live/prueba")).data;
    await api.close();
    api = createStudioApi({ root, storageDir: dir });
    const after = (await call("/api/live/prueba")).data;
    assert.equal(after.valueMs, before.valueMs);
    assert.equal(after.running, false);
    const forbidden = await fetch(origin + "/api/live/prueba", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "hide" }),
    });
    assert.equal(forbidden.status, 403);
    const html = await (
      await fetch(origin + "/live/countdown?channel=prueba")
    ).text();
    assert(html.includes("window.setInterval=function(){return 0}"));
    assert(html.includes("/live-client.js"));
    assert(html.includes('<base href="/media/resources/">'));
    const one = await call("/api/exports", input);
    assert.equal(one.status, 202);
    const two = await call("/api/exports", input);
    assert.equal(two.status, 202);
    await call("/api/exports/" + two.data.id, null, "DELETE");
    let job;
    for (let i = 0; i < 100; i++) {
      job = (await call("/api/exports/" + one.data.id)).data;
      if (["completed", "failed", "cancelled"].includes(job.status)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(job.status, "completed", job.error);
    const seed = JSON.parse(
      await readFile(
        join(dir, "exports", one.data.id, "paquete/.estado-local/live.json"),
        "utf8",
      ),
    );
    assert.equal(seed.prueba.valueMs, before.valueMs);
    assert.equal(seed.prueba.running, false);
    const archive = await fetch(origin + job.download);
    assert.equal(archive.status, 200);
    assert.equal(archive.headers.get("content-type"), "application/zip");
    assert((await archive.arrayBuffer()).byteLength > 10000);
    assert.equal(
      (await call("/api/exports/" + two.data.id)).data.status,
      "cancelled",
    );
    assert.equal((await call("/api/exports")).data.length, 2);
  } finally {
    await api.close();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});

test("Fraternidad se combina sin reemplazar los recursos originales ni aceptar rutas ajenas", async () => {
  const combined = await loadCatalog(root);
  const fraternity = combined.resources.filter(r => r.catalog === "fraternidad");
  assert.equal(fraternity.length, 17);
  assert.deepEqual(combined.resources.slice(0, manifest.resources.length), manifest.resources);
  for (const resource of fraternity) {
    const config = { ...input, items: [{ ...input.items[0], resourceId: resource.id,
      url: `/media/${resource.file}?tipo=editorial`, durationMs: resource.durationMs }] };
    assert.equal(validateExport(config, combined).items[0].resource.id, resource.id);
    for (const url of ["/media/fraternidad/resources/desconocido.html", "/media/assets/eventos/fraternidad-insignia.png", `https://example.com/media/${resource.file}`])
      assert.throws(() => validateExport({ ...config, items: [{ ...config.items[0], url }] }, combined));
  }
  const start = fraternity.find(r => r.id === "fraternidad-start");
  assert.throws(() => validateExport({ ...input, items: [{ ...input.items[0], resourceId: start.id,
    url: `/media/${start.file}?liveDurationMs=-1` }] }, combined));
});

test("Fraternidad: fuentes vivas, ZIP completo y servidor portátil comparten el estado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fraternidad-backend-test-"));
  const api = createStudioApi({ root, storageDir: dir });
  const server = createServer((req, res) => api.middleware(req, res, () => res.writeHead(404).end()));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let portable;
  const request = async (path, body) => {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    assert(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
    return response;
  };
  try {
    const ids = ["fraternidad-start", "fraternidad-countdown", "fraternidad-live", "fraternidad-break"];
    for (const id of ids) {
      const response = await request(`/live/${id}?channel=${id}&aspecto=9:16&tipo=neutro&liveDurationMs=120000`);
      const html = await response.text();
      assert(html.includes('<base href="/media/fraternidad/resources/">'));
      assert(html.includes(`data-live-resource="${id}"`));
      assert(html.includes('/live-client.js'));
      assert(!html.includes('window.setInterval=function(){return 0}'), "El catálogo nuevo no debe bloquear intervalos globalmente.");
      const state = await (await request(`/api/live/${id}`)).json();
      assert.equal(state.mode, id === "fraternidad-live" ? "elapsed" : "countdown");
      assert.equal(state.valueMs, id === "fraternidad-live" ? 0 : 120000);
      await request(`/api/live/${id}`, { action: "start" });
      await new Promise(resolve => setTimeout(resolve, 30));
      await request(`/api/live/${id}`, { action: "pause" });
      const paused = await (await request(`/api/live/${id}`)).json();
      await request(`/live/${id}?channel=${id}&aspecto=16:9&liveDurationMs=90000`);
      const other = await (await request(`/api/live/${id}`)).json();
      assert.equal(other.valueMs, paused.valueMs, "El otro formato no puede reiniciar el canal.");
      await request(`/api/live/${id}`, { action: "reset" });
    }
    const config = { formats: ["html"], project: { schema: "fratv-project", version: 1 }, items: [
      ...ids.map(id => ({ id, label: id, channel: id, resourceId: id, aspect: "16:9", time: 1600,
        url: `/media/fraternidad/resources/${id}.html?tipo=editorial&aspecto=16:9`, durationMs: 7000 })),
      { id: "corte", label: "Transición", resourceId: "fraternidad-stinger", aspect: "9:16", time: 400,
        url: "/media/fraternidad/resources/fraternidad-stinger.html?tipo=aprobado", durationMs: 800 },
    ] };
    const created = await (await request("/api/exports", config)).json();
    let job;
    for (let i = 0; i < 100; i++) {
      job = await (await request(`/api/exports/${created.id}`)).json();
      if (["completed", "failed", "cancelled"].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(job.status, "completed", job.error);
    const archive = join(dir, "entrega.zip");
    await writeFile(archive, Buffer.from(await (await request(job.download)).arrayBuffer()));
    const extracted = join(dir, "entrega");
    await mkdir(extracted);
    execFileSync("unzip", ["-q", archive, "-d", extracted]);
    const packCatalog = await loadCatalog(extracted);
    assert.equal(packCatalog.resources.length, manifest.resources.length + 17);
    const details = JSON.parse(await readFile(join(extracted, "recursos.json"), "utf8"));
    assert.equal(details.items.filter(item => item.liveClock).length, 4);
    assert.equal(details.items.find(item => item.resourceId === "fraternidad-stinger").stingerCutMs, 400);
    assert.equal(details.sources.filter(source => source.clock).length, 4);
    const state = JSON.parse(await readFile(join(extracted, ".estado-local/live.json"), "utf8"));
    assert.equal(state["fraternidad-start"].valueMs, 120000);
    assert.equal(state["fraternidad-live"].valueMs, 0);
    portable = spawn(process.execPath, [join(extracted, "runtime/portable.mjs")], {
      env: { ...process.env, FRATV_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
    });
    const address = await new Promise((resolve, reject) => {
      let output = "", errors = "";
      const timer = setTimeout(() => reject(new Error(`El paquete no inició: ${errors}`)), 10000);
      portable.stderr.on("data", data => { errors += data; });
      portable.once("error", error => { clearTimeout(timer); reject(error); });
      portable.once("exit", code => { clearTimeout(timer); reject(new Error(`El paquete terminó (${code}): ${errors}`)); });
      portable.stdout.on("data", data => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const served = await fetch(address + details.sources[0].path);
    assert.equal(served.status, 200);
    assert((await served.text()).includes('/media/fraternidad/resources/'));
    const resource = packCatalog.resources.find(r => r.id === "fraternidad-start");
    const native = await fetch(`${address}/media/${resource.file}`);
    assert.equal(native.status, 200);
    for (const path of ["/media/assets/eventos/fraternidad-insignia.png", "/live-control?channel=fraternidad-start", "/live-client.js"])
      assert.equal((await fetch(address + path)).status, 200, `Falta ${path} en el paquete.`);
    const restored = await (await fetch(address + "/api/live/fraternidad-start")).json();
    assert.equal(restored.valueMs, 120000);
    assert.equal(restored.running, false);
  } finally {
    if (portable && portable.exitCode === null) {
      const closed = new Promise(resolve => portable.once("exit", resolve));
      portable.kill("SIGTERM");
      await closed;
    }
    await api.close();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
