import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaults,
  duration,
  fieldUnavailable,
  resourceUrl,
} from "../src/model.ts";
import type { Resource } from "../src/model.ts";
const manifest = JSON.parse(
  readFileSync(new URL("../../handoff/manifest.json", import.meta.url), "utf8"),
);
const get = (id: string): Resource =>
  manifest.resources.find((r: Resource) => r.id === id);
const params = (r: Resource, v = defaults(r), aspect = "16:9") =>
  new URL(
    resourceUrl(r, v, aspect, "fratv-oficial", "aprobado"),
    "http://localhost",
  ).searchParams;
test("Conserva caracteres reservados y saltos de línea en textos, sin inyectar parámetros", () => {
  const r = get("lower-third");
  const p = params(r, {
    ...defaults(r),
    name: "ANA & JOSÉ? #1",
    role: "",
    topic: "Línea 1\nLínea 2",
  });
  assert.equal(p.get("name"), "ANA & JOSÉ? #1");
  assert.equal(p.get("role"), "");
  assert.equal(p.get("topic"), "Línea 1\nLínea 2");
  assert.equal(p.get("autoplay"), "0");
});
test("Traduce filas y redes al contrato real de los HTML", () => {
  assert.equal(
    params(get("schedule"), { rows: [["21:00", "Programa", "VIVO"]] }).get(
      "rows",
    ),
    "21:00|Programa|VIVO",
  );
  const p = params(get("bumper-out"), { socials: ["@FRATV", "YOUTUBE"] });
  assert.equal(p.get("social1"), "@FRATV");
  assert.equal(p.get("social2"), "YOUTUBE");
  assert.equal(p.has("socials"), false);
});
test("Permite ocultar todos los módulos sin activar el fallback del recurso", () => {
  assert.equal(
    params(get("engagement"), { modules: [] }).get("modules"),
    "ninguno",
  );
});
test("El tiempo del ticker vertical cubre su ciclo CSS completo", () => {
  const r = get("ticker");
  assert.equal(duration(r, { speed: 18 }, "9:16"), 27000);
  assert.equal(
    params(r, { ...defaults(r), speed: 18 }, "9:16").get("duracion"),
    "27000",
  );
  assert.equal(duration(r, { speed: 18 }, "16:9"), 18000);
});
test("No expone ajustes de reloj o velocidad que el recurso no implementa", () => {
  const r = get("end-credits");
  assert(fieldUnavailable(r, r.fields.find((f) => f.key === "speed")!));
  assert.equal(params(r).has("speed"), false);
  assert.equal(params(get("live-badge")).has("clock"), false);
});
test("Los borradores no mutan el manifiesto y normalizan saltos de línea", () => {
  const r = get("schedule");
  const v = defaults(r);
  (v.rows as string[][])[0][0] = "CAMBIO";
  assert.notEqual((defaults(r).rows as string[][])[0][0], "CAMBIO");
  assert.equal(defaults(get("program-title")).title, "HISTORIAS\nDE BARRIO");
});

const fraternidad = JSON.parse(
  readFileSync(new URL("../../handoff/fraternidad/manifest.json", import.meta.url), "utf8"),
);
const getFraternidad = (id: string): Resource => fraternidad.resources.find((r: Resource) => r.id === `fraternidad-${id}`);
test("Fraternidad conserva su paleta al exportar y transmite cada opción tipográfica", () => {
  const r = getFraternidad("lower-third");
  for (const font of ["aprobado", "editorial", "neutro"]) {
    const url = new URL(resourceUrl(r, { name: "José & María", role: "Comunidad" }, "9:16", "fratv-invertido", font), "http://localhost");
    assert.equal(url.pathname, "/media/fraternidad/resources/fraternidad-lower-third.html");
    assert.equal(url.searchParams.get("tipo"), font);
    assert.equal(url.searchParams.get("tema"), "fraternidad");
    assert.equal(url.searchParams.get("name"), "José & María");
    assert.equal(url.searchParams.get("aspecto"), "9:16");
  }
  assert.equal(new URL(resourceUrl(get("lower-third"), defaults(get("lower-third")), "16:9", "fratv-invertido", "aprobado"), "http://localhost").searchParams.get("tema"), "fratv-invertido");
});
test("El adaptador mantiene los campos propios de agenda y cierre Fraternidad", () => {
  assert.equal(params(getFraternidad("schedule"), { rows: [["21:00", "Comunidad", "EN VIVO"]] }).get("rows"), "21:00|Comunidad|EN VIVO");
  const out = params(getFraternidad("out"), { socials: ["@comunidad", "Canal local"] });
  assert.equal(out.get("socials"), "@comunidad;Canal local");
  assert.equal(out.has("social1"), false);
  assert.equal(duration(getFraternidad("ticker"), {}, "9:16"), getFraternidad("ticker").durationMs);
});
