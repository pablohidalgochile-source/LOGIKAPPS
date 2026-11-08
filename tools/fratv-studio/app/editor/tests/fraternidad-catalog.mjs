/* Comprueba el catálogo nuevo y compara únicamente los tres diseños aprobados. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync,spawnSync } from 'node:child_process';
const root=resolve(process.argv[2] || resolve(import.meta.dirname,'../..'));
const base=process.argv[3] || 'http://127.0.0.1:5178';
const out=process.env.FRATERNIDAD_QA_OUTPUT || join(tmpdir(),'fraternidad-catalogo-'+Date.now());
const catalog=JSON.parse(await readFile(join(root,'handoff/fraternidad/manifest.json'),'utf8'));
const require=createRequire(join(root,'scripts/package.json'));
const puppeteer=require('puppeteer-core');
const {CHROME}=await import(join(root,'scripts/chrome.mjs'));
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:CHROME,headless:true});
const page=await browser.newPage();
page.setDefaultTimeout(25000);
const errors=[],failures=[],checks=[],renders=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('/favicon.ico'))failures.push(r.status()+' '+r.url());});
const pass=s=>{checks.push(s);console.log('✓ '+s);};
function diff(a,b) {
 const flatA=join(out,'comparacion-a.png'),flatB=join(out,'comparacion-b.png');
 for(const [source,dest] of [[a,flatA],[b,flatB]])execFileSync('magick',[source,'-background','black','-alpha','remove','-alpha','off',dest]);
 const result=spawnSync('compare',['-fuzz','40%','-metric','AE',flatA,flatB,'null:'],{encoding:'utf8'});
 assert([0,1].includes(result.status),result.stderr);
 // Este ImageMagick HDRI informa primero unidades Quantum; paréntesis contiene píxeles.
 // Control medido: dos imágenes10×10 completamente distintas informan6.5535e6(100).
 const value=result.stderr.match(/\(([\d.e+-]+)\)/)?.[1] || result.stderr.trim().split(/\s/)[0];
 assert(Number.isFinite(Number(value)),result.stderr);
 return Number(value);
}
async function open(resource,aspect,font='aprobado',extra={}) {
 const q=new URLSearchParams({autoplay:'0',aspecto:aspect,tipo:font,...extra});
 await page.goto(base+'/media/'+resource.file+'?'+q,{waitUntil:'networkidle2'});
 await page.waitForFunction(()=>Boolean(window.FRATV));
 await page.evaluate(async()=>await FRATV.ready);
 assert.equal(await page.evaluate(()=>FRATV.meta.id),resource.id);
}
async function seek(t){await page.evaluate(t=>FRATV.seek(t),t);await new Promise(r=>setTimeout(r,100));}
function layout() {
 const s=getComputedStyle(document.documentElement), percent=n=>parseFloat(s.getPropertyValue('--safe-'+n))/100;
 const safe={left:innerWidth*percent('x'),right:innerWidth*(1-percent('x')),top:innerHeight*percent('top'),bottom:innerHeight*(1-percent('bottom'))};
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).display!=='none';};
 const boxes=[...document.querySelectorAll('[data-check-bounds]')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {name:el.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
 const text=[...document.querySelectorAll('[data-field]')].filter(visible).filter(el=>el.clientWidth>0).map(el=>({name:el.dataset.field,width:el.clientWidth,scrollWidth:el.scrollWidth}));
 return {safe,boxes,text,logos:[...document.images].filter(i=>i.getAttribute('src')).map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0})),font:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)};
}
try {
 assert.equal(catalog.resources.length,17);
 for(const [aspect,width,height] of [['16:9',1920,1080],['9:16',1080,1920]]) {
  await page.setViewport({width,height,deviceScaleFactor:1});
  for(const resource of catalog.resources) {
   await open(resource,aspect);
   const time=resource.id.endsWith('stinger')?400:resource.id.endsWith('ticker')?9000:resource.id.endsWith('credits')?11000:1600;
   await seek(time);
   const measured=await page.evaluate(layout);
   assert(measured.logos.every(i=>i.loaded),resource.id+' logo no cargado');
   if(!/(flag|stinger)$/.test(resource.id))assert(measured.font.some(f=>f.includes('Manrope')),resource.id+' no cargó Manrope');
   if(!/(stinger|ticker|credits)$/.test(resource.id)) {
    assert(measured.boxes.length,resource.id+' sin marcadores de límites');
    for(const b of measured.boxes)assert(b.x>=measured.safe.left-1&&b.y>=measured.safe.top-1&&b.right<=measured.safe.right+1&&b.bottom<=measured.safe.bottom+1,resource.id+' '+aspect+' fuera de áreas seguras '+JSON.stringify(b));
    for(const t of measured.text)assert(t.scrollWidth<=t.width+1,resource.id+' '+aspect+' texto desbordado '+JSON.stringify(t));
   }
   const file=join(out,resource.id+'-'+aspect.replace(':','x')+'.png');
   await page.screenshot({path:file,omitBackground:true});
   await seek(250);await seek(time);
   const repeat=join(out,'repetido.png');await page.screenshot({path:repeat,omitBackground:true});
   assert(diff(file,repeat)<1500,resource.id+' seek no repetible');
   if(catalog.approvedPilots.includes(resource.id)) {
    const difference=diff(join(root,'laminas','referencia-fraternidad-'+aspect.replace(':','x'),resource.id+'.png'),file);
    assert(difference<1500,resource.id+' '+aspect+' cambió '+difference+' píxeles respecto del diseño aprobado');
    pass(resource.id+' '+aspect+': referencia aprobada conservada ('+difference+' píxeles fuertes).');
   }
   renders.push({id:resource.id,aspect,file,time,measured});
   console.log('  '+resource.id+' '+aspect);
  }
 }
 pass('17 recursos × 2 formatos: cargan, repiten cuadro y respetan límites estáticos.');
 const name=catalog.resources.find(r=>r.id==='fraternidad-lower-third');
 for(const [aspect,width,height] of [['16:9',1920,1080],['9:16',1080,1920]]) {
  await page.setViewport({width,height,deviceScaleFactor:1});
  for(const [font,family] of [['aprobado','Manrope'],['editorial','Instrument Sans'],['neutro','Inter']]) {
   await open(name,aspect,font,{name:'MARÍA JOSÉ GONZÁLEZ',role:'COORDINADORA DE COMUNIDAD'});await seek(1600);
   const measured=await page.evaluate(layout);
   assert(measured.font.some(f=>f.includes(family)),font+' no se descargó');
   assert(measured.text.every(t=>t.scrollWidth<=t.width+1),font+' texto largo desbordado');
   await page.screenshot({path:join(out,'tipografia-'+font+'-'+aspect.replace(':','x')+'.png'),omitBackground:true});
  }
 }
 pass('Tres tipografías realmente cargadas y nombres largos legibles en ambos formatos.');
 for(const [aspect,width,height] of [['16:9',1920,1080],['9:16',1080,1920]]) {
  await page.setViewport({width,height,deviceScaleFactor:1});
  for(const font of ['aprobado','editorial','neutro']) for(const piece of ['schedule','start']) {
   const resource=catalog.resources.find(r=>r.id==='fraternidad-'+piece);
   const fields=piece==='schedule' ? {rows:Array.from({length:5},()=>['21:00',('Conversaciones de la comunidad y los nuevos encuentros del campus. ').repeat(4).slice(0,200),'EN VIVO'].join('|')).join(';')} : {title:'W'.repeat(55),subtitle:'Encuentro de la comunidad '.repeat(3).slice(0,60)};
   await open(resource,aspect,font,fields);await seek(1600);
   const safe=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);const top=innerHeight*parseFloat(s.getPropertyValue('--safe-top'))/100,bottom=innerHeight*(1-parseFloat(s.getPropertyValue('--safe-bottom'))/100);return [...document.querySelectorAll('.agenda-row,.intro-copy,.intro-emblem,.intro-footer')].every(el=>{const b=el.getBoundingClientRect();return b.y>=top-1&&b.bottom<=bottom+1;});});
   assert(safe,resource.id+' '+aspect+' '+font+' pierde texto largo fuera del área segura');
  }
 }
 pass('Títulos de 55 caracteres anchos y agenda 5 × 200 caracteres caben con tres fuentes y dos formatos.');
 const stinger=catalog.resources.find(r=>r.id==='fraternidad-stinger');
 await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
 await open(stinger,'16:9');
 for(const time of [250,400,550]) {
  await seek(time);const file=join(out,'stinger-cobertura-'+time+'.png');await page.screenshot({path:file,omitBackground:true});
  const alpha=execFileSync('magick',[file,'-alpha','extract','-format','%[fx:minima]','info:'],{encoding:'utf8'}).trim();
  assert.equal(Number(alpha),1,'El stinger no cubre todo el cuadro a'+time+'ms');
 }
 await seek(stinger.durationMs);const end=join(out,'stinger-final.png');await page.screenshot({path:end,omitBackground:true});
 assert.equal(Number(execFileSync('magick',[end,'-alpha','extract','-format','%[fx:maxima]','info:'],{encoding:'utf8'})),0,'El stinger no termina transparente');
 pass('Stinger: cobertura total 250–550 ms, corte 400 ms y salida transparente.');
 // Prueba de control: el comparador debe detectar una alteración conocida en una pieza pequeña.
 await open(catalog.resources[0],'16:9');await seek(1600);
 await page.evaluate(()=>{document.querySelector('.channel-bug').style.setProperty('transform','scale(1.2)','important');document.querySelector('.channel-bug').style.transformOrigin='top right';});
 const mutant=join(out,'control-mosca-alterada.png');await page.screenshot({path:mutant,omitBackground:true});
 assert(diff(join(root,'laminas/referencia-fraternidad-16x9/fraternidad-flag.png'),mutant)>=1500,'El comparador dejó pasar la alteración de control');
 pass('El comparador rechaza una mosca agrandada 20 %.');
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 pass('Sin errores JavaScript ni fallos HTTP locales.');
 await writeFile(join(out,'resultado.json'),JSON.stringify({ok:true,checks,renders,errors,failures},null,2));
 console.log('Informe y capturas: '+out);
} catch(error) {
 await page.screenshot({path:join(out,'fallo.png'),omitBackground:true}).catch(()=>{});
 await writeFile(join(out,'resultado.json'),JSON.stringify({ok:false,checks,renders,errors,failures,error:String(error.stack||error)},null,2));
 throw error;
} finally {await browser.close();}
