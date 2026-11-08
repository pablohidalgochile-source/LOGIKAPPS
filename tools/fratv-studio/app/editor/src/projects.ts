import { resources, aspects } from "./catalog.ts";
export { resources } from "./catalog.ts";
import { defaults, themes, resourceName, textListLimit } from "./model.ts";
import type { Field, FieldValue, Resource, Values } from "./model.ts";

export interface Episode {
  program: string;
  date: string;
  host: string;
  hostRole: string;
  guests: { name: string; role: string }[];
  topics: string[];
  sponsors: string[];
}
export interface ProgramTemplate {
  name: string;
  resources: string[];
}
export interface ProgramItem {
  id: string;
  resourceId: string;
  label: string;
  values: Values;
}
export interface LiveConfig {
  mode: "countdown" | "elapsed";
  durationMs: number;
  targetTime?: number;
}
export interface Project {
  schema: "fratv-project";
  version: 1;
  id: string;
  name: string;
  updatedAt: string;
  theme: string;
  font: string;
  aspect: string;
  drafts: Record<string, Values>;
  template: ProgramTemplate;
  episode: Episode;
  items: ProgramItem[];
  live: Record<string, LiveConfig>;
}
export const PROJECT_STORAGE_KEY = "fratv.projects.v1";
export const TEMPLATE_STORAGE_KEY = "fratv.templates.v1";
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
export const builtInTemplates: ProgramTemplate[] = [
  {
    name: "Entrevista en vivo",
    resources: [
      "ident-short",
      "flag",
      "live-badge",
      "countdown",
      "bumper-in",
      "lower-third",
      "program-title",
      "ticker",
      "bumper-out",
    ],
  },
  {
    name: "Programa de conversación",
    resources: [
      "ident-long",
      "flag",
      "live-badge",
      "lower-third",
      "program-title",
      "schedule",
      "engagement",
      "sponsor",
      "bumper-out",
      "end-credits",
    ],
  },
  {
    name: "Coproducción con Fraternidad",
    resources: [
      "flag-evento",
      "bumper-evento",
      "lower-third-evento",
      "live-badge",
      "countdown",
      "ticker",
    ],
  },
];
builtInTemplates.push(
  {
    name: "Fraternidad · encuentro institucional",
    resources: ["fraternidad-ident-long", "fraternidad-flag", "fraternidad-start", "fraternidad-live", "fraternidad-lower-third", "fraternidad-program-title", "fraternidad-schedule", "fraternidad-break", "fraternidad-out", "fraternidad-credits"],
  },
  {
    name: "Fraternidad · conversación y comunidad",
    resources: ["fraternidad-ident-short", "fraternidad-flag", "fraternidad-countdown", "fraternidad-live", "fraternidad-lower-third", "fraternidad-program-title", "fraternidad-ticker", "fraternidad-comment", "fraternidad-sponsor", "fraternidad-break", "fraternidad-out", "fraternidad-technical"],
  },
);
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const resourceById = (key: string) => resources.find((r) => r.id === key);
export function createProject(name = "Mi programa"): Project {
  return {
    schema: "fratv-project",
    version: 1,
    id: id(),
    name,
    updatedAt: now(),
    theme: "fratv-oficial",
    font: "aprobado",
    aspect: "16:9",
    drafts: {},
    template: structuredClone(builtInTemplates[0]),
    episode: {
      program: "",
      date: "",
      host: "",
      hostRole: "",
      guests: [],
      topics: [],
      sponsors: [],
    },
    items: [],
    live: {},
  };
}
function fail(message: string): never {
  throw new Error(message);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(`${label}: se esperaba un objeto.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 2000): string {
  if (typeof value !== "string" || value.length > max || /\u0000/.test(value))
    return fail(`${label}: texto inválido o demasiado largo (máximo ${max}).`);
  return value;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    return fail(`${label}: lista inválida (máximo ${max}).`);
  return value;
}
function validId(value: unknown, label: string): string {
  const result = text(value, label, 100);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(result))
    return fail(`${label}: identificador inválido.`);
  return result;
}
function fieldValue(value: unknown, field: Field): FieldValue {
  const label = `Campo «${field.label}»`;
  if (field.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)
    )
      return fail(`${label}: número fuera del rango permitido.`);
    return value;
  }
  if (field.type === "rows")
    return array(value, label, field.max || 30).map((row, i) => {
      const columns = array(
        row,
        `${label}, fila ${i + 1}`,
        field.schema!.length,
      );
      if (columns.length !== field.schema!.length)
        return fail(`${label}: cantidad de columnas incorrecta.`);
      return columns.map((v) => {
        const s = text(v, label, 500);
        if (/[;|]/.test(s))
          return fail(`${label}: «;» y «|» están reservados como separadores.`);
        return s;
      });
    });
  if (field.type === "textlist" || field.type === "multienum")
    return array(
      value,
      label,
      field.type === "multienum" ? field.options!.length : 30,
    ).map((v) => {
      const s = text(v, label, field.type === "textlist" ? field.max || 500 : 500);
      if (field.type === "multienum" && !field.options?.includes(s))
        return fail(`${label}: opción no reconocida.`);
      if (field.type === "textlist" && /;/.test(s))
        return fail(`${label}: «;» está reservado como separador.`);
      return s;
    });
  const result = text(
    value,
    label,
    field.key === "logo" ? 4000 : field.max || 2000,
  );
  if (field.type === "enum" && !field.options?.includes(result))
    return fail(`${label}: opción no reconocida.`);
  if (
    field.type === "datetime" &&
    result &&
    !Number.isFinite(Date.parse(result))
  )
    return fail(`${label}: fecha inválida.`);
  if (
    field.key === "logo" &&
    result &&
    !/^(?:https?:\/\/|\.\.\/assets\/|\/media\/assets\/)/i.test(result)
  )
    return fail(
      `${label}: usa una imagen web o del paquete. Las imágenes embebidas no se admiten en esta versión.`,
    );
  if (field.key === "alto" && result && !/^\d+(?:\.\d+)?(?:px)?$/.test(result))
    return fail(`${label}: la altura debe ser una medida positiva.`);
  return result;
}
function validateValues(input: unknown, resource: Resource): Values {
  const values = record(input, `Contenido de ${resourceName(resource)}`);
  const result = defaults(resource);
  for (const [key, value] of Object.entries(values)) {
    const field = resource.fields.find((f) => f.key === key);
    if (!field)
      return fail(`El recurso ${resource.id} no reconoce el campo «${key}».`);
    if (resource.catalog === "fraternidad" && field.type === "textlist" && Array.isArray(value) && value.length > textListLimit(resource))
      return fail(`El campo «${field.label}» admite hasta ${textListLimit(resource)} líneas.`);
    result[key] = fieldValue(value, field);
  }
  return result;
}
export function validateTemplate(input: unknown): ProgramTemplate {
  const t = record(input, "Plantilla");
  const name = text(t.name, "Nombre de plantilla", 100);
  if (!name.trim()) return fail("La plantilla necesita un nombre.");
  const selected = array(
    t.resources,
    "Recursos de plantilla",
    resources.length,
  ).map((v) => text(v, "Recurso", 100));
  if (
    selected.some((v) => !resourceById(v)) ||
    new Set(selected).size !== selected.length
  )
    return fail("La plantilla contiene recursos desconocidos o repetidos.");
  return { name, resources: selected };
}
export function validateProject(input: unknown): Project {
  if (JSON.stringify(input)?.length > MAX_PROJECT_BYTES)
    return fail("El proyecto supera el máximo de 8 MB.");
  const p = record(input, "Proyecto");
  if (p.schema !== "fratv-project" || p.version !== 1)
    return fail("Este archivo no es un proyecto FRATV compatible (versión 1).");
  const name = text(p.name, "Nombre del proyecto", 120);
  if (!name.trim()) return fail("El proyecto necesita un nombre.");
  const theme = text(p.theme, "Tema", 100),
    font = text(p.font, "Tipografía", 100),
    aspect = text(p.aspect, "Formato", 20);
  if (
    !themes.some((t) => t[0] === theme) ||
    !["aprobado", "editorial", "neutro"].includes(font) ||
    !Object.hasOwn(aspects, aspect)
  )
    return fail("El proyecto declara tema, tipografía o formato desconocido.");
  const updatedAt = text(p.updatedAt, "Fecha de actualización", 100);
  if (!Number.isFinite(Date.parse(updatedAt)))
    return fail("La fecha de actualización es inválida.");
  const e = record(p.episode, "Episodio");
  const episode: Episode = {
    program: text(e.program, "Nombre del programa", 160),
    date: text(e.date, "Fecha del episodio", 40),
    host: text(e.host, "Conductor", 100),
    hostRole: text(e.hostRole, "Cargo del conductor", 140),
    guests: array(e.guests, "Invitados", 20).map((g) => {
      const v = record(g, "Invitado");
      return {
        name: text(v.name, "Nombre del invitado", 100),
        role: text(v.role, "Cargo del invitado", 140),
      };
    }),
    topics: array(e.topics, "Temas", 30).map((v) =>
      text(v, "Tema del programa", 200),
    ),
    sponsors: array(e.sponsors, "Auspiciadores", 20).map((v) =>
      text(v, "Auspiciador", 150),
    ),
  };
  if (episode.date && !Number.isFinite(Date.parse(episode.date)))
    return fail("La fecha del episodio es inválida.");
  const rawDrafts = record(p.drafts, "Borradores"),
    drafts: Record<string, Values> = {};
  if (Object.keys(rawDrafts).length > resources.length)
    return fail("Hay demasiados borradores.");
  for (const [key, value] of Object.entries(rawDrafts)) {
    const resource = resourceById(key);
    if (!resource) return fail(`Recurso desconocido: ${key}.`);
    drafts[key] = validateValues(value, resource);
  }
  const itemIds = new Set<string>();
  const items = array(p.items, "Piezas del programa", 60).map((raw) => {
    const item = record(raw, "Pieza");
    const itemId = validId(item.id, "Identificador de pieza");
    if (itemIds.has(itemId))
      return fail("Hay piezas con el mismo identificador.");
    itemIds.add(itemId);
    const resourceId = text(item.resourceId, "Recurso de pieza", 100),
      resource = resourceById(resourceId);
    if (!resource) return fail(`Recurso desconocido: ${resourceId}.`);
    return {
      id: itemId,
      resourceId,
      label: text(item.label, "Nombre de pieza", 200),
      values: validateValues(item.values, resource),
    };
  });
  const rawLive =
    p.live === undefined ? {} : record(p.live, "Configuración de relojes");
  if (Object.keys(rawLive).length > 100)
    return fail("Hay demasiadas configuraciones de reloj.");
  const live: Record<string, LiveConfig> = {};
  for (const [key, raw] of Object.entries(rawLive)) {
    validId(key, "Identificador del reloj");
    if (["__proto__", "prototype", "constructor"].includes(key))
      return fail("El identificador del reloj está reservado.");
    const config = record(raw, "Configuración de reloj");
    if (config.mode !== "countdown" && config.mode !== "elapsed")
      return fail("El modo de reloj no es válido.");
    if (
      typeof config.durationMs !== "number" ||
      !Number.isFinite(config.durationMs) ||
      config.durationMs < 0 ||
      config.durationMs > 86400000
    )
      return fail("La duración del reloj debe estar entre 0 y 24 horas.");
    if (
      config.targetTime !== undefined &&
      (typeof config.targetTime !== "number" ||
        !Number.isFinite(config.targetTime) ||
        config.targetTime <= 0)
    )
      return fail("La hora objetivo del reloj no es válida.");
    live[key] = {
      mode: config.mode,
      durationMs: config.durationMs,
      ...(config.targetTime === undefined
        ? {}
        : { targetTime: config.targetTime as number }),
    };
  }
  return {
    schema: "fratv-project",
    version: 1,
    id: validId(p.id, "Identificador de proyecto"),
    name,
    updatedAt,
    theme,
    font,
    aspect,
    drafts,
    template: validateTemplate(p.template),
    episode,
    items,
    live,
  };
}
export function loadProjects(): Project[] {
  const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const projects = array(parsed, "Proyectos guardados", 30).map(
      validateProject,
    );
    if (new Set(projects.map((p) => p.id)).size !== projects.length)
      throw new Error("Identificadores repetidos.");
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    throw new Error(
      `No se pudo leer el guardado local. No se ha reemplazado: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export function saveProjects(projects: Project[]): void {
  // Leer antes de escribir impide reemplazar inadvertidamente un almacenamiento corrupto.
  loadProjects();
  if (projects.length > 30)
    return fail(
      "Puedes guardar hasta 30 proyectos locales. Exporta y elimina uno antes de continuar.",
    );
  const validated = projects.map(validateProject);
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(validated));
  } catch {
    throw new Error(
      "No se pudo guardar: el almacenamiento está lleno o deshabilitado. Exporta el proyecto como respaldo.",
    );
  }
}
export function saveProject(project: Project): void {
  const value = validateProject(project);
  const projects = loadProjects();
  saveProjects([value, ...projects.filter((p) => p.id !== value.id)]);
}
export function deleteProject(projectId: string): void {
  saveProjects(loadProjects().filter((p) => p.id !== projectId));
}
export function serializeProject(project: Project): string {
  return JSON.stringify(validateProject(project), null, 2);
}
export function loadTemplates(): ProgramTemplate[] {
  const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!raw) return [];
  try {
    return array(JSON.parse(raw), "Plantillas guardadas", 30).map(
      validateTemplate,
    );
  } catch {
    throw new Error(
      "No se pudieron leer las plantillas locales; se han conservado sin cambios.",
    );
  }
}
export function saveTemplate(template: ProgramTemplate): void {
  const validated = validateTemplate(template),
    current = loadTemplates();
  const templates = [
    validated,
    ...current.filter((t) => t.name !== validated.name),
  ];
  if (templates.length > 30)
    return fail("Hay un máximo de 30 plantillas guardadas.");
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    throw new Error(
      "No se pudo guardar la plantilla. Exporta el proyecto para conservarla.",
    );
  }
}
function clipped(value: string, resource: Resource, key: string): string {
  const max = resource.fields.find((f) => f.key === key)?.max;
  return max ? value.slice(0, max) : value;
}
export function generationWarnings(project: Project): string[] {
  const warnings: string[] = [];
  for (const resourceId of project.template.resources) {
    const resource = resourceById(resourceId)!;
    if (resourceId.startsWith("lower-third") || resourceId === "fraternidad-lower-third")
      for (const person of [
        { name: project.episode.host, role: project.episode.hostRole },
        ...project.episode.guests,
      ]) {
        for (const key of ["name", "role"] as const)
          if (
            person[key].length >
            (resource.fields.find((f) => f.key === key)?.max || Infinity)
          )
            warnings.push(
              `${person.name || "Invitado"}: ${key === "name" ? "nombre" : "cargo"} excede el largo de la placa y se recortará. Revísalo después de preparar.`,
            );
      }
    if (resourceId === "fraternidad-ticker" && project.episode.topics.some((topic) => topic.length > 60))
      warnings.push("Los avisos de Fraternidad se ajustarán a 60 caracteres por línea. Revisa los mensajes largos después de preparar.");
    if (resourceId === "fraternidad-ticker" && project.episode.topics.length > 20)
      warnings.push("La banda de Fraternidad admite hasta 20 avisos; se usarán los primeros 20 temas.");
    if (["fraternidad-program-title", "fraternidad-start", "fraternidad-ident-long", "fraternidad-ident-short"].includes(resourceId) && (project.episode.topics[0] || "").length > 60)
      warnings.push(`La bajada de «${resourceName(resource)}» se ajustará a 60 caracteres.`);
    if (resourceId === "fraternidad-sponsor" && project.episode.sponsors.some((name) => name.length > 60))
      warnings.push("Hay nombres de auspiciadores que se ajustarán a 60 caracteres.");
    if (["program-title", "bumper-in", "bumper-evento", "fraternidad-program-title", "fraternidad-start", "fraternidad-ident-long", "fraternidad-ident-short"].includes(resourceId)) {
      const key = resourceId === "bumper-evento" ? "titulo" : "title";
      if (
        project.episode.program.length >
        (resource.fields.find((f) => f.key === key)?.max || Infinity)
      )
        warnings.push(
          `El nombre del programa se recortará en «${resourceName(resource)}».`,
        );
    }
  }
  if (project.episode.sponsors.length)
    warnings.push(
      "Los nombres de auspiciadores se guardan en el episodio. Debes asignar sus logos en cada pieza antes de exportar.",
    );
  if (!project.episode.program.trim())
    warnings.push("Falta el nombre del programa.");
  return [...new Set(warnings)];
}
export function generateItems(project: Project): ProgramItem[] {
  const items: ProgramItem[] = [],
    e = project.episode;
  const add = (resource: Resource, label: string, extra: Values = {}) => {
    const values = {
      ...defaults(resource),
      ...(project.drafts[resource.id] || {}),
      ...extra,
    };
    const supported = Object.fromEntries(Object.entries(values).filter(([key]) => resource.fields.some((field) => field.key === key)));
    items.push({ id: id(), resourceId: resource.id, label, values: supported });
  };
  for (const resourceId of project.template.resources) {
    const resource = resourceById(resourceId);
    if (!resource) throw new Error(`Recurso desconocido: ${resourceId}.`);
    if (resourceId.startsWith("fraternidad-") && resourceId !== "fraternidad-lower-third") {
      const piece = resourceId.slice("fraternidad-".length);
      const clean = (value: string) => value.replace(/[;|]/g, ",");
      const date = e.date.replace("T", " · ");
      const subtitle = clipped(e.topics[0] || date, resource, "subtitle");
      if (["ident-long", "ident-short", "start", "program-title"].includes(piece))
        add(resource, e.program || resourceName(resource), { title: clipped(e.program, resource, "title"), subtitle });
      else if (piece === "schedule")
        add(resource, "Agenda del programa", { dayLabel: clipped(e.date.slice(0, 10) || "HOY", resource, "dayLabel"), rows: (e.topics.length ? e.topics : [e.program]).slice(0, 5).map((topic) => ["", clean(topic), ""]) });
      else if (piece === "ticker")
        add(resource, "Avisos del programa", { items: (e.topics.length ? e.topics : [e.program]).slice(0, textListLimit(resource)).map((topic) => clipped(clean(topic), resource, "items")) });
      else if (piece === "sponsor") {
        for (const name of e.sponsors.length ? e.sponsors : [""])
          add(resource, name ? `Auspiciador · ${name}` : "Auspiciador pendiente", { name: clipped(name, resource, "name"), logo: "" });
      } else if (piece === "comment")
        add(resource, "Pregunta de la comunidad", { name: "", comment: "" });
      else if (piece === "credits")
        add(resource, "Créditos del programa", { rows: [["PROGRAMA", clean(e.program)], ...[{ name: e.host, role: e.hostRole }, ...e.guests].filter((person) => person.name.trim()).map((person) => [clean(person.role || "PARTICIPANTE"), clean(person.name)])] });
      else if (["out", "break"].includes(piece))
        add(resource, resourceName(resource), { subtitle: clipped(e.program, resource, "subtitle") });
      else add(resource, resourceName(resource));
      continue;
    }
    if (resourceId.startsWith("lower-third") || resourceId === "fraternidad-lower-third") {
      const people = [{ name: e.host, role: e.hostRole }, ...e.guests].filter(
        (person) => person.name.trim(),
      );
      if (!people.length)
        add(resource, resourceName(resource), {
          name: "",
          role: "",
          topic: "",
        });
      for (const person of people)
        add(resource, `Nombre · ${person.name}`, {
          name: clipped(person.name, resource, "name"),
          role: clipped(person.role, resource, "role"),
          topic: clipped(e.topics[0] || "", resource, "topic"),
        });
    } else if (resourceId === "program-title")
      add(resource, e.program || resourceName(resource), {
        title: clipped(e.program, resource, "title"),
        meta: clipped(
          e.date ? e.date.replace("T", " · ") : "",
          resource,
          "meta",
        ),
      });
    else if (resourceId === "bumper-in")
      add(resource, "Apertura del programa", {
        title: clipped(e.program || "EN BREVE COMIENZA", resource, "title"),
      });
    else if (resourceId === "bumper-evento")
      add(resource, e.program || "Cortinilla de evento", {
        titulo: clipped(e.program, resource, "titulo"),
        subtitulo: clipped(e.date.replace("T", " · "), resource, "subtitulo"),
      });
    else if (resourceId === "countdown")
      add(
        resource,
        "Cuenta regresiva en vivo",
        e.date ? { target: e.date } : {},
      );
    else if (resourceId === "ticker")
      add(resource, "Temas del programa", {
        items: e.topics.length
          ? e.topics.map((v) => v.replace(/;/g, ","))
          : [e.program || ""],
      });
    else if (resourceId === "schedule")
      add(resource, "Temas y programación", {
        rows: (e.topics.length ? e.topics : [e.program])
          .slice(0, 5)
          .map((topic) => ["", topic.replace(/[;|]/g, ","), ""]),
      });
    else if (resourceId === "sponsor" && e.sponsors.length)
      for (const sponsor of e.sponsors)
        add(resource, `Auspiciador · ${sponsor}`, { logo: "" });
    else if (resourceId === "end-credits")
      add(resource, "Créditos del programa", {
        rows: [
          ["PROGRAMA", e.program.replace(/[;|]/g, ",")],
          ...[{ name: e.host, role: e.hostRole }, ...e.guests]
            .filter((p) => p.name.trim())
            .map((p) => [
              (p.role || "PARTICIPANTE").replace(/[;|]/g, ","),
              p.name.replace(/[;|]/g, ","),
            ]),
        ],
      });
    else add(resource, resourceName(resource));
  }
  if (items.length > 60)
    throw new Error(
      "La plantilla produciría más de 60 piezas. Reduce los invitados o los recursos.",
    );
  return items;
}
/** Regenera el episodio y lleva sus ajustes de reloj a las nuevas instancias.
 * Las claves por recurso permanecen; las de piezas reemplazadas se depuran. */
