export type FieldValue = string | number | string[] | string[][];
export interface Field {
  key: string;
  label: string;
  type: string;
  default?: FieldValue;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  optional?: boolean;
  schema?: { key: string }[];
}
export interface Resource {
  id: string;
  name: string;
  family: string;
  file: string;
  aspects: string[];
  durationMs: number;
  loop: boolean;
  alpha: boolean;
  fields: Field[];
  catalog?: "fratv" | "fraternidad" | "coproduccion";
  liveMode?: "countdown" | "elapsed";
}
export type Values = Record<string, FieldValue>;
export const catalogNames: Record<string, string> = {
  fratv: "FRATV",
  fraternidad: "Fraternidad",
  coproduccion: "Coproducción",
};
export function resourceCatalog(resource: Resource): string {
  return resource.catalog || (resource.id.endsWith("-evento") ? "coproduccion" : "fratv");
}
export function textListLimit(resource: Resource): number {
  return ["bumper-out", "fraternidad-out"].includes(resource.id) ? 2 : 20;
}
export function isLiveResource(resource: Resource, values: Values = {}): boolean {
  return Boolean(resource.liveMode) || resource.id === "countdown" || resource.id === "bumper-in" ||
    (resource.id === "live-badge" && values.variant === "reloj");
}
export const familyNames: Record<string, string> = {
  marca: "Marca",
  estado: "Estado",
  cortinilla: "Cortinillas",
  informacion: "Información",
  interaccion: "Interacción",
  comercial: "Comercial",
  cierre: "Cierre",
};
export const displayNames: Record<string, string> = {
  "lower-third": "Nombre y cargo",
  "lower-third-evento": "Nombre y cargo · evento",
  "ident-long": "Identidad de canal",
  "ident-short": "Identidad breve",
  "end-credits": "Créditos de cierre",
  sponsor: "Auspiciador",
  ticker: "Banda de noticias",
};
export const resourceName = (r: Resource) => displayNames[r.id] || r.name;
export const themes = [
  ["fratv-oficial", "Identidad oficial"],
  ["fratv-invertido", "Invertido"],
  ["fratv-mono-marfil", "Monocromo marfil"],
  ["fratv-mono-negro", "Monocromo negro"],
];
export function defaults(resource: Resource): Values {
  return Object.fromEntries(
    resource.fields.map((f) => [
      f.key,
      typeof f.default === "string"
        ? f.default.replace(/\\n/g, "\n")
        : structuredClone(f.default ?? ""),
    ]),
  );
}
export function fieldUnavailable(
  resource: Resource,
  field: Field,
): string | undefined {
  if (resource.id === "end-credits" && field.key === "speed")
    return "El recurso aprobado tiene una duración fija de 22 segundos.";
  if (field.type === "clock")
    return resource.id === "live-badge"
      ? "El reloj avanza en tiempo real al elegir la variante «reloj»."
      : "Este campo todavía no está conectado en el recurso original.";
}
export function duration(
  resource: Resource,
  values: Values,
  aspect: string,
): number {
  if (resource.id === "ticker")
    return Number(values.speed || 18) * 1000 * (aspect === "9:16" ? 1.5 : 1);
  return resource.durationMs;
}
export function resourceUrl(
  resource: Resource,
  values: Values,
  aspect: string,
  theme: string,
  font: string,
): string {
  const params = new URLSearchParams({
    autoplay: "0",
    aspecto: aspect,
    tema: resourceCatalog(resource) === "fraternidad" ? "fraternidad" : theme,
    tipo: font,
  });
  for (const field of resource.fields) {
    if (fieldUnavailable(resource, field)) continue;
    const value = values[field.key] ?? "";
    if (resource.id === "bumper-out" && field.key === "socials") {
      const lines = Array.isArray(value) ? value : [];
      params.set("social1", String(lines[0] ?? ""));
      params.set("social2", String(lines[1] ?? ""));
      continue;
    }
    const serialized =
      field.type === "rows"
        ? (value as string[][]).map((row) => row.join("|")).join(";")
        : field.type === "textlist"
          ? (value as string[]).join(";")
          : field.type === "multienum"
            ? (value as string[]).join(",") || "ninguno"
            : String(value);
    if (field.type === "datetime" && !serialized) continue;
    params.set(
      field.key,
      resource.id === "ticker" && field.key === "items" && !serialized
        ? ";"
        : serialized,
    );
  }
  // El ciclo vertical de la banda dura 1,5 veces el horizontal, según su CSS aprobado.
  if (resource.id === "ticker")
    params.set("duracion", String(duration(resource, values, aspect)));
  return `/media/${resource.file}?${params}`;
}
export const timeLabel = (ms: number) =>
  `${(ms / 1000).toFixed(2).replace(".", ",")} s`;
