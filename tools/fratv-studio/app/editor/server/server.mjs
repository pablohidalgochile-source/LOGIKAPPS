import { createReadStream, existsSync } from "node:fs";
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
  cp,
  rename,
} from "node:fs/promises";
import { resolve, join, basename, extname, posix } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const here = import.meta.dirname;
const allowedFormats = new Set(["png", "mov", "mp4", "html"]);
const clockResources = new Set(["countdown", "live-badge", "bumper-in"]);
function clockResource(resource, query) {
  return ["countdown", "elapsed"].includes(resource.liveMode) ||
    resource.id === "countdown" || resource.id === "bumper-in" ||
    (resource.id === "live-badge" && query.get("variant") === "reloj");
}
export async function loadCatalog(root) {
  const manifest = JSON.parse(await readFile(join(root, "handoff/manifest.json"), "utf8"));
  let additional = [];
  try {
    additional = JSON.parse(await readFile(join(root, "handoff/fraternidad/manifest.json"), "utf8")).resources;
    if (!Array.isArray(additional)) throw new Error("El catálogo de Fraternidad no declara sus recursos.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const resources = [...manifest.resources, ...additional];
  if (new Set(resources.map(resource => resource.id)).size !== resources.length)
    throw new Error("El catálogo contiene identificadores repetidos.");
  for (const resource of resources)
    if (!/^(?:resources|fraternidad\/resources)\/[a-zA-Z0-9_-]+\.html$/.test(resource.file))
      throw new Error("El catálogo contiene una ruta de recurso no válida.");
  return { ...manifest, resources };
}
const fonts = {
  editorial:
    "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;700&display=swap",
  neutro:
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;700&display=swap",
};
const safeName = (value) =>
  String(value || "recurso")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 70);
const clockItem = (item) => clockResource(
  item.resource,
  new URL(item.url, "http://localhost").searchParams,
);
const json = (res, code, value) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
const htmlEscape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 12 * 1024 * 1024)
      throw new Error("El paquete supera los 12 MB permitidos.");
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
}
export function liveValue(state, now = Date.now()) {
  const elapsed = state.running ? Math.max(0, now - state.updatedAt) : 0;
  return Math.max(
    0,
    state.valueMs + (state.mode === "elapsed" ? elapsed : -elapsed),
  );
}
export function createLiveState(init = {}, now = Date.now()) {
  const mode = init.mode || "countdown";
  if (!["countdown", "elapsed"].includes(mode))
    throw new Error("Tipo de reloj no válido.");
  const inputTarget = init.targetTime ?? init.target;
  const hasTarget =
    mode === "countdown" &&
    inputTarget != null &&
    String(inputTarget).trim() !== "";
  if (hasTarget) {
    const target = Number.isFinite(Number(inputTarget))
      ? Number(inputTarget)
      : Date.parse(inputTarget);
    if (!Number.isFinite(target) || target > now + 366 * 86400000)
      throw new Error(
        "La hora objetivo debe ser válida y no superar los próximos 366 días.",
      );
    const remaining = Math.max(0, target - now);
    return {
      mode,
      durationMs: remaining,
      valueMs: remaining,
      running: remaining > 0,
      visible: true,
      updatedAt: now,
    };
  }
  const duration = Number(init.durationMs ?? 300000);
  if (!Number.isFinite(duration) || duration < 0 || duration > 86400000)
    throw new Error("La duración debe estar entre 0 y 24 horas.");
  return {
    mode,
    durationMs: duration,
    valueMs: mode === "elapsed" ? 0 : duration,
    running: false,
    visible: true,
    updatedAt: now,
  };
}
function clockInit(resource, q) {
  return {
    mode:
      q.get("liveMode") ||
      (resource.liveMode || (resource.id === "live-badge" ? "elapsed" : "countdown")),
    durationMs: q.get("liveDurationMs") ?? undefined,
    targetTime: q.get("liveTargetTime") ?? undefined,
    target: q.get("target") || q.get("clockTarget"),
  };
}
export function updateLive(previous, input, now = Date.now()) {
  const s = { ...previous, valueMs: liveValue(previous, now), updatedAt: now };
  switch (input.action) {
    case "start":
      s.running = true;
      break;
    case "pause":
      s.running = false;
      break;
    case "show":
      s.visible = true;
      break;
    case "hide":
      s.visible = false;
      break;
    case "reset":
      s.running = false;
      s.valueMs = s.mode === "elapsed" ? 0 : s.durationMs;
      break;
    case "configure": {
      if (!["countdown", "elapsed"].includes(input.mode))
        throw new Error("Tipo de reloj no válido.");
      const duration = Number(
        input.durationMs ??
          (input.targetTime != null
            ? 300000
            : Math.min(s.durationMs, 86400000)),
      );
      if (!Number.isFinite(duration) || duration < 0 || duration > 86400000)
        throw new Error("La duración debe estar entre 0 y 24 horas.");
      s.mode = input.mode;
      s.durationMs = duration;
      s.valueMs = s.mode === "elapsed" ? 0 : duration;
      s.running = false;
      if (input.targetTime != null) {
        const target = Number(input.targetTime);
        if (!Number.isFinite(target) || target > now + 366 * 86400000)
          throw new Error(
            "La hora objetivo debe ser válida y no superar los próximos 366 días.",
          );
        s.mode = "countdown";
        s.valueMs = Math.max(0, target - now);
        s.durationMs = s.valueMs;
        s.running = s.valueMs > 0;
      }
      break;
    }
    default:
      throw new Error("Acción de control no válida.");
  }
  return s;
}
export function validateExport(input, manifest) {
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 60
  )
    throw new Error("Selecciona entre 1 y 60 piezas.");
  if (
    !Array.isArray(input.formats) ||
    !input.formats.length ||
    input.formats.some((f) => !allowedFormats.has(f))
  )
    throw new Error("Selecciona una salida válida.");
  const items = input.items.map((item, i) => {
    const resource = manifest.resources.find((r) => r.id === item.resourceId);
    if (!resource || !resource.aspects.includes(item.aspect))
      throw new Error(`Formato o recurso inválido en la pieza ${i + 1}.`);
    const url = new URL(item.url, "http://localhost");
    if (
      url.origin !== "http://localhost" ||
      url.pathname !== `/media/${resource.file}` ||
      typeof item.url !== "string" ||
      !item.url.startsWith("/media/")
    )
      throw new Error("La exportación solo acepta recursos del catálogo.");
    url.searchParams.set("autoplay", "0");
    url.searchParams.set("aspecto", item.aspect);
    const font = url.searchParams.get("tipo") || "aprobado";
    if (!["aprobado", "editorial", "neutro"].includes(font))
      throw new Error("Tipografía no válida.");
    if (clockResource(resource, url.searchParams))
      createLiveState(clockInit(resource, url.searchParams));
    const duration = Number(item.durationMs ?? resource.durationMs);
    const time = Number(item.time ?? 0);
    if (
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > 120000 ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > 120000
    )
      throw new Error("Tiempo de exportación inválido.");
    if (item.channel != null && !/^[a-zA-Z0-9_-]{1,100}$/.test(item.channel))
      throw new Error("Canal no válido.");
    return {
      channel: item.channel || safeName(item.id || `${resource.id}-${i}`),
      id: safeName(item.id || `${resource.id}-${i}`),
      label: String(item.label || resource.name).slice(0, 160),
      resourceId: resource.id,
      url: url.pathname + url.search,
      aspect: item.aspect,
      durationMs: duration,
      time,
      resource,
    };
  });
  return {
    items,
    formats: [...new Set(input.formats)],
    fps: input.fps === 30 ? 30 : 60,
    project: input.project ?? null,
  };
}

