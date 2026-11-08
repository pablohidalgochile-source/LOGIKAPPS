/* Verifica render, relojes compartidos y archivos reales de Fraternidad.
   Uso: node editor/server/fraternidad-browser.mjs [raíz del repositorio]. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const root = resolve(process.argv[2] || resolve(import.meta.dirname, '../..'));
const require = createRequire(join(root, 'scripts/package.json'));
const puppeteer = require('puppeteer-core');
const { CHROME } = await import(pathToFileURL(join(root, 'scripts/chrome.mjs')));
const { createStudioApi } = await import(pathToFileURL(join(root, 'editor/server/server.mjs')));
const dir = await mkdtemp(join(tmpdir(), 'fraternidad-produccion-'));
const api = createStudioApi({ root, storageDir: join(dir, 'estado') });
const types = { '.js':'text/javascript', '.html':'text/html; charset=utf-8', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = createServer((req,res) => api.middleware(req,res, async()=>{
  try {
    const url = new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/media/')) throw Error();
    const file = resolve(root, 'handoff', decodeURIComponent(url.pathname.slice(7)));
    if(!file.startsWith(join(root,'handoff')+sep) || !(await stat(file)).isFile()) throw Error();
    res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream'});
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end('No encontrado'); }
}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const checks=[], errors=[], externalFailures=[];
let portable;
function pass(message){ checks.push(message); console.log('✓ '+message); }
async function page(){const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',request=>{if(!request.url().startsWith(base)&&request.failure()?.errorText!=='net::ERR_ABORTED')externalFailures.push(request.url()+': '+request.failure()?.errorText);});p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.status()+' '+r.url());});return p;}
async function json(path, body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert(r.ok, data.error);return data;}
async function ready(p){await p.bringToFront();await p.waitForFunction(()=>window.FRATV);await p.evaluate(()=>Promise.race([window.FRATV.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("Recurso no preparado a tiempo")),20000))]));await p.waitForFunction(()=>document.documentElement.dataset.liveReady==='1'&&document.body.style.visibility==='visible');}
async function clock(p){return p.$eval('[data-field="clock"]',el=>el.textContent);}
try{
  const a=await page(), b=await page();
  await a.setViewport({width:1920,height:1080}); await b.setViewport({width:1080,height:1920});
  const channel='prueba-conjunta';
  await json(`/api/live/${channel}`,{action:'configure',mode:'countdown',durationMs:300000});
  for(const [p,aspect] of [[a,'16:9'],[b,'9:16']]){
    await p.goto(`${base}/live/fraternidad-start?channel=${channel}&aspecto=${aspect}&autoplay=1`,{waitUntil:'domcontentloaded'});
    await ready(p);
    await p.evaluate(()=>window.FRATV.seek(1600));
    assert.equal(await clock(p),'05:00');
  }
  await a.screenshot({path:join(dir,'inicio-vivo-horizontal.png')}); await b.screenshot({path:join(dir,'inicio-vivo-vertical.png')});
  pass('Inicio vivo conserva el reloj corto 05:00 y carga en ambos formatos.');
  await json(`/api/live/${channel}`,{action:'start'});await delay(2100);
  const movingA=await clock(a),movingB=await clock(b);
  assert.notEqual(movingA,'05:00'); assert.equal(movingA,movingB);
  await json(`/api/live/${channel}`,{action:'pause'});await delay(650);
  const paused=await clock(a);await delay(1200);assert.equal(await clock(a),paused);assert.equal(await clock(b),paused);
  await b.reload({waitUntil:'domcontentloaded'});await ready(b);assert.equal(await clock(b),paused);
  await json(`/api/live/${channel}`,{action:'hide'});await delay(700);
  for(const p of [a,b])assert.equal(await p.evaluate(()=>document.body.style.visibility),'hidden');
  await json(`/api/live/${channel}`,{action:'show'});await delay(650);await ready(a);await ready(b);
  await json(`/api/live/${channel}`,{action:'reset'});await delay(650);assert.equal(await clock(a),'05:00');assert.equal(await clock(b),'05:00');
  pass('Dos fuentes sincronizadas: marcha, pausa, recarga sin reinicio, visibilidad y reinicio.');
  for(const [id,mode] of [['fraternidad-countdown','countdown'],['fraternidad-live','elapsed'],['fraternidad-break','countdown']]){
    await a.goto(`${base}/live/${id}?channel=${id}&aspecto=16:9&autoplay=1`,{waitUntil:'domcontentloaded'});await ready(a);
    assert.equal((await json(`/api/live/${id}`)).mode,mode);
    assert.equal(await clock(a),mode==='elapsed'?'00:00':'05:00');
  }
  await json('/api/live/fraternidad-countdown',{action:'configure',mode:'countdown',durationMs:3661000});
  await a.goto(`${base}/live/fraternidad-countdown?channel=fraternidad-countdown&aspecto=9:16`,{waitUntil:'domcontentloaded'});await ready(a);assert.equal(await clock(a),'01:01:01');
  pass('Los cuatro temporizadores reciben el estado y admiten lectura de horas.');
  const creation=await json('/api/exports',{formats:['png','mov','mp4','html'],fps:30,project:{schema:'fratv-project',version:1},items:[
    {id:'placa',channel:'placa',label:'Placa de prueba',resourceId:'fraternidad-lower-third',url:'/media/fraternidad/resources/fraternidad-lower-third.html?name=MAR%C3%8DA%20LAGOS&role=INVITADA&tipo=editorial',aspect:'16:9',durationMs:500,time:1600},
    {id:'inicio',channel, label:'Inicio con reloj',resourceId:'fraternidad-start',url:'/media/fraternidad/resources/fraternidad-start.html?tipo=aprobado',aspect:'9:16',durationMs:7000,time:1600},
  ]});
  let job;
  for(let i=0;i<600;i++){job=await json(`/api/exports/${creation.id}`);if(['completed','failed','cancelled'].includes(job.status))break;await delay(500);}
  assert.equal(job.status,'completed',job.error);
  assert(job.warnings.some(w=>w.includes('reloj')&&w.includes('HTML vivo')));
  const archive=join(dir,'programa.zip');await writeFile(archive,Buffer.from(await(await fetch(base+job.download)).arrayBuffer()));
  const pack=join(dir,'extraido');await mkdir(pack);execFileSync('unzip',['-q',archive,'-d',pack]);
  const files=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).split('\n');
  for(const extension of ['png','mov','mp4']) assert(files.some(f=>f.endsWith('.'+extension)),`Falta ${extension}.`);
  const mov=files.find(f=>f.endsWith('.mov')),mp4=files.find(f=>f.endsWith('.mp4'));
  const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',join(pack,file)],{encoding:'utf8'})).streams[0];
  assert.equal(probe(mov).codec_name,'prores');assert(probe(mov).pix_fmt.includes('a'),'MOV sin canal alfa.');assert.equal(probe(mp4).codec_name,'h264');
  assert(files.some(f=>f.includes('9x16')&&f.endsWith('_instantanea.png')));
  assert(!files.some(f=>f.includes('9x16')&&/\.(mov|mp4)$/.test(f)),'Un reloj controlable no se debe convertir en video.');
  pass('Exportación real: PNG, MOV ProRes con alfa, MP4 H.264 y reloj vivo con instantánea, descargados en ZIP.');
  portable=spawn(process.execPath,[join(pack,'runtime/portable.mjs')],{env:{...process.env,FRATV_PORT:'0'},stdio:['ignore','pipe','pipe']});
  const address=await new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(Error('Paquete no inicia')),10000);portable.once('error',reject);portable.stdout.on('data',d=>{output+=d;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timeout);resolve(m[0]);}});});
  const info=JSON.parse(await readFile(join(pack,'recursos.json'),'utf8'));
  const source=info.sources.find(s=>s.clock);
  await a.goto(address+source.path,{waitUntil:'domcontentloaded'});await ready(a);assert.equal(await clock(a),'05:00');
  const staticSource=info.sources.find(s=>!s.clock);await b.bringToFront();await b.goto(address+staticSource.path,{waitUntil:'networkidle2'});await b.waitForFunction(()=>window.FRATV);await b.evaluate(()=>window.FRATV.ready);
  assert(await b.evaluate(()=>document.body.textContent.includes('MARÍA LAGOS')));
  assert(await b.evaluate(()=>document.fonts.check('800 50px "Instrument Sans"')&&[...document.fonts].some(f=>f.family.includes('Instrument Sans')&&f.status==='loaded')));
  pass('Paquete extraído: fuente viva y placa con texto editado y tipografía editorial realmente cargada.');
  assert.deepEqual(errors,[]);pass('Sin errores JavaScript ni recursos locales fallidos.');
  await writeFile(join(dir,'resultado.json'),JSON.stringify({ok:true,checks,externalFailures,job},null,2));console.log('Informe y archivos: '+dir);
}catch(error){await writeFile(join(dir,'resultado.json'),JSON.stringify({ok:false,checks,errors,externalFailures,error:String(error.stack||error)},null,2));throw error;}
finally{if(portable&&portable.exitCode===null){const closed=new Promise(resolve=>portable.once('exit',resolve));portable.kill('SIGTERM');await closed;}await browser.close();await api.close();await new Promise(resolve=>server.close(resolve));}
