import {randomUUID,createHash} from 'node:crypto';
import {AppError,shortText,amount,validDate} from './store.mjs';
import {parseBill} from './bill-reader.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const optional=(value,label,max=80)=>value===''?'':shortText(value,label,max);
export function createHomeStore(store){
  const {db,tx,audit}=store;
  db.exec(`
    CREATE TABLE IF NOT EXISTS home_settings(household_id TEXT PRIMARY KEY REFERENCES households(id),address TEXT NOT NULL DEFAULT '',commune TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',holder TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS service_accounts(id TEXT PRIMARY KEY,household_id TEXT NOT NULL REFERENCES households(id),owner_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,company TEXT NOT NULL,client_number TEXT NOT NULL,holder TEXT NOT NULL,scope TEXT NOT NULL CHECK(scope IN ('personal','shared')),consented_at TEXT,last_checked TEXT,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS bill_drafts(id TEXT PRIMARY KEY,household_id TEXT NOT NULL REFERENCES households(id),owner_id TEXT NOT NULL REFERENCES users(id),service_id TEXT REFERENCES service_accounts(id),source TEXT NOT NULL,file_name TEXT NOT NULL,source_hash TEXT NOT NULL,document BLOB,text TEXT NOT NULL,extraction TEXT NOT NULL,reviewed TEXT,expense_id TEXT REFERENCES expenses(id),created_at TEXT NOT NULL,UNIQUE(household_id,source_hash));
    CREATE UNIQUE INDEX IF NOT EXISTS one_bill_per_expense ON bill_drafts(expense_id) WHERE expense_id IS NOT NULL;
  `);
  const getHouse=user=>db.prepare('SELECT * FROM households WHERE id=?').get(user.household_id);
  function home(user){
    const row=db.prepare('SELECT * FROM home_settings WHERE household_id=?').get(user.household_id);
    return {name:getHouse(user).name,address:row?.address||'',commune:row?.commune||'',region:row?.region||'',holder:row?.holder||(getHouse(user).demo?'Aileen Caro':''),version:row?.version||0};
  }
  function saveHome(user,input){
    const name=shortText(input.name,'Nombre de la casa',50),address=shortText(input.address,'Dirección',160),commune=shortText(input.commune,'Comuna',60),region=shortText(input.region,'Región',60),holder=shortText(input.holder,'Titular',80);
    tx(()=>{
      if(home(user).version!==input.version)throw new AppError('La configuración cambió. Vuelve a abrir Casa antes de guardar.',409);
      db.prepare('INSERT INTO home_settings(household_id,address,commune,region,holder) VALUES(?,?,?,?,?) ON CONFLICT(household_id) DO UPDATE SET address=excluded.address,commune=excluded.commune,region=excluded.region,holder=excluded.holder,version=home_settings.version+1').run(user.household_id,address,commune,region,holder);
      db.prepare('UPDATE households SET name=? WHERE id=?').run(name,user.household_id);audit(user,'home.update',user.household_id);
    });return home(user);
  }
  const publicService=(r,user)=>({id:r.id,ownerId:r.owner_id,kind:r.kind,company:r.company,clientNumber:r.client_number,holder:r.holder,scope:r.scope,consented:!!r.consented_at,lastChecked:r.last_checked,version:r.version,canEdit:r.owner_id===user.id});
  function service(user,id,ownerOnly=false){
    const row=db.prepare("SELECT * FROM service_accounts WHERE id=? AND household_id=? AND (scope='shared' OR owner_id=?)").get(id,user.household_id,user.id);
    if(!row)throw new AppError('No encontramos ese servicio.',404);
    if(ownerOnly&&row.owner_id!==user.id)throw new AppError('Solo quien registró el servicio puede cambiarlo o consultar su deuda.',403);
    return publicService(row,user);
  }
  function services(user){return db.prepare("SELECT * FROM service_accounts WHERE household_id=? AND (scope='shared' OR owner_id=?) ORDER BY rowid DESC").all(user.household_id,user.id).map(r=>publicService(r,user));}
  function saveService(user,input,id=null){
    if(!['water','electricity','internet','gas','other'].includes(input.kind))throw new AppError('Elige un tipo de servicio.');
    if(!['personal','shared'].includes(input.scope))throw new AppError('Elige la privacidad del servicio.');
    if(typeof input.consented!=='boolean')throw new AppError('Revisa el permiso de consulta.');
    const company=shortText(input.company,'Empresa',80),client=shortText(input.clientNumber,'Número de cliente',40),holder=shortText(input.holder,'Titular',80);
    const key=id||randomUUID();
    tx(()=>{
      if(id){const old=service(user,id,true);if(old.version!==input.version)throw new AppError('El servicio cambió. Vuelve a abrirlo.',409);}
      const duplicate=db.prepare('SELECT id FROM service_accounts WHERE household_id=? AND owner_id=? AND lower(company)=lower(?) AND client_number=? AND id<>?').get(user.household_id,user.id,company,client,key);
      if(duplicate)throw new AppError('Ya registraste esta cuenta de servicio.',409);
      const consent=input.consented?new Date().toISOString():null;
      if(id)db.prepare('UPDATE service_accounts SET last_checked=CASE WHEN company<>? OR client_number<>? THEN NULL ELSE last_checked END,kind=?,company=?,client_number=?,holder=?,scope=?,consented_at=?,version=version+1 WHERE id=?').run(company,client,input.kind,company,client,holder,input.scope,consent,key);
      else db.prepare('INSERT INTO service_accounts(id,household_id,owner_id,kind,company,client_number,holder,scope,consented_at) VALUES(?,?,?,?,?,?,?,?,?)').run(key,user.household_id,user.id,input.kind,company,client,holder,input.scope,consent);
      audit(user,id?'service.update':'service.create',key);
    });return service(user,key);
  }
  function draft(user,id){
    const r=db.prepare('SELECT id,service_id,source,file_name,text,extraction,reviewed,expense_id,created_at FROM bill_drafts WHERE id=? AND household_id=? AND owner_id=?').get(id,user.household_id,user.id);
    if(!r)throw new AppError('No encontramos esa boleta.',404);
    const parsed=JSON.parse(r.extraction), reviewed=r.reviewed?JSON.parse(r.reviewed):null;
    return {id:r.id,serviceId:r.service_id,source:r.source,fileName:r.file_name,text:r.text,...parsed,reviewed,expenseId:r.expense_id,createdAt:r.created_at};
  }
  function drafts(user){return db.prepare('SELECT id FROM bill_drafts WHERE household_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 50').all(user.household_id,user.id).map(r=>{const d=draft(user,r.id);delete d.text;delete d.evidence;return d;});}
  function addDraft(user,{text,fileName,bytes=null,source='text',serviceId=null,extraction=null,sourceHash=null}){
    if(serviceId)service(user,serviceId,true);
    if(typeof text!=='string'||text.length<30||text.length>100000)throw new AppError('Usa una boleta con entre 30 y 100.000 caracteres de texto.');
    const hash=sourceHash||digest(bytes||text.replace(/\s+/g,' ').trim());
    const old=db.prepare('SELECT id,owner_id FROM bill_drafts WHERE household_id=? AND source_hash=?').get(user.household_id,hash);
    if(old){if(old.owner_id!==user.id)throw new AppError('Este documento ya fue leído en el hogar. Pide a quien lo incorporó que lo revise.',409);return {...draft(user,old.id),duplicate:true};}
    const id=randomUUID(),at=new Date().toISOString();
    const parsed=extraction||parseBill(text);
    tx(()=>{db.prepare('INSERT INTO bill_drafts(id,household_id,owner_id,service_id,source,file_name,source_hash,document,text,extraction,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,user.household_id,user.id,serviceId,source,shortText(fileName,'Nombre del archivo',160),hash,bytes,text,JSON.stringify(parsed),at);audit(user,'bill.read',id);});
    return draft(user,id);
  }
  function confirm(user,id,input){
    if(input.reviewed!==true)throw new AppError('Confirma que revisaste el total, el vencimiento y la cuenta.');
    const company=shortText(input.company,'Empresa',80),clientNumber=shortText(input.clientNumber,'Número de cliente',40),billNumber=optional(input.billNumber||'','Folio',40),holder=shortText(input.holder,'Titular',80),value=amount(input.amount,'Total',false),dueDate=validDate(input.dueDate);
    if(!['shared','personal'].includes(input.scope))throw new AppError('Elige dónde organizar la boleta.');
    let expenseId;
    tx(()=>{
      const d=draft(user,id);if(d.expenseId){expenseId=d.expenseId;return;}
      if(d.serviceId){const s=service(user,d.serviceId,true);if(s.company.toLowerCase()!==company.toLowerCase()||s.clientNumber!==clientNumber)throw new AppError('La empresa o número de cliente no coincide con el servicio seleccionado. Lee la boleta sin asociarla o corrige el servicio.');}
      const identity=digest(JSON.stringify([company.toLowerCase(),clientNumber,billNumber?['folio',billNumber.toUpperCase()]:['fecha-monto',dueDate,value]]));
      const old=db.prepare('SELECT reviewed FROM bill_drafts WHERE household_id=? AND expense_id IS NOT NULL').all(user.household_id).find(r=>JSON.parse(r.reviewed)?.identity===identity);
      if(old)throw new AppError('Esta cuenta y boleta ya están incorporadas. No se agregó otro gasto.',409);
      if(input.existingExpenseId){
        const e=db.prepare('SELECT * FROM expenses WHERE id=? AND household_id=? AND owner_id=? AND deleted=0').get(input.existingExpenseId,user.household_id,user.id);
        if(!e||e.amount!==value||e.scope!==input.scope)throw new AppError('El gasto elegido debe ser tuyo, visible en el mismo espacio y tener el mismo total.');
        if(db.prepare('SELECT id FROM bill_drafts WHERE expense_id=?').get(e.id))throw new AppError('El gasto ya tiene una boleta asociada.',409);
        expenseId=e.id;
      }else expenseId=store.createExpense(user,{title:`${company}${billNumber?' · '+billNumber:''}`.slice(0,80),amount:value,category:'services',date:dueDate,scope:input.scope,status:'planned',paidBy:input.paidBy||user.id,splitMode:input.splitMode||'EVENLY',notes:'Boleta revisada en Cuentas. No se ha realizado un pago.'});
      db.prepare('UPDATE bill_drafts SET expense_id=?,reviewed=? WHERE id=?').run(expenseId,JSON.stringify({company,clientNumber,billNumber,holder,amount:value,dueDate,scope:input.scope,identity}),id);audit(user,'bill.confirm',id);
    });return {expenseId};
  }
  function document(user,id){draft(user,id);const r=db.prepare('SELECT document,file_name,text,source FROM bill_drafts WHERE id=?').get(id);return {bytes:r.document||Buffer.from(r.text),name:r.document?'boleta.pdf':'boleta.txt',type:r.document?'application/pdf':'text/plain; charset=utf-8'};}
  function removeDraft(user,id){const d=draft(user,id);if(d.expenseId)throw new AppError('Esta boleta respalda un gasto. Puedes quitar el gasto desde Gastos.');tx(()=>{db.prepare('DELETE FROM bill_drafts WHERE id=?').run(id);audit(user,'bill.discard',id);});}
  function recordDebt(user,s,result){
    db.prepare('UPDATE service_accounts SET last_checked=? WHERE id=?').run(new Date().toISOString(),s.id);
    if(result.amount===0)return {noDebt:true,message:'El proveedor informó deuda pendiente $0 en esta consulta.'};
    const fields={company:s.company,clientNumber:s.clientNumber,holder:s.holder,amount:result.amount,dueDate:result.dueDate,billNumber:''};
    const text=`Consulta de deuda a Khipu/Servipag\nEmpresa: ${s.company}\nCliente: ${s.clientNumber}\nTotal a pagar: ${result.amount}\nVencimiento: ${result.dueDate}\nOperación: ${result.operationId}`;
    return addDraft(user,{text,fileName:'Consulta de deuda',source:'khipu',serviceId:s.id,sourceHash:digest(JSON.stringify(['khipu',s.company,s.clientNumber,result.dueDate,result.amount])),extraction:{fields,evidence:{},warnings:['Esta consulta entrega deuda pendiente; no contiene la boleta completa.',...(result.incomplete?['El proveedor indicó que la respuesta puede estar incompleta.']:[])]}});
  }
  return {home,saveHome,services,service,saveService,drafts,draft,addDraft,confirm,document,removeDraft,recordDebt};
}
