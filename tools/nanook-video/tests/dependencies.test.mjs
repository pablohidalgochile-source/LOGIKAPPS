import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDependencyCheck } from '../dependencies.mjs';

test('un fallo inicial se vuelve a comprobar y recupera la cola sin reiniciar', async () => {
  let time=0, available=false, calls=0, resumed=0;
  const check=createDependencyCheck({ytdlp:'yt',ffmpeg:'ff',now:()=>time,onReady:()=>resumed++,run:async binary=>{
    calls++;if(binary==='yt'&&!available)throw Object.assign(new Error('startup timeout'),{killed:true});return{stdout:'version\n'};
  }});
  const first=await check();assert.equal(first.ready,false);assert.equal(first.ffmpeg,true);assert.equal(first.dependencyErrors.ytDlp,'timeout');assert(!first.dependencyMessage.includes('Falta'));
  available=true;time=4999;assert.equal((await check()).ready,false);assert.equal(calls,2);
  time=5000;assert.equal((await check()).ready,true);assert.equal(resumed,1);assert.equal(calls,4);
  assert.equal((await check()).dependencyMessage,null);assert.equal(resumed,1);
});
test('las comprobaciones simultáneas comparten los mismos procesos',async()=>{
  let release,calls=0;const gate=new Promise(r=>release=r);
  const check=createDependencyCheck({ytdlp:'yt',ffmpeg:'ff',run:async()=>{calls++;await gate;return{stdout:'ok'};}});
  const requests=Array.from({length:20},()=>check());release();assert((await Promise.all(requests)).every(r=>r.ready));assert.equal(calls,2);
});
test('también caduca una comprobación exitosa y distingue herramientas ausentes',async()=>{
  let time=0,available=true,resumed=0;
  const check=createDependencyCheck({ytdlp:'yt',ffmpeg:'ff',now:()=>time,onReady:()=>resumed++,run:async binary=>{
    if(binary==='ff'&&!available)throw Object.assign(new Error('not found'),{code:'ENOENT'});return{stdout:'ok'};
  }});
  assert((await check()).ready);available=false;time=60000;const failed=await check();assert.equal(failed.ready,false);assert.equal(failed.dependencyErrors.ffmpeg,'missing');assert.equal(failed.dependencyErrors.ytDlp,null);
  available=true;time+=5000;assert((await check()).ready);assert.equal(resumed,2);
});
