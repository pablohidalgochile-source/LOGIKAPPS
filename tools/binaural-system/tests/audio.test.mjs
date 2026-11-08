import test from 'node:test';
import assert from 'node:assert/strict';

class Param { constructor(value=0){this.value=value;} setValueAtTime(v){this.value=v;} linearRampToValueAtTime(v){this.value=v;} setTargetAtTime(v){this.value=v;} cancelScheduledValues(){} }
class Node { constructor(){this.gain=new Param();this.frequency=new Param();this.pan=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();} connect(node){return node;} disconnect(){} start(){this.started=true;} stop(){this.stopped=true;} }
class Context {
  constructor(){this.state='running';this.currentTime=0;this.sampleRate=1000;this.destination=new Node();}
  createGain(){return new Node();}createStereoPanner(){return new Node();}createOscillator(){return new Node();}createBufferSource(){return new Node();}createDynamicsCompressor(){return new Node();}createAnalyser(){return new Node();}
  createBuffer(ch,length,sr){const values=Array.from({length:ch},()=>new Float32Array(length));return {length,sampleRate:sr,numberOfChannels:ch,getChannelData:c=>values[c]};}
  async resume(){this.state='running';}async close(){this.state='closed';}
}
globalThis.window={AudioContext:Context};
globalThis.document={createElement(){throw new Error('No media stream in test');},addEventListener(){},removeEventListener(){}};
const { NanookAudioEngine, createSynthesisGraph, audioBufferToWav } = await import('../src/audio-engine.js');
const { parseNarration, narration } = await import('../src/tts-engine.js');

test('grafo compartido mantiene L/R, ganancias por oído y deriva del motor avanzado', () => {
  const ctx=new Context(),g=createSynthesisGraph(ctx,{leftHz:173,rightHz:251,leftGain:0,rightGain:.7,modulation:.4,solfeggioGain:.2,beatDrift:1,volume:0},ctx.destination,0,2);
  assert.equal(g.nodes[0].frequency.value,173);assert.equal(g.nodes[1].frequency.value,251);
  assert.equal(g.gains.leftGain.gain.value,0);assert.equal(g.gains.rightGain.gain.value,.7);
  assert.equal(g.gains.master.gain.value,0);assert.ok(Math.abs(g.gains.lfoGain.gain.value-.04)<1e-12);
  assert.equal(g.gains.binLfoL.gain.value,1);assert.equal(g.gains.binLfoR.gain.value,-1);
});

test('WAV escribe cabecera, frecuencia de muestreo y muestras estéreo intercaladas', async () => {
  const buffer={numberOfChannels:2,sampleRate:44100,length:3,getChannelData:c=>Float32Array.from(c?[.5,0,-.5]:[1,0,-1])};
  const blob=audioBufferToWav(buffer),data=new DataView(await blob.arrayBuffer());
  assert.equal(blob.size,56);assert.equal(data.getUint16(22,true),2);assert.equal(data.getUint32(24,true),44100);
  assert.equal(data.getUint32(40,true),12);assert.equal(data.getInt16(44,true),32767);assert.equal(data.getInt16(46,true),16383);
  assert.equal(data.getInt16(52,true),-32768);assert.equal(data.getInt16(54,true),-16384);
});

test('programa avanza etapas reales y detenerlo cancela las siguientes', async () => {
  const stages=[{name:'A',durationMin:.0005,beatHz:4,solfeggioHz:396},{name:'B',durationMin:.0005,beatHz:8,solfeggioHz:528}];
  const engine=new NanookAudioEngine(),seen=[];
  try {
    await new Promise((resolve,reject)=>{engine.onError=reject;engine.runProgram(stages,200,0,'pink',.2,(i)=>seen.push([i,engine.currentPatch.leftHz,engine.currentPatch.rightHz]),resolve).catch(reject);});
    assert.deepEqual(seen,[[0,198,202],[1,196,204]]);
    seen.length=0;
    await engine.runProgram(stages,200,0,'pink',.2,i=>seen.push(i));engine.stop(false);
    await new Promise(resolve=>setTimeout(resolve,90));assert.deepEqual(seen,[0]);assert.equal(engine.state,'idle');
  } finally {engine.dispose();}
});

test('narración conserva pausas decimales y rechaza proveedores no conectados sin llamadas', () => {
  assert.deepEqual(parseNarration('Hola [pausa 1.5s] Sigue [pausa 2]'),[{type:'text',content:'Hola'},{type:'pause',secs:1.5},{type:'text',content:'Sigue'},{type:'pause',secs:2}]);
  assert.throws(()=>narration.speak('Hola',{}, {backend:'openai'}),/sin cuenta/);
});
