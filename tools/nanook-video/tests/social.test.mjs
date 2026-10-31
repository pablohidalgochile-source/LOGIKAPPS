import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaURL,sourceName,summarize,selection,friendlyError,videoDownloadPlan} from '../lib.mjs';
import {compatibleMp4Encoding} from '../media.mjs';

test('reconoce Instagram, TikTok y enlaces compartidos sin confundir dominios',()=>{
  assert.equal(mediaURL('https://instagram.com/p/De5DCGlobfY/?igsh=tracking'),'https://www.instagram.com/p/De5DCGlobfY/');
  assert.equal(mediaURL('[https://www.instagram.com/p/De5DCGlobfY/](https://www.instagram.com/p/De5DCGlobfY/)'),'https://www.instagram.com/p/De5DCGlobfY/');
  assert.equal(mediaURL('Mira este video https://vm.tiktok.com/ZTR45GpSF/ en TikTok'),'https://vm.tiktok.com/ZTR45GpSF/');
  assert.equal(mediaURL('https://www.tiktok.com/@patroxofficial/video/6742501081818877190?share_app_id=123'),'https://www.tiktok.com/@patroxofficial/video/6742501081818877190');
  assert.equal(sourceName('https://vm.tiktok.com/id'),'TikTok');assert.equal(sourceName('https://www.instagram.com/reel/id'),'Instagram');assert.equal(sourceName('https://notinstagram.com/'),'notinstagram.com');
  assert.throws(()=>mediaURL('https://youtu.be/jNQXAC9IVRw https://vimeo.com/123'),/Lotes/);
  assert.throws(()=>mediaURL('Mira http://127.0.0.1/privado'));
  assert.equal(mediaURL('https://example.org/video.mp4?signature=abc&expires=123'),'https://example.org/video.mp4?signature=abc&expires=123');
});
test('conserva dimensiones verticales y reconoce H264 de TikTok en MP4',()=>{
  const info=summarize({id:'6742501081818877190',formats:[{ext:'mp4',vcodec:'h264',acodec:'aac',height:1024,width:576}]},'https://www.tiktok.com/@example/video/6742501081818877190');
  assert.equal(info.platform,'TikTok');assert.equal(info.width,576);assert.equal(info.height,1024);assert.deepEqual(info.mp4Heights,[1024]);assert(info.hasAudio);
  assert(selection('mp4','best').format.includes('avc1|h264'));
});
test('permite videos silenciosos y distingue limitación temporal de acceso',()=>{
  const info=summarize({id:'silent',formats:[{ext:'mp4',vcodec:'avc1',acodec:'none',width:720,height:1280}]},'https://www.instagram.com/reel/silent/');
  assert(info.hasVideo);assert.equal(info.hasAudio,false);assert(selection('original','best').format.endsWith('/bv*'));
  assert.match(friendlyError('HTTP Error 429: Too Many Requests; login required'),/temporalmente/);
});

test('Instagram con VP9 y MP4 sin metadatos permite MP4 mediante conversión',()=>{
  const info=summarize({id:'De5DCGlobfY',formats:[
    {ext:'mp4'}, {ext:'mp4',width:1080,height:1920,vcodec:'vp09.00.40.08',acodec:'none'},
    {ext:'m4a',vcodec:'none',acodec:'mp4a.40.5'}
  ]},'https://www.instagram.com/p/De5DCGlobfY/');
  assert.deepEqual(info.mp4Heights,[]);
  const mp4=videoDownloadPlan('mp4','best',info);
  assert(mp4.convertToMp4);assert.equal(mp4.container,'mkv');
  assert.equal(mp4.format,selection('original','best').format);
  assert.equal(videoDownloadPlan('original','best',info).convertToMp4,false);
});

test('MP4 nativo se conserva y la conversión respeta el límite elegido',()=>{
  const info={mp4Heights:[1080],heights:[1080,720]};
  assert.equal(videoDownloadPlan('mp4','best',info).convertToMp4,false);
  const limited=videoDownloadPlan('mp4','720',info);
  assert(limited.convertToMp4);assert.equal(limited.format,selection('original','720').format);
  assert.throws(()=>videoDownloadPlan('mp4','720;exec',info));
});

test('MP4 convierte a H264, conserva AAC y admite videos sin audio',()=>{
  const meta={type:'video',audioCodec:'aac'};
  const args=compatibleMp4Encoding(meta);
  assert.equal(args[args.indexOf('-c:v')+1],'libx264');
  assert.equal(args[args.indexOf('-c:a')+1],'copy');
  assert(args.includes('0:a:0?'));assert(args.includes('+faststart'));
  const opus=compatibleMp4Encoding({...meta,audioCodec:'opus'});
  assert.equal(opus[opus.indexOf('-c:a')+1],'aac');
  assert(compatibleMp4Encoding({...meta,audioCodec:null}).includes('0:a:0?'));
  assert.throws(()=>compatibleMp4Encoding({type:'audio'}));
});
