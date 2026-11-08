/* Integración de proyectos, episodios, plantillas e importación/exportación.
   Uso desde editor/tests: node projects-browser.mjs [raíz del repositorio] [URL]. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
const root = resolve(process.argv[2] || resolve(import.meta.dirname, "../.."));
const url = process.argv[3] || "http://127.0.0.1:5178";
const require = createRequire(join(root, "scripts/package.json"));
const puppeteer = require("puppeteer-core");
const { buscarChrome } = await import(
  pathToFileURL(join(root, "scripts/chrome.mjs")).href
);
const runId = Date.now().toString(36);
const out =
  process.env.FRATV_QA_OUTPUT || join(tmpdir(), `fratv-projects-qa-${runId}`);
const downloads = join(out, "descargas");
await mkdir(downloads, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: buscarChrome(),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
page.setDefaultTimeout(20000);
const client = await page.createCDPSession();
await client.send("Page.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: downloads,
});
const errors = [],
  failures = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (
    r.url().startsWith(url) &&
    r.status() >= 400 &&
    !r.url().endsWith("/favicon.ico")
  )
    failures.push(`${r.status()} ${r.url()}`);
});
const pass = (s) => {
  checks.push(s);
  console.log(`✓ ${s}`);
};
async function click(text, scope = "") {
  const handle = await page.evaluateHandle(
    (label, selector) =>
      [
        ...(selector
          ? document.querySelector(selector)
          : document
        ).querySelectorAll("button"),
      ].find((el) => el.textContent.trim() === label),
    text,
    scope,
  );
  assert(handle.asElement(), `Botón «${text}» no encontrado.`);
  await handle.asElement().click();
  await handle.dispose();
}
async function control(label, tag = "input,select,textarea") {
  const handle = await page.evaluateHandle(
    (label, tag) =>
      [...document.querySelectorAll(tag)].find(
        (el) =>
          el.getClientRects().length &&
          (el.getAttribute("aria-label") === label ||
            [...(el.labels || [])].some(
              (l) =>
                l.textContent.trim() === label ||
                l.textContent.trim().startsWith(label),
            )),
      ),
    label,
    tag,
  );
  assert(handle.asElement(), `Campo «${label}» no encontrado.`);
  return handle.asElement();
}
async function input(label, value) {
  const el = await control(label);
  await el.evaluate((e) => {
    e.focus();
    e.select();
  });
  await page.keyboard.press("Backspace");
  await el.type(value);
  await el.dispose();
}
async function storage() {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fratv.projects.v1") || "[]"),
  );
}
async function saved(name) {
  await page.waitForFunction(
    (name) =>
      document
        .querySelector(".project-heading")
        ?.textContent.includes("Guardado en este navegador") &&
      JSON.parse(localStorage.getItem("fratv.projects.v1") || "[]").some(
        (p) => p.name === name,
      ),
    {},
    name,
  );
}
async function open() {
  if (!(await page.$(".project-dialog"))) await click("Programa y proyectos");
  await page.waitForSelector(".project-dialog");
}
async function close() {
  await page.click('[aria-label="Cerrar preparación de programa"]');
  await page.waitForSelector(".project-dialog", { hidden: true });
}
async function ready(id) {
  await page.waitForFunction(
    (id) => {
      const frame = document.querySelector(
        'iframe[title="Vista previa del recurso"]',
      );
      return (
        frame?.contentWindow?.FRATV?.meta.id === id &&
        frame.style.opacity === "1" &&
        document
          .querySelector(".statusbar")
          ?.textContent.includes("Vista previa lista")
      );
    },
    {},
    id,
  );
}
async function rowButton(label) {
  const handle = await page.evaluateHandle(
    (label) =>
      [...document.querySelectorAll(".program-items>button")].find(
        (b) => b.querySelector("strong")?.textContent === label,
      ),
    label,
  );
  assert(handle.asElement(), `Pieza «${label}» no encontrada.`);
  await handle.asElement().click();
  await handle.dispose();
  await page.waitForSelector(".project-dialog", { hidden: true });
}
try {
  await page.goto(url, { waitUntil: "networkidle2" });
  await ready("lower-third");
  const projectName = `QA programa ${runId}`,
    templateName = `QA plantilla ${runId}`;
  await open();
  await click("Mis proyectos", ".project-dialog");
  await input("Nombre del nuevo proyecto", projectName);
  await click("Crear proyecto", ".project-dialog");
  await saved(projectName);
  await input("Nombre del programa", "Conversaciones QA");
  await input("Conductor o conductora", "Ana QA");
  await input("Cargo del conductor", "Conductora");
  await click("＋ Agregar invitado", ".project-dialog");
  await input("Invitado 1", "Invitada QA");
  await input("Cargo del invitado 1", "Directora");
  await input("Temas del episodio", "Cultura\nComunidad");
  await click("Plantilla", ".project-dialog");
  for (const desired of [
    "Nombre y cargo",
    "Cuenta regresiva",
    "Identidad breve",
  ])
    assert(
      await page.evaluate(
        (name) =>
          [...document.querySelectorAll(".template-resources label")].some(
            (l) => l.querySelector("strong")?.textContent === name,
          ),
        desired,
      ),
    );
  const labels = await page.$$(".template-resources label");
  for (const label of labels) {
    const state = await label.evaluate((l) => ({
      name: l.querySelector("strong").textContent,
      checked: l.querySelector("input").checked,
    }));
    const want = [
      "Nombre y cargo",
      "Cuenta regresiva",
      "Identidad breve",
    ].includes(state.name);
    if (state.checked !== want) await label.click();
  }
  await input("Nombre de esta plantilla", templateName);
  await click("Guardar plantilla reutilizable", ".project-dialog");
  await page.waitForFunction(() =>
    document
      .querySelector(".project-message")
      ?.textContent.includes("Plantilla guardada"),
  );
  await click("Episodio", ".project-dialog");
  await click("Preparar todas las piezas", ".project-dialog");
  await page.waitForFunction(
    () => document.querySelectorAll(".program-items>button").length === 4,
  );
  await saved(projectName);
  let original = (await storage()).find((p) => p.name === projectName);
  assert.equal(
    original.items.filter((i) => i.resourceId === "lower-third").length,
    2,
  );
  assert.equal(original.items.length, 4);
  pass(
    "Un programa genera una placa por persona y las demás piezas seleccionadas.",
  );
  await rowButton("Nombre · Invitada QA");
  await ready("lower-third");
  await input("Cargo", "Directora editada");
  await saved(projectName);
  await page.waitForFunction(
    () =>
      document
        .querySelector("iframe")
        ?.contentDocument?.querySelector('[data-field="role"]')?.textContent ===
      "Directora editada",
  );
  original = (await storage()).find((p) => p.name === projectName);
  const guestId = original.items.find(
    (i) => i.label === "Nombre · Invitada QA",
  ).id;
  await page.reload({ waitUntil: "networkidle2" });
  await ready("lower-third");
  const piece = await control("Pieza del episodio", "select");
  await piece.select(guestId);
  await piece.dispose();
  await ready("lower-third");
  assert.equal(
    await (await control("Cargo")).evaluate((el) => el.value),
    "Directora editada",
  );
  pass("La edición de una pieza sobrevive a una recarga completa del editor.");
  await open();
  await click("Plantilla", ".project-dialog");
  const templateSelect = await control("Partir de una plantilla", "select");
  assert(
    await templateSelect.evaluate(
      (el, name) =>
        [...el.options].some((o) => o.textContent === `${name} · guardada`),
      templateName,
    ),
  );
  await close();
  await open();
  await click("Plantilla", ".project-dialog");
  assert(
    await (
      await control("Partir de una plantilla", "select")
    ).evaluate(
      (el, name) =>
        [...el.options].some((o) => o.textContent === `${name} · guardada`),
      templateName,
    ),
  );
  pass("La plantilla guardada permanece disponible al reabrir el panel.");
  await click("Mis proyectos", ".project-dialog");
  await click("Duplicar episodio actual", ".project-dialog");
  const copyName = `${projectName} · copia`;
  await saved(copyName);
  await input("Nombre del programa", "Programa de la copia");
  await saved(copyName);
  let all = await storage();
  assert.equal(
    all.find((p) => p.id === original.id).episode.program,
    "Conversaciones QA",
  );
  assert.equal(
    all.find((p) => p.name === copyName).episode.program,
    "Programa de la copia",
  );
  pass("Duplicar un episodio permite cambiarlo sin alterar el original.");
  await click("Importador general", ".project-dialog");
  const briefFile = join(out, "brief.txt");
  await writeFile(
    briefFile,
    "Programa: Programa desde brief\nInvitado: Bruno Pérez | Músico\nTema: Estreno\nInstrucción desconocida: no aplicar",
  );
  const txt = await page.$('input[type="file"][accept=".txt,text/plain"]');
  await txt.uploadFile(briefFile);
  await page.waitForSelector(".brief-preview");
  assert(
    await page.$eval(".brief-preview", (el) =>
      el.textContent.includes("no reconocida"),
    ),
  );
  const beforeBrief = (await storage()).find((p) => p.name === copyName);
  assert.equal(beforeBrief.episode.program, "Programa de la copia");
  await click("Aplicar al episodio", ".project-dialog");
  await saved(copyName);
  all = await storage();
  const briefProject = all.find((p) => p.name === copyName);
  assert.equal(briefProject.episode.program, "Programa desde brief");
  assert.equal(briefProject.episode.guests[0].name, "Bruno Pérez");
  assert.equal(
    briefProject.items.find((i) => i.id === guestId).values.role,
    "Directora editada",
  );
  pass(
    "El brief TXT requiere revisión, informa etiquetas desconocidas y conserva piezas ya editadas.",
  );
  await click("Importador general", ".project-dialog");
  const invalidFile = join(out, "invalido.json");
  await writeFile(invalidFile, JSON.stringify({ schema: "otro", version: 99 }));
  const projectFile = await page.$(
    'input[aria-label="Importar proyecto FRATV"]',
  );
  await projectFile.uploadFile(invalidFile);
  await page.waitForSelector(".project-message.error");
  assert.equal(
    (await storage()).find((p) => p.name === copyName).episode.program,
    "Programa desde brief",
  );
  assert.equal(await page.$(".brief-preview"), null);
  pass("Un archivo incompatible se rechaza sin reemplazar el proyecto actual.");
  await click("Exportar proyecto .fratv.json", ".project-dialog");
  let files = [];
  for (let n = 0; n < 50; n++) {
    files = (await readdir(downloads)).filter((f) => f.endsWith(".fratv.json"));
    if (files.length) break;
    await delay(100);
  }
  assert.equal(files.length, 1, "No se descargó el proyecto.");
  const downloadedPath = join(downloads, files[0]);
  const exported = JSON.parse(await readFile(downloadedPath, "utf8"));
  assert.equal(exported.schema, "fratv-project");
  assert.equal(exported.version, 1);
  assert.equal(exported.episode.program, "Programa desde brief");
  assert.equal(
    exported.items.find((i) => i.id === guestId).values.role,
    "Directora editada",
  );
  const beforeCount = (await storage()).length;
  await projectFile.uploadFile(downloadedPath);
  await page.waitForSelector(".brief-preview");
  await click("Importar como copia", ".project-dialog");
  await page.waitForFunction(
    (count) =>
      JSON.parse(localStorage.getItem("fratv.projects.v1")).length === count,
    {},
    beforeCount + 1,
  );
  all = await storage();
  const imported = all
    .filter((p) => p.name === copyName)
    .find((p) => p.id !== exported.id);
  assert(imported);
  assert.notEqual(imported.id, exported.id);
  assert.deepEqual(imported.items, exported.items);
  assert.deepEqual(imported.episode, exported.episode);
  assert.deepEqual(imported.template, exported.template);
  pass(
    "El exportador descarga un proyecto completo que vuelve a importarse como copia equivalente.",
  );
  await page.screenshot({
    path: join(out, "programa-escritorio.png"),
    fullPage: true,
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await delay(100);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Desborde horizontal del panel en móvil.",
  );
  await page.screenshot({
    path: join(out, "programa-movil.png"),
    fullPage: true,
  });
  pass("El formulario y su paquete caben en escritorio y móvil.");
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  pass("Sin errores JavaScript ni respuestas locales fallidas.");
  await writeFile(
    join(out, "resultado.json"),
    JSON.stringify({ checks, errors, failures, downloads: files }, null, 2),
  );
  console.log(`Pruebas completas. Capturas y respaldo: ${out}`);
} catch (error) {
  await page
    .screenshot({ path: join(out, "fallo.png"), fullPage: true })
    .catch(() => {});
  await writeFile(
    join(out, "fallo.json"),
    JSON.stringify({ error: String(error), checks, errors, failures }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
