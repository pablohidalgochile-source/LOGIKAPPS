import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
process.chdir(root);
if(existsSync('.env.local')) process.loadEnvFile('.env.local');
const config=JSON.parse(readFileSync('launcher-config.json','utf8'));
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13)) throw Error('Se necesita Node.js 22.13 o posterior. Consulta LEEME.');
if(!existsSync(join(root,config.required))) throw Error('Primero abre Preparar '+config.name+'.command. Abrir no instala dependencias.');
const free=port=>new Promise(resolve=>{const s=createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});
let port;
for(let p=config.port;p<config.port+10;p++) if(await free(p)){port=p;break;}
if(!port)throw Error('No hay puerto disponible. Cierra otra copia de esta herramienta.');
const url=`http://127.0.0.1:${port}`;
const args=config.args.map(a=>a==='{port}'?String(port):a);
const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,[config.portEnv||'PORT']:String(port)}});
let stopping=false,failed=false;
const stop=()=>{stopping=true;child.kill('SIGTERM');};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
child.once('error',e=>{console.error(e.message);failed=true;});
child.once('exit',code=>{process.exitCode=failed?1:stopping?0:code??1;});
let ready=false;
for(let n=0;n<160&&child.exitCode===null;n++){
  try{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(1000)});const body=await r.text();if(r.ok&&body.includes(config.marker)){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
}
if(!ready){failed=true;console.error('No pudo iniciar. Revisa el mensaje anterior.');stop();}
else {console.log(`${config.name} · ${url}\nMantén Terminal abierto. Para terminar: Control+C.`);if(!process.argv.includes('--no-open')&&process.platform==='darwin')spawn('/usr/bin/open',[url],{stdio:'ignore'});}