export function createStudioApi({
  root,
  storageDir = join(root, "editor/.local"),
}) {
  const jobs = new Map(),
    channels = new Map(),
    queue = [];
  let active = null,
    stopped = false,
    manifest,
    saveChain = Promise.resolve();
  const ready = (async () => {
    manifest = await loadCatalog(root);
    await mkdir(join(storageDir, "exports"), { recursive: true });
    try {
      for (const [id, state] of Object.entries(
        JSON.parse(await readFile(join(storageDir, "live.json"), "utf8")),
      ))
        channels.set(id, state);
    } catch {}
    for (const dir of await readdir(join(storageDir, "exports"), {
      withFileTypes: true,
    })) {
      if (!dir.isDirectory()) continue;
      try {
        const job = JSON.parse(
          await readFile(
            join(storageDir, "exports", dir.name, "job.json"),
            "utf8",
          ),
        );
        if (["queued", "running"].includes(job.status)) {
          job.status = "failed";
          job.error = "El servidor se reinició. Vuelve a exportar el paquete.";
        }
        jobs.set(job.id, job);
      } catch {}
    }
  })();
  const persistLive = () => {
    const data = JSON.stringify(Object.fromEntries(channels), null, 2);
    saveChain = saveChain.then(async () => {
      await writeFile(join(storageDir, "live.json.tmp"), data);
      await rename(
        join(storageDir, "live.json.tmp"),
        join(storageDir, "live.json"),
      );
    });
    return saveChain;
  };
  function stateFor(channel, init = {}, create = true) {
    if (channels.has(channel)) return channels.get(channel);
    const state = createLiveState(init);
    if (create) channels.set(channel, state);
    return state;
  }
  const snapshot = (channel, init = {}, create = true) => {
    const s = stateFor(channel, init, create),
      now = Date.now();
    return { ...s, valueMs: liveValue(s, now), serverTime: now };
  };
  const itemClockInit = (item) =>
    clockInit(
      item.resource,
      new URL(item.url, "http://localhost").searchParams,
    );
  const publicJob = (job) => ({
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    warnings: job.warnings || [],
    createdAt: job.createdAt,
    download:
      job.status === "completed" ? `/api/exports/${job.id}/download` : null,
  });
  const persistJob = (job) =>
    writeFile(
      join(storageDir, "exports", job.id, "job.json"),
      JSON.stringify(publicJob(job), null, 2),
    );
  function check(job) {
    if (stopped || job.cancelled) throw new Error("Exportación cancelada.");
  }
  async function runProcess(command, args, job, options = {}) {
    check(job);
    await new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        ...options,
        stdio: ["ignore", "ignore", "pipe"],
      });
      job.process = process;
      let error = "";
      process.stderr.on("data", (b) => {
        error = (error + b).slice(-2000);
      });
      process.once("error", reject);
      process.once("close", (code) => {
        job.process = null;
        code === 0
          ? resolve()
          : reject(
              new Error(error || `${command} terminó con código ${code}.`),
            );
      });
    });
    check(job);
  }
  async function loadPage(job, item, base) {
    const p = job.page,
      format = manifest.aspects[item.aspect];
    await p.setViewport({
      width: format.w,
      height: format.h,
      deviceScaleFactor: 1,
    });
    let renderPath = item.url;
    if (clockItem(item)) {
      const q = new URL(item.url, "http://localhost").searchParams;
      q.set("channel", item.channel);
      q.set("snapshot", "1");
      renderPath = `/live/${item.resourceId}?${q}`;
    }
    await p.goto(base + renderPath, {
      waitUntil: clockItem(item) ? "domcontentloaded" : "networkidle0",
      timeout: 45000,
    });
    if (clockItem(item))
      await p.waitForFunction(
        () =>
          document.documentElement.dataset.liveReady === "1" &&
          document.body.style.visibility === "visible",
        { polling: 100, timeout: 10000 },
      );
    await p.waitForFunction(() => !!window.FRATV, { timeout: 10000 });
    await p.evaluate(
      async (fontUrl) => {
        await window.FRATV.ready;
        if (fontUrl) {
          await new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = fontUrl;
            const timeout = setTimeout(
              () => reject(new Error("No se pudo cargar la tipografía.")),
              15000,
            );
            link.onload = () => {
              clearTimeout(timeout);
              resolve();
            };
            link.onerror = () => {
              clearTimeout(timeout);
              reject(new Error("No se pudo cargar la tipografía."));
            };
            document.head.append(link);
          });
          void document.body.offsetWidth;
          await document.fonts.ready;
        }
        await Promise.all(
          [...document.images]
            .filter((img) => img.getAttribute("src"))
            .map(async (img) => {
              await img.decode();
              if (!img.naturalWidth)
                throw new Error(
                  "No se pudo cargar un logo o imagen del recurso.",
                );
            }),
        );
      },
      item.resource.catalog === "fraternidad" ? null :
        fonts[new URL(item.url, "http://localhost").searchParams.get("tipo")] || null,
    );
    check(job);
  }
  async function exportJob(job) {
    const jobDir = join(storageDir, "exports", job.id),
      pack = join(jobDir, "paquete");
    await mkdir(pack, { recursive: true });
    const config = job.config,
      warnings = job.warnings;
    await writeFile(
      join(pack, "proyecto.fratv.json"),
      JSON.stringify(config.project, null, 2),
    );
    const needHTML =
      config.formats.includes("html") || config.items.some(clockItem);
    if (needHTML) {
      await cp(
        join(root, "handoff/resources"),
        join(pack, "handoff/resources"),
        { recursive: true },
      );
      await cp(join(root, "handoff/assets"), join(pack, "handoff/assets"), {
        recursive: true,
      });
      await cp(
        join(root, "handoff/manifest.json"),
        join(pack, "handoff/manifest.json"),
      );
      if (existsSync(join(root, "handoff/fraternidad/manifest.json")))
        await cp(join(root, "handoff/fraternidad"), join(pack, "handoff/fraternidad"), { recursive: true });
      await mkdir(join(pack, "runtime"), { recursive: true });
      for (const file of [
        "server.mjs",
        "live-client.js",
        "live-control.html",
        "portable.mjs",
      ])
        await cp(join(here, file), join(pack, "runtime", file));
      await writeFile(
        join(pack, "INICIAR.command"),
        '#!/bin/sh\ncd "$(dirname "$0")"\nnode runtime/portable.mjs\n',
        { mode: 0o755 },
      );
    }
    if (config.formats.some((f) => ["png", "mov", "mp4"].includes(f))) {
      const require = createRequire(join(root, "scripts/package.json"));
      let puppeteer;
      try {
        puppeteer = require("puppeteer-core");
      } catch {
        throw new Error(
          "Instala las dependencias de scripts/ para exportar imágenes o video.",
        );
      }
      const { CHROME } = await import(
        pathToFileURL(join(root, "scripts/chrome.mjs")).href
      );
      job.browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        args: ["--force-device-scale-factor=1", "--hide-scrollbars"],
      });
      job.page = await job.browser.newPage();
    }
    const links = [],
      details = [];
    for (let index = 0; index < config.items.length; index++) {
      check(job);
      const item = config.items[index],
        isClock = clockItem(item),
        stem = `${String(index + 1).padStart(2, "0")}_${safeName(item.label)}_${item.aspect.replace(":", "x")}`;
      const part = (fraction) => {
        job.progress = Math.round(
          ((index + fraction) / config.items.length) * 95,
        );
      };
      job.message = `Preparando ${item.label}`;
      part(0);
      await persistJob(job);
      const folder = join(pack, item.aspect.replace(":", "x"));
      await mkdir(folder, { recursive: true });
      if (job.page) await loadPage(job, item, job.origin);
      if (
        config.formats.includes("png") ||
        (isClock && config.formats.some((f) => f === "mov" || f === "mp4"))
      ) {
        await job.page.evaluate((t) => window.FRATV.seek(t), item.time);
        await job.page.screenshot({
          path: join(folder, `${stem}${isClock ? "_instantanea" : ""}.png`),
          omitBackground: item.resource.alpha,
        });
      }
      if (isClock && config.formats.some((f) => f === "mov" || f === "mp4"))
        warnings.push(
          `${item.label}: el reloj se entrega como HTML vivo y PNG de referencia; un video no puede controlarse en vivo.`,
        );
      if (
        !isClock &&
        item.durationMs > 0 &&
        config.formats.some((f) => f === "mov" || f === "mp4")
      ) {
        const frames = join(jobDir, "frames");
        await mkdir(frames, { recursive: true });
        const count =
          Math.round((item.durationMs * config.fps) / 1000) +
          (item.resource.loop ? 0 : 1);
        for (let frame = 0; frame < count; frame++) {
          check(job);
          await job.page.evaluate(
            (t) => window.FRATV.seek(t),
            (frame * 1000) / config.fps,
          );
          await job.page.screenshot({
            path: join(frames, `${String(frame).padStart(6, "0")}.png`),
            omitBackground: item.resource.alpha,
          });
          if (frame % 15 === 0) {
            part((frame / count) * 0.85);
            job.message = `${item.label}: cuadro ${frame + 1} de ${count}`;
          }
        }
        job.message = `Codificando ${item.label}`;
        if (config.formats.includes("mov"))
          await runProcess(
            "ffmpeg",
            [
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-framerate",
              String(config.fps),
              "-i",
              join(frames, "%06d.png"),
              "-c:v",
              "prores_ks",
              "-profile:v",
              "4444",
              "-pix_fmt",
              "yuva444p10le",
              "-alpha_bits",
              "16",
              "-vendor",
              "apl0",
              join(folder, `${stem}.mov`),
            ],
            job,
          );
        if (config.formats.includes("mp4"))
          await runProcess(
            "ffmpeg",
            [
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-framerate",
              String(config.fps),
              "-i",
              join(frames, "%06d.png"),
              "-filter_complex",
              "[0:v]split[fg][bg];[bg]lutrgb=r=0:g=0:b=0,format=rgb24[black];[black][fg]overlay=format=auto:shortest=1[out]",
              "-map",
              "[out]",
              "-c:v",
              "libx264",
              "-pix_fmt",
              "yuv420p",
              "-crf",
              "18",
              "-preset",
              "faster",
              join(folder, `${stem}.mp4`),
            ],
            job,
          );
        await rm(frames, { recursive: true, force: true });
      } else if (
        !isClock &&
        !item.durationMs &&
        config.formats.some((f) => f === "mov" || f === "mp4")
      ) {
        if (!config.formats.includes("png")) {
          await job.page.evaluate((t) => window.FRATV.seek(t), item.time);
          await job.page.screenshot({
            path: join(folder, `${stem}.png`),
            omitBackground: item.resource.alpha,
          });
        }
        warnings.push(`${item.label}: pieza estática, entregada como PNG.`);
      }
      if (needHTML) {
        const q = new URL(item.url, "http://localhost").searchParams;
        q.set("autoplay", "1");
        q.set("channel", item.channel);
        const livePath = `/live/${item.resourceId}?${q}`;
        links.push({
          label: item.label,
          path: livePath,
          control: `/live-control?channel=${item.channel}`,
          width: manifest.aspects[item.aspect].w,
          height: manifest.aspects[item.aspect].h,
          clock: isClock,
        });
      }
      details.push({
        resourceId: item.resourceId,
        label: item.label,
        aspect: item.aspect,
        liveClock: isClock,
        alpha: item.resource.alpha,
        stingerCutMs: item.resource.cutMs ?? (item.resourceId === "stinger" ? 400 : undefined),
      });
      part(1);
    }
    await job.browser?.close();
    job.browser = null;
    await writeFile(
      join(pack, "recursos.json"),
      JSON.stringify(
        { fps: config.fps, items: details, sources: links, warnings },
        null,
        2,
      ),
    );
    if (needHTML) {
      const seeded = {};
      for (const item of config.items.filter(clockItem)) {
        const state = stateFor(item.channel, itemClockInit(item));
        const now = Date.now();
        seeded[item.channel] = {
          ...state,
          valueMs: liveValue(state, now),
          updatedAt: now,
        };
      }
      await mkdir(join(pack, ".estado-local"), { recursive: true });
      await writeFile(
        join(pack, ".estado-local/live.json"),
        JSON.stringify(seeded, null, 2),
      );
      await writeFile(
        join(pack, "fuentes.html"),
        `<!doctype html><html lang="es"><meta charset="utf-8"><title>Fuentes OBS</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;line-height:1.8;background:#100b18;color:#f5f1e8}a{color:#f2a8b5}section{border-bottom:1px solid #514153;padding:15px}</style><h1>Fuentes para OBS</h1><p>Agrega cada enlace como fuente de navegador. Conserva el servidor encendido.</p>${links.map((l) => `<section><strong>${htmlEscape(l.label)}</strong> · ${l.width} × ${l.height}<br><a href="${htmlEscape(l.path)}">Abrir gráfica</a>${l.clock ? ` · <a href="${htmlEscape(l.control)}">Control en vivo / dock OBS</a>` : ""}<br><code>http://127.0.0.1:8796${htmlEscape(l.path)}</code></section>`).join("")}</html>`,
      );
    }
    await writeFile(
      join(pack, "LEEME.txt"),
      `FRATV · paquete de programa\n\nImporta proyecto.fratv.json en el editor para continuar.\nLas carpetas por formato contienen los archivos solicitados.\nPNG: cuadro del editor con transparencia cuando el recurso la admite.\nMOV: ProRes 4444, con alfa cuando el recurso lo admite.\nMP4: video opaco sobre negro para compartir.\nStinger: punto de corte aprobado 400 ms.\n\n${needHTML ? "FUENTES VIVAS PARA OBS\nNecesitas Node 22 o posterior. Abre INICIAR.command o ejecuta: node runtime/portable.mjs\nLuego abre http://127.0.0.1:8796/fuentes.html\nAgrega la URL de cada gráfica como fuente de navegador con el tamaño indicado.\nPara relojes, abre Control en vivo como dock de navegador personalizado de OBS.\nEl servidor debe permanecer encendido; cerrar la página del editor no detiene el reloj.\nEl control se comparte entre todas las fuentes con el mismo canal y se conserva al recargar.\nLas fuentes tipográficas y logos con URL externa necesitan conexión. No se descargan ni incrustan logos remotos automáticamente.\nEl paquete contiene los assets de marca locales.\n\n" : ""}ADVERTENCIAS\n${warnings.join("\n") || "Sin advertencias."}\n`,
    );
    check(job);
    job.message = "Armando paquete ZIP";
    job.progress = 97;
    await runProcess(
      "zip",
      ["-q", "-r", join(jobDir, "programa.zip"), "."],
      job,
      { cwd: pack },
    );
    job.status = "completed";
    job.progress = 100;
    job.message = "Paquete listo para descargar";
    await persistJob(job);
  }
  async function pump() {
    if (active || stopped) return;
    const job = queue.shift();
    if (!job) return;
    active = job;
    try {
      check(job);
      job.status = "running";
      await persistJob(job);
      await exportJob(job);
    } catch (error) {
      job.status = job.cancelled || stopped ? "cancelled" : "failed";
      job.error = job.status === "failed" ? error.message : undefined;
      job.message =
        job.status === "cancelled"
          ? "Exportación cancelada"
          : "No se pudo exportar";
      await persistJob(job).catch(() => {});
    } finally {
      await job.browser?.close().catch(() => {});
      job.browser = null;
      job.process?.kill("SIGTERM");
      await rm(join(storageDir, "exports", job.id, "frames"), {
        recursive: true,
        force: true,
      }).catch(() => {});
      active = null;
      if (!stopped) setTimeout(pump, 0);
    }
  }
  async function handle(req, res, next) {
    const parsed = new URL(req.url || "/", "http://localhost");
    if (
      !parsed.pathname.startsWith("/api/exports") &&
      !parsed.pathname.startsWith("/api/live/") &&
      !parsed.pathname.startsWith("/live/") &&
      parsed.pathname !== "/live-control" &&
      parsed.pathname !== "/live-client.js"
    )
      return next();
    try {
      await ready;
      const host = req.headers.host || "";
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
        return json(res, 403, {
          error: "Este servicio solo admite conexiones locales.",
        });
      const origin = `http://${host}`;
      if (
        ["POST", "DELETE"].includes(req.method) &&
        req.headers.origin &&
        req.headers.origin !== origin
      )
        return json(res, 403, { error: "Origen no autorizado." });
      if (parsed.pathname === "/live-control") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(await readFile(join(here, "live-control.html")));
        return;
      }
      if (parsed.pathname === "/live-client.js") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        res.end(await readFile(join(here, "live-client.js")));
        return;
      }
      if (parsed.pathname.startsWith("/live/")) {
        const resourceId = parsed.pathname.slice("/live/".length),
          resource = manifest.resources.find((r) => r.id === resourceId);
        if (!resource)
          return json(res, 404, { error: "Recurso no encontrado." });
        const channel = parsed.searchParams.get("channel") || "programa";
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channel))
          throw new Error("Canal no válido.");
        const isClock = clockResource(resource, parsed.searchParams);
        if (isClock)
          stateFor(channel, clockInit(resource, parsed.searchParams));
        let html = await readFile(join(root, "handoff", resource.file), "utf8");
        let injection = `<base href="/media/${htmlEscape(posix.dirname(resource.file))}/">`;
        const font = resource.catalog === "fraternidad" ? null : fonts[parsed.searchParams.get("tipo")];
        if (font)
          injection += `<link rel="stylesheet" href="${htmlEscape(font)}">`;
        if (isClock) {
          // Solo los HTML históricos tienen intervalos propios que reemplazar.
          const legacyClock = clockResources.has(resourceId);
          injection += "<style>body{visibility:hidden}</style><script>window.__fratvNativeSetInterval=window.setInterval.bind(window);" +
            (legacyClock ? "window.setInterval=function(){return 0};" : "") + "</script>";
          html = html.replace(/<html\b([^>]*)>/i, `<html$1 data-live-resource="${resourceId}">`);
          html = html.replace(
            "</body>",
            '<script>window.setInterval=window.__fratvNativeSetInterval;</script><script src="/live-client.js"></script></body>',
          );
        }
        html = html.replace("<head>", "<head>" + injection);
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }
      if (parsed.pathname.startsWith("/api/live/")) {
        const channel = parsed.pathname.slice("/api/live/".length);
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channel))
          throw new Error("Canal no válido.");
        if (req.method === "POST") {
          channels.set(channel, updateLive(stateFor(channel), await body(req)));
          await persistLive();
        } else if (req.method !== "GET")
          return json(res, 405, { error: "Método no permitido." });
        const seed = {
          mode: parsed.searchParams.get("mode"),
          durationMs: parsed.searchParams.get("durationMs"),
          targetTime: parsed.searchParams.get("targetTime"),
          target: parsed.searchParams.get("target"),
        };
        json(
          res,
          200,
          snapshot(
            channel,
            seed,
            req.method === "POST" ||
              ["mode", "target", "durationMs", "targetTime"].some((key) =>
                parsed.searchParams.has(key),
              ),
          ),
        );
        return;
      }
      if (parsed.pathname === "/api/exports") {
        if (req.method === "GET")
          return json(
            res,
            200,
            [...jobs.values()]
              .map(publicJob)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          );
        if (req.method !== "POST")
          return json(res, 405, { error: "Método no permitido." });
        if (queue.length >= 5)
          throw new Error(
            "Ya hay cinco paquetes en espera. Espera a que terminen o cancela uno.",
          );
        const config = validateExport(await body(req), manifest),
          id = randomUUID();
        const job = {
          id,
          status: "queued",
          progress: 0,
          message: "En cola",
          warnings: [],
          createdAt: new Date().toISOString(),
          config,
          origin,
        };
        jobs.set(id, job);
        await mkdir(join(storageDir, "exports", id), { recursive: true });
        await persistJob(job);
        queue.push(job);
        json(res, 202, publicJob(job));
        setTimeout(pump, 0);
        return;
      }
      const match = parsed.pathname.match(
        /^\/api\/exports\/([a-f0-9-]+)(\/download)?$/,
      );
      const job = match && jobs.get(match[1]);
      if (!job) return json(res, 404, { error: "Exportación no encontrada." });
      if (match[2]) {
        if (job.status !== "completed")
          return json(res, 409, { error: "El paquete todavía no está listo." });
        const file = join(storageDir, "exports", job.id, "programa.zip");
        if (!existsSync(file))
          return json(res, 404, { error: "El archivo ya no está disponible." });
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="FRATV_programa.zip"',
        });
        createReadStream(file).pipe(res);
        return;
      }
      if (
        req.method === "DELETE" &&
        ["queued", "running"].includes(job.status)
      ) {
        job.cancelled = true;
        job.process?.kill("SIGTERM");
        await job.browser?.close().catch(() => {});
        if (job.status === "queued") {
          queue.splice(queue.indexOf(job), 1);
          job.status = "cancelled";
          job.message = "Exportación cancelada";
          await persistJob(job);
        }
      } else if (req.method !== "GET" && req.method !== "DELETE")
        return json(res, 405, { error: "Método no permitido." });
      json(res, 200, publicJob(job));
    } catch (error) {
      if (!res.headersSent)
        json(res, 400, {
          error: error.message || "No se pudo completar la operación.",
        });
      else res.end();
    }
  }
  return {
    middleware(req, res, next) {
      handle(req, res, next).catch((e) => {
        if (!res.headersSent) json(res, 500, { error: e.message });
      });
    },
    async close() {
      stopped = true;
      for (const job of queue.splice(0)) {
        job.cancelled = true;
        job.status = "cancelled";
        job.message = "Servidor detenido";
        await persistJob(job);
      }
      if (active) {
        active.cancelled = true;
        active.process?.kill("SIGTERM");
        await active.browser?.close().catch(() => {});
      }
      await saveChain.catch(() => {});
    },
  };
}
