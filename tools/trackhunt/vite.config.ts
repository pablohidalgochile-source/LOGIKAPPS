import { defineConfig } from "vite";
import vinext from "vinext";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [vinext()],
  resolve: { alias: { "cloudflare:workers": fileURLToPath(new URL("./portable-env.ts", import.meta.url)) } },
  server: { host: "127.0.0.1", strictPort: true },
  build: { sourcemap: false }
});
