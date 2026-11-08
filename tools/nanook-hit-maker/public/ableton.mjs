const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountAbleton({getProject,isDirty,save,show,list,showTab,request,safe,status}){
 let live={},job=null,preview=null,timer=null,epoch=0,submitting=false,reading=null,reviewKey='';
 const active=()=>job&&['queued','running','locators','verifying'].includes(job.state);
 const readActive=()=>reading&&['queued','running','applying'].includes(reading.state);
 function render(){
  const p=getProject();if(!p)return;
  $('#live-badge').textContent=live.connected?'LIVE CONECTADO':'ESPERANDO A LIVE';
  $('#live-destination').textContent=live.connected?`${live.setName} · Ableton ${live.liveVersion} · ${Number(Number(live.tempo).toFixed(3))} BPM`:'Abre Ableton y activa la superficie de control NanookHitMaker.';
  $('#live-setup').hidden=!!live.connected;
  $('#live-unsaved').hidden=!live.connected||!!live.setPath;
  $('#live-send').textContent=live.bindings?.includes(p.id)?'Actualizar pistas en Ableton':'Enviar canción a Ableton';
  $('#live-send').disabled=!live.connected||!live.setPath||!!active()||!!readActive()||submitting||!preview?.duration;
  $('#live-tempo-text').textContent=`Aplicar ${p.bpm} BPM y compás 4/4 en el Set de Live`;
  $('#live-progress').hidden=!active();
  $('#live-replace-label').hidden=!job||!['conflict','error','interrupted'].includes(job.state);
  $('#live-job-state').textContent=({queued:'Entrega preparada · esperando a Live',running:'Live está incorporando la canción',locators:'Colocando los marcadores de estructura',verifying:'Comprobando los clips recibidos en Live',complete:'Canción incorporada al Set',conflict:'Revisa los cambios hechos en Live',error:'La entrega necesita revisión',expired:'Live no recibió la entrega',interrupted:'La entrega se interrumpió'}[job?.state]||'Todo listo para tu producción');
  $('#live-job-detail').textContent=job?.error||(job?.state==='complete'?`${job.midiNotes} notas MIDI · ${job.audioClips} pistas de audio · ${job.sections} secciones · revisión de NANOOK ${job.sourceRevision}. ${job.skippedCueCollisions?'Se conservaron marcadores propios que coinciden en el tiempo.':''}`:active()?'Mantén Live abierto. Los archivos se incorporan en el Set de destino; puedes consultar el resultado aquí.':'Se crean pistas vinculadas en el Arrangement y marcadores de estructura. Las siguientes entregas actualizan esas pistas.');
  $('#live-send-note').textContent=job?.state==='complete'?'Puedes seguir produciendo en ese mismo Set. Guarda en Ableton para conservar los cambios.':'El envío se inicia con este botón. Detén Live antes de enviar o actualizar.';
  renderReturn();
 }
 function renderReturn(){
  const p=getProject();if(!p)return;
  $('#live-read').disabled=!live.connected||!live.bindings?.includes(p.id)||!!active()||!!readActive()||submitting;
  $('#live-return-progress').hidden=!readActive();
  $('#live-return-review').hidden=reading?.state!=='ready'||!reading.preview;
  $('#live-return-score').hidden=reading?.state!=='complete';
  $('#live-return-state').textContent=reading?.error||reading?.previewError||({queued:'Esperando la lectura de Live…',running:'Leyendo el Arrangement…',applying:'Comprobando Live y guardando la partitura…',ready:'Lectura lista. Revisa las notas y la estructura que quieres recibir.',complete:`Cambios recibidos · revisión ${reading?.appliedRevision}. La partitura usa estas notas.`,expired:'Live no recibió la lectura. Actualiza la conexión y vuelve a leer.',interrupted:'La lectura se interrumpió. Vuelve a leer el Set.'}[reading?.state]||'Lee el Set para revisar tus cambios antes de aplicarlos.');
  const data=reading?.preview;if(reading?.state!=='ready'||!data)return;
  const key=JSON.stringify([reading.id,data]);
  if(key!==reviewKey){
   reviewKey=key;
   $('#live-return-parts').innerHTML=data.parts.map(r=>`<div class="report-item"><b>${esc(r.name)}</b><p>${r.localCount} → ${r.liveCount} notas · ${r.conflict?'Cambios en ambos lados':r.changed?'Cambios de Live':r.localChanged?'Se conserva tu edición de NANOOK':'Sin cambios'}</p>${r.changed?`<p>${r.added} eventos nuevos o modificados · ${r.removed} anteriores retirados</p>`:''}${r.examples.length?`<p>${r.examples.map(n=>`MIDI ${n[0]} · pulso ${n[1]} · duración ${n[2]}`).join('<br>')}</p>`:''}</div>`).join('');
   $('#live-return-warnings').textContent=data.warnings.join(' ');
   $('#live-return-resolve').checked=false;
  }
  const choice=$('#live-structure-source').value,source=choice==='auto'?data.suggestedSource:choice,candidate=data.structures[source];
  $('#live-structure-detail').textContent=!source?'Los clips de sección y los localizadores tienen cambios distintos. Elige cuál usar.':candidate?.error||`${source==='clips'?'Clips de la pista Estructura':'Localizadores de todo el Set'} · ${candidate.rows.length} secciones · ${candidate.conflict?'Cambios en ambos lados':candidate.changed?'Cambios de Live':'Sin cambios de Live'}.`;
  $('#live-return-sections').innerHTML=(candidate?.rows||[]).map(s=>`<div class="history-row"><span>${esc(s[0])}</span><span class="muted">${(s[1]/4+1).toFixed(2)} → ${((s[1]+s[2])/4+1).toFixed(2)}</span></div>`).join('');
  const notes=$('#live-return-notes').checked,structure=$('#live-return-structure').checked;
  const conflicts=[...data.parts.filter(r=>notes&&r.conflict).map(r=>r.name),...(structure&&candidate?.conflict?['Estructura']:[])];
  $('#live-return-conflicts').textContent=conflicts.length?`Cambió en NANOOK y en Live: ${conflicts.join(', ')}. Elige explícitamente la versión de Live para sustituir esas ediciones de NANOOK.`:'Las ediciones de NANOOK en partes que Live no cambió se conservan.';
  $('#live-return-resolve-label').hidden=!conflicts.length;
  $('#live-return-apply').disabled=submitting||(!notes&&!structure)||(structure&&(!candidate||!!candidate.error))||(conflicts.length>0&&!$('#live-return-resolve').checked);
 }
 async function poll(id,token){
  clearTimeout(timer);
  try{
   const [state,current,incoming]=await Promise.all([request('/api/ableton/status',undefined,{background:true}),request(`/api/projects/${id}/ableton`,undefined,{background:true}),request(`/api/projects/${id}/ableton-return`,undefined,{background:true})]);
   if(token!==epoch||getProject()?.id!==id)return;
   live=state;job=current;reading=incoming;render();timer=setTimeout(()=>poll(id,token),1800);
  }catch(e){if(token!==epoch)return;$('#live-job-detail').textContent=e.message;timer=setTimeout(()=>poll(id,token),5000);}
 }
 async function load(){
  const token=++epoch,id=getProject().id;clearTimeout(timer);preview=null;live={};job=null;reading=null;reviewKey='';render();
  $('#live-structure-source').value='auto';$('#live-return-notes').checked=true;$('#live-return-structure').checked=true;
  const data=await request(`/api/projects/${id}/ableton-preview`,undefined,{background:true});
  if(token!==epoch||getProject()?.id!==id)return;preview=data;
  $('#live-material').textContent=`${data.notes} notas en ${data.parts.filter(p=>p.notes).length} partes · ${data.sections.length} secciones · ${data.duration.toFixed(1)} segundos.`;
  $('#live-audio').innerHTML=data.audio.map(a=>`<label class="check live-asset"><input type="checkbox" value="${a.id}" ${a.default?'checked':''}>${esc(a.name)}</label>`).join('')||'<p class="muted small">El envío contiene la partitura y su estructura; no hay audio adjunto.</p>';
  $('#live-replace').checked=false;await poll(id,token);
 }
 $('#live-refresh').onclick=safe(load);
 $('#live-open').onclick=safe(async()=>{await request('/api/ableton/open',{});status('Ableton abierto. Puedes continuar produciendo en su Set actual.');});
 $('#live-read').onclick=safe(async()=>{
  submitting=true;render();
  try{await save();const p=getProject();reading=await request(`/api/projects/${p.id}/ableton-return`,{expectedRevision:p.revision,targetSession:live.session,targetPath:live.setPath});reviewKey='';render();await poll(p.id,epoch);}
  finally{submitting=false;render();}
 });
 for(const id of ['live-structure-source','live-return-notes','live-return-structure','live-return-resolve'])$('#'+id).onchange=renderReturn;
 $('#live-return-apply').onclick=safe(async()=>{
  if(isDirty()){await save();await poll(getProject().id,epoch);status('Guardé tus cambios de NANOOK. Revisa la comparación actualizada antes de aplicar.');return;}
  const p=getProject(),id=reading.id;submitting=true;renderReturn();
  try{
   const updated=await request(`/api/projects/${p.id}/ableton-return/${id}/apply`,{expectedRevision:p.revision,notes:$('#live-return-notes').checked,structure:$('#live-return-structure').checked,structureSource:$('#live-structure-source').value,resolveConflicts:$('#live-return-resolve').checked?'live':null});
   if(getProject()?.id!==p.id)return;show(updated);await list();status('Notas y estructura recibidas de Ableton. Abre JAVITA para ver la partitura actualizada.');
  }finally{submitting=false;renderReturn();}
 });
 $('#live-return-score').onclick=()=>showTab('compose');
 $('#live-send').onclick=safe(async()=>{
  submitting=true;render();
  try{
   await save();
   const p=getProject();job=await request(`/api/projects/${p.id}/ableton`,{expectedRevision:p.revision,targetSession:live.session,targetPath:live.setPath,assetIds:Array.from(document.querySelectorAll('#live-audio input:checked'),x=>x.value),setTempo:$('#live-tempo').checked,replaceLive:$('#live-replace').checked},{background:true});
   $('#live-replace').checked=false;render();await poll(p.id,epoch);
  }finally{submitting=false;render();}
 });
 return {view(next){clearTimeout(timer);++epoch;if(next==='produce')load().catch(e=>status(e.message,true));}};
}
