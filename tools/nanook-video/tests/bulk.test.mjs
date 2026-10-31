import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLinks, discoveryInput, discoveryResults, downloadKey, queueConfig, createBatchManager } from '../bulk.mjs';
const link = n => `https://youtu.be/${String(n).padStart(11,'0')}`;
const delay = ms => new Promise(r=>setTimeout(r,ms));
test('lotes normalizan enlaces, eliminan repetidos y limitan el trabajo a 200', () => {
  const b=parseLinks(`(${link(1)}),\nhttps://www.youtube.com/watch?v=00000000001&si=foo\nhttps://localhost/secret`);
  assert.equal(b.items.length,2);assert.equal(b.duplicates,1);assert.equal(b.items[0].url,'https://www.youtube.com/watch?v=00000000001');assert.equal(b.items[1].invalid,true);
  assert.equal(parseLinks(Array.from({length:200},(_,i)=>link(i)).join('\n')).items.length,200);
  assert.throws(()=>parseLinks(Array.from({length:201},(_,i)=>link(i)).join('\n')),/200/);
  assert.throws(()=>parseLinks(''));assert.throws(()=>parseLinks('a'.repeat(200001)));
});
test('búsqueda y playlists solo producen solicitudes acotadas de YouTube',()=>{
  assert.deepEqual(discoveryInput({kind:'search',query:'  música $(touch nope) ',page:2}),{kind:'search',page:2,url:'ytsearch40:música $(touch nope)',args:['--playlist-items','21:40']});
  assert.equal(discoveryInput({kind:'playlist',query:'https://www.youtube.com/watch?v=00000000001&list=PLabcdefgh1234&other=evil'}).url,'https://www.youtube.com/playlist?list=PLabcdefgh1234');
  for(const query of ['http://127.0.0.1/playlist?list=PLabcdefgh1234','https://youtube.com:99/playlist?list=PLabcdefgh1234','https://evil@youtube.com/playlist?list=PLabcdefgh1234','file:///etc/passwd'])assert.throws(()=>discoveryInput({kind:'playlist',query}));
  for(const page of [0,11,1.5,'1'])assert.throws(()=>discoveryInput({kind:'search',query:'music',page}));
});
test('resultados descartan entradas no válidas y no aceptan enlaces del extractor',()=>{
  const entries=Array.from({length:201},(_,i)=>({id:String(i).padStart(11,'0'),title:'<script>',ie_key:'Youtube',url:'http://evil.test'}));
  const result=discoveryResults({entries:[null,{id:'bad'},...entries,entries[0]]},{kind:'playlist',page:1});
  assert.equal(result.entries.length,200);assert.equal(result.truncated,true);assert.equal(result.hasMore,true);assert.equal(result.entries[0].url,'https://www.youtube.com/watch?v=00000000000');
  assert.equal(discoveryResults({entries:entries.slice(0,20)},{kind:'search',page:1}).hasMore,true);
  assert.equal(discoveryResults({entries},{kind:'search',page:10}).hasMore,false);
});
test('duplicados distinguen formato y calidad efectivos; configuración valida límites',()=>{
  const j={url:link(1),mode:'audio',audioFormat:'mp3',audioQuality:'320'};
  assert.notEqual(downloadKey(j),downloadKey({...j,audioQuality:'128'}));
  assert.equal(downloadKey({...j,audioFormat:'wav'}),downloadKey({...j,audioFormat:'wav',audioQuality:'128'}));
  assert.deepEqual(queueConfig({paused:true},{paused:false,concurrency:2}),{paused:true,concurrency:2});
  for(const value of [{concurrency:4},{concurrency:'3'},{paused:'false'},null,[]])assert.throws(()=>queueConfig(value,{}));
});
test('análisis respeta dos espacios, detiene nuevos trabajos y recupera un reinicio',async()=>{
  const data=mkdtempSync(join(tmpdir(),'nanook-batch-'));let running=0,max=0,stopping=false;
  try{
    const config={data,slots:()=>2-running,stopping:()=>stopping,analyze:async url=>{running++;max=Math.max(max,running);await delay(20);running--;return {url,title:'Video'};}};
    let manager=createBatchManager(config);
    const batch=manager.create(Array.from({length:8},(_,i)=>link(i)).join('\n'),'Prueba');
    manager.control(batch.id,'stop');await delay(70);assert.equal(manager.public(batch).counts.ready,2);assert.equal(manager.public(batch).counts.pending,6);assert.equal(max,2);
    manager.control(batch.id,'resume');await delay(150);assert.equal(manager.public(batch).counts.ready,8);
    const stored=JSON.parse(readFileSync(join(data,'batches.json'),'utf8'));stored[0].items[0].status='analyzing';writeFileSync(join(data,'batches.json'),JSON.stringify(stored));
    manager=createBatchManager(config);assert.equal(manager.public(manager.find(batch.id)).counts.pending,1);manager.pump();await delay(70);assert.equal(manager.public(manager.find(batch.id)).counts.ready,8);
    stopping=true;
  }finally{rmSync(data,{recursive:true,force:true});}
});
