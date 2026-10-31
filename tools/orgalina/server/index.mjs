import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, sep } from 'node:path';
import { openStore } from './store.mjs';
import { createApi } from './api.mjs';

process.umask(0o077);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const store=openStore(process.env.ORGALINA_DB||resolve(root,'data/orgalina.sqlite'));
const api=createApi(store), dev=process.argv.includes('--dev'), port=Number(process.env.ORGALINA_PORT||4391);
let vite;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(req.url?.startsWith('/api/')) return api(req,res);
  if(!/^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host||'')) {res.writeHead(403);res.end('Local access only');return;}
  if(dev&&vite) return vite.middlewares(req,res,()=>{res.writeHead(404);res.end();});
  if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),dist=resolve(root,'dist');
    let path=resolve(dist,'.'+pathname);
    if(path!==dist&&!path.startsWith(dist+sep)) {res.writeHead(403);res.end();return;}
    try { if(!(await stat(path)).isFile())path=resolve(dist,'index.html'); } catch { path=resolve(dist,'index.html'); }
    const data=await readFile(path);
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  } catch { res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Primero ejecuta npm run build, o inicia con npm run dev.'); }
});
if(dev){const {createServer:createViteServer}=await import('vite');vite=await createViteServer({root,server:{middlewareMode:true,host:'127.0.0.1',hmr:{server}},appType:'spa'});}
server.listen(port,'127.0.0.1',()=>console.log(`Orgalina · http://127.0.0.1:${port}/`));
async function close(){await vite?.close();server.close(()=>{store.close();process.exit(0);});}
process.on('SIGINT',close);process.on('SIGTERM',close);
