import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioSelection, downloadChoices } from '../lib.mjs';
import { metadata, enhancementOptions, audioFilters, videoFilters, byteRange } from '../media.mjs';
const video = { type: 'video', duration: 30, width: 1280, height: 720, audioCodec: 'aac' };
test('audio original evita recompresión; las conversiones limitan formato y bitrate', () => {
  assert.deepEqual(audioSelection().args, ['-x', '--audio-format', 'best']);
  assert.deepEqual(audioSelection('mp3', '320').args, ['-x', '--audio-format', 'mp3', '--audio-quality', '320K']);
  assert(!audioSelection('wav', '320').args.includes('--audio-quality'));
  for (const [format, quality] of [['ogg','320'],['mp3','999'],['mp3','320;touch']]) assert.throws(() => audioSelection(format,quality));
  const choices = downloadChoices({ target: 'both', mode: 'mp4', quality: '1080', audioFormat: 'flac', audioQuality: '320' });
  assert.equal(choices.length, 2); assert.equal(choices[1].mediaType, 'audio');
  assert.throws(() => downloadChoices({target:'both',mode:'original',quality:'best',audioFormat:'exe'}));
});
test('carátulas no se confunden con video; rotación y audio se detectan', () => {
  const result = metadata({ format: {duration:'12'}, streams:[{codec_type:'video',width:600,height:600,disposition:{attached_pic:1}},{codec_type:'audio',codec_name:'mp3',sample_rate:'44100',channels:2,bit_rate:'320000'}] });
  assert.equal(result.type, 'audio'); assert.equal(result.audioBitrate, 320);
  const rotated = metadata({format:{duration:'12'},streams:[{codec_type:'video',width:1920,height:1080,side_data_list:[{rotation:90}],avg_frame_rate:'30000/1001'}]});
  assert.equal(rotated.width,1080);assert.equal(rotated.height,1920);assert(rotated.fps>29.9);
  assert.throws(()=>metadata({format:{duration:'nan'},streams:[{codec_type:'audio'}]}));
});
test('mejoras rechazan fuentes incompatibles, opciones inyectadas e IA fuera de límites', () => {
  assert.throws(()=>enhancementOptions({engine:'ai'},video,false));
  assert.throws(()=>enhancementOptions({target:'video'}, {...video,type:'audio'},true));
  assert.throws(()=>enhancementOptions({target:'audio'}, {...video,audioCodec:null},true));
  for(const patch of [{engine:'shell'},{resolution:'1080;exec'},{normalize:'false'},{previewSeconds:999},{engine:'ai'}]) assert.throws(()=>enhancementOptions(patch,{...video,duration:900},false));
  const clean=enhancementOptions({target:'audio',profile:'preserve'},video,true);
  assert.deepEqual(audioFilters(clean),[]);
  assert.match(videoFilters({...clean,resolution:'1080'},{width:720,height:1280})[0],/1080:1920/);
});
test('rangos de reproducción: parciales, sufijos, límites y solicitudes inválidas',()=>{
  assert.deepEqual(byteRange('bytes=0-99',1000),{start:0,end:99});
  assert.deepEqual(byteRange('bytes=-100',1000),{start:900,end:999});
  assert.deepEqual(byteRange('bytes=900-',1000),{start:900,end:999});
  for(const header of ['bytes=1000-','bytes=10-1','bytes=0-2,4-5','bytes=-0','bytes=-','junk'])assert.equal(byteRange(header,1000),false);
});
