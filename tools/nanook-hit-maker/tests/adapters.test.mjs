import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importChoices,applyImport,asMagic,asJavita,projectMidi,scoreWindow,scoreXML} from '../public/adapters.mjs';
const base={format:'nanook-hit-maker-project',version:1,id:'a'.repeat(32),revision:1,title:'Neón',bpm:120,duration:2,key:'La menor',chords:'Am–F–C–G',idea:'Una canción nocturna con un motivo memorable.',lyrics:'[Chorus]\nNeón, corazón',style:'Dark electro urban groove with warm bass and a repeating melodic motif.',exclude:'slow ballad',parts:[],assets:[],structure:[],imports:[]};
test('JAVITA import retains polyphonic notes without retranscription',()=>{
 const source={format:'javita',version:1,title:'Acorde',bpm:108,duration:2,parts:[{key:'other',notes:[60,64,67].map(pitch=>({pitch,start:0,duration:1.9,amplitude:.6}))}]};
 const p=applyImport(base,importChoices(source)[0]);assert.equal(p.parts[0].notes.length,3);assert.deepEqual(asJavita(p).parts,source.parts);assert.deepEqual(p.imports[0].raw,source);
});
test('published hits fixture composes and roundtrips as JAVITA',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/hits-session.json',import.meta.url)));
 const p=applyImport(base,importChoices(fixture)[0]);assert.equal(p.parts.length,3);assert.equal(p.structure.length,6);assert.equal(asJavita(p).origin,'hits');assert.equal(p.parts[0].notes[0].pitch,62);
});
test('MAGIC draft transfer validates and preserves musical decisions and Unicode lyrics',()=>{
 const session=asMagic(base);const choice=importChoices(JSON.parse(session.text))[0];const p=applyImport(base,choice);
 assert.equal(p.lyrics,base.lyrics);assert.equal(p.chords,base.chords);assert.equal(p.style,base.style);assert.equal(p.idea,base.idea);assert.equal(p.parts.length,0);
});
test('integrated MAGIC retains its explicit proposal tempo when the score differs',()=>{
 const existing=asMagic(base).current;
 for(const scoreTempo of [123.87,100]){
  const p={...base,bpm:scoreTempo,magic:{...existing,generationId:'test-generation',brief:{...existing.brief,bpm:124}}};
  const out=asMagic(p).current;assert.equal(out.proposal.tempo,124);assert.equal(out.brief.bpm,124);assert.equal(p.bpm,scoreTempo);
 }
});
test('long projects cannot be silently truncated into JAVITA',()=>{
 assert.throws(()=>asJavita({...base,duration:370}),/5 minutos/);
});
test('score windows retain sustained notes crossing page boundaries',()=>{
 const p={...base,duration:40,parts:[{key:'melody',name:'Melodía',notes:[{pitch:60,start:15,duration:5,amplitude:.8}]}]};
 const window=scoreWindow(p,0,1);assert.equal(window.parts[0].notes[0].start,0);assert.equal(window.parts[0].notes[0].duration,4);
});
test('returned Ableton sections appear in MusicXML and retain global bars across pages',()=>{
 const p={...base,duration:40,parts:[{key:'bass',name:'Bajo',notes:[{pitch:30,start:8,duration:1,amplitude:.8}]}],structure:[{name:'Intro',time:0},{name:'Drop & vuelta <Live>',time:10}]};
 const xml=scoreXML(scoreWindow(p,0,0));
 assert.match(xml,/<measure number="6"><direction placement="above"><direction-type><rehearsal[^>]*>Drop &amp; vuelta &lt;Live&gt;/);
 const next=scoreXML(scoreWindow(p,0,1));assert.match(next,/<measure number="9">/);assert.match(next,/Drop &amp; vuelta &lt;Live&gt; \(cont.\)/);
});
test('MIDI routes drums to channel 10 and retains end-of-project silence',()=>{
 const p={...base,duration:10,parts:[{key:'drums',name:'Batería',notes:[{pitch:36,start:0,duration:.1,amplitude:1}]},{key:'bass',name:'Bajo',notes:[{pitch:36,start:0,duration:1,amplitude:.8}]}]};
 const bytes=projectMidi(p);assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'MThd');assert.ok(bytes.includes(0x99));assert.ok(bytes.includes(0x90));
 // Parse tracks rather than asserting the writer's byte layout.
 const view=new DataView(bytes.buffer);let pos=14;const ends=[];
 for(let i=0;i<view.getUint16(10);i++){const limit=pos+8+view.getUint32(pos+4);pos+=8;let ticks=0;
  const variable=()=>{let n=0,b;do{b=bytes[pos++];n=n*128+(b&127);}while(b&128);return n;};
  while(pos<limit){ticks+=variable();const event=bytes[pos++];if(event===255){const type=bytes[pos++],len=variable();pos+=len;if(type===47)ends.push(ticks);}else pos+=(event&0xf0)===0xc0?1:2;}
 }
 assert.deepEqual(ends,[9600,9600]);
});