export function prepareProject(project: Project): Project {
  const items = generateItems(project);
  const live: Record<string, LiveConfig> = {};
  for (const [key, config] of Object.entries(project.live)) {
    if (resourceById(key)) live[key] = structuredClone(config);
  }
  const previous = new Map<string, ProgramItem[]>();
  for (const item of project.items) {
    const group = previous.get(item.resourceId) || [];
    group.push(item);
    previous.set(item.resourceId, group);
  }
  for (const item of items) {
    const oldItem = previous.get(item.resourceId)?.shift();
    const config = (oldItem && project.live[oldItem.id]) || project.live[item.resourceId];
    if (config) live[item.id] = structuredClone(config);
  }
  return { ...project, items, live, updatedAt: now() };
}

export interface ParsedBrief {
  episode: Partial<Episode>;
  warnings: string[];
}
export function parseBrief(input: string): ParsedBrief {
  if (input.length > 100000)
    throw new Error("El brief es demasiado largo. Máximo 100.000 caracteres.");
  const episode: Partial<Episode> = {},
    warnings: string[] = [];
  const aliases: Record<string, keyof Episode> = {
    programa: "program",
    nombre: "program",
    fecha: "date",
    conductor: "host",
    conductora: "host",
    cargo: "hostRole",
    "cargo conductor": "hostRole",
    "cargo conductora": "hostRole",
    invitado: "guests",
    invitada: "guests",
    invitados: "guests",
    invitadas: "guests",
    tema: "topics",
    temas: "topics",
    auspiciador: "sponsors",
    auspiciadores: "sponsors",
  };
  let recognized = 0;
  for (const [index, line] of input.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (!match) {
      warnings.push(
        `Línea ${index + 1}: no tiene una etiqueta reconocible; no se aplicará.`,
      );
      continue;
    }
    const key = match[1]
      .trim()
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const field = aliases[key],
      value = match[2].trim();
    if (!field) {
      warnings.push(`Etiqueta «${match[1]}» no reconocida; no se aplicará.`);
      continue;
    }
    recognized++;
    if (field === "guests") {
      const people = value
        .split(";")
        .filter(Boolean)
        .map((person) => {
          const [name, ...role] = person.split("|");
          return {
            name: name.trim().slice(0, 100),
            role: role.join("|").trim().slice(0, 140),
          };
        });
      episode.guests = [...(episode.guests || []), ...people].slice(0, 20);
      if (people.some((p) => !p.role))
        warnings.push("Hay invitados sin cargo. El campo quedará vacío.");
    } else if (field === "topics" || field === "sponsors") {
      episode[field] = [
        ...(episode[field] || []),
        ...value
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean),
      ].slice(0, field === "topics" ? 30 : 20);
    } else if (field === "date") {
      if (value && !Number.isFinite(Date.parse(value)))
        warnings.push(
          `Fecha «${value}» no válida. Usa AAAA-MM-DDTHH:MM; no se aplicará.`,
        );
      else episode.date = value;
    } else episode[field] = value;
  }
  if (!recognized)
    warnings.push(
      "No se reconoció información. Usa el ejemplo de brief etiquetado.",
    );
  return { episode, warnings };
}
