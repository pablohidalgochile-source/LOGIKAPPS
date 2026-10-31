import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { mediaURL } from './lib.mjs';
import { publicURL } from './network.mjs';

export const QUEUE_LIMIT = 500;
export const BATCH_LIMIT = 200;
export function parseLinks(input) {
  if (typeof input !== 'string' || input.length > 200000) throw new Error('Pega hasta 200 enlaces.');
  const candidates = input.match(/https?:\/\/[^\s<>"']+/gi) || input.split(/\s+/).filter(Boolean);
  if (candidates.length > 1000) throw new Error('Divide los enlaces en lotes de hasta 200.');
  const seen = new Set(), items = []; let duplicates = 0;
  for (const raw of candidates) {
    const cleaned = raw.replace(/[),.;\]}]+$/, '');
    try {
      const url = mediaURL(cleaned);
      if (seen.has(url)) { duplicates++; continue; }
      seen.add(url); items.push({ id: randomUUID(), url, status: 'pending' });
    } catch (e) { items.push({ id: randomUUID(), url: cleaned.slice(0,2048), status: 'error', error: e.message, invalid: true }); }
  }
  if (!items.length) throw new Error('Pega al menos un enlace público.');
  if (items.length > BATCH_LIMIT) throw new Error('Cada lote admite hasta 200 videos. Divide la lista en varios lotes.');
  return { items, duplicates };
}
export function parseMaterial(input) {
  if(typeof input!=='string'||input.length>200000)throw new Error('Pega hasta 200 enlaces o títulos.');
  let rows;
  if(input.trim().startsWith('[')){
    try{rows=JSON.parse(input);}catch{throw new Error('El JSON no es válido. Usa una lista con título, año y url opcional.');}
    if(!Array.isArray(rows))throw new Error('Usa una lista JSON.');
  }else rows=input.split(/\n+/).map(s=>s.trim()).filter(Boolean).flatMap(line=>{
    const urls=line.match(/https?:\/\/[^\s<>"']+/gi);return urls?.length?urls:[line];
  });
  if(!rows.length||rows.length>1000)throw new Error('Introduce entre 1 y 200 materiales por lote.');
  const seen=new Set(),items=[];let duplicates=0;
  for(const row of rows){
    const item={id:randomUUID(),status:'pending'};
    try{
      const value=typeof row==='string'?{value:row}:row;
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Entrada no válida.');
      const title=value.titulo??value.title??'',year=value.año??value.year;
      if(typeof title!=='string'||title.length>300)throw new Error('El título debe tener hasta 300 caracteres.');
      if(year!==undefined&&(!Number.isInteger(Number(year))||Number(year)<1800||Number(year)>2100))throw new Error('Año no válido.');
      const raw=value.url??(typeof row==='string'&&/^https?:/i.test(row)?row:'');
      if(raw){item.url=mediaURL(typeof raw==='string'?raw.replace(/[),.;\]}]+$/,''):raw);}
      else {
        const query=title||value.value;
        if(typeof query!=='string'||query.length<2||query.length>300||/^[a-z]+:\/\//i.test(query))throw new Error('Usa un título o un enlace público HTTP/HTTPS.');
        item.query=[query.trim(),year||''].filter(Boolean).join(' ');
      }
      if(title)item.requestedTitle=title.trim();if(year)item.requestedYear=Number(year);
      const key=item.url||item.query.toLowerCase();if(seen.has(key)){duplicates++;continue;}seen.add(key);
    }catch(e){item.status='error';item.invalid=true;item.error=e.message;item.url=typeof row==='string'?row.slice(0,500):'';}
    items.push(item);
  }
  if(items.length>200)throw new Error('Cada lote admite hasta 200 materiales. Divide la lista en varios lotes.');
  return {items,duplicates};
}
export function discoveryInput(input) {
  if(!input||typeof input!=='object')throw new Error('Búsqueda no válida.');
  const page=input.page??1;
  if(['playlist','collection'].includes(input.kind)){
    if(!Number.isInteger(page)||page<1||page>50)throw new Error('La exploración admite hasta 50 páginas.');
    let url=publicURL(input.query),u=new URL(url);
    if(['youtube.com','www.youtube.com','music.youtube.com'].includes(u.hostname)){
      if(u.searchParams.has('list')){const id=u.searchParams.get('list');if(!/^[A-Za-z0-9_-]{10,100}$/.test(id))throw new Error('Playlist no válida.');url=`https://www.youtube.com/playlist?list=${id}`;}
      else if(/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.test(u.pathname))url=url.replace(/\/$/,'')+'/videos';
    }
    return {url,args:['--playlist-items',`${(page-1)*200+1}:${page*200+1}`],kind:'collection',page};
  }
  if(input.kind!=='search'||typeof input.query!=='string'||input.query.trim().length<2||input.query.length>300)throw new Error('Escribe entre 2 y 300 caracteres para buscar.');
  if(!Number.isInteger(page)||page<1||page>10)throw new Error('La búsqueda admite hasta 200 resultados.');
  return {url:`ytsearch${page*20}:${input.query.trim()}`,args:['--playlist-items',`${(page-1)*20+1}:${page*20}`],kind:'search',page};
}
export function discoveryResults(info,request) {
  const seen=new Set(),entries=[];
  const source=info.entries||[info];
  for(const item of source){
    if(!item)continue;
    let url;try{
      const youtube=request.kind==='search'||/youtube/i.test(item.ie_key||item.extractor_key||info.extractor_key||'');
      // HTML5 embeds can point their webpage_url back to the collection itself.
      // Use the selected media URL so preparing it does not loop.
      const embedded=/html5/i.test(item.extractor_key||item.extractor||'')||item.webpage_url===request.url&&!!item.formats;
      const direct=embedded?item.url:(item.webpage_url||item.original_url||item.url);
      url=youtube&&/^[A-Za-z0-9_-]{11}$/.test(item.id||'')?`https://www.youtube.com/watch?v=${item.id}`:mediaURL(direct);
    }catch{continue;}
    if(seen.has(url))continue;seen.add(url);
    const isYT=new URL(url).hostname==='www.youtube.com';
    entries.push({id:isYT?new URL(url).searchParams.get('v'):createHash('sha256').update(url).digest('hex').slice(0,24),url,title:String(item.title||'Material audiovisual').slice(0,300),channel:String(item.channel||item.uploader||'').slice(0,200),source:new URL(url).hostname,duration:Number.isFinite(item.duration)?item.duration:null,thumbnail:isYT?`https://i.ytimg.com/vi/${new URL(url).searchParams.get('v')}/hqdefault.jpg`:'',views:Number(item.view_count)||0});
  }
  const collection=request.kind!=='search',limit=collection?200:20;
  return {title:String(info.title||'Resultados').slice(0,300),entries:entries.slice(0,limit),truncated:collection&&(source.length>200||Number(info.playlist_count)>200),page:request.page,hasMore:collection?source.length>200&&request.page<50:entries.length>=20&&request.page<10};
}
export const words=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]+/g)||[];
export function titleMatch(title,candidate,year){
  const expected=words(title).filter(w=>!['the','a','an','de','el','la','of','and'].includes(w));
  const actual=new Set(words(candidate));
  const ratio=expected.length?expected.filter(w=>actual.has(w)).length/expected.length:0;
  const conflictingYear=year&&[...actual].some(w=>/^(19|20)\d\d$/.test(w)&&w!==String(year));
  return {ratio,conflictingYear:!!conflictingYear,review:ratio<.75||!!conflictingYear};
}
export function downloadKey(job) { return JSON.stringify([job.url, job.mode, job.quality || 'best', job.mode === 'audio' ? job.audioFormat : '', job.mode === 'audio' && ['mp3','m4a'].includes(job.audioFormat) ? job.audioQuality : '']); }
export function queueConfig(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuración de cola no válida.');
  if (input.paused !== undefined && typeof input.paused !== 'boolean') throw new Error('Pausa no válida.');
  if (input.concurrency !== undefined && ![1,2,3].includes(input.concurrency)) throw new Error('Elige entre 1 y 3 descargas simultáneas.');
  return { paused: input.paused ?? current.paused, concurrency: input.concurrency ?? current.concurrency };
}
export function batchSummary(batch) {
  const counts = { pending:0, analyzing:0, ready:0, error:0 };
  for (const item of batch.items) counts[item.status]++;
  return { id: batch.id, name: batch.name, createdAt: batch.createdAt, total: batch.items.length, duplicates: batch.duplicates, stopped: batch.stopped, counts, complete: !counts.pending && !counts.analyzing };
}
export function createBatchManager({ data, slots, analyze, stopping }) {
  const path = join(data,'batches.json'); let batches = [];
  try { batches = JSON.parse(readFileSync(path,'utf8')); } catch {}
  batches = Array.isArray(batches) ? batches.filter(b => /^[a-f0-9-]{36}$/.test(b.id) && Array.isArray(b.items)) : [];
  for (const b of batches) for (const item of b.items) if (item.status === 'analyzing') item.status = 'pending';
  function save() { writeFileSync(path+'.tmp',JSON.stringify(batches)); renameSync(path+'.tmp',path); }
  const find = id => { const batch=batches.find(b=>b.id===id); if(!batch) throw Object.assign(new Error('Lote no encontrado.'),{status:404});return batch; };
  function pump() {
    if (stopping()) return;
    for (const batch of batches) {
      if (batch.stopped) continue;
      for (const item of batch.items) {
        if (slots() <= 0) return;
        if (item.status !== 'pending') continue;
        item.status = 'analyzing'; save();
        void (async () => {
          try { item.info = await analyze(item.url,item); item.url=item.info.url||item.url; item.status = 'ready'; delete item.error; }
          catch(e) { item.status = stopping() ? 'pending' : 'error'; item.error = e.message; }
          finally { save(); pump(); }
        })();
      }
    }
  }
  save();
  return {
    find, save, pump,
    list: () => batches.map(batchSummary).reverse(),
    public: b => ({...batchSummary(b),items:b.items}),
    create(text,name) {
      if (batches.filter(b => !batchSummary(b).complete && !b.stopped).length >= 3) throw new Error('Ya hay tres lotes en análisis. Espera o detén uno antes de añadir otro.');
      const parsed = parseMaterial(text);
      const b = { id:randomUUID(), name:typeof name === 'string' && name.trim() ? name.trim().slice(0,80) : `Lote ${batches.length+1}`, createdAt:new Date().toISOString(), stopped:false, ...parsed, receipts:{} };
      batches.push(b);save();pump();return b;
    },
    append(id,text) {
      const b=find(id),parsed=parseMaterial(text),known=new Set(b.items.map(i=>i.url||i.query?.toLowerCase())),added=[];
      for(const item of parsed.items){const key=item.url||item.query?.toLowerCase();if(key&&known.has(key)){parsed.duplicates++;continue;}known.add(key);added.push(item);}
      if(b.items.length+added.length>BATCH_LIMIT)throw new Error('Este lote superaría 200 materiales. Crea otro lote.');
      b.items.push(...added);b.duplicates+=parsed.duplicates;save();pump();return b;
    },
    edit(id,input) {
      const b=find(id);
      if(input.name!==undefined){if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw new Error('Escribe un nombre de 1 a 80 caracteres.');b.name=input.name.trim();}
      if(input.removeIds!==undefined){if(!Array.isArray(input.removeIds)||input.removeIds.some(id=>typeof id!=='string'))throw new Error('Selección no válida.');b.items=b.items.filter(i=>!input.removeIds.includes(i.id));}
      save();pump();return b;
    },
    replace(id,itemId,text) {
      const b=find(id),index=b.items.findIndex(i=>i.id===itemId),parsed=parseMaterial(text);
      if(index<0||parsed.items.length!==1||parsed.items[0].invalid)throw new Error('Selecciona exactamente un enlace válido para reemplazar.');
      if(b.items.some((i,n)=>n!==index&&i.url&&i.url===parsed.items[0].url))throw new Error('Ese material ya existe en este lote.');
      b.items[index]=parsed.items[0];save();pump();return b;
    },
    control(id,action) {
      const b=find(id);
      if(action==='stop') b.stopped=true;
      else if(action==='resume') { b.stopped=false;for(const i of b.items)if(i.status==='error'&&!i.invalid){i.status='pending';delete i.error;} }
      else throw new Error('Acción de análisis no válida.');
      save();pump();return b;
    }
  };
}
