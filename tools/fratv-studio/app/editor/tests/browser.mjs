/* Pruebas de integración del editor local con los recursos reales aprobados.
   Uso: node /tmp/fratv-editor-smoke.mjs [raíz del repositorio] [URL del editor] */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";

const root = resolve(process.argv[2] || resolve(import.meta.dirname, "../.."));
const url = process.argv[3] || "http://127.0.0.1:5178";
const require = createRequire(join(root, "scripts/package.json"));
const puppeteer = require("puppeteer-core");
const { buscarChrome } = await import(
  pathToFileURL(join(root, "scripts/chrome.mjs")).href
);
const manifest = JSON.parse(
  await readFile(join(root, "handoff/manifest.json"), "utf8"),
);
const out = process.env.FRATV_QA_OUTPUT || join(tmpdir(), "fratv-editor-qa");
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: buscarChrome(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
page.setDefaultTimeout(20000);
const errors = [],
  localFailures = [],
  externalFailures = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", (request) => {
  const message = `${request.url()} — ${request.failure()?.errorText}`;
  if (request.failure()?.errorText === "net::ERR_ABORTED") return;
  (request.url().startsWith(url) ? localFailures : externalFailures).push(
    message,
  );
});
page.on("response", (response) => {
  if (
    response.url().startsWith(url) &&
    response.status() >= 400 &&
    !response.url().endsWith("/favicon.ico")
  ) {
    localFailures.push(`${response.status()} ${response.url()}`);
  }
});
function pass(message) {
  checks.push(message);
  console.log(`✓ ${message}`);
}

async function elementByLabel(text, tag) {
  const handle = await page.evaluateHandle(
    (label, tagName) => {
      const controls = [
        ...document.querySelectorAll(tagName || "input, select, textarea"),
      ];
      return (
        controls.find(
          (el) =>
            el.getAttribute("aria-label") === label ||
            [...(el.labels || [])].some(
              (item) =>
                item.textContent.trim() === label ||
                item.textContent.trim().startsWith(label),
            ),
        ) || null
      );
    },
    text,
    tag,
  );
  const element = handle.asElement();
  assert(element, `No se encontró el control «${text}».`);
  return element;
}
async function input(text, value) {
  const el = await elementByLabel(text);
  await el.evaluate((control) => {
    control.focus();
    control.select();
  });
  await page.keyboard.press("Backspace");
  await el.type(value);
  await el.dispose();
}
async function select(text, value) {
  const el = await elementByLabel(text, "select");
  await el.select(value);
  await el.dispose();
  const params = { Formato: "aspecto", Tema: "tema", Tipografía: "tipo" };
  if (params[text]) {
    const id = await page.$eval(
      '[data-resource][aria-pressed="true"]',
      (el) => el.dataset.resource,
    );
    await currentFrame(id, { [params[text]]: value });
  }
}
async function clickText(text) {
  const el = await page.evaluateHandle(
    (label) =>
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === label,
      ),
    text,
  );
  assert(el.asElement(), `No se encontró el botón «${text}».`);
  await el.asElement().click();
  await el.dispose();
}
async function currentFrame(id, params = {}) {
  await page.waitForFunction(
    (expected, expectedParams) => {
      const iframe = document.querySelector(
        'iframe[title="Vista previa del recurso"]',
      );
      const win = iframe?.contentWindow;
      if (
        !win ||
        win.FRATV?.meta?.id !== expected ||
        iframe.style.opacity !== "1" ||
        !document
          .querySelector(".statusbar")
          ?.textContent.includes("Vista previa lista")
      )
        return false;
      const query = new URL(win.location.href).searchParams;
      return Object.entries(expectedParams).every(
        ([key, value]) => query.get(key) === value,
      );
    },
    {},
    id,
    params,
  );
  const el = await page.$('iframe[title="Vista previa del recurso"]');
  const frame = await el.contentFrame();
  await frame.evaluate(async () => {
    await window.FRATV.ready;
  });
  return frame;
}
async function resource(id) {
  const el = await page.$(`[data-resource="${id}"]`);
  assert(el, `No existe el recurso ${id} en la biblioteca.`);
  await el.click();
  return currentFrame(id);
}
async function animations() {
  const el = await page.$('iframe[title="Vista previa del recurso"]');
  return (await el.contentFrame()).evaluate(() =>
    document.getAnimations().map((a) => ({
      time: Number(a.currentTime),
      state: a.playState,
    })),
  );
}
async function button(label) {
  await page.click(`button[aria-label="${label}"]`);
}
async function controlDisabled(label) {
  return page.$eval(`[aria-label="${label}"]`, (el) => el.disabled);
}
async function ensureTab(label, control) {
  const shown = await page.evaluate(
    (name) =>
      [...document.querySelectorAll("select")].some(
        (el) =>
          el.offsetParent !== null &&
          (el.getAttribute("aria-label") === name ||
            [...el.labels].some((l) => l.textContent.trim() === name)),
      ),
    control,
  );
  if (!shown) await clickText(label);
}

