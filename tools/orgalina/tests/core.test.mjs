import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore,today} from '../server/store.mjs';
import {getExpenseShares} from '../vendor/spliit/shares.mjs';
import {getBalances,getSuggestedReimbursements} from '../vendor/spliit/balances.mjs';
import {categoryBalance,availableToBudget} from '../vendor/actual/envelope.mjs';
const month=today().slice(0,7);
function fixture(t){const s=openStore(':memory:');t.after(()=>s.close());return {s,vale:s.db.prepare("SELECT * FROM users WHERE id='demo-vale'").get(),nico:s.db.prepare("SELECT * FROM users WHERE id='demo-nico'").get()};}
const expense=(u,extra={})=>({title:'Compra de prueba',amount:10001,category:'food',date:`${month}-21`,scope:'shared',status:'paid',paidBy:u.id,splitMode:'AGREED',notes:'',...extra});
test('Spliit: conserva cada peso, incluido monto negativo y orden diferente',()=>{
  for(const n of [1,7,101,10001,9999999,-101])for(const weights of [[1,1],[60,40],[1,2,3],[0,30,70]]){
    const paidFor=weights.map((shares,i)=>({participantId:`p${i}`,shares}));
    const a=getExpenseShares({id:'stable-expense',amount:n,splitMode:'BY_SHARES',paidFor});
    const b=getExpenseShares({id:'stable-expense',amount:n,splitMode:'BY_SHARES',paidFor:[...paidFor].reverse()});
    assert.equal([...a.values()].reduce((s,v)=>s+v,0),n);assert.deepEqual(a,b);assert.ok([...a.values()].every(Number.isInteger));
  }
});
test('Actual: saldo positivo se arrastra, sobregasto se descuenta de lo asignable',()=>{
  assert.equal(categoryBalance(800,-600,0),200);
  assert.equal(categoryBalance(300,-50,200),450);
  assert.equal(categoryBalance(300,0,-100),300);
  assert.equal(categoryBalance(300,0,-100,true),200);
  assert.equal(availableToBudget(500,100,[{balance:-100,carryDebt:false}],300,0),200);
});
test('demo reproduce el plan aprobado sin doble conteo de pendientes',t=>{const {s,vale}=fixture(t);const r=s.snapshot(vale,'shared',month);assert.equal(r.budget.available,420000);assert.equal(r.budget.paid,1300000);assert.equal(r.budget.planned,430000);assert.equal(r.budget.unassigned,0);assert.equal(r.budget.categories.reduce((sum,c)=>sum+c.forecast,0),420000);});
test('privacidad: ni títulos, ids ni totales personales cruzan cuentas',t=>{
  const {s,vale,nico}=fixture(t),v=s.snapshot(vale,'personal',month),n=s.snapshot(nico,'personal',month),shared=s.snapshot(vale,'shared',month);
  assert.equal(v.budget.paid,14490);assert.equal(n.budget.paid,18000);
  const privateId=v.budget.expenses[0].id;
  assert.ok(!JSON.stringify(n).includes(privateId));assert.ok(!JSON.stringify(shared).includes('Café y almuerzo'));assert.ok(!JSON.stringify(v).includes('Regalo sorpresa'));
  assert.throws(()=>s.updateExpense(nico,privateId,expense(nico)),e=>e.status===404);
  assert.throws(()=>s.deleteExpense(nico,privateId),e=>e.status===404);
  assert.throws(()=>s.snapshot(vale,'all',month));
});
test('un gasto privado solo se comparte por acción de su creador',t=>{
  const {s,vale,nico}=fixture(t),id=s.createExpense(vale,expense(vale,{scope:'personal'}));
  assert.ok(!s.snapshot(nico,'shared',month).budget.expenses.some(e=>e.id===id));
  s.updateExpense(vale,id,expense(vale,{version:1,scope:'shared'}));
  assert.ok(s.snapshot(nico,'shared',month).budget.expenses.some(e=>e.id===id));
  assert.throws(()=>s.updateExpense(nico,id,expense(nico,{version:2})),e=>e.status===403);
});
test('pasar un plan a pagado cambia la deuda, no duplica el gasto presupuestario',t=>{
  const {s,vale}=fixture(t),r=s.snapshot(vale,'shared',month),e=r.budget.expenses.find(e=>e.title==='Luz');
  s.updateExpense(vale,e.id,{...e,status:'paid',notes:''});
  const result=s.snapshot(vale,'shared',month);
  assert.equal(result.budget.available,420000);assert.equal(result.budget.paid,1364500);assert.equal(result.budget.planned,365500);
});
test('acuerdo nuevo no reescribe reparto anterior ni al editar su nota',t=>{
  const {s,vale}=fixture(t),id=s.createExpense(vale,expense(vale,{amount:100}));
  s.db.prepare("UPDATE users SET weight=50 WHERE household_id='demo-household'").run();
  const before=s.snapshot(vale,'shared',month).budget.expenses.find(e=>e.id===id);
  s.updateExpense(vale,id,{...before,notes:'Solo una nota'});
  const after=s.snapshot(vale,'shared',month).budget.expenses.find(e=>e.id===id);
  assert.deepEqual(after.shares,before.shares);assert.equal(after.shares.find(s=>s.userId===vale.id).amount,60);
  const other=s.createExpense(vale,expense(vale,{amount:100}));
  assert.equal(s.snapshot(vale,'shared',month).budget.expenses.find(e=>e.id===other).shares.find(s=>s.userId===vale.id).amount,50);
});
test('deudas suman cero y las compensaciones cuadran exactamente',t=>{
  const {s,vale}=fixture(t),r=s.snapshot(vale,'shared',month),balances=getBalances(r.budget.expenses.filter(e=>e.status==='paid'));
  assert.equal(Object.values(balances).reduce((s,b)=>s+b.total,0),0);
  for(const refund of getSuggestedReimbursements(balances)){balances[refund.from].total+=refund.amount;balances[refund.to].total-=refund.amount;}
  assert.ok(Object.values(balances).every(b=>b.total===0));
});
test('quitar y deshacer restaura los importes del hogar',t=>{const {s,vale}=fixture(t);const e=s.snapshot(vale,'shared',month).budget.expenses.find(e=>e.ownerId===vale.id);s.deleteExpense(vale,e.id);assert.equal(s.snapshot(vale,'shared',month).budget.available,420000+e.amount);s.deleteExpense(vale,e.id,true);assert.equal(s.snapshot(vale,'shared',month).budget.available,420000);});
test('escrituras obsoletas de gastos y presupuestos devuelven conflicto',t=>{
  const {s,vale}=fixture(t),e=s.snapshot(vale,'shared',month).budget.expenses.find(e=>e.ownerId===vale.id);
  s.updateExpense(vale,e.id,{...e,title:'Cambio A'});assert.throws(()=>s.updateExpense(vale,e.id,{...e,title:'Cambio B'}),e=>e.status===409);
  const budget={income:2400000,savings:250000,allocations:{},version:1};s.saveBudget(vale,'shared',month,budget);assert.throws(()=>s.saveBudget(vale,'shared',month,budget),e=>e.status===409);
});
test('validación rechaza fracciones de peso, fechas imposibles y reparto inconsistente',t=>{
  const {s,vale}=fixture(t);
  for(const bad of [{amount:1.5},{amount:-4},{amount:Infinity},{date:'2026-02-31'},{paidBy:'outsider'},{category:'unknown'},{scope:'everyone'},{splitMode:'BY_PERCENTAGE',percentages:[{userId:vale.id,value:80},{userId:'demo-nico',value:80}]}])assert.throws(()=>s.createExpense(vale,expense(vale,bad)));
});
test('la base persiste al reiniciar y el mes siguiente conserva saldos',()=>{
  const dir=mkdtempSync(join(tmpdir(),'orgalina-persistence-'));try{const path=join(dir,'db.sqlite');let s=openStore(path);const user=s.db.prepare("SELECT * FROM users WHERE id='demo-vale'").get();const id=s.createExpense(user,expense(user,{amount:12345,scope:'personal'}));s.close();s=openStore(path);assert.ok(s.snapshot(user,'personal',month).budget.expenses.some(e=>e.id===id));const d=new Date(`${month}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);assert.equal(s.snapshot(user,'shared',d.toISOString().slice(0,7)).budget.available,850000);s.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
