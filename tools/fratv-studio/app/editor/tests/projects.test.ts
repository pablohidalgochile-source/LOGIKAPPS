import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  validateProject,
  generateItems,
  prepareProject,
  parseBrief,
  saveProject,
  loadProjects,
  serializeProject,
  deleteProject,
  saveTemplate,
  loadTemplates,
  PROJECT_STORAGE_KEY,
  builtInTemplates,
  resources,
  generationWarnings,
} from "../src/projects.ts";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  },
});
test("El proyecto se guarda, recupera y exporta con los ajustes de cada invitado", () => {
  memory.clear();
  const p = createProject("Entrevista del jueves");
  p.episode = {
    program: "Conversaciones",
    date: "2026-11-01T21:00",
    host: "Ana",
    hostRole: "Conductora",
    guests: [
      { name: "Luis", role: "Músico" },
      { name: "Luis", role: "Productor" },
    ],
    topics: ["Comunidad"],
    sponsors: [],
  };
  p.items = generateItems(p);
  const plates = p.items.filter((i) => i.resourceId === "lower-third");
  assert.equal(plates.length, 3);
  assert.notEqual(plates[1].id, plates[2].id);
  plates[1].values.topic = "Tema editado a mano";
  saveProject(p);
  const read = loadProjects()[0];
  assert.equal(
    read.items.find((i) => i.id === plates[1].id)?.values.topic,
    "Tema editado a mano",
  );
  assert.deepEqual(validateProject(JSON.parse(serializeProject(read))), read);
});
test("La importación rechaza versión, recurso, campos y rangos no compatibles sin mutar el original", () => {
  const p = createProject();
  const original = structuredClone(p);
  assert.throws(() => validateProject({ ...p, version: 2 }), /compatible/);
  assert.throws(
    () => validateProject({ ...p, drafts: { inexistente: {} } }),
    /desconocido/,
  );
  assert.throws(
    () => validateProject({ ...p, drafts: { ticker: { speed: 999 } } }),
    /rango/,
  );
  assert.throws(
    () => validateProject({ ...p, drafts: { ticker: { misterio: "x" } } }),
    /no reconoce/,
  );
  assert.throws(
    () =>
      validateProject({
        ...p,
        drafts: { sponsor: { logo: "javascript:alert(1)" } },
      }),
    /imagen web/,
  );
  assert.deepEqual(p, original);
});
test("Los proyectos corruptos se conservan y bloquean una escritura accidental", () => {
  memory.clear();
  memory.set(PROJECT_STORAGE_KEY, "{roto");
  assert.throws(() => saveProject(createProject()), /No se ha reemplazado/);
  assert.equal(memory.get(PROJECT_STORAGE_KEY), "{roto");
  memory.clear();
});
test("Duplicar y borrar un proyecto mantiene independientes los restantes", () => {
  memory.clear();
  const a = createProject("A");
  const b = { ...structuredClone(a), id: crypto.randomUUID(), name: "B" };
  saveProject(a);
  saveProject(b);
  deleteProject(a.id);
  assert.deepEqual(
    loadProjects().map((p) => p.name),
    ["B"],
  );
});
test("Brief etiquetado conserva tildes, repite invitados y no inventa cargos", () => {
  const p = parseBrief(
    "Programa: Diálogo\nInvitado: José Soto | Músico\nInvitada: Ana\nTema: Cultura\nTema: Comunidad\nCampo desconocido: no copiar\nTexto sin etiqueta",
  );
  assert.equal(p.episode.program, "Diálogo");
  assert.deepEqual(p.episode.guests, [
    { name: "José Soto", role: "Músico" },
    { name: "Ana", role: "" },
  ]);
  assert.deepEqual(p.episode.topics, ["Cultura", "Comunidad"]);
  assert(p.warnings.some((w) => w.includes("sin cargo")));
  assert(p.warnings.some((w) => w.includes("no reconocida")));
  assert.equal(p.episode.host, undefined);
});
test("Fecha inválida en un brief no se aplica ni oculta el problema", () => {
  const p = parseBrief("Fecha: mañana a las nueve");
  assert.equal(p.episode.date, undefined);
  assert(p.warnings.some((w) => w.includes("no válida")));
});
test("Plantillas guardadas se reutilizan sin compartir arrays mutables", () => {
  memory.clear();
  const p = createProject();
  saveTemplate(p.template);
  const loaded = loadTemplates();
  loaded[0].resources.push("sponsor");
  assert(!loadTemplates()[0].resources.includes("sponsor"));
});
test("La plantilla genera títulos, temas y filas sin identidades ficticias", () => {
  const p = createProject();
  p.template.resources = [
    "lower-third",
    "program-title",
    "ticker",
    "schedule",
    "end-credits",
  ];
  p.episode.program = "Mi programa";
  p.episode.topics = ["Tema | A; Tema B"];
  p.items = generateItems(p);
  assert.equal(p.items[0].values.name, "");
  assert.equal(p.items[0].values.role, "");
  assert.equal(
    p.items.find((i) => i.resourceId === "program-title")?.values.title,
    "Mi programa",
  );
  assert.doesNotThrow(() => validateProject(p));
});

