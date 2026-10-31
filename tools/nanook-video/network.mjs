import http from 'node:http';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';

export function publicIP(address) {
  if(net.isIP(address)===4){
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
  }
  // Only globally routable IPv6 unicast; reject transition and documentation ranges.
  return net.isIP(address)===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:0:|db8:|2:|10:|20:)/i.test(address)&&!/^2002:/i.test(address);
}
export function publicURL(input) {
  if(typeof input!=='string'||input.length>8192)throw new Error('Pega un enlace web válido.');
  let u;try{u=new URL(input.trim());}catch{throw new Error('Pega el enlace completo, comenzando con https://.');}
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!host.includes('.')&&!net.isIP(host)||/^(?:localhost|.*\.(?:local|localhost|internal|home|lan|test))\.?$/i.test(host)||net.isIP(host)&&!publicIP(host))throw new Error('Usa un enlace público HTTP o HTTPS. Las direcciones internas no están permitidas.');
  u.hash='';return u.href;
}
export async function publicAddress(host, resolver=lookup) {
  host=host.replace(/^\[|\]$/g,'');
  const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await resolver(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw new Error('Dirección interna bloqueada.');
  // Respect the Mac's route preference (IPv6 or IPv4), after checking every
  // answer. Forcing IPv4 can break a source that works over the normal route.
  return addresses[0];
}

// All extractor HTTP requests (including redirects and manifests) go through this
// private proxy. Resolve once and connect to the checked IP to prevent DNS rebinding.
export async function startMediaProxy() {
  const password=randomBytes(24).toString('hex'),auth='Basic '+Buffer.from('ingesta:'+password).toString('base64'),sockets=new Set();
  const authorized=req=>req.headers['proxy-authorization']===auth;
  const track=socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.setTimeout(60000,()=>socket.destroy());return socket;};
  const proxy=http.createServer(async(req,res)=>{
    let remote;
    try{
      if(!authorized(req))throw Error('No autorizado');
      const u=new URL(publicURL(req.url));if(u.protocol!=='http:')throw Error('Protocolo no válido');
      const address=await publicAddress(u.hostname);
      const headers={...req.headers,host:u.host};delete headers['proxy-authorization'];delete headers['proxy-connection'];
      remote=http.request({hostname:address.address,family:address.family,port:80,path:u.pathname+u.search,method:req.method,headers,agent:false},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
      remote.setTimeout(60000,()=>remote.destroy());remote.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Conexión no disponible');});
      req.on('aborted',()=>remote.destroy());res.on('close',()=>remote.destroy());req.pipe(remote);
    }catch{res.writeHead(403);res.end('INGESTA: dirección no permitida');}
  });
  proxy.on('connection',track);
  proxy.on('connect',async(req,client,head)=>{
    let upstream;
    try{
      if(!authorized(req)||sockets.size>150)throw Error('No autorizado');
      const u=new URL('https://'+req.url);if(u.username||u.password||u.port||u.pathname!=='/')throw Error('Puerto no permitido');
      publicURL(u.href);const address=await publicAddress(u.hostname);
      if(client.destroyed)return;
      upstream=track(net.connect({host:address.address,family:address.family,port:443}));
      upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
      client.on('close',()=>upstream.destroy());upstream.on('error',()=>client.destroy());upstream.on('close',()=>client.destroy());
    }catch{client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');upstream?.destroy();}
  });
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
  return {url:`http://ingesta:${password}@127.0.0.1:${proxy.address().port}`,close(){for(const socket of sockets)socket.destroy();proxy.close();}};
}
