/* Servidor del paquete OBS: solo módulos incluidos en Node. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve, extname, sep, join } from "node:path";
import { createStudioApi } from "./server.mjs";
const root = resolve(import.meta.dirname, "..");
const api = createStudioApi({ root, storageDir: join(root, ".estado-local") });
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const server = createServer((req, res) =>
  api.middleware(req, res, async () => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const relative =
        path === "/"
          ? "fuentes.html"
          : path.startsWith("/media/")
            ? "handoff/" + path.slice(7)
            : path === "/fuentes.html"
              ? "fuentes.html"
              : null;
      if (!relative) {
        res.writeHead(404).end("No encontrado");
        return;
      }
      const file = resolve(root, relative);
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
        throw Error();
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end("No encontrado");
    }
  }),
);
const port = Number(process.env.FRATV_PORT ?? 8796);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("FRATV_PORT debe ser un puerto entre 0 y 65535.");
server.listen(port, "127.0.0.1", () =>
  console.log(`Paquete OBS disponible en http://127.0.0.1:${server.address().port}/fuentes.html`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await api.close();
    server.close(() => process.exit(0));
  });
