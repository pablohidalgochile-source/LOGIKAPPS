import baseManifest from "../../handoff/manifest.json" with { type: "json" };
import fraternidadManifest from "../../handoff/fraternidad/manifest.json" with { type: "json" };
import type { Resource } from "./model.ts";

// El catálogo original conserva su manifiesto y sus referencias de aprobación.
export const resources: Resource[] = [
  ...(baseManifest.resources as Resource[]),
  ...(fraternidadManifest.resources as Resource[]),
];
export const aspects = baseManifest.aspects;
export const fps = baseManifest.fps;
