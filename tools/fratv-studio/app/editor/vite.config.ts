import { defineConfig, type Plugin } from "vite";
import { createReadStream, existsSync, statSync, cpSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// @ts-expect-error El servicio Node se mantiene como módulo JS portable para OBS.
import { createStudioApi } from "./server/server.mjs";
const root = resolve(import.meta.dirname, "..");
const mounts = [
  ["/media/resources/", resolve(root, "handoff/resources")],
  ["/media/assets/", resolve(root, "handoff/assets")],
  ["/media/fraternidad/", resolve(root, "handoff/fraternidad")],
  ["/reference/", resolve(root, "laminas/referencia-16x9")],
  ["/pilotos-fraternidad/", resolve(root, "propuestas/fraternidad-v1")],
] as const;
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/* Los originales y los pilotos se sirven en rutas separadas y se copian sin cambios. */
function approvedResources(): Plugin {
  return {
    name: "recursos-aprobados",
    configureServer(server) {
      server.middlewares.use(
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const path = new URL(req.url || "/", "http://localhost").pathname;
          const mount = mounts.find(([prefix]) => path.startsWith(prefix));
          if (!mount) return next();
          let file: string;
          try {
            file = resolve(
              mount[1],
              decodeURIComponent(path.slice(mount[0].length) || "index.html"),
            );
          } catch {
            res.statusCode = 400;
            res.end();
            return;
          }
          if (
            !file.startsWith(mount[1] + sep) ||
            !existsSync(file) ||
            !statSync(file).isFile()
          ) {
            res.statusCode = 404;
            res.end("Recurso no encontrado");
            return;
          }
          res.setHeader(
            "Content-Type",
            types[extname(file)] || "application/octet-stream",
          );
          createReadStream(file).pipe(res);
        },
      );
    },
    closeBundle() {
      for (const [prefix, source] of mounts)
        cpSync(source, resolve(import.meta.dirname, "dist", prefix.slice(1)), {
          recursive: true,
        });
    },
  };
}
function studioApi(): Plugin {
  return {
    name: "produccion-local",
    configureServer(server) {
      const api = createStudioApi({ root });
      server.middlewares.use(api.middleware);
      server.httpServer?.once("close", () => {
        void api.close();
      });
    },
    configurePreviewServer(server) {
      const api = createStudioApi({ root });
      server.middlewares.use(api.middleware);
      server.httpServer.once("close", () => {
        void api.close();
      });
    },
  };
}
export default defineConfig({
  plugins: [studioApi(), approvedResources()],
  server: { fs: { allow: [root] } },
});
