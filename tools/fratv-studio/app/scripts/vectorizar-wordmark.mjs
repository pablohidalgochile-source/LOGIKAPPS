/* FRATV · vectoriza el wordmark.
   Convierte las letras FRA y TV de texto a trazos, para que el logo no dependa
   de tener Arial Rounded MT Bold instalada.

   La bajada NO se vectoriza a propósito: usa Poppins (Google Font, garantizada)
   y además es un campo editable del manifest. Vectorizarla la volvería fija.
*/
import opentype from 'opentype.js';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI    = dirname(fileURLToPath(import.meta.url));
const HANDOFF = resolve(AQUI, '..', 'handoff');
const FUENTE  = '/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf';

/* Medidas del master: wordmark a 165 px, FRA en x=650 y TV en x=973, base y=333. */
const CUERPO = 165, BASE_Y = 333, X_FRA = 650, X_TV = 973;

const buf = await readFile(FUENTE);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const nombre = font.names?.fullName?.en || font.names?.fontFamily?.en || 'Arial Rounded MT Bold';
console.log(`\n  Tipografía: ${nombre}  ·  ${font.glyphs.length} glifos`);

/* Se compone la palabra COMPLETA y después se separa por letras. Generar "FRA"
   y "TV" por separado perdería el kerning entre la A y la T, y los trazos se
   solaparían. */
function componer(x) {
  const glifos = font.getPaths('FRATV', x, BASE_Y, CUERPO);
  const unir = (lista) => {
    const p = new opentype.Path();
    lista.forEach(g => { p.commands.push(...g.commands); });
    return p;
  };
  const pFra = unir(glifos.slice(0, 3));   // F R A
  const pTv  = unir(glifos.slice(3));      // T V
  const caja = (p) => { const b = p.getBoundingBox(); return {
    x1: +b.x1.toFixed(1), x2: +b.x2.toFixed(1), y1: +b.y1.toFixed(1), y2: +b.y2.toFixed(1),
    ancho: +(b.x2 - b.x1).toFixed(1), alto: +(b.y2 - b.y1).toFixed(1) }; };
  return {
    fra: { d: pFra.toPathData(2), ...caja(pFra) },
    tv:  { d: pTv.toPathData(2),  ...caja(pTv)  }
  };
}

const { fra, tv } = componer(X_FRA);

console.log(`  FRA  ancho ${fra.ancho} px  (x ${fra.x1} → ${fra.x2})`);
console.log(`  TV   ancho ${tv.ancho} px  (x ${tv.x1} → ${tv.x2})`);
/* Los rectángulos de la A y la T se solapan siempre: la A es diagonal y la T
   tiene brazos. Eso es kerning normal, no un defecto. La comprobación de verdad
   es visual, con comparar-wordmark.html. */
console.log(`  ancho total del wordmark: ${(tv.x2 - fra.x1).toFixed(1)} px`);

/* Segunda versión desde x=0: es la que usan los recursos, que componen el
   lockup en HTML y no en las coordenadas absolutas del master. */
const desdeCero = componer(0);
const M = 4;  // margen para que los remates redondos no queden al ras
const bx1 = Math.min(desdeCero.fra.x1, desdeCero.tv.x1) - M;
const by1 = Math.min(desdeCero.fra.y1, desdeCero.tv.y1) - M;
const bx2 = Math.max(desdeCero.fra.x2, desdeCero.tv.x2) + M;
const by2 = Math.max(desdeCero.fra.y2, desdeCero.tv.y2) + M;
const anchoTotal = +(bx2 - bx1).toFixed(1);
const altoTotal  = +(by2 - by1).toFixed(1);
console.log(`  caja del trazo: ${anchoTotal} x ${altoTotal} px  (relación ${(anchoTotal/altoTotal).toFixed(3)})`);

await writeFile(join(AQUI, 'wordmark-trazos.json'), JSON.stringify({
  fuente: FUENTE, cuerpo: CUERPO, baseY: BASE_Y,
  master: { fra, tv },
  recursos: { ...desdeCero, anchoTotal, altoTotal,
              viewBox: `${bx1.toFixed(1)} ${by1.toFixed(1)} ${anchoTotal} ${altoTotal}`,
              relacion: +(anchoTotal / altoTotal).toFixed(4) }
}, null, 2));

/* Master vectorizado, como archivo nuevo: el original con texto se conserva
   como archivo de trabajo editable. */
const original = await readFile(join(HANDOFF, 'assets/masters/fratv-logo-horizontal-por-capas.svg'), 'utf8');
const vector = original
  .replace(/<g id="wordmark"[^>]*>[\s\S]*?<\/g>/,
    `<g id="wordmark">
      <path id="word-fra" d="${fra.d}" fill="#F5F1E8"></path>
      <path id="word-tv" d="${tv.d}" fill="#B72A3A"></path>
    </g>`)
  .replace('<desc id="desc">Logo horizontal separado en capas para animación web y overlays OBS.</desc>',
           '<desc id="desc">Logo horizontal por capas, con el wordmark vectorizado y la paleta aprobada. No depende de ninguna tipografía instalada.</desc>')
  /* El original arrastra el naranja archivado. Este master es un archivo nuevo:
     sale con el rojo aprobado, para no quedar mitad y mitad. */
  .replaceAll('#FF6B3D', '#B72A3A');

await writeFile(join(HANDOFF, 'assets/masters/fratv-logo-horizontal-vectorizado.svg'), vector);
console.log(`\n  → assets/masters/fratv-logo-horizontal-vectorizado.svg`);
console.log(`  → scripts/wordmark-trazos.json  (para los recursos)\n`);
