import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.mjs';
import {createHomeStore} from '../server/home-store.mjs';
import {parseBill,readPdf} from '../server/bill-reader.mjs';
import {createDebtProvider} from '../server/khipu.mjs';

const sample='BOLETA DE EJEMPLO\nEmpresa: Aguas de Ejemplo\nTitular: Aileen Caro\nNúmero de cliente: DEMO-0001\nBoleta N°: DEMO-202610\nVencimiento: 24/10/2026\nConsumo: $20.000\nTotal a pagar: $25.000';
function fixture(t,path=':memory:'){const store=openStore(path),home=createHomeStore(store);t.after(()=>store.close());const a=store.db.prepare("SELECT * FROM users WHERE id='demo-vale'").get(),p=store.db.prepare("SELECT * FROM users WHERE id='demo-nico'").get();return{store,home,a,p};}
const confirm={company:'Aguas de Ejemplo',clientNumber:'DEMO-0001',holder:'Aileen Caro',billNumber:'DEMO-202610',amount:25000,dueDate:'2026-10-24',scope:'shared',splitMode:'AGREED',paidBy:'demo-vale',reviewed:true};
test('Lectura conservadora: total etiquetado, fechas, cliente y valores ambiguos',()=>{
 const {fields}=parseBill(sample);assert.equal(fields.amount,25000);assert.equal(fields.dueDate,'2026-10-24');assert.equal(fields.clientNumber,'DEMO-0001');assert.equal(fields.holder,'Aileen Caro');assert.equal(fields.billNumber,'DEMO-202610');
 assert.equal(parseBill(sample+'\nTotal a pagar: $30.000').fields.amount,null);
 assert.equal(parseBill('Subtotal: $30.000\nSaldo anterior: $50.000\nVencimiento: 31/02/2026').fields.amount,null);
 assert.equal(parseBill('Vencimiento: 31/02/2026').fields.dueDate,'');
 assert.equal(parseBill('Total a pagar:\n$25.000\nVencimiento:\n2026-10-24').fields.amount,25000);
 assert.equal(parseBill('Total a pagar: $25.000,99').fields.amount,null);
});
test('Casa persiste, rechaza versiones antiguas y migración conserva gastos',t=>{
 const dir=mkdtempSync(join(tmpdir(),'orgalina-home-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');
 let store=openStore(path),home=createHomeStore(store),a=store.db.prepare("SELECT * FROM users WHERE id='demo-vale'").get();const count=store.db.prepare('SELECT count(*) n FROM expenses').get().n;
 assert.equal(a.name,'Aileen');home.saveHome(a,{name:'Casa de prueba',address:'Dirección ficticia 123',commune:'Comuna ejemplo',region:'Región ejemplo',holder:'Aileen Caro',version:0});
 assert.throws(()=>home.saveHome(a,{...home.home(a),version:0}),/cambió/);store.close();store=openStore(path);home=createHomeStore(store);assert.equal(home.home(a).address,'Dirección ficticia 123');assert.equal(store.db.prepare('SELECT count(*) n FROM expenses').get().n,count);store.close();
});
test('Servicios privados y documentos: Pablo no obtiene datos de Aileen por id',t=>{
 const{home,a,p}=fixture(t);const s=home.saveService(a,{kind:'water',company:'Aguas de Ejemplo',clientNumber:'DEMO-0001',holder:'Aileen Caro',scope:'personal',consented:false});
 assert.equal(home.services(p).length,0);assert.throws(()=>home.service(p,s.id),/No encontramos/);
 const d=home.addDraft(a,{text:sample,fileName:'Ejemplo',serviceId:s.id});assert.equal(home.drafts(p).length,0);for(const fn of [()=>home.draft(p,d.id),()=>home.document(p,d.id),()=>home.confirm(p,d.id,confirm),()=>home.removeDraft(p,d.id)])assert.throws(fn,/No encontramos/);
 const shared=home.saveService(a,{...s,scope:'shared',consented:true},s.id);assert.equal(home.services(p).length,1);assert.throws(()=>home.saveService(p,shared,s.id),/Solo quien/);
 const revoked=home.saveService(a,{...shared,consented:false},s.id);assert.equal(revoked.consented,false);
});
test('Confirmación atómica, reparto exacto, relectura idempotente y duplicados semánticos',t=>{
 const{store,home,a,p}=fixture(t);const d=home.addDraft(a,{text:sample,fileName:'Ejemplo'});const before=store.db.prepare('SELECT count(*) n FROM expenses').get().n;
 assert.throws(()=>home.confirm(a,d.id,{...confirm,reviewed:false}),/Confirma/);assert.throws(()=>home.confirm(a,d.id,{...confirm,paidBy:'otro-hogar'}),/pertenecer/);assert.equal(home.draft(a,d.id).expenseId,null);assert.equal(store.db.prepare('SELECT count(*) n FROM expenses').get().n,before);
 const r=home.confirm(a,d.id,confirm);assert.equal(home.confirm(a,d.id,confirm).expenseId,r.expenseId);assert.equal(home.addDraft(a,{text:sample,fileName:'Repetida'}).id,d.id);assert.equal(store.db.prepare('SELECT count(*) n FROM expenses').get().n,before+1);
 const e=store.snapshot(p,'shared','2026-10').budget.expenses.find(e=>e.id===r.expenseId);assert.equal(e.status,'planned');assert.deepEqual(e.shares.map(s=>s.amount),[15000,10000]);assert.ok(!JSON.stringify(e).includes('DEMO-0001'));assert.throws(()=>home.document(p,d.id),/No encontramos/);
 const changed=home.addDraft(a,{text:sample+'\nCopia de impresión',fileName:'Otra copia'});assert.throws(()=>home.confirm(a,changed.id,confirm),/ya están incorporadas/);assert.throws(()=>home.confirm(a,changed.id,{...confirm,amount:30000}),/ya están incorporadas/);home.removeDraft(a,changed.id);assert.throws(()=>home.draft(a,changed.id),/No encontramos/);
});
test('Vincular un gasto existente no duplica y exige mismo propietario, espacio y total',t=>{
 const{home,store,a,p}=fixture(t);const d=home.addDraft(a,{text:sample,fileName:'Ejemplo'});const id=store.createExpense(a,{scope:'shared',title:'Agua previa',amount:25000,category:'services',date:'2026-10-24',status:'planned',paidBy:a.id,splitMode:'EVENLY',notes:''});
 const foreign=store.createExpense(p,{scope:'shared',title:'Agua de Pablo',amount:25000,category:'services',date:'2026-10-24',status:'planned',paidBy:p.id,splitMode:'EVENLY',notes:''});
 assert.throws(()=>home.confirm(a,d.id,{...confirm,existingExpenseId:foreign}),/debe ser tuyo/);const count=store.db.prepare('SELECT count(*) n FROM expenses').get().n;assert.equal(home.confirm(a,d.id,{...confirm,existingExpenseId:id}).expenseId,id);assert.equal(store.db.prepare('SELECT count(*) n FROM expenses').get().n,count);
});
test('Consulta Khipu usa contrato documentado y no convierte errores en deuda cero',async()=>{
 const user={id:'owner'},s={company:'Aguas Andinas',clientNumber:'000000'};let calls=0;
 const provider=createDebtProvider({token:'synthetic-token',userId:'owner',fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.khipu.com/v1/com/services/servipag.com/consult-debt');assert.equal(options.headers.Authorization,'Bearer synthetic-token');assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{RequestData:{EnterpriseName:s.company,ClientIdentifier:s.clientNumber}});return new Response(JSON.stringify({Status:'OK',Data:{Debt:{PendingDebt:15340,DueDate:'2026-10-24'}},OperationId:'test'}));}});
 assert.equal(provider.available({id:'someone-else'}),false);assert.equal((await provider.consult(user,s)).amount,15340);assert.equal(calls,1);
 for(const response of [{Status:'ERROR'},{Status:'OK',Data:null},{Status:'OK',Data:{Debt:{PendingDebt:'0'}}}]){const p=createDebtProvider({token:'x',userId:'owner',fetcher:async()=>new Response(JSON.stringify(response))});await assert.rejects(()=>p.consult(user,s));}
 const unavailable=createDebtProvider({token:'',userId:'owner',fetcher:()=>{throw Error('must not call');}});await assert.rejects(()=>unavailable.consult(user,s),/no está habilitada/);
});
test('PDF real: extrae texto; rechaza contenido falso y tamaño excesivo',async()=>{
 const bytes=readFileSync(new URL('./fixtures/boleta-ejemplo.pdf',import.meta.url));const text=await readPdf(bytes);assert.equal(parseBill(text).fields.amount,25000);assert.equal(parseBill(text).fields.dueDate,'2026-10-24');await assert.rejects(()=>readPdf(Buffer.from('not a pdf')),/no es un PDF/);await assert.rejects(()=>readPdf(Buffer.alloc(6*1024*1024)),/5 MB/);
});
