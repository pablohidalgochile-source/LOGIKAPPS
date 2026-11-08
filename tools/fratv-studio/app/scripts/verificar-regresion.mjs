/* FRATV — compara el render actual contra la referencia aprobada.

   La referencia vive en laminas/referencia-16x9/ y laminas/referencia-9x16/,
   y SÍ se versiona: es la foto de lo que el cliente aprobó. Cualquier cambio
   a un recurso tiene que pasar por aquí.

   Cómo se mide (las dos trampas ya costaron caro, ver §5.5 y §5.6 del hand-off):
   · Se aplana sobre negro antes de comparar. El AE de ImageMagick sobre PNG
     con alfa devuelve números sin sentido.
   · Se cuentan solo los píxeles que difieren más de un 40 % en color, y se
     toleran hasta 1500. El texto de Chrome varía en los bordes entre una carga
     y otra (medido: hasta ~7000 px a tolerancia cero, 490 px al 40 %), pero
     esa variación es tenue; un cambio real es fuerte. Un umbral en porcentaje
     del cuadro NO sirve: se probó, y una mosca un 20 % más grande pasaba como
     ruido porque la mosca ocupa menos del 1 % del cuadro.
   · countdown se salta: depende del reloj real, cambia por diseño.

   Uso:
     node verificar-regresion.mjs              compara 16:9 y 9:16
     node verificar-regresion.mjs 9:16         solo un formato
     node verificar-regresion.mjs --guardar    reemplaza la referencia (solo
                                               después de que el cliente apruebe) */
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const LAMINAS = resolve(import.meta.dirname, '..', 'laminas');
const GUARDAR = process.argv.includes('--guardar');
const pedido  = process.argv.slice(2).find(a => !a.startsWith('--'));
const FORMATOS = pedido ? [pedido] : ['16:9', '9:16'];
const SALTAR  = ['countdown'];
const FUZZ    = '40%';  // diferencia de color mínima para contar un píxel
const UMBRAL  = 1500;   // píxeles fuertes tolerados (ruido de rasterizado)

const renderizar = (aspecto, salida) =>
  execFileSync('node', [join(import.meta.dirname, 'renderizar-laminas.mjs'), aspecto, `--salida=${salida}`],
               { stdio: 'ignore' });

function distintos(a, b, tmp) {
  execFileSync('magick', [a, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', `${tmp}/a.png`]);
  execFileSync('magick', [b, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', `${tmp}/b.png`]);
  let out;
  try { out = execFileSync('compare', ['-fuzz', FUZZ, '-metric', 'AE', `${tmp}/a.png`, `${tmp}/b.png`, 'null:'], { stdio: 'pipe' }).toString(); }
  catch (e) { out = (e.stderr || '').toString(); }   // compare sale con 1 cuando hay diferencias
  const n = out.match(/\(([\d.e+-]+)\)/);              // el valor útil es el de los paréntesis
  return n ? Number(n[1]) : Number(out.trim().split(/\s/)[0]);
}

let fallas = 0;
for (const aspecto of FORMATOS) {
  const ref = join(LAMINAS, `referencia-${aspecto.replace(':', 'x')}`);

  if (GUARDAR) {
    rmSync(ref, { recursive: true, force: true });
    renderizar(aspecto, ref);
    rmSync(join(ref, '_CONTACTO.png'), { force: true });
    console.log(`  referencia ${aspecto} guardada en ${ref}`);
    continue;
  }
  if (!existsSync(ref)) { console.error(`  No hay referencia ${aspecto}. Créala con --guardar.`); process.exit(1); }

  const tmp = join(tmpdir(), `fratv-regresion-${process.pid}`);
  const ahora = join(tmp, 'ahora');
  mkdirSync(ahora, { recursive: true });
  renderizar(aspecto, ahora);

  console.log(`\n  ${aspecto}`);
  for (const f of readdirSync(ref).filter(f => f.endsWith('.png')).sort()) {
    const id = f.replace('.png', '');
    if (SALTAR.includes(id)) { console.log(`   —  ${id.padEnd(20)} se salta (reloj en vivo)`); continue; }
    const actual = join(ahora, f);
    if (!existsSync(actual)) { console.log(`   ✗  ${id.padEnd(20)} ya no se renderiza`); fallas++; continue; }
    const px = distintos(join(ref, f), actual, tmp);
    const veredicto = px === 0 ? 'idéntico' : px < UMBRAL ? `ruido de borde (${px} px)` : `CAMBIÓ (${px} px)`;
    if (px >= UMBRAL) fallas++;
    console.log(`   ${px >= UMBRAL ? '✗' : '✓'}  ${id.padEnd(20)} ${veredicto}`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

if (!GUARDAR) {
  console.log(fallas ? `\n  ${fallas} recursos cambiaron respecto de lo aprobado.\n`
                     : `\n  Todo coincide con la referencia aprobada.\n`);
  process.exit(fallas ? 1 : 0);
}
