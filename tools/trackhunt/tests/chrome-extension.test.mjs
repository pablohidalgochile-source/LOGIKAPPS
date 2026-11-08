import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { videoID, wavPCM } from '../chrome-extension/audio.js';
test('accepts only a single ordinary YouTube watch page', () => {
  assert.equal(videoID('https://www.youtube.com/watch?v=oFxQkIvVye8&list=RDx'), 'oFxQkIvVye8');
  for (const url of ['https://evil.test/watch?v=oFxQkIvVye8','https://www.youtube.com.evil.test/watch?v=oFxQkIvVye8','file:///tmp/audio','https://www.youtube.com/watch?v=bad','https://www.youtube.com/shorts/oFxQkIvVye8']) assert.equal(videoID(url), null);
});
test('PCM encoding is bounded, mono, little endian and clips samples', () => {
  const samples = new Float32Array(48000 * 12); samples.set([-2, 0, 2]);
  const v = new DataView(wavPCM(samples, 48000));
  assert.equal(v.byteLength, 1152044); assert.equal(v.getUint32(40,true), 1152000);
  assert.equal(v.getInt16(44,true), -32768); assert.equal(v.getInt16(48,true),32767);
  for (const [n,rate] of [[48000*13,48000],[48000*2,48000],[44100*3,22050]]) assert.throws(()=>wavPCM(new Float32Array(n),rate));
});
test('worklet captures only a bounded window, mixes channels and outputs silence', () => {
  let Processor; const sent=[];
  const sandbox={sampleRate:48000,Float32Array,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>sent.push(m)}}},registerProcessor:(_name,p)=>Processor=p};
  vm.runInNewContext(fs.readFileSync(new URL('../chrome-extension/capture-worklet.js',import.meta.url),'utf8'),sandbox);
  const p=new Processor(); p.port.onmessage({data:{type:'record',seconds:12}});
  const out=new Float32Array(128).fill(1), input=[[new Float32Array(128).fill(.5),new Float32Array(128).fill(.25)]];
  for(let i=0;i<4501;i++)p.process(input,[[out]]);
  assert.equal(sent.length,1); assert.equal(sent[0].samples.length,576000);assert.equal(sent[0].samples[0],.375);assert.ok(out.every(n=>n===0));
  p.port.onmessage({data:{type:'record',seconds:12}});p.process(input,[[out]]);p.port.onmessage({data:{type:'discard'}});for(let i=0;i<4500;i++)p.process(input,[[out]]);assert.equal(sent.length,1);
});
test('stable extension identity matches the native bridge allowlist; no broad host or microphone permissions',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../chrome-extension/manifest.json',import.meta.url)));
  const id=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].map(b=>String.fromCharCode(97+(b>>4),97+(b&15))).join('');
  assert.match(fs.readFileSync(new URL('../mac-assistant/Sources/ScanCore/ScanPlan.swift',import.meta.url),'utf8'),new RegExp(id));
  assert.deepEqual(manifest.host_permissions,['http://127.0.0.1:43871/*']);
  assert.ok(!manifest.permissions.includes('debugger'));assert.ok(!manifest.permissions.includes('audioCapture'));assert.equal(manifest.externally_connectable,undefined);
});
