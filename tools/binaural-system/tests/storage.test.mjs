import test from 'node:test';
import assert from 'node:assert/strict';
const map=new Map([['nanook-v1-user','original-intacto'],['binaural-system:v1:binauralPresets','{"invalid":true}']]);
globalThis.localStorage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
globalThis.window={dispatchEvent(){},addEventListener(){}};
const {readStore,writeStore,exportState,restoreState}=await import('../src/store.js');

test('persistencia ignora RESET DETOX, recupera colecciones inválidas y restaura solo su espacio',()=>{
  assert.equal(readStore('binauralPresets'),undefined);
  writeStore('binauralPresets',[{id:'preset_1',name:'Prueba'}]);writeStore('binauralVolume',.12);
  const backup=exportState();assert.equal(backup.binauralVolume,.12);assert.equal(backup['nanook-v1-user'],undefined);
  restoreState({binauralVolume:.2,binauralPresets:[]});
  assert.equal(map.get('nanook-v1-user'),'original-intacto');assert.equal(readStore('binauralVolume'),.2);
});
