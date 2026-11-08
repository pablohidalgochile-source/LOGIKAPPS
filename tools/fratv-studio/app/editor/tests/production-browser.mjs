import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const root = process.argv[2] || resolve(import.meta.dirname, "../..");
const require = createRequire(join(root, "scripts/package.json")),
  puppeteer = require("puppeteer-core");
const { CHROME } = await import(
  pathToFileURL(join(root, "scripts/chrome.mjs"))
);
const out = join(tmpdir(), "fratv-export-ui-" + Date.now());
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
page.setDefaultTimeout(25000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://127.0.0.1:5178";
async function click(text) {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === t,
    );
    if (!b) throw Error("Botón " + t);
    b.click();
  }, text);
}
async function ready(id) {
  await page.waitForFunction(
    (id) => {
      const f = document.querySelector("iframe");
      return f?.contentWindow?.FRATV?.meta.id === id && f.style.opacity === "1";
    },
    { polling: 100 },
    id,
  );
}
async function api(channel, body) {
  const r = await fetch(
    `${base}/api/live/${channel}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  assert(r.ok, await r.clone().text());
  return r.json();
}
try {
  await page.goto(base, { waitUntil: "networkidle2" });
  await page.click('[data-resource="ident-short"]');
  await ready("ident-short");
  await click("Exportar");
  await page.waitForSelector(".export-dialog");
  await page.evaluate(() => {
    for (const label of document.querySelectorAll(".export-option")) {
      const input = label.querySelector("input");
      if (!input.checked) input.click();
    }
  });
  await click("Exportar paquete");
  await page.waitForFunction(
    () =>
      document.querySelector(".export-progress a[download]") ||
      document.querySelector(".export-progress .workflow-error"),
    { polling: 200, timeout: 180000 },
  );
  const failure = await page.$(".export-progress .workflow-error");
  assert(!failure, failure ? await failure.evaluate((e) => e.textContent) : "");
  const href = await page.$eval(".export-progress a[download]", (a) => a.href);
  const response = await fetch(href);
  assert(response.ok);
  const zip = join(out, "programa.zip");
  await writeFile(zip, Buffer.from(await response.arrayBuffer()));
  const unpack = join(out, "paquete");
  await mkdir(unpack);
  execFileSync("unzip", ["-q", zip, "-d", unpack]);
  const files = await readdir(join(unpack, "16x9"));
  for (const ext of [".png", ".mov", ".mp4"])
    assert(
      files.some((f) => f.endsWith(ext)),
      ext + " ausente",
    );
  const mov = join(
    unpack,
    "16x9",
    files.find((f) => f.endsWith(".mov")),
  );
  const mp4 = join(
    unpack,
    "16x9",
    files.find((f) => f.endsWith(".mp4")),
  );
  const probe = (f) =>
    JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-of", "json", f],
        { encoding: "utf8" },
      ),
    ).streams[0];
  assert.equal(probe(mov).codec_name, "prores");
  assert(probe(mov).pix_fmt.includes("a"));
  assert.equal(probe(mp4).codec_name, "h264");
  const project = JSON.parse(
    await readFile(join(unpack, "proyecto.fratv.json"), "utf8"),
  );
  assert.equal(project.schema, "fratv-project");
  console.log(
    "✓ Exportación desde la interfaz: ZIP descargado con PNG, MOV ProRes con alfa, MP4 H.264 y proyecto editable.",
  );
  await page.screenshot({ path: join(out, "exportador.png") });
  await page.click('[aria-label="Cerrar exportador"]');
  await page.click('[data-resource="countdown"]');
  await ready("countdown");
  await click("En vivo");
  await page.waitForSelector('[aria-label="URL de la fuente OBS"]');
  const source = await page.$eval(
    '[aria-label="URL de la fuente OBS"]',
    (i) => i.value,
  );
  const channel = new URL(source).searchParams.get("channel");
  await page.$eval('[aria-label="Duración en minutos"]', (el) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, "1");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Aplicar duración");
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("fratv.projects.v1")).some(
        (p) => p.live?.countdown?.durationMs === 60000,
      ),
    { polling: 100 },
  );
  assert.equal((await api(channel)).durationMs, 60000);
  console.log(
    "✓ La duración configurada desde el panel se guarda en el proyecto.",
  );
  const a = await browser.newPage(),
    b = await browser.newPage();
  for (const tab of [a, b]) {
    // El runtime aprobado espera un cuadro RAF; Chrome no lo entrega a pestañas ocultas.
    await tab.bringToFront();
    await tab.goto(source, { waitUntil: "networkidle2" });
    await tab.waitForFunction(
      () => document.documentElement.dataset.liveReady === "1" && document.body.style.visibility === "visible",
      { polling: 100 },
    );
  }
  await page.bringToFront();
  // Una vez preparadas, ambas fuentes siguen recibiendo el reloj en segundo plano.
  for (const tab of [a, b]) assert.equal(await tab.evaluate(() => document.visibilityState), "hidden");
  await click("Ver la fuente en vivo en el lienzo");
  await page.waitForFunction(
    () => document.querySelector("iframe").src.includes("/live/"),
    { polling: 100 },
  );
  await click("Iniciar reloj");
  await new Promise((r) => setTimeout(r, 1500));
  await click("Pausar reloj");
  await new Promise((r) => setTimeout(r, 700));
  const read = (tab) =>
    tab.$eval('[data-v="largo"] [data-field="reloj"]', (e) => e.textContent);
  const va = await read(a),
    vb = await read(b);
  assert.equal(va, vb);
  assert.notEqual(va, "00:01:00");
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await read(a), va);
  await b.bringToFront();
  await b.reload({ waitUntil: "networkidle2" });
  await b.waitForFunction(
    () => document.documentElement.dataset.liveReady === "1" && document.body.style.visibility === "visible",
    { polling: 100 },
  );
  assert.equal(await read(b), va);
  await page.bringToFront();
  await click("Ocultar gráfica");
  await a.waitForFunction(() => document.body.style.visibility === "hidden", {
    polling: 100,
  });
  await click("Mostrar gráfica");
  await a.waitForFunction(() => document.body.style.visibility === "visible", {
    polling: 100,
  });
  await click("Reiniciar");
  await a.waitForFunction(
    () =>
      document.querySelector('[data-v="largo"] [data-field="reloj"]')
        .textContent === "00:01:00",
    { polling: 100 },
  );
  console.log(
    "✓ Dos fuentes de navegador comparten reloj; iniciar, pausar, recargar, ocultar y reiniciar funcionan desde la interfaz.",
  );
  await page.screenshot({ path: join(out, "control-vivo.png") });
  assert.deepEqual(errors, []);
  await writeFile(
    join(out, "resultado.json"),
    JSON.stringify(
      { zip, mov: probe(mov), mp4: probe(mp4), clock: va, errors },
      null,
      2,
    ),
  );
  console.log("Resultados: " + out);
} catch (e) {
  await page.screenshot({ path: join(out, "fallo.png") }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
