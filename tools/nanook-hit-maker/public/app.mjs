import {mountAudio} from './audio.mjs';
import {importChoices,applyImport,asJavita,asMagic,sunoText,projectMidi,scoreWindow,scoreXML,newSession,generateMotif,transformMotif,transforms,noteName,compose} from './adapters.mjs';
import {mountMagic} from './magic.mjs';
import {mountAbleton} from './ableton.mjs';
import {mountAutoSync,editsAfterSave} from './autosync.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let project=null,dirty=false,tab='project',part=0,page=0,hits=null,seed=17,importQueue=[],zipMode='restore',audioContext=null,playing=[],scoreToken=0;
let pending=0;
let analysisJob=null,analysisTimer=null,analysisGeneration=0,analysisCaps=null,autoApplyAttempt=null;
const fields=['title','bpm','key','chords','idea','lyrics','style','exclude'];
const status=(s,error=false)=>{$('#status').textContent=s;$('#status').classList.toggle('error',error);};
let editSerial=0,savingPromise=null,structureInputPending=false;
function markDirty(){dirty=true;editSerial++;$('#save-project').textContent='Guardando…';magicUI.changed();syncUI.changed();}
async function request(url,body,options={}){
 const {background=false,...fetchOptions}=options;
 const init={headers:{'X-Nanook':'1'},...fetchOptions};
 if(body!==undefined){init.method='POST';if(body instanceof Blob)init.body=body;else{init.headers['Content-Type']='application/json';init.body=JSON.stringify(body);}}
 if(!background){pending++;document.body.inert=true;}
 try{const r=await fetch(url,init),data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo completar la operación.');return data;}
 finally{if(!background){pending--;document.body.inert=pending>0;}}
}
const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){status(e.message,true);}};
const magicUI=mountMagic({getProject:()=>project,isDirty:()=>dirty,save,show,list,request,status,safe});
const abletonUI=mountAbleton({getProject:()=>project,isDirty:()=>dirty,save,show,list,showTab,request,safe,status});
const audioUI=mountAudio({getProject:()=>project,changed:markDirty});
const syncUI=mountAutoSync({getProject:()=>project,isDirty:()=>dirty,save,receive:receiveAuto,show,list,showTab,request,safe,status});
function capture(){if(!project)return;fields.forEach(f=>{project[f]=f==='bpm'?Number($('#field-'+f).value):$('#field-'+f).value;});}
function download(data,name,type='application/json'){
 const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadURL(url,name){const a=document.createElement('a');a.href=url;a.download=name;a.click();}
async function save(options={}){
 if(savingPromise){await savingPromise;if(dirty)return save(options);return project;}
 if(!project)return;capture();if(!dirty)return project;
 if(audioUI.pending())throw Error('Completa los ajustes del clip de audio. Tu edición sigue en pantalla.');
 if(structureInputPending)throw Error('Completa los límites de la sección para guardar. Tu edición sigue en pantalla.');
 const sent=structuredClone(project),serial=editSerial;
 savingPromise=(async()=>{
  const result=await request(`/api/projects/${sent.id}/ableton-auto/save`,{project:sent,expectedRevision:sent.revision,clientId:options.clientId||syncUI.clientId},{background:!!options.auto});
  if(result.conflict){syncUI.conflict();throw Error('Hay ediciones distintas del mismo contenido. Tu edición se conserva; elige una versión en el aviso de sincronización.');}
  if(project?.id!==sent.id)return result.project;
  capture();const accepted=editsAfterSave(sent,project,result.project),existing=project.parts,used=new Set();
  accepted.parts=accepted.parts.map(p=>{const old=existing.find(x=>!used.has(x)&&((x.abletonChannel&&x.abletonChannel===p.abletonChannel)||(!x.abletonChannel&&x.key===p.key&&x.name===p.name)));if(old){used.add(old);Object.assign(old,p);return old;}return p;});
  const mediaChanged=JSON.stringify(project.assets)!==JSON.stringify(accepted.assets);project=accepted;audioUI.saved();if(mediaChanged)libraryAssets();dirty=editSerial!==serial;$('#save-project').textContent=dirty?'Guardando…':'Guardado automáticamente';header();
  await list({background:!!options.auto});await history({background:!!options.auto});syncUI.saved();status('Guardado en el Mac · revisión '+project.revision);return project;
 })();
 try{return await savingPromise;}finally{savingPromise=null;}
}
async function list(options={}){
 const all=await request('/api/projects',undefined,options);
 $('#project-list').innerHTML=all.map(p=>`<button data-open="${p.id}" class="${project?.id===p.id?'active':''}">${esc(p.title)}<small>${p.bpm} BPM · revisión ${p.revision}</small></button>`).join('')||'<p class="empty">Tu biblioteca empieza aquí.</p>';
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=safe(async()=>{await save();await open(b.dataset.open);}));
}
function header(){$('#project-heading').textContent=project.title;$('#project-meta').textContent=`${project.bpm} BPM · ${project.key||'Tonalidad por definir'} · ${project.parts.reduce((s,p)=>s+p.notes.length,0)} notas · revisión ${project.revision}`;}
async function open(id){show(await request('/api/projects/'+id));await list();}
function show(p){
 stop();project=p;dirty=false;structureInputPending=false;part=0;page=0;hits=p.hits?structuredClone(p.hits):null;
 clearTimeout(analysisTimer);analysisGeneration++;analysisJob=null;autoApplyAttempt=null;
 window.history.replaceState(null,'','#project='+p.id);
 $('#welcome').hidden=true;$('#workspace').hidden=false;$('#save-project').textContent='Guardar cambios';
 fields.forEach(f=>$('#field-'+f).value=p[f]??'');header();assets();provenance();history().catch(e=>status(e.message,true));showTab(tab);status('Proyecto abierto · archivos guardados en el Mac.');loadAnalysis().catch(e=>{$('#analysis-stage').textContent=e.message;});magicUI.open();syncUI.open();
}
async function receiveAuto(p){
 if(!project||project.id!==p.id||dirty)return;
 const oldAssets=JSON.stringify(project.assets),oldAudio=JSON.stringify(project.audio_tracks);project=p;hits=p.hits?structuredClone(p.hits):null;
 fields.forEach(f=>$('#field-'+f).value=p[f]??'');header();if(oldAssets!==JSON.stringify(p.assets))assets();else if(oldAudio!==JSON.stringify(p.audio_tracks))audioUI.render();
 if(tab==='compose'){stop();renderComposer();}magicUI.changed();
 await Promise.all([list({background:true}),history({background:true})]);status('Proyecto actualizado automáticamente · revisión '+p.revision);
}
async function create(){await save();const p=await request('/api/projects',{title:'Mi próxima canción'});show(p);await list();}
function showTab(next){capture();stop();tab=next;if(project)window.history.replaceState(null,'','#project='+project.id+'&view='+tab);document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+tab);if(tab==='compose')renderComposer();if(tab==='produce')production();if(tab==='analyze')renderAnalysis();magicUI.changed();abletonUI.view(next);}
function assets(){audioUI.render();libraryAssets();}
function libraryAssets(){
 $('#assets').innerHTML=project.assets.filter(a=>a.role!=='ableton-audio-preview').map(a=>`<div class="asset"><strong>${esc(a.role==='ableton-audio-source'?(project.audio_tracks?.find(t=>t.clips.some(c=>c.assetId===a.id))?.name||a.name)+' · fuente de Live':a.name)}</strong><small>${(a.size/1048576).toFixed(1)} MB${a.duration?' · '+Math.round(a.duration)+' s':''}</small>${a.mime.startsWith('audio/')?`<audio controls preload="metadata" src="/api/projects/${project.id}/assets/${a.id}"></audio>`:`<p><a href="/api/projects/${project.id}/assets/${a.id}" download="${esc(a.name)}">Descargar paquete original</a></p>`}</div>`).join('')||'<p class="empty">Añade una referencia o incorpora un paquete de Contrapista con sus stems.</p>';
}
function provenance(){
 $('#provenance').innerHTML=project.imports.map(x=>`<div class="report-item"><b>${esc(x.module)}</b><p>${esc(new Date(x.at).toLocaleString('es-CL'))} · original conservado en el respaldo</p></div>`).join('')||'<p class="empty">Todavía no has importado material de otros módulos.</p>';
}
async function history(options={}){
 if(!project)return;const id=project.id,rows=await request('/api/projects/'+id+'/history',undefined,options);if(project.id!==id)return;
 $('#history').innerHTML=rows.slice(0,8).map(r=>`<div class="history-row"><span>Revisión ${r.revision}<small>${esc(new Date(r.updatedAt).toLocaleString('es-CL'))}${r.source?' · '+esc(r.source):''}</small></span>${r.revision!==project.revision?`<button data-revert="${r.revision}">Recuperar</button>`:'<span class="muted small">Actual</span>'}</div>`).join('');
 document.querySelectorAll('[data-revert]').forEach(b=>b.onclick=safe(async()=>{await save();show(await request('/api/projects/'+project.id+'/revert',{revision:Number(b.dataset.revert),expectedRevision:project.revision}));await list();status('Versión recuperada como una revisión nueva.');}));
}
async function backup(){await save();downloadURL('/api/projects/'+project.id+'/backup','NANOOK-proyecto.zip');status('Preparando respaldo completo con audios e historial.');}
function renderComposer(){
 $('#part-select').innerHTML=project.parts.map((p,i)=>`<option value="${i}">${esc(p.name)} · ${p.notes.length} notas</option>`).join('')||'<option value="0">Sin partes todavía</option>';
 part=Math.min(part,Math.max(0,project.parts.length-1));$('#part-select').value=String(part);$('#hits-editor').hidden=!hits;
 if(hits)renderMotif();renderNotes();renderScore();renderStructure();
}
function structureRows(){
 const rows=project.structure.filter(s=>s&&typeof s==='object').map(s=>({...s,name:s.name||s.label||'Sección',time:s.time??s.start??((s.bar-1)*240/project.bpm)})).filter(s=>Number.isFinite(s.time)).sort((a,b)=>a.time-b.time);
 if(!rows.length&&project.duration>0&&!project.ableton_structure)rows.push({name:'Inicio',time:0});
 return rows.map((s,i)=>({name:s.name,time:s.time,end:s.end>s.time?s.end:(rows[i+1]?.time??project.duration)}));
}
function writeStructure(rows){
 rows.sort((a,b)=>a.time-b.time);
 if(rows.some((s,i)=>!s.name.trim()||s.time<0||s.end<=s.time||s.end>1800||(i&&s.time<rows[i-1].end-.00001)))throw Error('Las secciones necesitan nombre y límites válidos, sin superponerse.');
 project.structure=rows.map(s=>({...s,start:s.time,bar:s.time*project.bpm/240+1,source:'nanook'}));project.ableton_structure=true;
 project.duration=Math.max(project.duration,...rows.map(s=>s.end));markDirty();renderScore();
}
function renderStructure(){
 const rows=structureRows();$('#structure-editor').innerHTML=rows.map((s,i)=>`<div class="structure-row"><label>Sección<input data-section="${i}" data-section-field="name" maxlength="100" value="${esc(s.name)}"></label><label>Compás de inicio<input data-section="${i}" data-section-field="time" type="number" min="1" step="0.25" value="${Number((s.time*project.bpm/240+1).toFixed(4))}"></label><label>Compás de fin<input data-section="${i}" data-section-field="end" type="number" min="1" step="0.25" value="${Number((s.end*project.bpm/240+1).toFixed(4))}"></label><button data-section-remove="${i}" aria-label="Quitar sección ${esc(s.name)}">Quitar</button></div>`).join('')||'<p class="muted small">Añade una sección para organizar el arreglo.</p>';
 document.querySelectorAll('[data-section]').forEach(el=>{const commit=()=>{structureInputPending=true;markDirty();const next=structureRows(),field=el.dataset.sectionField,v=field==='name'?el.value:(Number(el.value)-1)*240/project.bpm;if(field!=='name'&&(!el.value||!Number.isFinite(v)))throw Error('Escribe un compás válido.');next[+el.dataset.section][field]=v;writeStructure(next);structureInputPending=false;};el.oninput=safe(commit);el.onchange=safe(()=>{commit();renderStructure();});});
 document.querySelectorAll('[data-section-remove]').forEach(el=>el.onclick=safe(()=>{writeStructure(structureRows().filter((_,i)=>i!==+el.dataset.sectionRemove));renderStructure();}));
}
function renderMotif(){
 $('#hits-mode').value=hits.mode;
 $('#motif-notes').innerHTML=hits.motif.map((n,i)=>`<div class="motif-event"><label>Nota MIDI<input type="number" min="36" max="84" value="${n.pitch??''}" placeholder="Silencio" data-motif-pitch="${i}"></label><label>Pulsos<select data-motif-beats="${i}">${[.25,.5,1,1.5,2,3,4].map(b=>`<option ${b===n.beats?'selected':''}>${b}</option>`).join('')}</select></label></div>`).join('');
 document.querySelectorAll('[data-motif-pitch]').forEach(el=>el.onchange=()=>{hits.motif[+el.dataset.motifPitch].pitch=el.value===''?null:Number(el.value);});
 document.querySelectorAll('[data-motif-beats]').forEach(el=>el.onchange=()=>{hits.motif[+el.dataset.motifBeats].beats=Number(el.value);});
}
async function renderScore(){
 const token=++scoreToken;$('#score').replaceChildren();const current=project.parts[part];
 if(!current||!project.duration){$('#score-message').textContent='Importa notas de JAVITA o crea un motivo con hits.';$('#score-page').textContent='';return;}
 page=Math.max(0,Math.min(page,Math.ceil(project.duration/(32*60/project.bpm))-1));
 $('#score-page').textContent=`Compases ${page*8+1}–${Math.min(Math.ceil(project.duration/(4*60/project.bpm)),page*8+8)}`;
 $('#part-reviewed').checked=!!current.reviewed;
 if(current.key==='drums'){$('#score-message').textContent='Golpes candidatos de batería. Editables y exportables en MIDI; notación de percusión pendiente.';return;}
 try{
  if(!window.opensheetmusicdisplay)throw Error('No se pudo cargar el visor local de partituras. Puedes conservar y exportar las notas.');
  const viewer=new opensheetmusicdisplay.OpenSheetMusicDisplay($('#score'),{autoResize:true,backend:'svg',drawingParameters:'compact',drawTitle:false,drawMeasureNumbersOnlyAtSystemStart:true});
  await viewer.load(scoreXML(scoreWindow(project,part,page),0));
  if(token!==scoreToken)return;viewer.render();$('#score-message').textContent='';
 }catch(e){if(token===scoreToken)$('#score-message').textContent=e.message;}
}
function renderNotes(){
 const p=project.parts[part];if(!p){$('#note-editor').innerHTML='<p class="empty">Sin notas todavía.</p>';return;}
 const from=page*32*60/project.bpm,to=from+32*60/project.bpm;
 const entries=p.notes.map((n,i)=>({n,i})).filter(({n})=>n.start>=from&&n.start<to);
 $('#note-editor').innerHTML=entries.slice(0,80).map(({n,i})=>`<div class="note-row"><span>${esc(noteName(n.pitch))}</span><label>Altura MIDI<input data-note="${i}" data-property="pitch" type="number" min="0" max="127" step="1" value="${n.pitch}"></label><label>Inicio · s<input data-note="${i}" data-property="start" type="number" min="0" step="0.001" value="${Number(n.start.toFixed(6))}"></label><label>Duración · s<input data-note="${i}" data-property="duration" type="number" min="0.001" step="0.001" value="${Number(n.duration.toFixed(6))}"></label></div>`).join('')||'<p class="empty">Esta parte no tiene ataques en estos compases.</p>';
 if(entries.length>80)$('#note-editor').insertAdjacentHTML('beforeend','<p class="muted small">Se muestran las primeras 80 notas de estos compases. El resto se conserva.</p>');
 document.querySelectorAll('[data-note]').forEach(el=>el.oninput=safe(async()=>{const i=+el.dataset.note,key=el.dataset.property,v=Number(el.value),n=p.notes[i];if(!el.value||!Number.isFinite(v)||v<0||(key==='pitch'&&(!Number.isInteger(v)||v>127))||(key==='duration'&&v<=0))throw Error('Valor de nota fuera de rango.');const candidate={...n,[key]:v};if(candidate.start+candidate.duration>project.duration+.001)throw Error('La nota supera el final del proyecto.');p.notes[i]=candidate;p.reviewed=false;markDirty();stop();renderScore();}));
}
function stop(){playing.forEach(n=>{try{n.stop();}catch{}});playing=[];}
async function play(){
 capture();stop();const p=scoreWindow(project,part,page);audioContext??=new AudioContext();await audioContext.resume();
 for(const n of p.parts[0].notes){const osc=audioContext.createOscillator(),g=audioContext.createGain(),t=audioContext.currentTime+.05+n.start,d=Math.min(n.duration,8);osc.type=project.parts[part].key==='bass'?'sine':'triangle';osc.frequency.value=440*2**((n.pitch-69)/12);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(Math.min(.12,n.amplitude*.12),t+.012);g.gain.setValueAtTime(Math.min(.12,n.amplitude*.12),t+Math.max(.012,d-.03));g.gain.linearRampToValueAtTime(0,t+d);osc.connect(g).connect(audioContext.destination);osc.start(t);osc.stop(t+d+.01);playing.push(osc);}
}
async function applyChoice(choice){
 if(!project){const p=await request('/api/projects',{title:choice.label});show(p);}
 await save();const next=applyImport(project,choice);project=next;fields.forEach(f=>$('#field-'+f).value=project[f]??'');dirty=true;
 const result=await save();show(result);await list();status('Importación incorporada · '+choice.module+'. Se conserva su documento original.');
}
async function importJSON(file){
 if(file.size>6*1024*1024)throw Error('El archivo JSON supera 6 MB.');
 const choices=importChoices(JSON.parse(await file.text()));if(!choices.length)throw Error('La biblioteca no contiene ideas.');
 if(choices.length===1){await applyChoice(choices[0]);return;}
 importQueue=choices;$('#import-choice').innerHTML=choices.map((c,i)=>`<option value="${i}">${esc(c.label)}</option>`).join('');$('#import-dialog').showModal();
}
async function production(){
 const count=project.parts.reduce((s,p)=>s+p.notes.length,0),zip=project.assets.find(a=>a.role==='ableton-original');
 $('#production-summary').innerHTML=`<div class="report-item"><b>${count} notas · ${project.bpm} BPM</b><p>Cada parte con notas se entrega en su propia pista MIDI.</p></div><div class="report-item"><b>${project.assets.filter(a=>a.mime.startsWith('audio/')).length} archivos de audio</b><p>Descargables desde Proyecto y conservados en el respaldo.</p></div>${zip?`<div class="report-item"><a href="/api/projects/${project.id}/assets/${zip.id}" download="Contrapista.zip">${zip.jobId?'Descargar paquete de Ableton generado':'Descargar paquete original de Contrapista / Ableton'}</a></div>`:''}`;
 const modules=await request('/api/modules');$('#module-list').innerHTML=modules.map(m=>`<div class="module-row"><span>${m.label}<small>${m.integrated?(m.id==='contrapista'?'Análisis integrado en NANOOK':'Ideas, letras y prompts integrados'):m.handoff?'Handoff recibido · intercambio por archivos':'Handoff solicitado'}</small></span><a href="${m.url}" target="_blank" rel="noopener">Abrir herramienta</a></div>`).join('');
 const r=project.analysis;$('#analysis-report').innerHTML=r?`<div class="report-item"><b>${esc(r.separation_model||'Análisis importado')} · ${r.duration_s} s</b><p>Tempo: ${esc(r.tempo_source||'estimado')} · ${r.bpm} BPM</p></div>${(r.warnings||[]).map(w=>`<div class="report-item"><p>${esc(w)}</p></div>`).join('')}`:'<p class="empty">Sube una canción en Analizar para recibir aquí su informe y su producción.</p>';
}
async function loadAnalysis(){
 const id=project.id,generation=analysisGeneration;
 const [caps,job]=await Promise.all([request('/api/analysis/capabilities',undefined,{background:true}),request('/api/projects/'+id+'/analysis',undefined,{background:true})]);
 if(project?.id!==id||generation!==analysisGeneration)return;
 analysisCaps=caps;analysisJob=job;
 const select=$('#analysis-asset'),old=select.value;
 const audio=project.assets.filter(a=>a.mime.startsWith('audio/'));
 select.innerHTML=audio.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')||'<option value="">Sube una canción</option>';
 select.value=audio.some(a=>a.id===old)?old:(audio.find(a=>a.role==='reference')?.id||audio[0]?.id||'');
 $('#analysis-quality').querySelector('[value="ai"]').disabled=!caps.ai;
 if(!caps.ai)$('#analysis-quality').value='fast';
 renderAnalysis();await pollAnalysis(id,generation);
}
function renderAnalysis(){
 const j=analysisJob,active=j&&['queued','running'].includes(j.state),ready=j?.state==='ready';
 $('#analysis-start').disabled=!!active||!!ready||!$('#analysis-asset').value||!analysisCaps?.[$('#analysis-quality').value];
 for(const id of ['analysis-asset','analysis-source','analysis-quality','analysis-bpm'])$('#'+id).disabled=!!active||!!ready;
 $('#analysis-capabilities').textContent=analysisCaps?.ai?'Demucs y Basic Pitch disponibles · procesamiento local en este Mac.':'IA local no disponible. El modo rápido usa separación y notas aproximadas.';
 $('#analysis-badge').textContent=({queued:'EN PREPARACIÓN',running:'ANALIZANDO',ready:'RESULTADO LISTO',complete:'INCORPORADO',cancelled:'CANCELADO',error:'REINTENTAR',interrupted:'INTERRUMPIDO'}[j?.state]||'LISTO PARA EMPEZAR');
 $('#analysis-stage').textContent=j?.error||j?.stage||'Sube o elige un audio para comenzar.';
 $('#analysis-progress').value=j?.percent||0;
 $('#analysis-progress').hidden=!j;
 $('#analysis-detail').textContent=j?(j.state==='ready'?(j.needsReview?'La música cambió durante el análisis. Puedes guardar una versión y aplicar las nuevas partes.':dirty?'Tienes cambios sin guardar. Aplicar los guardará antes de incorporar el resultado.':'Preparando las partes para esta canción…'):`${j.assetName} · ${j.quality==='ai'?'IA local':'Rápido'} · ${j.percent}%`):'Puedes recargar la página y volver al progreso. Mantén la aplicación local en ejecución.';
 $('#analysis-cancel').hidden=!active&&!ready;$('#analysis-cancel').textContent=ready?'Descartar resultado':'Cancelar análisis';
 $('#analysis-apply').hidden=!ready||!!j.needsReview;$('#analysis-force').hidden=!ready||!j.needsReview;
 const hasResult=!!project?.analysis;
 $('#analysis-score').hidden=!hasResult;$('#analysis-audio').hidden=!hasResult;
 const r=project?.analysis;
 $('#analysis-results').innerHTML=r?`<div class="report-item"><b>${esc(r.separation_model||'Contrapista')} · ${r.duration_s} s</b><p>${r.bpm} BPM · ${project.parts.reduce((sum,p)=>sum+p.notes.length,0)} notas candidatas en ${project.parts.length} partes.</p></div>${(r.warnings||[]).map(w=>`<div class="report-item"><p>${esc(w)}</p></div>`).join('')}`:'';
}
async function pollAnalysis(id,generation=analysisGeneration){
 clearTimeout(analysisTimer);
 try{
  const job=await request('/api/projects/'+id+'/analysis',undefined,{background:true});
  if(project?.id!==id||generation!==analysisGeneration)return;
  analysisJob=job;renderAnalysis();
  if(job?.state==='ready'&&!dirty&&!job.needsReview&&autoApplyAttempt!==job.id){
   autoApplyAttempt=job.id;await applyAnalysis(false);return;
  }
  if(job&&['queued','running','ready'].includes(job.state))analysisTimer=setTimeout(()=>pollAnalysis(id,generation),1500);
 }catch(e){
  if(project?.id!==id||generation!==analysisGeneration)return;
  $('#analysis-stage').textContent=e.message;
  analysisTimer=setTimeout(()=>pollAnalysis(id,generation),5000);
 }
}
async function startAnalysis(){
 await save();
 const bpm=$('#analysis-bpm').value;
 analysisJob=await request('/api/projects/'+project.id+'/analysis',{assetId:$('#analysis-asset').value,source:$('#analysis-source').value,quality:$('#analysis-quality').value,bpm:bpm===''?null:Number(bpm),expectedRevision:project.revision});
 autoApplyAttempt=null;renderAnalysis();status('Análisis iniciado. Puedes seguir trabajando en esta app.');await pollAnalysis(project.id);
}
async function applyAnalysis(force=false){
 const id=project.id,job=analysisJob;
 if(!job)return;
 await save();
 const fresh=await request('/api/projects/'+id);
 if(project?.id!==id)return;
 const p=await request(`/api/projects/${id}/analysis/${job.id}/apply`,{expectedRevision:fresh.revision,force});
 if(project?.id!==id)return;
 show(p);await list();status('Análisis incorporado: notas, stems e informe en esta misma canción.');
}
fields.forEach(f=>$('#field-'+f).addEventListener('input',()=>{markDirty();if(analysisJob)renderAnalysis();magicUI.changed();}));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
$('#new-project').onclick=$('#welcome-create').onclick=safe(create);
$('#save-project').onclick=safe(save);$('#history-refresh').onclick=safe(history);
$('#reload-project').onclick=safe(async()=>{if(dirty&&!confirm('Hay cambios sin guardar. ¿Quieres descartarlos y cargar la versión del Mac?'))return;await open(project.id);});
$('#backup-project').onclick=$('#production-backup').onclick=safe(backup);
$('#import-project').onclick=()=>$('#json-file').click();$('#json-file').onchange=safe(async e=>{const f=e.target.files[0];e.target.value='';if(f)await importJSON(f);});
$('#restore-project').onclick=()=>{zipMode='restore';$('#zip-file').click();};$('#import-contrapista').onclick=()=>{zipMode='contrapista';$('#zip-file').click();};
$('#zip-file').onchange=safe(async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;await save();status('Incorporando paquete. Mantén esta pestaña abierta…');const p=await request(zipMode==='restore'?'/api/restore':'/api/import/contrapista?title='+encodeURIComponent(f.name.replace(/\.zip$/i,'')),f);show(p);await list();status(zipMode==='restore'?'Respaldo recuperado como proyecto nuevo.':'Paquete de Contrapista importado con notas, stems e informe.');});
$('#add-audio').onclick=$('#analysis-upload').onclick=$('#welcome-upload').onclick=()=>$('#audio-file').click();
$('#audio-file').onchange=safe(async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>1024**3)throw Error('El archivo supera 1 GB.');await save();if(!project)show(await request('/api/projects',{title:f.name.replace(/\.[^.]+$/,'').slice(0,200)||'Mi canción'}));status('Guardando canción en el Mac…');const id=project.id;const p=await request(`/api/projects/${id}/assets?revision=${project.revision}&name=${encodeURIComponent(f.name)}`,f);show(p);await list();showTab('analyze');status('Canción guardada. Elige el modo y pulsa Analizar canción.');});
$('#analysis-start').onclick=safe(startAnalysis);
$('#analysis-quality').onchange=renderAnalysis;
$('#analysis-asset').onchange=renderAnalysis;
$('#analysis-apply').onclick=safe(()=>applyAnalysis(false));
$('#analysis-force').onclick=safe(()=>applyAnalysis(true));
$('#analysis-cancel').onclick=safe(async()=>{if(!analysisJob)return;analysisJob=await request(`/api/projects/${project.id}/analysis/${analysisJob.id}/cancel`,{});renderAnalysis();});
$('#analysis-score').onclick=()=>showTab('compose');$('#analysis-audio').onclick=()=>showTab('project');
$('#import-cancel').onclick=()=>$('#import-dialog').close();$('#import-apply').onclick=safe(async()=>{const c=importQueue[+$('#import-choice').value];$('#import-dialog').close();await applyChoice(c);});
$('#structure-add').onclick=safe(()=>{if(project.duration<=0)throw Error('Añade música antes de organizar las secciones.');const rows=structureRows(),last=rows.at(-1);if(last){const end=last.end,at=(last.time+end)/2;last.end=at;rows.push({name:'Nueva sección',time:at,end});}else rows.push({name:'Inicio',time:0,end:project.duration});writeStructure(rows);renderStructure();});
$('#part-select').onchange=()=>{part=Number($('#part-select').value);page=0;stop();renderNotes();renderScore();};
$('#part-reviewed').onchange=()=>{if(project.parts[part]){project.parts[part].reviewed=$('#part-reviewed').checked;markDirty();}};
$('#score-prev').onclick=()=>{page=Math.max(0,page-1);stop();renderScore();renderNotes();};$('#score-next').onclick=()=>{if((page+1)*32*60/project.bpm<project.duration)page++;stop();renderScore();renderNotes();};
$('#play-notes').onclick=safe(play);$('#stop-notes').onclick=stop;
$('#new-motif').onclick=safe(async()=>{capture();if(!Number.isInteger(project.bpm)||project.bpm<50||project.bpm>180)throw Error('hits requiere un tempo entero entre 50 y 180 BPM. Ajusta el tempo del proyecto antes de componer.');if(project.title.length>100)throw Error('hits admite títulos de hasta 100 caracteres. Acorta el título antes de crear el arreglo.');hits={...(project.hits?structuredClone(project.hits):newSession()),title:project.title,bpm:project.bpm};$('#hits-editor').hidden=false;renderMotif();});
$('#hits-transform').innerHTML=Object.entries(transforms).map(([key,[label]])=>`<option value="${key}">${esc(label)}</option>`).join('');
$('#hits-mode').onchange=()=>{hits.mode=$('#hits-mode').value;hits.motif=generateMotif(seed++,hits.tonic,hits.mode);renderMotif();};$('#regenerate-motif').onclick=()=>{hits.motif=generateMotif(seed++,hits.tonic,hits.mode);renderMotif();};
$('#apply-motif').onclick=safe(async()=>{await save();const copy=structuredClone(hits),kind=$('#hits-transform').value;copy.title=project.title;copy.bpm=project.bpm;copy.sections=copy.sections.map(s=>({...s,transform:kind==='original'?s.transform:kind}));const choice=importChoices(copy)[0];await applyChoice(choice);showTab('compose');});
const exportMIDI=safe(async()=>{await save();download(projectMidi(project),'NANOOK-arreglo.mid','audio/midi');});$('#export-midi').onclick=$('#production-midi').onclick=exportMIDI;
$('#export-javita').onclick=safe(async()=>{await save();download(JSON.stringify(asJavita(project),null,2),'NANOOK-partitura.javita.json');});
$('#export-xml').onclick=safe(async()=>{await save();const p=project.parts[part];if(!p||p.key==='drums')throw Error('Elige una parte melódica para MusicXML.');download(scoreXML({...project,parts:[p]},0),'NANOOK-'+p.key+'.musicxml','application/vnd.recordare.musicxml+xml');});
$('#export-magic').onclick=safe(async()=>{await save();download(asMagic(project).text,'NANOOK-magic-session.json');});
$('#export-suno').onclick=safe(async()=>{await save();download(sunoText(project),'NANOOK-para-Suno.txt','text/plain');});
$('#music-to-brief').onclick=()=>{capture();const instruments=project.parts.map(p=>p.name).join(', '),structure=project.structure.map(s=>s.name||s.label).filter(Boolean).join(' → ');const extra=[`${project.bpm} BPM`,project.key,project.chords&&'Chords: '+project.chords,instruments&&'Instruments: '+instruments,structure&&'Structure: '+structure].filter(Boolean).join('. ');if((project.style+'\n'+extra).trim().length>1000){status('Styles superaría 1.000 caracteres. Acorta el texto antes de añadir los datos.',true);return;}$('#field-style').value=(project.style+'\n'+extra).trim();markDirty();status('Datos musicales añadidos a Styles. Puedes editarlos antes de transferir.');};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}stop();});
await list();
const locationState=new URLSearchParams(location.hash.slice(1));
const selected=locationState.get('project');
const selectedView=locationState.get('view');if(['project','analyze','compose','magic','produce'].includes(selectedView))tab=selectedView;
if(selected&&/^[a-f0-9]{32}$/.test(selected))await safe(()=>open(selected))();
