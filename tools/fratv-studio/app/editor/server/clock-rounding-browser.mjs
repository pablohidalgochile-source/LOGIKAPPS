/* Cuenta regresiva y cronómetro usan el mismo criterio en fuente y dock.
   Uso: node editor/server/clock-rounding-browser.mjs [raíz del repositorio]. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2] || resolve(import.meta.dirname, '../..'));
const require = createRequire(join(root,'scripts/package.json'));
const puppeteer = require('puppeteer-core');
const { CHROME } = await import(pathToFileURL(join(root,'scripts/chrome.mjs')));
const { createStudioApi } = await import(pathToFileURL(join(root,'editor/server/server.mjs')));
const dir = await mkdtemp(join(tmpdir(),'fratv-redondeo-'));
const cases = [
  ['fraternidad-start','countdown','00:11',''],
  ['countdown','countdown','00:00:11',''],
  ['fraternidad-live','elapsed','00:10',''],
  ['live-badge','elapsed','00:00:10','&variant=reloj'],
];
const paused = Object.fromEntries(cases.map(([id,mode])=>[id,{mode,durationMs:30000,valueMs:10500,running:false,visible:true,updatedAt:Date.now()}]));
await writeFile(join(dir,'live.json'),JSON.stringify(paused));
const api=createStudioApi({root,storageDir:dir});
const types={'.js':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer((req,res)=>api.middleware(req,res,async()=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith('/media/'))throw Error();
    const file=resolve(root,'handoff',decodeURIComponent(path.slice(7)));
    if(!file.startsWith(join(root,'handoff')+sep)||!(await stat(file)).isFile())throw Error();
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end();}
}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage(),dock=await browser.newPage(),errors=[];
for(const p of [page,dock])p.on('pageerror',e=>errors.push(e.message));
try{
  for(const [id,mode,expected,extra] of cases){
    await page.bringToFront();
    await page.goto(`${base}/live/${id}?channel=${id}&aspecto=16:9${extra}`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.dataset.liveReady==='1'&&document.body.style.visibility==='visible',{polling:100});
    const read=()=>page.$eval('[data-field="clock"],[data-field="reloj"]',el=>el.textContent);
    assert.equal(await read(),expected,`${id}: redondeo de la fuente incorrecto.`);
    await dock.bringToFront();
    await dock.goto(`${base}/live-control?channel=${id}`,{waitUntil:'domcontentloaded'});
    await dock.waitForFunction(value=>document.querySelector('#clock').textContent===value,{polling:100},mode==='countdown'?'00:00:11':'00:00:10');
    await new Promise(resolve=>setTimeout(resolve,1300));
    assert.equal(await read(),expected,`${id}: la fuente pausada cambió en segundo plano.`);
    assert.equal(await dock.$eval('#clock',el=>el.textContent),mode==='countdown'?'00:00:11':'00:00:10');
    console.log(`✓ ${id}: pausa10500ms → ${expected}; coincide con dock y se mantiene en segundo plano.`);
  }
  assert.deepEqual(errors,[]);
  console.log('✓ Sin errores JavaScript.');
}finally{await browser.close();await api.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
