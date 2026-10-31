import { Worker } from 'node:worker_threads';
import { AppError } from './store.mjs';

const clean = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function parseBill(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const candidates = { amount: [], dueDate: [], clientNumber: [], billNumber: [], holder: [] };
  const evidence = {};
  const add = (key, value, line) => { if (value !== null && value !== '') { candidates[key].push(value); evidence[key] = line.slice(0, 240); } };
  const date = value => {
    const m = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
    const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    const s = iso?.[0] || (m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null);
    return s && Number.isFinite(Date.parse(s)) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s ? s : null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], n = clean(line);
    // Only labelled totals; consumption, subtotals and prior balances are not inferred as totals.
    if (/^(?:total\s+(?:a\s+pagar|del\s+documento)|monto\s+(?:total|a\s+pagar))\b/.test(n)) {
      const rest = line.replace(/^(?:total\s+(?:a\s+pagar|del\s+documento)|monto\s+(?:total|a\s+pagar))\s*[:$]?\s*/i,'') || lines[i+1] || '';
      const match = rest.match(/^\s*(?:CLP\s*)?\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,00)?\s*(?:CLP)?\s*$/i);
      if (match) add('amount', Number(match[1].replaceAll('.','')), line.includes(match[1])?line:line+' '+rest);
    }
    if (/^(?:fecha\s+de\s+vencimiento|vencimiento|venc[eé]|pagar\s+hasta)\b/.test(n)) add('dueDate',date(line+' '+(lines[i+1]||'')),line+' '+(lines[i+1]||''));
    for (const [key,pattern] of [
      ['clientNumber',/^(?:(?:n[°ºo.]?\s*|numero\s+de\s+)?cliente|cuenta\s+contrato)\s*[:#.-]?\s*([a-z0-9][a-z0-9.\/-]{2,39})\s*$/i],
      ['billNumber',/^(?:(?:boleta(?:\s+electronica)?|folio)\s*(?:n[°ºo.]?|numero)?\s*[:#.-]?\s*)([a-z0-9][a-z0-9.-]{1,39})\s*$/i]
    ]) { const m=n.match(pattern); if(m)add(key,m[1].toUpperCase(),line); }
    if (/^(?:titular|nombre\s+del\s+cliente)\s*:/.test(n)) add('holder',line.split(':').slice(1).join(':').trim(),line);
  }
  const fields = {company:'',amount:null,dueDate:'',clientNumber:'',billNumber:'',holder:''}, warnings=[];
  const known=['Aguas Andinas','Enel','CGE','Essbio','Esval','Chilquinta','Metrogas','VTR','Movistar','Entel','Claro'];
  const brands=known.filter(name=>lines.slice(0,12).some(line=>new RegExp('\\b'+clean(name)+'\\b').test(clean(line))));
  if(brands.length===1) fields.company=brands[0];
  const explicit=lines.find(line=>/^empresa\s*:/i.test(line));
  if(explicit)fields.company=explicit.split(':').slice(1).join(':').trim().slice(0,80);
  for(const [key,values] of Object.entries(candidates)) {
    const unique=[...new Set(values)];
    if(unique.length===1)fields[key]=unique[0];
    if(unique.length>1){warnings.push(`Hay más de un valor posible para ${key==='amount'?'el total':key==='dueDate'?'el vencimiento':key==='clientNumber'?'el número de cliente':key==='holder'?'el titular':'el folio'}. Revísalo en el documento.`);delete evidence[key];}
  }
  if(!fields.amount)warnings.push('No se identificó un total a pagar inequívoco.');
  if(!fields.dueDate)warnings.push('No se identificó una fecha de vencimiento válida.');
  return {fields,evidence,warnings};
}

export async function readPdf(bytes) {
  if(bytes.length>5*1024*1024)throw new AppError('La boleta admite hasta 5 MB.',413);
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw new AppError('El archivo no es un PDF válido.');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf-worker.mjs',import.meta.url),{workerData:new Uint8Array(bytes),resourceLimits:{maxOldGenerationSizeMb:192}});
    const timer=setTimeout(()=>{worker.terminate();reject(new AppError('La lectura tardó demasiado. Prueba un PDF más pequeño.'));},15000);
    const finish=(error,value)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
    worker.once('message',r=>finish(r.error?new AppError(r.error):null,r.text));
    worker.once('error',()=>finish(new AppError('No pudimos leer este PDF. Prueba el original descargado de la empresa.')));
    worker.once('exit',code=>{if(code!==0)finish(new AppError('No pudimos completar la lectura del PDF.'));});
  });
}
