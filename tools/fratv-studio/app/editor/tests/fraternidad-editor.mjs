/* Flujo del catálogo Fraternidad en el editor real, con perfil aislado de Chrome. */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root=resolve(process.argv[2]||resolve(import.meta.dirname,'../..'));
const base=process.argv[3]||'http://127.0.0.1:5178';
const require=createRequire(join(root,'scripts/package.json'));
const puppeteer=require('puppeteer-core');
const {CHROME}=await import(pathToFileURL(join(root,'scripts/chrome.mjs')).href);
const out=process.env.FRATERNIDAD_EDITOR_QA_OUTPUT||join(tmpdir(),`fraternidad-editor-${Date.now()}`);
const downloads=join(out,'descargas');await mkdir(downloads,{recursive:true});
const browser=await puppeteer.launch({executablePath:CHROME,headless:true});
const page=await browser.newPage();const errors=[],failures=[],checks=[];
page.on('pageerror',e=>errors.push(String(e.stack||e.message)));
page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))failures.push(`${r.status()} ${r.url()}`)});
page.setDefaultTimeout(30000);
const client=await page.createCDPSession();await client.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
const pass=message=>{checks.push(message);console.log(`✓ ${message}`)};
async function clickText(label){const el=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()===text),label);assert(el.asElement(),label);await el.asElement().click();await el.dispose();}
async function control(label){const h=await page.evaluateHandle(text=>[...document.querySelectorAll('input,textarea,select')].find(e=>e.getClientRects().length&&(e.getAttribute('aria-label')===text||[...(e.labels||[])].some(l=>l.textContent.trim().startsWith(text)))),label);assert(h.asElement(),label);return h.asElement();}
async function input(label,value){const e=await control(label);await e.evaluate((e,v)=>{const prototype=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);await e.dispose();}
async function ready(id){await page.waitForFunction(id=>{const f=document.querySelector('iframe[title="Vista previa del recurso"]');return f?.contentWindow?.FRATV?.meta?.id===id&&f.style.opacity==='1'}, {},id);}
async function storage(){return page.evaluate(()=>JSON.parse(localStorage.getItem('fratv.projects.v1')))}
async function saved(){await page.waitForFunction(()=>document.querySelector('.project-heading')?.textContent.includes('Guardado en este navegador'))}
async function closeProgram(){await page.click('[aria-label="Cerrar preparación de programa"]')}
try{
await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
await page.goto(base,{waitUntil:'networkidle2'});
await page.waitForSelector('[data-resource="fraternidad-lower-third"]');
assert.equal(await page.$$eval('[data-resource]',x=>x.length),35);
for(const [identity,count]of [['fraternidad',17],['fratv',15],['coproduccion',3],['todas',35]]){await page.select('#catalog',identity);assert.equal(await page.$$eval('[data-resource]',x=>x.length),count);}
pass('La biblioteca reúne 35 recursos y filtra 17 Fraternidad, 15 FRATV y 3 coproducciones.');
await page.select('#catalog','fraternidad');await page.click('[data-resource="fraternidad-lower-third"]');await ready('fraternidad-lower-third');
await input('Nombre','MARÍA JOSÉ');
await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('[data-field=name]')?.textContent==='MARÍA JOSÉ');
await page.click('#tab-style');assert.equal(await page.$eval('#theme',e=>e.disabled),true);
for(const [font,family]of [['aprobado','Manrope'],['editorial','Instrument Sans'],['neutro','Inter']]){
await page.select('#font',font);await page.waitForFunction((font,family)=>{const f=document.querySelector('iframe[title="Vista previa del recurso"]');const d=f?.contentDocument;return f?.style.opacity==='1'&&new URL(f.src).searchParams.get('tipo')===font&&getComputedStyle(d.documentElement).getPropertyValue('--fr-font-display').includes(family)&&[...d.fonts].some(face=>face.family.includes(family)&&face.status==='loaded')},{},font,family);
}
pass('Las tres tipografías se cargan realmente y Fraternidad conserva su paleta aprobada.');
await page.select('#aspect','9:16');await ready('fraternidad-lower-third');await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.innerHeight===1920);
await page.screenshot({path:join(out,'editor-fraternidad-vertical.png'),fullPage:true});
await clickText('Exportar');await page.select('[aria-label="Qué exportar"]','all');assert.equal(await page.$eval('[aria-label="Identidad a exportar"]',e=>e.value),'fraternidad');
assert(await page.evaluate(()=>document.body.textContent.includes('17 piezas/formato')));
const selectedAspect=await page.$$eval('.option-grid input',els=>els.filter(e=>e.checked).map(e=>e.parentElement.textContent.trim()));assert.deepEqual(selectedAspect,['9:16']);
await page.screenshot({path:join(out,'exportador-fraternidad.png'),fullPage:true});await page.click('[aria-label="Cerrar exportador"]');
pass('El exportador selecciona Fraternidad y el formato activo sin mezclar las otras identidades.');
await clickText('Programa y proyectos');await clickText('Plantilla');
const select=await control('Partir de una plantilla');const option=await select.evaluate(e=>[...e.options].find(o=>o.textContent==='Fraternidad · encuentro institucional').value);await select.select(option);await select.dispose();
assert.equal(await page.$eval('[aria-label="Identidad de plantilla"]',e=>e.value),'fraternidad');assert.equal(await page.$$eval('.template-resources input',es=>es.filter(e=>e.checked).length),10);assert.equal(await page.$$eval('.template-resources input',es=>es.length),17);
await page.screenshot({path:join(out,'plantilla-fraternidad.png'),fullPage:true});
await clickText('Episodio');await input('Nombre del programa','Conversaciones de la comunidad');await input('Conductor o conductora','Ana Soto');await input('Cargo del conductor','Conductora');await clickText('＋ Agregar invitado');await input('Invitado 1','José Pérez');await input('Cargo del invitado 1','Director');await input('Temas del episodio','Cultura\nPróximas actividades');await clickText('Preparar todas las piezas');
await page.waitForFunction(()=>document.querySelectorAll('.program-items>button').length===11);await saved();
let project=(await storage())[0];assert(project.items.every(i=>i.resourceId.startsWith('fraternidad-')));assert.deepEqual(project.items.filter(i=>i.resourceId==='fraternidad-lower-third').map(i=>i.values.name),['Ana Soto','José Pérez']);
pass('La plantilla institucional prepara 11 piezas, incluidas las dos personas del episodio.');
const start=project.items.find(i=>i.resourceId==='fraternidad-start');await closeProgram();await page.select('[aria-label="Pieza del episodio"]',start.id);await ready('fraternidad-start');await page.click('#tab-live');
await input('Duración en minutos','0.2');await clickText('Aplicar duración');await page.waitForFunction(()=>document.querySelector('.live-readout')?.textContent.includes('00:00:12'));await clickText('Iniciar reloj');await delay(1400);await clickText('Pausar reloj');await page.waitForFunction(()=>document.querySelector('.live-readout')?.textContent.includes('En pausa'));
const source=await (await control('URL de la fuente OBS')).evaluate(e=>e.value);assert(new URL(source).pathname==='/live/fraternidad-start');
await clickText('Ver la fuente en vivo en el lienzo');await ready('fraternidad-start');await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.documentElement.dataset.liveReady==='1');
const channel=new URL(source).searchParams.get('channel');
await page.evaluate(async channel=>{const response=await fetch(`/api/live/${channel}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'configure',mode:'countdown',durationMs:10500})});if(!response.ok)throw new Error('No se pudo fijar la muestra temporal.');},channel);
await page.waitForFunction(()=>document.querySelector('.live-readout')?.textContent.includes('00:00:11'));
const dock=await browser.newPage();await dock.goto(`${base}/live-control?channel=${channel}`,{waitUntil:'networkidle2'});await dock.waitForFunction(()=>document.querySelector('#clock')?.textContent==='00:00:11');await dock.close();
await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('[data-field=clock]')?.textContent==='00:11');
const read=()=>page.$eval('iframe',e=>e.contentDocument.querySelector('[data-field=clock]').textContent);const paused=await read();await delay(1300);assert.equal(await read(),paused);const panelClock=await page.$eval('.live-readout',e=>e.textContent.match(/\d{2}:\d{2}:\d{2}/)[0]);const seconds=value=>value.split(':').map(Number).reduce((sum,n)=>sum*60+n,0);assert.equal(seconds(await read()),seconds(panelClock),'Panel y fuente deben mostrar el mismo tiempo pausado.');
project=(await storage())[0];assert.equal(project.live[start.id].durationMs,12000);assert.equal(project.live[start.id].mode,'countdown');
await page.screenshot({path:join(out,'reloj-fraternidad.png'),fullPage:true});
await clickText('Volver a vista previa de edición');
const elapsed=project.items.find(i=>i.resourceId==='fraternidad-live');await page.select('[aria-label="Pieza del episodio"]',elapsed.id);await ready('fraternidad-live');assert.equal(await page.$eval('[aria-label="Modo del reloj"]',e=>e.value),'elapsed');
pass('El panel controla la cuenta compartida y conserva su configuración; En vivo propone tiempo transcurrido.');
await clickText('Programa y proyectos');await clickText('Importador general');await clickText('Exportar proyecto .fratv.json');
let files=[];for(let n=0;n<50;n++){files=(await readdir(downloads)).filter(f=>f.endsWith('.fratv.json'));if(files.length)break;await delay(100)}assert.equal(files.length,1);
const file=join(downloads,files[0]);const backup=JSON.parse(await readFile(file,'utf8'));assert.equal(backup.font,'neutro');assert.equal(backup.items.length,11);assert.equal(backup.live[start.id].durationMs,12000);
await (await page.$('[aria-label="Importar proyecto FRATV"]')).uploadFile(file);await page.waitForSelector('.brief-preview');await clickText('Importar como copia');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fratv.projects.v1')).length===2);
const copy=(await storage()).find(p=>p.id!==backup.id);assert.deepEqual(copy.items,backup.items);assert.deepEqual(copy.live,backup.live);assert.equal(copy.font,'neutro');
await closeProgram();await ready('fraternidad-lower-third');
await page.reload({waitUntil:'networkidle2'});await ready('fraternidad-lower-third');await page.click('#tab-style');assert.equal(await page.$eval('#font',e=>e.value),'neutro');
pass('El respaldo Fraternidad se descarga e importa como copia con fuentes, piezas y configuración de relojes.');
await page.setViewport({width:390,height:844,deviceScaleFactor:1});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);assert(await page.$eval('#catalog',e=>e.getClientRects().length>0),'El filtro de identidad debe estar disponible en móvil.');await page.select('#catalog','fraternidad');assert.equal(await page.$$eval('[data-resource]',els=>els.length),17);
await page.screenshot({path:join(out,'editor-fraternidad-movil.png'),fullPage:true});
assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);pass('Sin errores JavaScript ni peticiones locales fallidas; escritorio y móvil sin desbordes.');
await writeFile(join(out,'resultado.json'),JSON.stringify({ok:true,checks,errors,failures},null,2));console.log(out);
}catch(e){await page.screenshot({path:join(out,'fallo.png'),fullPage:true});await writeFile(join(out,'fallo.json'),JSON.stringify({error:String(e.stack),checks,errors,failures},null,2));throw e}finally{await browser.close()}
