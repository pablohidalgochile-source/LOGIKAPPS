import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicIP,publicURL,publicAddress,startMediaProxy} from '../network.mjs';
import {mediaURL,safeFormat,selection,summarize} from '../lib.mjs';
import {parseMaterial,discoveryInput,discoveryResults,titleMatch,createBatchManager} from '../bulk.mjs';

test('admite webs públicas y normaliza YouTube sin abrir rutas internas',()=>{
  assert.equal(mediaURL('https://vimeo.com/123#t=1'),'https://vimeo.com/123');
  assert.equal(mediaURL('https://youtu.be/jNQXAC9IVRw?si=x'),'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  for(const url of ['file:///etc/passwd','ftp://example.org/video','http://localhost/','http://localhost./','http://127.0.0.1','http://2130706433','http://0x7f000001','http://[::ffff:127.0.0.1]','http://[::1]','http://169.254.169.254/latest','http://router.local','https://user:pass@example.org','https://example.org:8080'])assert.throws(()=>publicURL(url),url);
  assert(publicURL('https://example.org/video.mp4?signature=value'));
});
test('bloquea direcciones reservadas y DNS mixto antes de conectar',async()=>{
  for(const ip of ['0.0.0.0','10.1.1.1','127.0.0.1','100.64.0.1','169.254.169.254','172.31.1.1','192.168.1.1','224.0.0.1','198.18.0.1','::1','::ffff:8.8.8.8','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::'])assert.equal(publicIP(ip),false,ip);
  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert(publicIP(ip),ip);
  await assert.rejects(publicAddress('example.org',async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}]));
  assert.deepEqual(await publicAddress('example.org',async()=>[{address:'1.1.1.1',family:4}]),{address:'1.1.1.1',family:4});
  const ipv6={address:'2606:4700:4700::1111',family:6},ipv4={address:'1.1.1.1',family:4};
  assert.deepEqual(await publicAddress('example.org',async()=>[ipv6,ipv4]),ipv6);
  assert.deepEqual(await publicAddress('example.org',async()=>[ipv4,ipv6]),ipv4);
});
test('proxy exige su credencial y rechaza HTTP y túneles a redes internas',async()=>{
  const proxy=await startMediaProxy(),u=new URL(proxy.url),auth='Basic '+Buffer.from(u.username+':'+u.password).toString('base64');
  const get=headers=>new Promise((resolve,reject)=>{const req=http.get({hostname:u.hostname,port:u.port,path:'http://127.0.0.1:4317/api/health',headers},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  try{
    assert.equal(await get({}),403);assert.equal(await get({'Proxy-Authorization':auth}),403);
    const text=await new Promise((resolve,reject)=>{const socket=net.connect(Number(u.port),u.hostname,()=>socket.write(`CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\nProxy-Authorization: ${auth}\r\n\r\n`));let text='';socket.on('data',b=>text+=b);socket.on('end',()=>resolve(text));socket.on('error',reject);});assert.match(text,/403 Forbidden/);
  }finally{proxy.close();}
});
test('selección restringe protocolos y metadatos distinguen audio, video desconocido y DRM',()=>{
  const safe=safeFormat(selection('original','1080').format);assert.equal((safe.match(/protocol~/g)||[]).length,4);assert(safe.includes('m3u8_native'));assert(!safe.includes('rtmp'));
  const audio=summarize({id:'a',title:'Audio',url:'https://example.org/a.mp3',ext:'mp3'},'https://example.org/a.mp3');assert.equal(audio.hasVideo,false);assert.equal(audio.source,'example.org');assert.equal(audio.thumbnail,'');
  const video=summarize({id:'v',url:'https://example.org/v.mp4',ext:'mp4'},'https://example.org/v.mp4');assert(video.hasVideo);assert.equal(video.maxHeight,0);assert.deepEqual(video.heights,[]);
  assert.throws(()=>summarize({has_drm:true,formats:[{height:1080,vcodec:'avc1',has_drm:true}]},'https://example.org/video'),/DRM/);
  assert.throws(()=>summarize({_type:'playlist',entries:[]},'https://example.org/video'),/colección/);
});
test('importa JSON, títulos, años y enlaces de varias fuentes conservando errores',()=>{
  const parsed=parseMaterial(JSON.stringify([{titulo:'Scary Movie',año:2000,url:'https://youtu.be/3iy0pE1FBkc'},{titulo:'Project X',año:2012},{url:'https://vimeo.com/123'},{url:'file:///etc/passwd'}]));
  assert.equal(parsed.items.length,4);assert.equal(parsed.items[0].requestedYear,2000);assert.equal(parsed.items[1].query,'Project X 2012');assert.equal(parsed.items[3].invalid,true);
  assert.equal(parseMaterial('https://example.org/video.mp4\nhttps://example.org/video.mp4').duplicates,1);
  assert.throws(()=>parseMaterial('[invalid'),/JSON/);assert.equal(parseMaterial('file:///etc/passwd').items[0].invalid,true);
  assert.equal(titleMatch('Scary Movie','Scary Movie 3 Official Trailer 2003',2000).review,true);
  assert.equal(titleMatch('Scary Movie','Scary Movie Official Trailer (2000)',2000).review,false);
});
test('canales paginan de 200 en 200 y fuentes externas no se convierten en YouTube',()=>{
  const r=discoveryInput({kind:'collection',query:'https://www.youtube.com/@Blender',page:2});assert.equal(r.url,'https://www.youtube.com/@Blender/videos');assert.deepEqual(r.args,['--playlist-items','201:401']);
  const d=discoveryResults({entries:[{id:'123',url:'https://vimeo.com/123',title:'Clip'},{id:'bad',url:'file:///etc/passwd'},{id:'private',url:'http://localhost/secret'}]},r);assert.equal(d.entries.length,1);assert.equal(d.entries[0].source,'vimeo.com');
});
test('lotes permiten añadir, renombrar, reemplazar y quitar sin duplicar',()=>{
  const data=mkdtempSync(join(tmpdir(),'ingesta-batch-'));
  try{const m=createBatchManager({data,slots:()=>0,stopping:()=>false,analyze:async()=>{}}),b=m.create('https://vimeo.com/123','Lote');m.append(b.id,'https://vimeo.com/123\nhttps://example.org/video.mp4');assert.equal(b.items.length,2);assert.equal(b.duplicates,1);m.edit(b.id,{name:'Tráilers'});assert.equal(b.name,'Tráilers');m.replace(b.id,b.items[0].id,'https://vimeo.com/456');assert.equal(b.items[0].url,'https://vimeo.com/456');assert.throws(()=>m.replace(b.id,b.items[0].id,'http://localhost/a'));m.edit(b.id,{removeIds:[b.items[1].id]});assert.equal(b.items.length,1);}finally{rmSync(data,{recursive:true,force:true});}
});
test('los videos HTML5 incrustados usan el archivo y no vuelven a la página contenedora',()=>{
  const url='https://example.org/watch',request=discoveryInput({kind:'collection',query:url});
  const entry={extractor_key:'HTML5MediaEmbed',webpage_url:url,url:'https://cdn.example.org/clip.mp4',formats:[{ext:'mp4'}],title:'Clip'};
  const result=discoveryResults({entries:[entry,{...entry,id:'duplicate'},{...entry,url:'http://localhost/private'}]},request);
  assert.equal(result.entries.length,1);assert.equal(result.entries[0].url,'https://cdn.example.org/clip.mp4');
});
