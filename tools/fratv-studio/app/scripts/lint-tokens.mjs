/* FRATV · lint del contrato de recursos.

   Comprueba tres cosas en handoff/resources/*.html:

   1. COLOR LITERAL      todo color sale de var(--fr-*), salvo en el bloque
                         :root de valores por defecto y en fratv-aspectos.css.
   2. TIPOGRAFÍA LITERAL  idem con font-family.
   3. MEDIDA LITERAL     nada de px desnudos: van como calc(n * var(--fr-u)).
                         Se perdonan los filetes de 1 y 2 px.

   Por qué existe: sin esto, el cliente no puede cambiar el color de todo desde
   un selector, que es un requisito, y el paquete deja de funcionar en vertical.

   ── Sobre la regla, que ya se escribió mal una vez ──
   La versión anterior usaba  /font-family:\s*(?!var\()/  para cazar fuentes
   literales. NO DETECTA NADA: \s* puede consumir cero caracteres, así que el
   lookahead se evalúa justo después de los dos puntos, donde casi siempre pasa.
   Por eso este archivo trae sus propias pruebas: `node lint-tokens.mjs --probar`
   verifica que las reglas aciertan sobre casos conocidos antes de confiar en
   ellas. Una regla de lint sin prueba es una regla que no sabes si corre.

   Uso:
     node lint-tokens.mjs            revisa los recursos (sale 1 si hay faltas)
     node lint-tokens.mjs --probar   prueba las reglas contra casos conocidos
*/
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI      = dirname(fileURLToPath(import.meta.url));
const RECURSOS  = resolve(AQUI, '..', 'handoff', 'resources');

/* Un valor es literal si contiene un color o una fuente escritos a mano.
   Se analiza el VALOR de la declaración, no la línea entera, para no depender
   de dónde quedaron los espacios. */
const COLOR_LITERAL  = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/;
const FUENTE_LITERAL = /['"][^'"]+['"]|\b(?:serif|sans-serif|monospace|system-ui|cursive|fantasy)\b/;
const PX_LITERAL     = /(?<![\w.])(\d+)px/g;

const PROP_COLOR = /^(color|background|background-color|border|border-[a-z]+|outline|fill|stroke|box-shadow|text-shadow)$/;

/* Devuelve [{prop, valor, indice}] de un bloque CSS. */
function declaraciones(css) {
  const out = [];
  for (const m of css.matchAll(/([-a-zA-Z]+)\s*:\s*([^;{}]+)/g)) {
    out.push({ prop: m[1], valor: m[2].trim(), indice: m.index });
  }
  return out;
}

/* El bloque :root de cada recurso define los valores por omisión y SÍ puede
   llevar literales: es justamente donde viven. Se recorta antes de analizar. */
function sinBloquesRoot(css) {
  return css.replace(/:root[^{]*\{[^}]*\}/g, (b) => ' '.repeat(b.length));
}

function revisar(nombre, html) {
  const faltas = [];
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    const css = sinBloquesRoot(m.group ? m.group(1) : m[1]);
    const base = m.index + m[0].indexOf(m[1]);

    for (const d of declaraciones(css)) {
      const linea = html.slice(0, base + d.indice).split('\n').length;
      if (d.valor.includes('var(--fr-')) continue;

      if (PROP_COLOR.test(d.prop) && COLOR_LITERAL.test(d.valor)) {
        faltas.push({ linea, tipo: 'color literal', texto: `${d.prop}: ${d.valor}` });
      }
      if (d.prop === 'font-family' && FUENTE_LITERAL.test(d.valor)) {
        faltas.push({ linea, tipo: 'tipografía literal', texto: `${d.prop}: ${d.valor}` });
      }
      for (const p of d.valor.matchAll(PX_LITERAL)) {
        if (Number(p[1]) <= 2) continue;              // filetes
        faltas.push({ linea, tipo: 'medida literal', texto: `${d.prop}: ${d.valor}` });
        break;
      }
    }
  }
  return faltas;
}

/* ── Pruebas de las reglas ─────────────────────────────────────────────── */
const CASOS = [
  ['<style>.a{color:#FF0000}</style>',                       1, 'color literal detectado'],
  ['<style>.a{color:var(--fr-text)}</style>',                0, 'color por token permitido'],
  ['<style>:root{--fr-text:#F5F1E8}</style>',                0, ':root puede llevar literales'],
  ['<style>.a{font-family:\'Poppins\',sans-serif}</style>',  1, 'fuente literal detectada'],
  ['<style>.a{font-family:var(--fr-font-display)}</style>',  0, 'fuente por token permitida'],
  ['<style>.a{font-family:   \'Poppins\'}</style>',          1, 'fuente literal con espacios'],
  ['<style>.a{font-size:54px}</style>',                      1, 'px desnudo detectado'],
  ['<style>.a{font-size:calc(54 * var(--fr-u))}</style>',    0, 'medida por unidad permitida'],
  ['<style>.a{border:1px dashed var(--fr-accent)}</style>',  0, 'filete de 1px permitido'],
  ['<style>.a{background:rgba(0,0,0,.5)}</style>',           1, 'rgba literal detectado'],
];

if (process.argv.includes('--probar')) {
  let mal = 0;
  console.log('\n  Pruebas de las reglas de lint\n');
  for (const [html, esperado, nombre] of CASOS) {
    const n = revisar('prueba', html).length;
    const ok = n === esperado;
    if (!ok) mal++;
    console.log(`   ${ok ? '✓' : '✗'} ${nombre.padEnd(38)} esperado ${esperado}, obtuvo ${n}`);
  }
  console.log(mal ? `\n  ${mal} reglas fallan: NO confíes en este lint.\n`
                  : `\n  Las ${CASOS.length} pruebas pasan.\n`);
  process.exit(mal ? 1 : 0);
}

/* ── Revisión de los recursos ──────────────────────────────────────────── */
const archivos = (await readdir(RECURSOS)).filter(f => f.endsWith('.html')).sort();
let total = 0;
console.log('');
for (const f of archivos) {
  const faltas = revisar(f, await readFile(join(RECURSOS, f), 'utf8'));
  total += faltas.length;
  if (faltas.length) {
    console.log(`  ✗ ${f}`);
    for (const x of faltas) console.log(`       línea ${String(x.linea).padStart(3)}  ${x.tipo.padEnd(20)} ${x.texto.slice(0, 64)}`);
  } else {
    console.log(`  ✓ ${f}`);
  }
}
console.log(total ? `\n  ${total} faltas al contrato en ${archivos.length} recursos.\n`
                  : `\n  Los ${archivos.length} recursos cumplen el contrato.\n`);
process.exit(total ? 1 : 0);
