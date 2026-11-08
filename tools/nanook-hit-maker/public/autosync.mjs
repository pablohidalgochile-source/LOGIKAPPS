const $=s=>document.querySelector(s);
const fields=['title','bpm','duration','key','chords','idea','lyrics','style','exclude','structure','hits','ableton_structure'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function parts(p){const seen=new Map();return p.parts.map(value=>{const occurrence=seen.get(value.key)||0;seen.set(value.key,occurrence+1);return {id:value.abletonChannel,alias:`${value.key}:${occurrence}`,value};});}
const matching=(all,entry)=>all.find(p=>entry.id&&p.id===entry.id)||all.find(p=>p.alias===entry.alias);

// Carry keystrokes typed during an autosave onto its accepted/rebased response.
export function editsAfterSave(sent,newer,accepted){
 const result=structuredClone(accepted);
 for(const field of fields)if(!same(sent[field],newer[field]))result[field]=structuredClone(newer[field]);
 const a=parts(sent),b=parts(newer),out=parts(result);
 // The server can add a channel identity; align new identities to the sent part.
 for(const entry of b){
  const old=matching(a,entry);if(same(old?.value,entry.value))continue;
  const current=matching(out,entry),value={...entry.value,abletonChannel:current?.value.abletonChannel||entry.value.abletonChannel};
  if(current)current.value=value;else out.push({...entry,value});
 }
 for(const entry of a)if(!matching(b,entry)){
  const current=matching(out,entry),index=out.indexOf(current);if(index>=0)out.splice(index,1);
 }
 result.parts=out.map(p=>p.value);
 const at=new Map((sent.audio_tracks||[]).map(t=>[t.id,t])),bt=new Map((newer.audio_tracks||[]).map(t=>[t.id,t])),ct=new Map((accepted.audio_tracks||[]).map(t=>[t.id,t]));
 for(const [id,t] of bt)if(!same(at.get(id),t))ct.set(id,{...t,previewAssetId:ct.get(id)?.previewAssetId||t.previewAssetId});
 for(const id of at.keys())if(!bt.has(id))ct.delete(id);
 if(ct.size||accepted.audio_tracks)result.audio_tracks=[...ct.values()];
 return result;
}

export function mountAutoSync({getProject,isDirty,save,receive,show,list,showTab,request,status,safe}){
 const clientId=crypto.randomUUID().replaceAll('-','');let timer,saveTimer,epoch=0,state={},saving=false,blockedSave=false,inFlightToken=null;
 function render(){
  $('#auto-banner').hidden=!getProject();if(!getProject())return;
  $('#auto-enabled').checked=state.enabled!==false;
  $('#auto-state').textContent=state.message||'Esperando el Set vinculado…';
  $('#auto-label').textContent=({synced:'SINCRONIZADO',receiving:'RECIBIENDO',sending:'ENVIANDO',editing:'AUTOGUARDANDO',transport:'EN ESPERA',conflict:'CONFLICTO', 'editor-conflict':'CONFLICTO',error:'REVISAR LIVE',paused:'PAUSADO',offline:'SIN CONEXIÓN'}[state.state]||'SINCRONIZACIÓN LOCAL');
  $('#auto-last').textContent=state.lastSyncAt?`${state.lastDirection} · ${new Date(state.lastSyncAt*1000).toLocaleTimeString('es-CL')} · revisión ${state.lastRevision}`:'Cada edición aceptada conserva la versión anterior en el historial.';
  const conflict=['conflict','editor-conflict'].includes(state.state);
  $('#auto-conflict').hidden=!conflict;$('#auto-error-resume').hidden=state.state!=='error';
  $('#auto-conflict-detail').textContent=(state.conflicts||[]).join(' · ');
  $('#auto-source-label').hidden=!state.conflicts?.some(c=>c.includes('localizadores'));
 }
 async function lease(){const p=getProject();if(p)await request(`/api/projects/${p.id}/ableton-auto/editor`,{clientId,dirty:isDirty()},{background:true});}
 async function autosave(){
  if(!isDirty()||saving||blockedSave)return;saving=true;
  try{await save({auto:true,clientId});}
  catch(e){status(e.message,true);}
  finally{saving=false;if(isDirty()&&!blockedSave)saveTimer=setTimeout(autosave,3000);}
 }
 async function poll(token,id){
  if(token!==epoch||getProject()?.id!==id)return;
  if(inFlightToken===token)return;inFlightToken=token;
  try{
   if(isDirty())await lease();
   const next=await request(`/api/projects/${id}/ableton-auto`,undefined,{background:true});
   if(token!==epoch||getProject()?.id!==id)return;state=next;render();
   if(!isDirty()&&next.revision>getProject().revision){
    const p=await request(`/api/projects/${id}`,undefined,{background:true});
    if(token===epoch&&getProject()?.id===id&&!isDirty())await receive(p);
   }
  }catch(e){if(token===epoch){$('#auto-state').textContent=e.message;}}
  finally{if(inFlightToken===token)inFlightToken=null;if(token===epoch)timer=setTimeout(()=>poll(token,id),1200);}
 }
 $('#auto-enabled').onchange=safe(async()=>{state=await request(`/api/projects/${getProject().id}/ableton-auto`,{enabled:$('#auto-enabled').checked},{background:true});render();});
 $('#auto-error-resume').onclick=safe(async()=>{state=await request(`/api/projects/${getProject().id}/ableton-auto`,{enabled:true});render();});
 for(const choice of ['nanook','live'])$('#auto-choose-'+choice).onclick=safe(async()=>{
  const p=await request(`/api/projects/${getProject().id}/ableton-auto/resolve`,{choice,expectedRevision:state.revision,draftId:state.draftId,captureHash:state.captureHash,structureSource:$('#auto-structure-source').value});
  show(p);await list();status('Conflicto resuelto. Las versiones anteriores siguen en el historial.');
 });
 $('#auto-history').onclick=()=>showTab('project');
 return {clientId,open(){clearTimeout(timer);clearTimeout(saveTimer);blockedSave=false;const token=++epoch,p=getProject();state={};render();if(p)poll(token,p.id);},
  changed(){blockedSave=false;clearTimeout(saveTimer);lease().catch(()=>{});saveTimer=setTimeout(autosave,1100);},
  saved(){if(isDirty())this.changed();else lease().catch(()=>{});},
  conflict(){blockedSave=true;clearTimeout(saveTimer);clearTimeout(timer);poll(epoch,getProject().id);},
 };
}
