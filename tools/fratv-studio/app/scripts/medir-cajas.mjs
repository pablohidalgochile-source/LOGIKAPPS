/* FRATV — mide las cajas de cada recurso en un formato y avisa de desbordes.
   Uso:  node medir-cajas.mjs [16:9|9:16|1:1|4:5]
   Complementa a renderizar-laminas.mjs: la lámina se mira, esto se lee.
   Sirve para contestar con números si una pieza se sale del cuadro o si
   quedó demasiado chica respecto del alto y el ancho disponibles. */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
import { CHROME } from './chrome.mjs';
import { resolve } from 'path';
const RAIZ=resolve(import.meta.dirname,'..','handoff');
const MAN=JSON.parse(readFileSync(`${RAIZ}/manifest.json`,'utf8'));
const ASP=process.argv[2]||'9:16';
const d=MAN.aspects[ASP];
const nav=await puppeteer.launch({executablePath:CHROME,headless:'shell',args:['--no-sandbox','--allow-file-access-from-files','--force-device-scale-factor=1']});
const pg=await nav.newPage(); await pg.setViewport({width:d.w,height:d.h,deviceScaleFactor:1});
console.log(`\n${ASP} — ${d.w}×${d.h}\n`);
for(const r of MAN.resources){
  if(!r.aspects.includes(ASP))continue;
  const t=r.durationMs?Math.round(r.durationMs*0.45):0;
  await pg.goto(`file://${RAIZ}/${r.file}?autoplay=0&aspecto=${encodeURIComponent(ASP)}`,{waitUntil:'networkidle0'});
  await pg.evaluate(()=>document.fonts.ready);
  await pg.evaluate(()=>Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))));
  await pg.evaluate(tt=>window.FRATV&&window.FRATV.seek(tt),t);
  await new Promise(r=>setTimeout(r,150));
  const info=await pg.evaluate(()=>{
    const W=innerWidth,H=innerHeight,out=[];
    document.querySelectorAll('.stage > *').forEach(el=>{
      if(el.classList.contains('safe'))return;
      const b=el.getBoundingClientRect();
      const cs=getComputedStyle(el);
      if(cs.display==='none'||b.width===0)return;
      out.push({c:el.className||el.id,x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),
        op:cs.opacity, fuera:(b.x<-1||b.y<-1||b.right>W+1||b.bottom>H+1)});
    });
    return {W,H,out};
  });
  console.log(`── ${r.id}`);
  for(const e of info.out){
    const pw=(e.w/info.W*100).toFixed(0), ph=(e.h/info.H*100).toFixed(0);
    console.log(`     ${String(e.c).slice(0,22).padEnd(23)} x=${String(e.x).padStart(5)} y=${String(e.y).padStart(5)}  ${String(e.w).padStart(5)}×${String(e.h).padStart(4)}  (${pw}%×${ph}%)${e.fuera?'   ⚠ FUERA DEL CUADRO':''}${e.op!=='1'?'  op='+e.op:''}`);
  }
}
await nav.close();
