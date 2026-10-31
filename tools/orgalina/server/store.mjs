import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { getExpenseShares } from '../vendor/spliit/shares.mjs';
import { getBalances, getSuggestedReimbursements } from '../vendor/spliit/balances.mjs';
import { categoryBalance, availableToBudget } from '../vendor/actual/envelope.mjs';

export const CATEGORIES = [
  { id: 'home', name: 'Vivienda', icon: 'home' },
  { id: 'food', name: 'Alimentación', icon: 'basket' },
  { id: 'transport', name: 'Transporte', icon: 'car' },
  { id: 'services', name: 'Servicios', icon: 'zap' },
  { id: 'life', name: 'Vida y bienestar', icon: 'heart' },
  { id: 'other', name: 'Otros planes', icon: 'leaf' },
];
export const LIMIT = 10_000_000_000;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function amount(value, label = 'Monto', allowZero = true) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > LIMIT) throw new AppError(`${label}: ingresa pesos enteros entre ${allowZero ? 0 : 1} y 10.000.000.000.`);
  return value;
}
export function validMonth(value) {
  if (typeof value !== 'string' || !/^(20[2-4]\d|2050)-(0[1-9]|1[0-2])$/.test(value)) throw new AppError('Mes inválido.');
  return value;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError('Fecha inválida.');
  validMonth(value.slice(0, 7));
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AppError('Fecha inválida.');
  return value;
}
export function shortText(value, label, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AppError(`${label}: completa hasta ${max} caracteres.`);
  return value.trim();
}
const nextMonth = month => { const [y, m] = month.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; };
export function openStore(path, { seed = true } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS households(id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, household_id TEXT NOT NULL REFERENCES households(id), weight INTEGER NOT NULL DEFAULT 50);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invitations(token_hash TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS budgets(owner_key TEXT NOT NULL, month TEXT NOT NULL, income INTEGER NOT NULL, savings INTEGER NOT NULL, allocations TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(owner_key,month));
    CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id), owner_id TEXT NOT NULL REFERENCES users(id), scope TEXT NOT NULL CHECK(scope IN ('shared','personal')), title TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), category TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('paid','planned')), paid_by TEXT NOT NULL REFERENCES users(id), split_mode TEXT NOT NULL, shares TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS expense_visibility ON expenses(household_id,scope,owner_id,date,deleted);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, household_id TEXT NOT NULL, action TEXT NOT NULL, entity_id TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  `);
  let transactionDepth=0;
  const tx = fn => {
    const level=transactionDepth++,savepoint=`nested_${level}`;
    db.exec(level?`SAVEPOINT ${savepoint}`:'BEGIN IMMEDIATE');
    try { const value=fn();db.exec(level?`RELEASE ${savepoint}`:'COMMIT');return value; }
    catch(e){db.exec(level?`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`:'ROLLBACK');throw e;}
    finally{transactionDepth--;}
  };
  const memberList = user => db.prepare('SELECT id,name,weight FROM users WHERE household_id=? ORDER BY rowid').all(user.household_id);
  const key = (user, scope) => scope === 'shared' ? `household:${user.household_id}` : `personal:${user.id}`;
  const audit = (user, action, entity) => db.prepare('INSERT INTO audit(user_id,household_id,action,entity_id,at) VALUES(?,?,?,?,?)').run(user.id, user.household_id, action, entity, new Date().toISOString());
  const visibleExpense = (user, id, includeDeleted = false) => {
    const row = db.prepare(`SELECT * FROM expenses WHERE id=? AND household_id=? AND (scope='shared' OR owner_id=?) ${includeDeleted ? '' : 'AND deleted=0'}`).get(id, user.household_id, user.id);
    if (!row) throw new AppError('No encontramos ese gasto.', 404);
    return row;
  };
  function normalizedExpense(user, input, id) {
    const scope = input.scope;
    if (!['shared', 'personal'].includes(scope)) throw new AppError('Elige hogar o personal.');
    const title = shortText(input.title, 'Nombre del gasto');
    const value = amount(input.amount, 'Monto', false);
    const date = validDate(input.date);
    if (!CATEGORIES.some(c => c.id === input.category)) throw new AppError('Categoría inválida.');
    if (!['paid', 'planned'].includes(input.status)) throw new AppError('Estado inválido.');
    const members = memberList(user);
    const paidBy = scope === 'personal' ? user.id : input.paidBy;
    if (!members.some(m => m.id === paidBy)) throw new AppError('El pagador debe pertenecer al hogar.');
    let weights;
    const mode = scope === 'personal' ? 'EVENLY' : input.splitMode;
    if (scope === 'personal') weights = [{ participantId: user.id, shares: 1 }];
    else if (mode === 'EVENLY') weights = members.map(m => ({ participantId: m.id, shares: 1 }));
    else if (mode === 'AGREED') {
      weights = members.map(m => ({ participantId: m.id, shares: m.weight }));
      if (!weights.some(w => w.shares > 0)) throw new AppError('Configuren primero los aportes del hogar.');
    } else if (mode === 'BY_PERCENTAGE') {
      if (!Array.isArray(input.percentages) || input.percentages.length !== members.length || new Set(input.percentages.map(p => p.userId)).size !== members.length) throw new AppError('Completa el porcentaje de cada integrante.');
      weights = input.percentages.map(p => {
        if (!members.some(m => m.id === p.userId) || !Number.isInteger(p.value) || p.value < 0 || p.value > 100) throw new AppError('Porcentajes inválidos.');
        return { participantId: p.userId, shares: p.value };
      });
      if (weights.reduce((sum, w) => sum + w.shares, 0) !== 100) throw new AppError('Los porcentajes deben sumar 100%.');
    } else throw new AppError('Reparto inválido.');
    const parts = getExpenseShares({ id, amount: value, splitMode: mode === 'EVENLY' ? 'EVENLY' : 'BY_SHARES', paidFor: weights });
    if (typeof input.notes !== 'string' || input.notes.length > 400) throw new AppError('La nota admite hasta 400 caracteres.');
    return { scope, title, amount: value, category: input.category, date, status: input.status, paidBy, splitMode: mode, shares: weights.map(w => ({ userId: w.participantId, weight: w.shares, amount: parts.get(w.participantId) })), notes: input.notes.trim() };
  }
  function createExpense(user, input) {
    if (input.id && (typeof input.id !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.id))) throw new AppError('Identificador inválido.');
    const id = input.id || randomUUID();
    if (db.prepare('SELECT id FROM expenses WHERE id=?').get(id)) throw new AppError('Este gasto ya fue guardado. Actualiza la vista.',409);
    const e = normalizedExpense(user, input, id), at = new Date().toISOString();
    tx(() => {
      db.prepare('INSERT INTO expenses(id,household_id,owner_id,scope,title,amount,category,date,status,paid_by,split_mode,shares,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.household_id,user.id,e.scope,e.title,e.amount,e.category,e.date,e.status,e.paidBy,e.splitMode,JSON.stringify(e.shares),e.notes,at,at);
      audit(user,'expense.create',id);
    });
    return id;
  }
  function updateExpense(user, id, input) {
    const existing = visibleExpense(user, id);
    if (existing.owner_id !== user.id) throw new AppError('Solo quien creó el gasto puede editarlo.', 403);
    if (existing.version !== input.version) throw new AppError('Este gasto cambió. Actualiza la vista antes de editar.', 409);
    const e = normalizedExpense(user, input, id);
    if (e.scope === existing.scope && input.splitMode === existing.split_mode && !input.recalculate) {
      const original = JSON.parse(existing.shares);
      const parts = getExpenseShares({id,amount:e.amount,splitMode:'BY_SHARES',paidFor:original.map(s=>({participantId:s.userId,shares:s.weight}))});
      e.shares = original.map(s=>({...s,amount:parts.get(s.userId)}));
    }
    tx(() => {
      db.prepare('UPDATE expenses SET scope=?,title=?,amount=?,category=?,date=?,status=?,paid_by=?,split_mode=?,shares=?,notes=?,version=version+1,updated_at=? WHERE id=?').run(e.scope,e.title,e.amount,e.category,e.date,e.status,e.paidBy,e.splitMode,JSON.stringify(e.shares),e.notes,new Date().toISOString(),id);
      audit(user,'expense.update',id);
    });
  }
  function deleteExpense(user, id, restore = false) {
    const e = visibleExpense(user, id, true);
    if (e.owner_id !== user.id) throw new AppError('Solo quien creó el gasto puede cambiarlo.', 403);
    tx(() => { db.prepare('UPDATE expenses SET deleted=?,version=version+1,updated_at=? WHERE id=?').run(restore ? 0 : 1,new Date().toISOString(),id); audit(user,restore?'expense.restore':'expense.delete',id); });
  }
  function saveBudget(user, scope, month, input) {
    validMonth(month);
    if (!['shared','personal'].includes(scope)) throw new AppError('Espacio inválido.');
    const income = amount(input.income, 'Ingreso'), savings = amount(input.savings, 'Ahorro');
    if (!input.allocations || typeof input.allocations !== 'object') throw new AppError('Completa las categorías.');
    const allocations = Object.fromEntries(CATEGORIES.map(c => [c.id, amount(input.allocations[c.id] ?? 0, c.name)]));
    tx(() => {
      const existing = db.prepare('SELECT version FROM budgets WHERE owner_key=? AND month=?').get(key(user,scope),month);
      if (input.version !== undefined && input.version !== (existing?.version || 0)) throw new AppError('El presupuesto cambió. Actualiza la vista antes de guardar.',409);
      db.prepare('INSERT INTO budgets(owner_key,month,income,savings,allocations) VALUES(?,?,?,?,?) ON CONFLICT(owner_key,month) DO UPDATE SET income=excluded.income,savings=excluded.savings,allocations=excluded.allocations,version=budgets.version+1').run(key(user,scope),month,income,savings,JSON.stringify(allocations)); audit(user,'budget.update',`${scope}:${month}`);
    });
  }
  function snapshot(user, scope, month) {
    validMonth(month);
    if (!['shared','personal'].includes(scope)) throw new AppError('Espacio inválido.');
    // Filter at the data boundary, before calculating totals or serializing any rows.
    const records = db.prepare(`SELECT * FROM expenses WHERE household_id=? AND scope=? AND (scope='shared' OR owner_id=?) AND deleted=0 AND date<? ORDER BY date DESC,created_at DESC`).all(user.household_id,scope,user.id,`${nextMonth(month)}-01`).map(e => ({ id:e.id,ownerId:e.owner_id,scope:e.scope,title:e.title,amount:e.amount,category:e.category,date:e.date,status:e.status,paidBy:e.paid_by,splitMode:e.split_mode,shares:JSON.parse(e.shares),notes:e.notes,version:e.version,canEdit:e.owner_id===user.id }));
    const budgets = db.prepare('SELECT * FROM budgets WHERE owner_key=? AND month<=? ORDER BY month').all(key(user,scope),month).map(b => ({...b,allocations:JSON.parse(b.allocations)}));
    let first = [month,...budgets.map(b=>b.month),...records.map(e=>e.date.slice(0,7))].sort()[0];
    let previous = CATEGORIES.map(c=>({...c,balance:0,carryDebt:false})), previousUnassigned = 0, current;
    for (let m=first; m<=month; m=nextMonth(m)) {
      const budget = budgets.find(b=>b.month===m) || {income:0,savings:0,allocations:{}};
      const expenses = records.filter(e=>e.date.startsWith(m));
      const categories = CATEGORIES.map(c=>{
        const paid = expenses.filter(e=>e.category===c.id&&e.status==='paid').reduce((s,e)=>s+e.amount,0);
        const planned = expenses.filter(e=>e.category===c.id&&e.status==='planned').reduce((s,e)=>s+e.amount,0);
        const prior = previous.find(p=>p.id===c.id).balance;
        const allocated = budget.allocations[c.id]||0;
        const balance = categoryBalance(allocated,-paid,prior,false);
        return {...c,allocated,paid,planned,carried:Math.max(0,prior),balance,forecast:balance-planned,carryDebt:false};
      });
      const allocated = categories.reduce((s,c)=>s+c.allocated,0);
      const unassigned = availableToBudget(budget.income,previousUnassigned,previous,allocated,budget.savings);
      const paid = expenses.filter(e=>e.status==='paid').reduce((s,e)=>s+e.amount,0), planned = expenses.filter(e=>e.status==='planned').reduce((s,e)=>s+e.amount,0);
      const available = unassigned+categories.reduce((s,c)=>s+c.balance,0)-planned;
      current = {income:budget.income,savings:budget.savings,allocated,unassigned,paid,planned,available,categories,expenses,version:budget.version||0,hasBudget:budgets.some(b=>b.month===m)};
      previous=categories; previousUnassigned=unassigned;
    }
    const members=memberList(user), household=db.prepare('SELECT id,name,owner_id,demo FROM households WHERE id=?').get(user.household_id);
    const balances=scope==='shared'?getBalances(records.filter(e=>e.status==='paid')):{};
    const plannedShares=Object.fromEntries(members.map(m=>[m.id,current.expenses.filter(e=>e.status==='planned').reduce((sum,e)=>sum+(e.shares.find(s=>s.userId===m.id)?.amount||0),0)]));
    return {scope,month,today:today(),user:{id:user.id,name:user.name,email:user.email},household:{id:household.id,name:household.name,demo:!!household.demo,isOwner:household.owner_id===user.id},members,budget:current,balances,reimbursements:scope==='shared'?getSuggestedReimbursements(balances):[],plannedShares};
  }
  function seedDemo() {
    if (db.prepare("SELECT value FROM metadata WHERE key='seed-v1'").get()) return;
    const month=today().slice(0,7), valeId='demo-vale',nicoId='demo-nico',house='demo-household';
    tx(()=>{
      db.prepare('INSERT INTO households(id,name,owner_id,demo) VALUES(?,?,?,1)').run(house,'Vale y Nico',valeId);
      const insert=db.prepare('INSERT INTO users(id,email,name,password_hash,household_id,weight) VALUES(?,?,?,?,?,?)');
      insert.run(valeId,'vale@demo.orgalina.local','Vale',passwordHash(randomBytes(32).toString('hex')),house,60);
      insert.run(nicoId,'nico@demo.orgalina.local','Nico',passwordHash(randomBytes(32).toString('hex')),house,40);
      db.prepare("INSERT INTO metadata(key,value) VALUES('seed-v1',?)").run(month);
    });
    const vale=db.prepare('SELECT * FROM users WHERE id=?').get(valeId),nico=db.prepare('SELECT * FROM users WHERE id=?').get(nicoId);
    saveBudget(vale,'shared',month,{income:2400000,savings:250000,allocations:{home:850000,food:400000,transport:120000,services:200000,life:150000,other:430000}});
    saveBudget(vale,'personal',month,{income:200000,savings:50000,allocations:{food:50000,life:100000}});
    saveBudget(nico,'personal',month,{income:150000,savings:30000,allocations:{life:120000}});
    const rows=[['Arriendo',850000,'home','05','paid',valeId],['Compras del mes',280000,'food','18','paid',nicoId],['Transporte familiar',90000,'transport','19','paid',nicoId],['Panoramas en familia',80000,'life','20','paid',valeId],['Luz',64500,'services','22','planned',valeId],['Agua',25000,'services','24','planned',nicoId],['Mantención del hogar',340500,'other','25','planned',valeId]];
    for (const [title,value,category,day,status,paidBy] of rows) createExpense(paidBy===valeId?vale:nico,{scope:'shared',title,amount:value,category,date:`${month}-${day}`,status,paidBy,splitMode:'AGREED',notes:''});
    for (const [u,title,value,category] of [[vale,'Café y almuerzo',8500,'food'],[vale,'Mi música',5990,'life'],[nico,'Regalo sorpresa',18000,'life']]) createExpense(u,{scope:'personal',title,amount:value,category,date:`${month}-20`,status:'paid',notes:''});
  }
  if (seed) seedDemo();
  if(!db.prepare("SELECT value FROM metadata WHERE key='demo-names-v2'").get())tx(()=>{
    // Preserve ids, expenses, sessions and passwords while renaming only the seeded demo.
    db.prepare("UPDATE users SET name='Aileen',email='aileen@demo.orgalina.local' WHERE id='demo-vale' AND household_id IN (SELECT id FROM households WHERE demo=1)").run();
    db.prepare("UPDATE users SET name='Pablo',email='pablo@demo.orgalina.local' WHERE id='demo-nico' AND household_id IN (SELECT id FROM households WHERE demo=1)").run();
    db.prepare("UPDATE households SET name='Aileen y Pablo' WHERE id='demo-household' AND demo=1 AND name='Vale y Nico'").run();
    db.prepare("INSERT INTO metadata(key,value) VALUES('demo-names-v2','done')").run();
  });
  return {db,tx,snapshot,createExpense,updateExpense,deleteExpense,saveBudget,memberList,audit,close:()=>db.close()};
}
