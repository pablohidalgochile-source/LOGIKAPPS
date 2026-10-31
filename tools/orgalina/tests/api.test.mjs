import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openStore,today} from '../server/store.mjs';
import {createApi} from '../server/api.mjs';

const month=today().slice(0,7);
async function fixture(t){
  const store=openStore(':memory:'),server=createServer(createApi(store));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,{method='GET',body,cookie,origin=base,headers={}}={}){
    const r=await fetch(base+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
  }
  async function register(name,extra={}){return call('/api/auth/register',{method:'POST',body:{name,email:`${name}@test.invalid`,password:'Synthetic-test-only-82!',householdName:`Casa ${name}`,...extra}});}
  return {store,call,register,base};
}
test('HTTP: sesiones privadas, origen obligatorio y cierre revoca la sesión',async t=>{
  const {call}=await fixture(t);
  assert.equal((await call(`/api/snapshot?month=${month}`)).status,401);
  assert.equal((await call('/api/auth/demo',{method:'POST',body:{profile:'vale'},origin:'https://untrusted.invalid'})).status,403);
  assert.equal((await call('/api/auth/demo',{method:'POST',body:{profile:'vale'},headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  const auth=await call('/api/auth/demo',{method:'POST',body:{profile:'vale'}});
  assert.equal(auth.status,200);assert.match(auth.headers.get('set-cookie'),/HttpOnly/);assert.match(auth.headers.get('set-cookie'),/SameSite=Strict/);
  const r=await call('/api/me',{cookie:auth.cookie});assert.equal(r.body.user.name,'Aileen');assert.equal(r.headers.get('cache-control'),'no-store');
  await call('/api/auth/logout',{method:'POST',body:{},cookie:auth.cookie});
  assert.equal((await call(`/api/snapshot?month=${month}`,{cookie:auth.cookie})).status,401);
});
test('HTTP: gastos y presupuestos personales no se pueden obtener cambiando ids',async t=>{
  const {call}=await fixture(t);
  const v=(await call('/api/auth/demo',{method:'POST',body:{profile:'vale'}})).cookie;
  const n=(await call('/api/auth/demo',{method:'POST',body:{profile:'nico'}})).cookie;
  const priv=(await call(`/api/snapshot?scope=personal&month=${month}`,{cookie:v})).body;
  const id=priv.budget.expenses[0].id;
  const other=(await call(`/api/snapshot?scope=personal&month=${month}&userId=demo-vale&ownerId=demo-vale`,{cookie:n})).body;
  assert.equal(other.budget.paid,18000);assert.ok(!JSON.stringify(other).includes(id));
  for(const method of ['PUT','DELETE'])assert.equal((await call(`/api/expenses/${id}`,{method,body:{},cookie:n})).status,404);
  assert.equal((await call(`/api/expenses/${id}/restore`,{method:'POST',body:{},cookie:n})).status,404);
  const before=(await call(`/api/snapshot?scope=personal&month=${month}`,{cookie:v})).body.budget;
  await call('/api/budget',{method:'PUT',cookie:n,body:{scope:'personal',month,version:1,income:1,savings:0,allocations:{},owner_key:'personal:demo-vale',ownerId:'demo-vale'}});
  assert.deepEqual((await call(`/api/snapshot?scope=personal&month=${month}`,{cookie:v})).body.budget,before);
});
test('HTTP: hogares aislados, invitación revocable de un uso y acceso con contraseña',async t=>{
  const {call,register}=await fixture(t);
  const a=await register('ana');assert.equal(a.status,201);
  const aCookie=a.cookie;
  const original=(await call('/api/invitation',{method:'POST',body:{},cookie:aCookie})).body.code;
  const second=(await call('/api/invitation',{method:'POST',body:{},cookie:aCookie})).body.code;
  assert.equal((await register('expired',{invitation:original})).status,400);
  const b=await register('bea',{invitation:second});assert.equal(b.status,201);
  assert.equal((await register('reused',{invitation:second})).status,400);
  assert.equal((await call('/api/invitation',{method:'POST',body:{},cookie:b.cookie})).status,403);
  const aSnapshot=(await call(`/api/snapshot?month=${month}`,{cookie:aCookie})).body;
  const c=await register('carla',{household_id:aSnapshot.household.id});assert.equal(c.status,201);
  const cSnapshot=(await call(`/api/snapshot?month=${month}&householdId=${aSnapshot.household.id}`,{cookie:c.cookie})).body;
  assert.notEqual(cSnapshot.household.id,aSnapshot.household.id);assert.equal(cSnapshot.members.length,1);
  const expense=await call('/api/expenses',{method:'POST',cookie:aCookie,body:{title:'Prueba del hogar A',amount:101,category:'food',date:`${month}-21`,scope:'shared',status:'paid',paidBy:aSnapshot.user.id,splitMode:'EVENLY',notes:''}});
  assert.equal(expense.status,201);
  assert.ok((await call(`/api/snapshot?month=${month}`,{cookie:b.cookie})).body.budget.expenses.some(e=>e.id===expense.body.id));
  assert.ok(!(await call(`/api/snapshot?month=${month}`,{cookie:c.cookie})).body.budget.expenses.some(e=>e.id===expense.body.id));
  assert.equal((await call(`/api/expenses/${expense.body.id}`,{method:'DELETE',body:{},cookie:c.cookie})).status,404);
  const code=(await call('/api/invitation',{method:'POST',body:{},cookie:aCookie})).body.code;
  await call('/api/invitation',{method:'DELETE',body:{},cookie:aCookie});
  assert.equal((await register('revoked',{invitation:code})).status,400);
  assert.equal((await call('/api/auth/login',{method:'POST',body:{email:'ana@test.invalid',password:'wrong'}})).status,401);
  const login=await call('/api/auth/login',{method:'POST',body:{email:'ANA@test.invalid',password:'Synthetic-test-only-82!'}});
  assert.equal(login.status,200);assert.equal((await call('/api/me',{cookie:login.cookie})).body.user.name,'ana');
});
test('HTTP: gastos duplicados y presupuestos obsoletos se rechazan sin alterar datos',async t=>{
  const {call}=await fixture(t),cookie=(await call('/api/auth/demo',{method:'POST',body:{profile:'vale'}})).cookie;
  const body={id:'00000000-0000-4000-8000-000000000001',title:'Compra única',amount:101,category:'food',date:`${month}-21`,scope:'shared',status:'paid',paidBy:'demo-vale',splitMode:'EVENLY',notes:''};
  assert.equal((await call('/api/expenses',{method:'POST',body,cookie})).status,201);
  assert.equal((await call('/api/expenses',{method:'POST',body,cookie})).status,409);
  const budget={scope:'shared',month,income:2400000,savings:250000,allocations:{},version:1};
  assert.equal((await call('/api/budget',{method:'PUT',body:budget,cookie})).status,200);
  assert.equal((await call('/api/budget',{method:'PUT',body:budget,cookie})).status,409);
});
test('HTTP: configuración, boletas privadas, confirmación y consulta no habilitada',async t=>{
 const {call,register,base}=await fixture(t);
 const a=(await call('/api/auth/demo',{method:'POST',body:{profile:'aileen'}})).cookie,p=(await call('/api/auth/demo',{method:'POST',body:{profile:'pablo'}})).cookie;
 const outsider=(await register('outsider')).cookie;
 const settings={name:'Casa de prueba',address:'Calle ficticia 123',commune:'Ejemplo',region:'Ejemplo',holder:'Aileen Caro',version:0};
 assert.equal((await call('/api/household/settings',{method:'PUT',body:settings,cookie:a})).status,200);
 assert.equal((await call('/api/household/settings',{cookie:p})).body.address,settings.address);
 assert.equal((await call('/api/household/settings',{cookie:outsider})).body.address,'');
 const service=(await call('/api/services',{method:'POST',cookie:a,body:{kind:'electricity',company:'Luz de Ejemplo',clientNumber:'DEMO-LUZ-1',holder:'Aileen Caro',scope:'personal',consented:true}})).body;
 assert.equal((await call('/api/accounts',{cookie:p})).body.services.length,0);
 assert.equal((await call(`/api/services/${service.id}/consult`,{method:'POST',cookie:a,body:{confirmed:true}})).status,503);
 assert.equal((await call(`/api/services/${service.id}/consult`,{method:'POST',cookie:p,body:{confirmed:true}})).status,404);
 const read=await call('/api/bills/read',{method:'POST',cookie:a,body:{text:'Empresa: Luz de Ejemplo\nTitular: Aileen Caro\nNúmero de cliente: DEMO-LUZ-1\nFolio: LUZ-1\nTotal a pagar: $30.000\nVencimiento: 25/10/2026',fileName:'Luz ficticia',serviceId:service.id}});
 assert.equal(read.status,201);assert.equal(read.body.fields.amount,30000);
 for(const cookie of [p,outsider])for(const suffix of ['', '/document'])assert.equal((await call(`/api/bills/${read.body.id}${suffix}`,{cookie})).status,404);
 assert.equal((await call(`/api/bills/${read.body.id}/confirm`,{method:'POST',cookie:p,body:{}})).status,400);
 const confirmed=await call(`/api/bills/${read.body.id}/confirm`,{method:'POST',cookie:a,body:{...read.body.fields,scope:'shared',paidBy:'demo-vale',splitMode:'EVENLY',reviewed:true}});assert.equal(confirmed.status,200);
 assert.equal((await call('/api/accounts',{cookie:p})).body.bills.length,0);
 const source=await fetch(base+`/api/bills/${read.body.id}/document`,{headers:{Cookie:a}});assert.equal(source.status,200);assert.match(source.headers.get('content-disposition'),/attachment/);assert.match(await source.text(),/DEMO-LUZ-1/);
});
test('HTTP: PDF cargado se conserva privado y contenido inválido se rechaza',async t=>{
 const {call,base}=await fixture(t);const cookie=(await call('/api/auth/demo',{method:'POST',body:{profile:'aileen'}})).cookie;
 const {readFile}=await import('node:fs/promises');const bytes=await readFile(new URL('./fixtures/boleta-ejemplo.pdf',import.meta.url));
 const result=await fetch(base+'/api/bills/read?fileName=Ejemplo.pdf',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/pdf'},body:bytes});assert.equal(result.status,201);const draft=await result.json();assert.equal(draft.fields.amount,25000);
 const document=await fetch(base+`/api/bills/${draft.id}/document`,{headers:{Cookie:cookie}});assert.deepEqual(Buffer.from(await document.arrayBuffer()),bytes);
 const bad=await fetch(base+'/api/bills/read',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/pdf'},body:'fake'});assert.equal(bad.status,400);
});
