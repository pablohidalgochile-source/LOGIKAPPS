import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const notices = new Map();
const licenses = {
  name: 'pack-dependency-notices',
  generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue;
      for (const module of Object.keys(chunk.modules)) {
        if (!module.includes('/node_modules/')) continue;
        let folder = path.dirname(module.split('?')[0]);
        while (folder !== path.dirname(folder)) {
          const manifest = path.join(folder, 'package.json');
          if (fs.existsSync(manifest)) {
            const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            if (pkg.name) {
              const files = fs.readdirSync(folder).filter(name => /^(license|copying)(\.|$)/i.test(name));
              const text = files.filter(name => fs.statSync(path.join(folder, name)).isFile()).map(name => fs.readFileSync(path.join(folder, name), 'utf8')).join('\n\n');
              notices.set(pkg.name, `${pkg.name} ${pkg.version || ''}\nLicense: ${pkg.license || 'See upstream license'}\n${text || 'License text: consult this package upstream.'}`);
              break;
            }
          }
          folder = path.dirname(folder);
        }
      }
    }
    fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.txt'), [...notices].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text).join('\n\n==============================\n\n') + '\n');
  }
};
await build({
  root, configFile: false, publicDir: false, base: './', envPrefix: 'PACK_PUBLIC_',
  resolve: { alias: { '@': path.join(root, 'src') } },
  plugins: [react(), licenses], css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: 'site', emptyOutDir: true, sourcemap: false, modulePreload: false }
});
