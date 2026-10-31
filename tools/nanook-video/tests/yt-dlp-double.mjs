#!/usr/bin/env node
// Deterministic engine double: used only by the isolated queue integration test.
import { copyFileSync, mkdirSync, appendFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const args=process.argv.slice(2),url=args.at(-1),id=url?.split('v=')[1];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
if(args.includes('--version')){console.log('test-double');process.exit(0);}
if(args.includes('--dump-single-json')){
  await delay(10);
  if(args.includes('--flat-playlist')){
    const range=args[args.indexOf('--playlist-items')+1].split(':').map(Number);
    const entries=Array.from({length:range[1]-range[0]+1},(_,i)=>({id:String(7000+range[0]+i).padStart(11,'0'),title:`${url.startsWith('ytsearch')?url.replace(/^ytsearch\d+:/,''):'Resultado'} ${range[0]+i}`,ie_key:'Youtube',channel:'Canal de prueba',duration:2}));
    await new Promise(resolve=>process.stdout.write(JSON.stringify({title:'Playlist de prueba',entries})+'\n',resolve));
  }else console.log(JSON.stringify({id,title:`Prueba musical ${id}`,channel:'Prueba local',duration:2,formats:[{height:90,vcodec:'avc1.640028',acodec:'aac'},{vcodec:'none',acodec:'aac',abr:128}]}));
  process.exit(0);
}
const directory=args[args.indexOf('--paths')+1];mkdirSync(directory,{recursive:true});
const events=process.env.DOUBLE_EVENTS,marker=join(directory,'started.part');
const event=type=>appendFileSync(events,JSON.stringify({type,id,pid:process.pid,time:Date.now()})+'\n');
event(existsSync(marker)?'resume':'start');writeFileSync(marker,'partial');
process.on('SIGTERM',()=>{event('stop');process.exit(143);});
console.log('PROGRESS '+JSON.stringify({downloaded_bytes:1,total_bytes:10}));
await delay(Number(process.env.DOUBLE_DELAY||700));
const fail=join(process.env.DOUBLE_CONTROL,'fail-'+id);
if(existsSync(fail)){event('error');console.error('Network connection failed');process.exit(1);}
const file=join(directory,'fixture.mp4');copyFileSync(process.env.DOUBLE_FIXTURE,file);unlinkSync(marker);event('end');
console.log('FILE '+JSON.stringify(file));
