import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppError, passwordHash, shortText } from './store.mjs';
import {createHomeStore} from './home-store.mjs';
import {createDebtProvider} from './khipu.mjs';
import {readPdf} from './bill-reader.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const SESSION_AGE = 7 * 24 * 3600;
function respond(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function body(req,limit=32000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Formato no admitido.',415);
  let size=0, chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size>limit) throw new AppError('El contenido es demasiado grande.',413); chunks.push(chunk); }
  try { const parsed=JSON.parse(Buffer.concat(chunks).toString()); if(!parsed || typeof parsed!=='object'||Array.isArray(parsed)) throw Error(); return parsed; } catch { throw new AppError('Contenido inválido.'); }
}
export function createApi(store,{provider=createDebtProvider()}={}) {
  const {db,tx}=store, attempts=new Map();
  const home=createHomeStore(store),reading=new Set(),lastQuery=new Map();
  function session(req) {
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('orgalina_session='))?.slice(17);
    if(!token||! /^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?').get(hash(token),Date.now())||null;
  }
  function startSession(res,userId) {
    const token=randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(hash(token),userId,Date.now()+SESSION_AGE*1000);
    res.setHeader('Set-Cookie',`orgalina_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_AGE}`);
  }
  function limitLogin(req) {
    const key=req.socket.remoteAddress, now=Date.now(), current=attempts.get(key);
    if(!current||current.until<now) { attempts.set(key,{count:1,until:now+900000}); return; }
    current.count++;
    if(current.count>30) throw new AppError('Demasiados intentos. Inténtalo en 15 minutos.',429);
  }
  return async function api(req,res) {
    try {
      const host=req.headers.host||'';
      if(!/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new AppError('Acceso local requerido.',403);
      const url=new URL(req.url,`http://${host}`), path=url.pathname;
      if(!['GET','HEAD'].includes(req.method)) {
        if(req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site') throw new AppError('Origen no permitido.',403);
      }
      if(path==='/api/health'&&req.method==='GET') return respond(res,200,{ok:true,version:'0.2.0'});
      if(path==='/api/auth/demo'&&req.method==='POST') {
        limitLogin(req);
        const input=await body(req);
        const profiles={aileen:'vale',pablo:'nico',vale:'vale',nico:'nico'};
        if(!Object.hasOwn(profiles,input.profile)) throw new AppError('Perfil de ejemplo inválido.');
        const user=db.prepare('SELECT u.id FROM users u JOIN households h ON h.id=u.household_id WHERE u.id=? AND h.demo=1').get(`demo-${profiles[input.profile]}`);
        if(!user) throw new AppError('Demo no disponible.',404);
        startSession(res,user.id);return respond(res,200,{ok:true});
      }
      if(path==='/api/auth/login'&&req.method==='POST') {
        limitLogin(req);const input=await body(req);
        const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
        if(typeof input.password!=='string'||input.password.length>128) throw new AppError('Revisa tu correo y contraseña.',401);
        const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const [salt, expected]=(user?.password_hash||'00000000000000000000000000000000:'+ '00'.repeat(64)).split(':');
        const actual=scryptSync(input.password,salt,64);
        if(!user||!timingSafeEqual(actual,Buffer.from(expected,'hex'))) throw new AppError('Revisa tu correo y contraseña.',401);
        startSession(res,user.id);return respond(res,200,{ok:true});
      }
      if(path==='/api/auth/register'&&req.method==='POST') {
        limitLogin(req);const input=await body(req);
        const name=shortText(input.name,'Tu nombre',40);
        const email=shortText(input.email,'Correo',120).toLowerCase();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Ingresa un correo válido.');
        if(typeof input.password!=='string'||input.password.length<10||input.password.length>128) throw new AppError('Usa una contraseña de 10 a 128 caracteres.');
        if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new AppError('No podemos crear la cuenta con ese correo. Usa iniciar sesión.',409);
        const invitation=typeof input.invitation==='string'?input.invitation.trim():'';
        const invite=invitation?db.prepare('SELECT * FROM invitations WHERE token_hash=? AND expires>?').get(hash(invitation),Date.now()):null;
        if(invitation&&!invite) throw new AppError('La invitación venció o fue revocada.');
        const householdName=invite?null:shortText(input.householdName,'Nombre del hogar',50);
        const id=randomUUID(),householdId=invite?.household_id||randomUUID();
        if(invite&&db.prepare('SELECT count(*) AS n FROM users WHERE household_id=?').get(householdId).n>=6) throw new AppError('Este prototipo admite hasta seis integrantes por hogar.');
        tx(()=>{
          if(!invite)db.prepare('INSERT INTO households(id,name,owner_id) VALUES(?,?,?)').run(householdId,householdName,id);
          db.prepare('INSERT INTO users(id,email,name,password_hash,household_id,weight) VALUES(?,?,?,?,?,?)').run(id,email,name,passwordHash(input.password),householdId,invite?0:100);
          if(invite)db.prepare('DELETE FROM invitations WHERE token_hash=?').run(hash(invitation));
        });
        startSession(res,id);return respond(res,201,{ok:true});
      }
      const user=session(req);
      if(path==='/api/me'&&req.method==='GET') return respond(res,200,{user:user?{id:user.id,name:user.name,email:user.email}:null});
      if(!user) throw new AppError('Entra a tu cuenta para continuar.',401);
      if(path==='/api/household/settings'&&req.method==='GET')return respond(res,200,home.home(user));
      if(path==='/api/household/settings'&&req.method==='PUT')return respond(res,200,home.saveHome(user,await body(req)));
      if(path==='/api/accounts'&&req.method==='GET')return respond(res,200,{services:home.services(user),bills:home.drafts(user),provider:{name:'Khipu / Servipag',available:provider.available(user)}});
      if(path==='/api/services'&&req.method==='POST')return respond(res,201,home.saveService(user,await body(req)));
      const servicePath=path.match(/^\/api\/services\/([\w-]+)(\/consult)?$/);
      if(servicePath&&req.method==='PUT'&&!servicePath[2])return respond(res,200,home.saveService(user,await body(req),servicePath[1]));
      if(servicePath&&req.method==='POST'&&servicePath[2]){
        const input=await body(req),s=home.service(user,servicePath[1],true);
        if(input.confirmed!==true||!s.consented)throw new AppError('Autoriza la consulta de esta cuenta antes de continuar.',403);
        if(!provider.available(user))throw new AppError('La consulta directa aún no está habilitada. Puedes leer una boleta en PDF.',503);
        if((lastQuery.get(s.id)||0)>Date.now()-60000)throw new AppError('Espera un minuto antes de consultar otra vez.',429);
        lastQuery.set(s.id,Date.now());
        const result=await provider.consult(user,s);
        // Recheck consent and account identity after the remote request completes.
        const current=home.service(user,s.id,true);
        if(!current.consented||current.version!==s.version)throw new AppError('El permiso o la cuenta cambió durante la consulta. No se guardaron resultados.',409);
        return respond(res,200,home.recordDebt(user,s,result));
      }
      if(path==='/api/bills/read'&&req.method==='POST'){
        if(reading.has(user.id)||reading.size>=2)throw new AppError('Hay una lectura en curso. Inténtalo cuando termine.',429);
        reading.add(user.id);
        try{
          if(req.headers['content-type']?.startsWith('application/pdf')){
            let size=0;const chunks=[];
            for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024)throw new AppError('El PDF admite hasta 5 MB.',413);chunks.push(chunk);}
            const bytes=Buffer.concat(chunks),text=await readPdf(bytes);
            return respond(res,201,home.addDraft(user,{bytes,text,source:'pdf',fileName:url.searchParams.get('fileName')||'Boleta.pdf',serviceId:url.searchParams.get('serviceId')||null}));
          }
          const input=await body(req,450000);
          return respond(res,201,home.addDraft(user,{text:input.text,fileName:input.fileName||'Texto de boleta',source:'text',serviceId:input.serviceId||null}));
        }finally{reading.delete(user.id);}
      }
      const billPath=path.match(/^\/api\/bills\/([\w-]+)(\/(?:confirm|document))?$/);
      if(billPath){
        if(req.method==='GET'&&!billPath[2])return respond(res,200,home.draft(user,billPath[1]));
        if(req.method==='DELETE'&&!billPath[2]){home.removeDraft(user,billPath[1]);return respond(res,200,{ok:true});}
        if(req.method==='POST'&&billPath[2]==='/confirm')return respond(res,200,home.confirm(user,billPath[1],await body(req)));
        if(req.method==='GET'&&billPath[2]==='/document'){
          const doc=home.document(user,billPath[1]);res.writeHead(200,{'Content-Type':doc.type,'Content-Disposition':`attachment; filename="${doc.name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(Buffer.from(doc.bytes));
        }
      }
      if(path==='/api/auth/logout'&&req.method==='POST') {
        const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('orgalina_session='))?.slice(17);
        if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));
        res.setHeader('Set-Cookie','orgalina_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return respond(res,200,{ok:true});
      }
      if(path==='/api/snapshot'&&req.method==='GET') return respond(res,200,store.snapshot(user,url.searchParams.get('scope')||'shared',url.searchParams.get('month')));
      if(path==='/api/expenses'&&req.method==='POST') return respond(res,201,{id:store.createExpense(user,await body(req))});
      const expensePath=path.match(/^\/api\/expenses\/([\w-]+)(\/restore)?$/);
      if(expensePath) {
        if(req.method==='PUT'&&!expensePath[2]) { store.updateExpense(user,expensePath[1],await body(req));return respond(res,200,{ok:true}); }
        if(req.method==='DELETE'&&!expensePath[2]) {store.deleteExpense(user,expensePath[1]);return respond(res,200,{ok:true});}
        if(req.method==='POST'&&expensePath[2]) {store.deleteExpense(user,expensePath[1],true);return respond(res,200,{ok:true});}
      }
      if(path==='/api/budget'&&req.method==='PUT') {
        const input=await body(req);if(!Number.isInteger(input.version)||input.version<0)throw new AppError('Actualiza el presupuesto antes de guardar.');store.saveBudget(user,input.scope,input.month,input);return respond(res,200,{ok:true});
      }
      if(path==='/api/household/weights'&&req.method==='PUT') {
        const input=await body(req),members=store.memberList(user);
        if(!Array.isArray(input.weights)||input.weights.length!==members.length||new Set(input.weights.map(w=>w.userId)).size!==members.length||input.weights.some(w=>!members.some(m=>m.id===w.userId)||!Number.isInteger(w.value)||w.value<0||w.value>100)||input.weights.reduce((s,w)=>s+w.value,0)!==100) throw new AppError('Los aportes deben sumar 100% e incluir a todo el hogar.');
        tx(()=>{for(const w of input.weights)db.prepare('UPDATE users SET weight=? WHERE id=? AND household_id=?').run(w.value,w.userId,user.household_id);store.audit(user,'household.weights',user.household_id);});
        return respond(res,200,{ok:true});
      }
      if(path==='/api/invitation'&&['POST','DELETE'].includes(req.method)) {
        const household=db.prepare('SELECT * FROM households WHERE id=?').get(user.household_id);
        if(household.owner_id!==user.id) throw new AppError('Solo quien creó el hogar puede invitar.',403);
        if(household.demo) throw new AppError('Crea tu propio hogar para invitar. La demo usa personas ficticias.');
        let code=null;
        tx(()=>{
          db.prepare('DELETE FROM invitations WHERE household_id=?').run(user.household_id);
          if(req.method==='POST') { code=randomBytes(24).toString('base64url');db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(hash(code),user.household_id,Date.now()+7*86400000); }
          store.audit(user,req.method==='POST'?'invitation.create':'invitation.revoke',user.household_id);
        });
        return respond(res,200,{code,expiresInDays:code?7:null});
      }
      throw new AppError('No encontramos esa acción.',404);
    } catch(error) {
      if(!res.headersSent)respond(res,error.status||500,{error:error.status?error.message:'No se pudo completar. Inténtalo de nuevo.'});
      if(!error.status)console.error('Orgalina request failed:',error.message);
    }
  };
}