test("La configuración manual de relojes sobrevive al guardado y al respaldo", () => {
  memory.clear();
  const p = createProject("Reloj de emisión");
  p.live.countdown = {
    mode: "countdown",
    durationMs: 300000,
    targetTime: 1000,
  };
  p.live["pieza-123"] = { mode: "elapsed", durationMs: 0 };
  saveProject(p);
  const restored = validateProject(
    JSON.parse(serializeProject(loadProjects()[0])),
  );
  assert.deepEqual(restored.live, p.live);
  restored.live.countdown.durationMs = 200000;
  assert.equal(p.live.countdown.durationMs, 300000);
});
test("Los proyectos anteriores reciben relojes vacíos y se rechazan configuraciones inválidas", () => {
  const p = createProject();
  const { live, ...legacy } = p;
  assert.deepEqual(validateProject(legacy).live, {});
  assert.throws(
    () =>
      validateProject({
        ...p,
        live: { countdown: { mode: "otro", durationMs: 1000 } },
      }),
    /modo/,
  );
  assert.throws(
    () =>
      validateProject({
        ...p,
        live: { countdown: { mode: "countdown", durationMs: 86400001 } },
      }),
    /duración/,
  );
  assert.throws(
    () =>
      validateProject({
        ...p,
        live: { countdown: { mode: "countdown", durationMs: -1 } },
      }),
    /duración/,
  );
  assert.throws(
    () =>
      validateProject({
        ...p,
        live: {
          countdown: { mode: "countdown", durationMs: 1000, targetTime: 0 },
        },
      }),
    /hora objetivo/,
  );
  assert.throws(
    () =>
      validateProject({
        ...p,
        live: JSON.parse('{"__proto__":{"mode":"elapsed","durationMs":0}}'),
      }),
    /reservado/,
  );
});


