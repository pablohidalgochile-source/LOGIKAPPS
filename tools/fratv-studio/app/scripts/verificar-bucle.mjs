/* Comprueba que en los recursos en bucle el cuadro 0 y el cuadro final
   coincidan: si no, al repetir se ve un tirón. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';
const H = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'handoff');
const M = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const srv = createServer(async (q,r)=>{try{const p=join(H,decodeURIComponent(q.url.split('?')[0]));
const b=await readFile(p);r.writeHead(200,{'Content-Type':M[extname(p)]||'application/octet-stream'});r.end(b);}catch{r.writeHead(404).end();}});
await new Promise(ok=>srv.listen(8802,'127.0.0.1',ok));
const man = JSON.parse(await readFile(join(H,'manifest.json'),'utf8'));
const br = await puppeteer.launch({executablePath: CHROME,headless:'shell'});
const pg = await br.newPage(); await pg.setViewport({width:1920,height:1080});
const h = async () => createHash('sha1').update(await pg.screenshot({omitBackground:true})).digest('hex').slice(0,12);
console.log('\n  recurso          cuadro 0 vs cuadro final');
console.log('  ' + '─'.repeat(52));
for (const r of man.resources.filter(x => x.loop && x.durationMs)) {
  await pg.goto(`http://127.0.0.1:8802/${r.file}?autoplay=0`, {waitUntil:'networkidle0'});
  await pg.evaluate(()=>document.fonts.ready);
  await pg.evaluate(()=>window.FRATV.seek(0));  const a = await h();
  await pg.evaluate(d=>window.FRATV.seek(d), r.durationMs); const b = await h();
  console.log(`  ${r.id.padEnd(16)} ${a} / ${b}  ${a===b?'cierra ✓':'TIRÓN ✗'}`);
}
await br.close(); srv.close();
