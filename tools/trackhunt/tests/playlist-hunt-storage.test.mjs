import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const modelUrl=compile(await readFile(new URL('../lib/playlist-hunt.ts',import.meta.url),'utf8'));
const model=await import(modelUrl);
const storage=await import(compile((await readFile(new URL('../lib/playlist-hunt-storage.ts',import.meta.url),'utf8')).replace('"./playlist-hunt"',JSON.stringify(modelUrl))));
const snapshot={id:'one',savedAt:new Date().toISOString(),input:{reference:{artist:'A',title:'B'},context:'',controls:{...model.DEFAULT_CONTROLS},feedback:[]},result:{name:'One',summary:'Test',warnings:[],tracks:[{id:'a|b',artist:'A',title:'B',genre:'Dancehall',region:'Caribe',language:'Español',reason:'Test',stage:'Dancehall',energy:50,similarity:80,bpm:null,bpmSource:'pending',key:null,duration:180,deezerId:123,catalogStatus:'verified'}]},selection:['a|b','missing'],name:'One',resultReference:'A — B',paths:{'a|b':'/Music/original.wav',missing:'/wrong'}};
test('history restores selection and local paths, filters absent tracks, rejects corrupt data',()=>{
 const restored=storage.readHuntSnapshot(snapshot);assert.deepEqual(restored.selection,['a|b']);assert.deepEqual(restored.paths,{'a|b':'/Music/original.wav'});
 assert.equal(storage.readHuntSnapshot({...snapshot,result:{...snapshot.result,tracks:[{}]}}),null);
 assert.equal(storage.readHuntSnapshot({...snapshot,input:{}}),null);
});
test('history keeps ten entries and replaces an updated snapshot without duplicates',()=>{
 let history=[];for(let i=0;i<12;i++)history=storage.addHuntHistory(history,{...snapshot,id:String(i)});
 assert.equal(history.length,10);assert.equal(history[0].id,'11');
 history=storage.addHuntHistory(history,{...snapshot,id:'8',name:'Edited'});
 assert.equal(history.length,10);assert.equal(history[0].name,'Edited');assert.equal(history.filter(s=>s.id==='8').length,1);
});