test("Los catálogos conservan los 18 recursos originales y añaden 17 de Fraternidad sin repetir ids", () => {
  assert.equal(resources.length, 35);
  assert.equal(resources.filter((r) => r.catalog === "fraternidad").length, 17);
  assert.equal(new Set(resources.map((r) => r.id)).size, resources.length);
  const clocks = resources.filter((r) => r.liveMode).map((r) => [r.id, r.liveMode]);
  assert.deepEqual(clocks, [["fraternidad-start", "countdown"], ["fraternidad-countdown", "countdown"], ["fraternidad-live", "elapsed"], ["fraternidad-break", "countdown"]]);
});
test("El programa Fraternidad genera datos reales, se guarda y se importa con tipografía y relojes", () => {
  memory.clear();
  const p = createProject("Encuentro de comunidad");
  p.template = { name: "Fraternidad completa", resources: resources.filter((r) => r.catalog === "fraternidad").map((r) => r.id) };
  p.font = "editorial";
  p.episode = { program: "Encuentro de comunidad", date: "2026-11-03T20:00", host: "María José", hostRole: "Conductora", guests: [{ name: "José Soto", role: "Invitado" }], topics: ["Cultura | comunidad", "Próximos encuentros"], sponsors: ["Librería local", "Centro cultural"] };
  p.items = generateItems(p);
  const plates = p.items.filter((i) => i.resourceId === "fraternidad-lower-third");
  assert.deepEqual(plates.map((i) => i.values), [{ name: "María José", role: "Conductora" }, { name: "José Soto", role: "Invitado" }]);
  const start = p.items.find((i) => i.resourceId === "fraternidad-start")!;
  assert.equal(start.values.title, p.episode.program);
  const sponsors = p.items.filter((i) => i.resourceId === "fraternidad-sponsor");
  assert.deepEqual(sponsors.map((i) => i.values.name), p.episode.sponsors);
  assert(sponsors.every((i) => i.values.logo === ""));
  const agenda = p.items.find((i) => i.resourceId === "fraternidad-schedule")!;
  assert.deepEqual(agenda.values.rows, [["", "Cultura , comunidad", ""], ["", "Próximos encuentros", ""]]);
  p.live[start.id] = { mode: "countdown", durationMs: 120000 };
  saveProject(p);
  const restored = validateProject(JSON.parse(serializeProject(loadProjects()[0])));
  assert.deepEqual(restored, p);
  assert.equal(restored.font, "editorial");
  assert.equal(restored.live[start.id].durationMs, 120000);
});
test("Las plantillas Fraternidad vacías no generan nombres ni auspiciadores ficticios", () => {
  const p = createProject();
  p.template = structuredClone(builtInTemplates.find((t) => t.name === "Fraternidad · conversación y comunidad")!);
  p.items = generateItems(p);
  assert(p.items.every((i) => i.resourceId.startsWith("fraternidad-")));
  assert.equal(p.items.find((i) => i.resourceId === "fraternidad-lower-third")!.values.name, "");
  assert.equal(p.items.find((i) => i.resourceId === "fraternidad-sponsor")!.values.name, "");
  assert.equal(p.items.find((i) => i.resourceId === "fraternidad-comment")!.values.comment, "");
  assert.doesNotThrow(() => validateProject(p));
});
test("Los avisos largos advierten su ajuste y una importación rechaza líneas no compatibles", () => {
  const p = createProject();
  p.template = { name: "Avisos", resources: ["fraternidad-ticker"] };
  p.episode.program = "Comunidad";
  p.episode.topics = ["A".repeat(90), ...Array(21).fill("Otro aviso")];
  assert(generationWarnings(p).some((w) => w.includes("60 caracteres")));
  assert(generationWarnings(p).some((w) => w.includes("20 avisos")));
  p.items = generateItems(p);
  assert.equal((p.items[0].values.items as string[]).length, 20);
  assert.equal((p.items[0].values.items as string[])[0].length, 60);
  assert.doesNotThrow(() => validateProject(p));
  assert.throws(() => validateProject({ ...p, drafts: { "fraternidad-out": { socials: ["A", "B", "C"] } } }), /hasta 2 líneas/);
  assert.throws(() => validateProject({ ...p, drafts: { "fraternidad-ticker": { items: ["B".repeat(61)] } } }), /máximo 60/);
});


test("Regenerar cuarenta episodios conserva relojes por pieza y recurso sin acumular claves huérfanas", () => {
  memory.clear();
  let p = createProject("Episodios sucesivos");
  p.template = { name: "Relojes", resources: ["fraternidad-start", "fraternidad-break"] };
  p.live = {
    "fraternidad-start": { mode: "countdown", durationMs: 300000 },
    "fraternidad-break": { mode: "countdown", durationMs: 60000 },
    "pieza-retirada": { mode: "countdown", durationMs: 1000 },
  };
  p = prepareProject(p);
  p.live[p.items[0].id] = { mode: "countdown", durationMs: 120000, targetTime: 2000000000000 };
  p.live[p.items[1].id] = { mode: "countdown", durationMs: 45000 };
  for (let episode = 0; episode < 40; episode++) {
    const previous = structuredClone(p);
    const next = prepareProject(p);
    assert.notEqual(next.items[0].id, p.items[0].id);
    assert.deepEqual(next.live[next.items[0].id], { mode: "countdown", durationMs: 120000, targetTime: 2000000000000 });
    assert.equal(next.live[next.items[1].id].durationMs, 45000);
    assert.equal(next.live["fraternidad-start"].durationMs, 300000);
    assert.equal(next.live["fraternidad-break"].durationMs, 60000);
    assert.equal(Object.keys(next.live).length, 4);
    assert.equal(next.live[p.items[0].id], undefined);
    assert.deepEqual(p, previous);
    saveProject(next);
    p = loadProjects()[0];
  }
  p.template.resources = ["fraternidad-start"];
  const smaller = prepareProject(p);
  assert.equal(Object.keys(smaller.live).length, 3);
  assert.equal(smaller.live[p.items[1].id], undefined);
  assert.equal(smaller.live["fraternidad-break"].durationMs, 60000);
});
