/* FRATV — comprueba que manifest.json y fratv-aspectos.css digan lo mismo.

   El ancho de diseño y las áreas seguras están en dos lugares: la hoja de
   estilos, que es la que manda en el render, y el manifiesto, que es de donde
   lee la app. Dos copias de un dato se desincronizan solas, así que esto
   falla en cuanto dejan de coincidir.

   Uso:  node verificar-aspectos.mjs      (sale con código 1 si hay diferencia)
*/
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI    = dirname(fileURLToPath(import.meta.url));
const HANDOFF = resolve(AQUI, '..', 'handoff');

const man = JSON.parse(await readFile(join(HANDOFF, 'manifest.json'), 'utf8'));
const css = await readFile(join(HANDOFF, 'resources', 'fratv-aspectos.css'), 'utf8');

/* Lee cada bloque :root[data-aspecto="…"] { … } de la hoja. */
const enCss = {};
for (const m of css.matchAll(/:root\[data-aspecto="([^"]+)"\]\s*\{([^}]*)\}/g)) {
  const [, aspecto, cuerpo] = m;
  const leer = (prop) => (cuerpo.match(new RegExp(`--${prop}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
  const u = leer('fr-u');
  enCss[aspecto] = {
    designWidth: u && Number((u.match(/\/\s*(\d+)/) || [])[1]),
    safeAreas: {
      top:    leer('safe-top'),
      bottom: leer('safe-bottom'),
      x:      leer('safe-x'),
      lower:  leer('safe-lower'),
      flag:   leer('safe-flag'),
    }
  };
}

const fallos = [];
for (const [aspecto, dim] of Object.entries(man.aspects)) {
  const c = enCss[aspecto];
  if (!c) { fallos.push(`${aspecto}: no existe en fratv-aspectos.css`); continue; }
  if (c.designWidth !== dim.designWidth) {
    fallos.push(`${aspecto}: designWidth manifiesto=${dim.designWidth} css=${c.designWidth}`);
  }
  for (const [k, v] of Object.entries(dim.safeAreas || {})) {
    if (c.safeAreas[k] !== v) {
      fallos.push(`${aspecto}: safeAreas.${k} manifiesto=${v} css=${c.safeAreas[k]}`);
    }
  }
}
for (const aspecto of Object.keys(enCss)) {
  if (!man.aspects[aspecto]) fallos.push(`${aspecto}: está en la hoja pero no en el manifiesto`);
}

if (fallos.length) {
  console.error('\n  ✗ El manifiesto y la hoja de formatos no coinciden:\n');
  for (const f of fallos) console.error(`     ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`\n  ✓ ${Object.keys(man.aspects).length} formatos coinciden entre manifest.json y fratv-aspectos.css\n`);
for (const [a, d] of Object.entries(man.aspects)) {
  const s = d.safeAreas;
  console.log(`     ${a.padEnd(5)} ${String(d.w).padStart(4)}×${String(d.h).padEnd(4)}  ancho de diseño ${String(d.designWidth).padStart(4)}  ` +
              `seguras ${s.top}/${s.bottom}/${s.x}  lower ${s.lower}  mosca ${s.flag}`);
}
console.log('');
