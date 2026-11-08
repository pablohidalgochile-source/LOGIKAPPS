const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountMagic({getProject,isDirty,save,show,list,request,status,safe}){
 let job=null,caps=null,context=null,recipes=[],timer=null,epoch=0,variant=0;
 const currentResult=()=>job?.result||(getProject()?.magic?.proposal?{...getProject().magic,knowledgeVersion:getProject().magic_history?.at(-1)?.knowledgeVersion}:null);
 const active=()=>job&&['queued','running'].includes(job.state);
 const ready=()=>job?.state==='ready';
 function changed(){
  const p=getProject();if(!p)return;
  $('#magic-stale-label').hidden=!ready()||(!job.stale&&!isDirty());
  $('#magic-apply-note').textContent=ready()?'Solo se sustituyen los textos marcados. La partitura, el tempo y los audios se conservan. El texto anterior queda en Versiones guardadas.':'Propuesta incorporada. Puedes ajustar los textos en el editor de esta canción.';
  $('#magic-tempo-note').textContent=`Tu partitura conserva ${p.bpm} BPM. MAGIC usa un entero de 40 a 220 BPM para su propuesta.`;
  if(context)$('#magic-context-summary').innerHTML=`<div class="report-item"><b>${esc(context.projectTempo)} BPM · ${esc(context.key||'Tonalidad por definir')}</b><p>${context.parts.length} partes · ${context.parts.reduce((s,p)=>s+p.noteCount,0)} notas · ${context.parts.filter(p=>p.status==='revisada por el usuario').length} partes revisadas.</p></div><div class="report-item"><b>${context.analysis.available?'Análisis de Contrapista incluido':'Puedes crear sin análisis previo'}</b><p>Notas, intervalos, ritmo, acordes y estructura disponibles. Las detecciones se identifican como candidatas.</p></div><div class="report-item"><b>${getProject().magic_history?.length||0} propuestas incorporadas</b><p>${isDirty()?'Hay cambios por guardar. Crear guardará el proyecto y actualizará este contexto.':'El resumen corresponde a la versión guardada del proyecto.'}</p></div>`;
 }
 function render(){
  $('#magic-start').disabled=!caps?.configured||!!active()||!!ready();
  $('#magic-cancel').hidden=!active()&&!ready();$('#magic-cancel').textContent=ready()?'Descartar propuesta':'Cancelar generación';
  $('#magic-progress').hidden=!active();
  $('#magic-state').textContent=({queued:'Preparando tu propuesta',running:'MAGIC está creando',ready:'Tu propuesta está lista',complete:'Propuesta incorporada',error:'No se pudo generar',interrupted:'Generación interrumpida',cancelled:'Propuesta descartada'}[job?.state]||'Listo para crear');
  $('#magic-message').textContent=job?.error||(active()?'Puedes seguir trabajando. La propuesta quedará aquí aunque recargues la página.':ready()?'Compara las alternativas y elige qué textos aplicar.':job?.state==='complete'?'Guardada en el proyecto junto con su contexto y las tres alternativas.':'Describe tu dirección y crea una nueva propuesta.');
  for(const id of ['magic-task','magic-instruction','magic-vocals','magic-language','magic-bpm','magic-recipe'])$('#'+id).disabled=!!active()||!!ready();
  const r=currentResult();$('#magic-review').hidden=!r;
  $('#magic-review-label').textContent=ready()?'PROPUESTA PARA REVISAR':job?.state==='complete'||!job?'PROPUESTA INCORPORADA · ALTERNATIVAS CONSERVADAS':'VISTA PREVIA';
  $('#magic-apply-controls').hidden=!ready();
  if(r){
   const p=r.proposal;$('#magic-proposal-title').textContent=p.title;
   $('#magic-proposal-meta').textContent=`${p.tempo} BPM · ${p.tonality}`;
   $('#magic-summary').textContent=p.summary;$('#magic-hook').textContent='Gancho: '+p.hook;
   $('#magic-variants').innerHTML=p.variants.map((v,i)=>`<button data-magic-variant="${i}" aria-pressed="${i===variant}"><span class="eyebrow">ALTERNATIVA ${i+1}</span><strong>${esc(v.label)}</strong><small>${esc(v.description)}</small></button>`).join('');
   document.querySelectorAll('[data-magic-variant]').forEach(b=>b.onclick=()=>{variant=Number(b.dataset.magicVariant);render();});
   $('#magic-preview-style').textContent=p.variants[variant].style;$('#magic-preview-exclude').textContent=p.variants[variant].exclude||'Sin exclusiones adicionales.';
   $('#magic-preview-lyrics').textContent=p.lyrics||'Esta propuesta no incluye letra cantada.';
   $('#magic-direction').textContent=p.direction||'Sin guion adicional.';$('#magic-tips').innerHTML=p.tips.map(t=>`<li>${esc(t)}</li>`).join('');
  }
  changed();
 }
 function defaults(){
  const task=job?.settings?.task||'complete';
  const selected=task==='ideas'?['idea']:task==='lyrics'?['lyrics']:task==='prompts'?['style','exclude']:['idea','lyrics','style','exclude'];
  document.querySelectorAll('#magic-fields input').forEach(x=>{x.checked=selected.includes(x.value);if(x.value==='lyrics'&&!job?.result?.proposal.lyrics)x.checked=false;});
  $('#magic-stale').checked=false;
 }
 async function poll(id,token){
  clearTimeout(timer);
  try{
   const next=await request(`/api/projects/${id}/magic`,undefined,{background:true});
   if(getProject()?.id!==id||token!==epoch)return;
   const wasReady=ready();job=next;if(!wasReady&&ready()){variant=0;defaults();}render();
   if(active())timer=setTimeout(()=>poll(id,token),1800);
  }catch(e){if(token!==epoch)return;$('#magic-message').textContent=e.message;timer=setTimeout(()=>poll(id,token),5000);}
 }
 async function load(){
  clearTimeout(timer);const token=++epoch,id=getProject().id;job=null;context=null;caps=null;variant=getProject().magic?.variantIndex||0;render();
  $('#magic-context-summary').textContent='Actualizando contexto musical…';$('#magic-context').textContent='';
  $('#magic-instruction').value=getProject().idea||'';$('#magic-bpm').value=String(Math.round(getProject().bpm));
  const settings=getProject().magic_history?.at(-1)?.settings;
  $('#magic-vocals').value=settings?.vocals||'Voz masculina';$('#magic-language').value=settings?.language||'Español';$('#magic-task').value=settings?.task||'complete';
  const results=await Promise.all([request('/api/magic/capabilities',undefined,{background:true}),request(`/api/projects/${id}/magic-context`,undefined,{background:true}),request(`/api/projects/${id}/magic`,undefined,{background:true}),fetch('/vendor/magic-recipes.json').then(r=>r.json())]);
  if(token!==epoch||getProject()?.id!==id)return;
  [caps,context,job,recipes]=results;
  $('#magic-connection').textContent=caps.configured?`Conexión de MAGIC disponible · ${caps.model} · 24 recetas musicales.`:'Conexión de MAGIC no disponible. El editor de textos sigue disponible.';
  $('#magic-context').textContent=JSON.stringify(context,null,2);
  $('#magic-recipe').innerHTML='<option value="">Según tu dirección</option>'+recipes.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  const s=job?.settings||settings;
  if(s){$('#magic-instruction').value=s.instruction;$('#magic-bpm').value=s.bpm;$('#magic-vocals').value=s.vocals;$('#magic-language').value=s.language;$('#magic-task').value=s.task;$('#magic-recipe').value=s.recipeId;}
  recipeNote();defaults();render();if(active())timer=setTimeout(()=>poll(id,token),1000);
 }
 function recipeNote(){$('#magic-recipe-note').textContent=recipes.find(r=>r.id===$('#magic-recipe').value)?.summary||'La receta orienta la producción y conserva el tempo y la armonía elegidos.';}
 $('#magic-recipe').onchange=recipeNote;
 $('#magic-start').onclick=safe(async()=>{
  await save();const id=getProject().id;
  const body={expectedRevision:getProject().revision,task:$('#magic-task').value,instruction:$('#magic-instruction').value,bpm:Number($('#magic-bpm').value),vocals:$('#magic-vocals').value,language:$('#magic-language').value,recipeId:$('#magic-recipe').value};
  job=await request(`/api/projects/${id}/magic`,body);context=await request(`/api/projects/${id}/magic-context`,undefined,{background:true});$('#magic-context').textContent=JSON.stringify(context,null,2);render();await poll(id,epoch);
 });
 $('#magic-cancel').onclick=safe(async()=>{job=await request(`/api/projects/${getProject().id}/magic/${job.id}/cancel`,{});clearTimeout(timer);render();status('Propuesta descartada. El proyecto se conserva.');});
 $('#magic-apply').onclick=safe(async()=>{
  if(!ready())return;
  const fields=Array.from(document.querySelectorAll('#magic-fields input:checked'),x=>x.value);if(!fields.length)throw Error('Selecciona al menos un campo para incorporar.');
  if((job.stale||isDirty())&&!$('#magic-stale').checked)throw Error('Revisa la propuesta y marca que quieres aplicarla al proyecto con tus cambios actuales.');
  await save();
  let p;try{p=await request(`/api/projects/${getProject().id}/magic/${job.id}/apply`,{expectedRevision:getProject().revision,fields,variantIndex:variant,allowStale:$('#magic-stale').checked});}catch(e){await poll(getProject().id,epoch);throw e;}
  show(p);await list();status('Propuesta incorporada · revisión '+p.revision+'. La versión anterior se conserva.');
 });
 return {open:()=>load().catch(e=>{$('#magic-message').textContent=e.message;status(e.message,true);}),changed};
}
