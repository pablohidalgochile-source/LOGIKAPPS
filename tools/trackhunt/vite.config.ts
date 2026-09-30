import { defineConfig } from "vite";
import vinext from "vinext";
export default defineConfig({
  plugins: [vinext()],
  server: { host: "127.0.0.1", strictPort: true },
  build: { sourcemap: false },
});