try {
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-resource="lower-third"]');
  const extra = JSON.parse(await readFile(join(root, "handoff/fraternidad/manifest.json"), "utf8"));
  assert.equal(await page.$$eval("[data-resource]", (els) => els.length), manifest.resources.length + extra.resources.length);
  for (const item of manifest.resources) {
    const frame = await resource(item.id);
    const actual = await frame.evaluate(() => ({
      id: window.FRATV.meta.id,
      w: innerWidth,
      h: innerHeight,
    }));
    assert.equal(actual.id, item.id);
    assert(actual.w > 0 && actual.h > 0, `${item.id} cargó sin tamaño.`);
  }
  pass("Los 18 recursos cargan con runtime y viewport válido.");

  let frame = await resource("lower-third");
  await input("Nombre", "PRUEBA NANOOK");
  await page.waitForFunction(
    () =>
      document
        .querySelector('iframe[title="Vista previa del recurso"]')
        ?.contentDocument?.querySelector('[data-field="name"]')?.textContent ===
      "PRUEBA NANOOK",
  );
  await resource("ident-short");
  frame = await resource("lower-third");
  assert.equal(
    await frame.$eval('[data-field="name"]', (el) => el.textContent),
    "PRUEBA NANOOK",
  );
  pass(
    "El nombre editado aparece en el recurso y se conserva al cambiar la selección.",
  );
  await resource("lower-third");
  assert.equal(
    await controlDisabled("Reproducir"),
    false,
    "Volver a elegir el recurso activo no debe bloquear la vista previa.",
  );
  pass(
    "Volver a elegir el recurso activo mantiene la vista previa disponible.",
  );

  const nameInput = await elementByLabel("Nombre");
  await nameInput.focus();
  await page.keyboard.press("End");
  await nameInput.type("X");
  await page.keyboard.press("Backspace");
  await delay(250);
  frame = await currentFrame("lower-third", { name: "PRUEBA NANOOK" });
  assert.equal(
    await frame.$eval('[data-field="name"]', (el) => el.textContent),
    "PRUEBA NANOOK",
  );
  assert.equal(await controlDisabled("Reproducir"), false);
  await nameInput.dispose();
  pass(
    "Escribir y borrar rápido conserva el contenido y recupera una vista previa lista.",
  );

  await select("Formato", "9:16");
  await page.waitForFunction(() => {
    const w = document.querySelector(
      'iframe[title="Vista previa del recurso"]',
    )?.contentWindow;
    return (
      w?.FRATV?.aspecto === "9:16" &&
      w.innerWidth === 1080 &&
      w.innerHeight === 1920
    );
  });
  frame = await currentFrame("lower-third");
  assert.equal(
    await frame.$eval('[data-field="name"]', (el) => el.textContent),
    "PRUEBA NANOOK",
  );
  await page.screenshot({
    path: join(out, "editor-vertical.png"),
    fullPage: true,
  });
  pass(
    "El formato vertical conserva el texto y usa un lienzo real de 1080 × 1920.",
  );

  await select("Formato", "16:9");
  await currentFrame("lower-third");
  await button("Volver al inicio");
  await button("Cuadro siguiente");
  await delay(100);
  let times = await animations();
  assert(times.length > 0, "El recurso animado no tiene animaciones.");
  assert(
    times.some((a) => a.time > 0 && a.time < 35),
    "Cuadro siguiente no avanzó un cuadro de 60 fps.",
  );
  await button("Cuadro anterior");
  await delay(100);
  times = await animations();
  assert(
    times.every((a) => Math.abs(a.time) < 1),
    "Cuadro anterior no volvió al comienzo.",
  );
  await button("Reproducir");
  await delay(250);
  await button("Pausar");
  await delay(100);
  const paused = await animations();
  assert(
    paused.some((a) => a.time > 100),
    "La reproducción no avanza el recurso.",
  );
  await delay(200);
  const later = await animations();
  assert.deepEqual(
    later,
    paused,
    "El recurso continúa avanzando después de pausar.",
  );
  pass(
    "Los controles avanzan cuadro a cuadro, reproducen y mantienen una pausa estable.",
  );

  const time = await elementByLabel("Tiempo", "input");
  await time.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, "4500");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await delay(150);
  assert(
    (await animations()).some((a) => Math.abs(a.time - 4500) < 20),
    "El deslizador no aplica seek al recurso.",
  );
  pass("El deslizador aplica el tiempo al runtime determinista.");

  await ensureTab("Estilo", "Tema");
  await select("Tema", "fratv-invertido");
  await page.waitForFunction(() => {
    const doc = document.querySelector(
      'iframe[title="Vista previa del recurso"]',
    )?.contentDocument;
    return (
      doc &&
      doc.documentElement.style.getPropertyValue("--fr-text").toUpperCase() ===
        "#100B18"
    );
  });
  await select("Tipografía", "editorial");
  await page.waitForFunction(() => {
    const doc = document.querySelector(
      'iframe[title="Vista previa del recurso"]',
    )?.contentDocument;
    return doc?.documentElement.style
      .getPropertyValue("--fr-font-display")
      .includes("Instrument Sans");
  });
  frame = await currentFrame("lower-third", { tipo: "editorial" });
  assert(
    await frame.evaluate(
      () =>
        document.fonts.check('600 54px "Instrument Sans"', "PRUEBA NANOOK") &&
        [...document.fonts].some(
          (face) =>
            face.family.includes("Instrument Sans") && face.status === "loaded",
        ),
    ),
    "La tipografía editorial debe estar descargada, no solo declarada como variable CSS.",
  );
  pass(
    "El tema llega al runtime y la tipografía editorial está realmente cargada.",
  );
  await select("Tema", "fratv-oficial");
  await select("Tipografía", "aprobado");

  await select("Formato", "1:1");
  await resource("stinger");
  await currentFrame("stinger", { aspecto: "16:9" });
  assert.equal(
    await (
      await elementByLabel("Formato", "select")
    ).evaluate((el) => el.value),
    "16:9",
  );
  const format = await elementByLabel("Formato", "select");
  const options = await format.evaluate((el) =>
    [...el.options]
      .filter((option) => !option.disabled)
      .map((option) => option.value),
  );
  assert.deepEqual(options.sort(), ["16:9", "9:16"]);
  pass(
    "El stinger solo permite 16:9 y 9:16; al venir de 1:1 vuelve automáticamente a horizontal.",
  );

  await clickText("Contenido");
  frame = await resource("schedule");
  await input("Programa", "ESTRENO DE PRUEBA");
  await page.waitForFunction(
    () =>
      document
        .querySelector('iframe[title="Vista previa del recurso"]')
        ?.contentDocument?.querySelector("#filas .fila .nom")?.textContent ===
      "ESTRENO DE PRUEBA",
  );
  frame = await currentFrame("schedule");
  assert.equal(await frame.$$eval("#filas .fila", (rows) => rows.length), 3);
  await clickText("＋ Agregar fila");
  await page.waitForFunction(
    () =>
      document
        .querySelector('iframe[title="Vista previa del recurso"]')
        ?.contentDocument?.querySelectorAll("#filas .fila").length === 4,
  );
  await currentFrame("schedule");
  await button("Eliminar fila 4");
  await page.waitForFunction(
    () =>
      document
        .querySelector('iframe[title="Vista previa del recurso"]')
        ?.contentDocument?.querySelectorAll("#filas .fila").length === 3,
  );
  await currentFrame("schedule");
  pass(
    "La programación refleja la edición, incorporación y eliminación de filas.",
  );

  await resource("bumper-out");
  await input("Redes", "@NANOOK\nCANAL DE PRUEBA");
  await currentFrame("bumper-out", {
    social1: "@NANOOK",
    social2: "CANAL DE PRUEBA",
  });
  frame = await currentFrame("bumper-out");
  assert.deepEqual(
    await frame.$$eval(
      '[data-field="social1"], [data-field="social2"]',
      (els) => els.map((el) => el.textContent),
    ),
    ["@NANOOK", "CANAL DE PRUEBA"],
  );
  pass(
    "Las dos redes de la cortinilla se traducen a los campos reales social1 y social2.",
  );

  await resource("engagement");
  for (const label of ["comentario", "votacion", "meta"]) {
    const checkbox = await elementByLabel(label, 'input[type="checkbox"]');
    assert(
      await checkbox.evaluate((el) => el.checked),
      `El módulo ${label} debe comenzar activo.`,
    );
    await checkbox.click();
  }
  frame = await currentFrame("engagement", { modules: "ninguno" });
  assert(
    await frame.$$eval(
      "[data-mod]",
      (els) => els.length === 3 && els.every((el) => el.hidden),
    ),
  );
  const comment = await elementByLabel("comentario", 'input[type="checkbox"]');
  await comment.click();
  frame = await currentFrame("engagement", { modules: "comentario" });
  assert.deepEqual(
    await frame.$$eval("[data-mod]", (els) =>
      els.filter((el) => !el.hidden).map((el) => el.dataset.mod),
    ),
    ["comentario"],
  );
  pass("Los módulos pueden desactivarse todos y volver a activar solo uno.");

  await resource("ticker");
  await input("Velocidad", "12");
  await page.keyboard.press("Enter");
  await currentFrame("ticker", { speed: "12" });
  assert.equal(
    await (await elementByLabel("Velocidad")).evaluate((el) => el.value),
    "12",
  );
  pass(
    "La velocidad permite escribir un número completo y se aplica al confirmar.",
  );

  await resource("end-credits");
  assert(
    await page.evaluate(() => {
      const speed = document.getElementById("field-speed");
      return (
        (!speed || speed.disabled) &&
        document
          .querySelector(".inspector")
          ?.textContent.includes("duración fija de 22 segundos")
      );
    }),
    "La velocidad de créditos debe quedar sin edición y explicar su duración fija.",
  );
  frame = await currentFrame("end-credits");
  assert.equal(await frame.evaluate(() => window.FRATV.meta.durationMs), 22000);
  pass(
    "Los créditos declaran su duración fija y no ofrecen una velocidad sin efecto.",
  );

  await resource("flag");
  assert(
    await controlDisabled("Reproducir"),
    "La mosca estática no debe ofrecer reproducción.",
  );
  await resource("countdown");
  assert(
    await controlDisabled("Reproducir"),
    "La cuenta regresiva de reloj real no debe ofrecer reproducción de timeline.",
  );
  pass("Los recursos sin duración no presentan reproducción ficticia.");

  await resource("lower-third");
  await clickText("Contenido");
  await page.screenshot({
    path: join(out, "editor-escritorio.png"),
    fullPage: true,
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await delay(200);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "La interfaz desborda horizontalmente en teléfono.",
  );
  await page.screenshot({
    path: join(out, "editor-movil.png"),
    fullPage: true,
  });
  pass(
    "Capturas de escritorio, vertical y móvil generadas sin desborde horizontal.",
  );

  assert.deepEqual(errors, [], "Se registraron errores de JavaScript.");
  assert.deepEqual(
    localFailures,
    [],
    "Se registraron errores al cargar archivos locales.",
  );
  pass("Sin errores de JavaScript ni peticiones locales fallidas.");
  await writeFile(
    join(out, "resultado.json"),
    JSON.stringify({ ok: true, checks, externalFailures }, null, 2),
  );
  console.log(`\nPruebas completas. Capturas: ${out}`);
} catch (error) {
  await page
    .screenshot({ path: join(out, "fallo.png"), fullPage: true })
    .catch(() => {});
  await writeFile(
    join(out, "resultado.json"),
    JSON.stringify(
      {
        ok: false,
        checks,
        error: String(error.stack || error),
        errors,
        localFailures,
        externalFailures,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
