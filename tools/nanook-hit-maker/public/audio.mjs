const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountAudio({getProject,changed}){
 let invalid=false;
 const url=(p,id)=>`/api/projects/${p.id}/assets/${id}`;
 const label=(p,a)=>a.role==='ableton-audio-source'?(p.audio_tracks?.find(t=>t.clips.some(c=>c.assetId===a.id))?.name||a.name)+' · fuente de Live':a.name;
 const choices=p=>p.assets.filter(a=>a.mime.startsWith('audio/')&&a.role!=='ableton-audio-preview');
 const defaultClip=a=>({assetId:a.id,name:a.name.slice(0,100),start:0,offset:0,duration:a.duration||1,gainDb:0,pitch:0,fine:0,muted:false});
 function render(){
  const p=getProject();if(!p)return;invalid=false;
  $('#audio-add-source').innerHTML=choices(p).map(a=>`<option value="${a.id}">${esc(label(p,a))}</option>`).join('');
  $('#audio-add').disabled=!choices(p).length;
  $('#audio-tracks').innerHTML=(p.audio_tracks||[]).map((t,ti)=>`<div class="audio-track" data-audio-track="${t.id}"><div class="section-head"><h3>${esc(t.name)}</h3><small>${t.clips.length} clips · vínculo con Live</small></div>${t.previewAssetId&&t.clips.length?`<audio controls preload="metadata" data-audio-preview="${t.id}" src="${url(p,t.previewAssetId)}"></audio>`:'<p class="muted small">Pista vacía. Sus instrumentos y efectos permanecen en Live.</p>'}<details ${ti===0?'open':''}><summary>Editar clips de ${esc(t.name)}</summary><label class="lower">Nombre de pista<input data-track-name="${t.id}" maxlength="100" value="${esc(t.name)}"></label>${t.clips.map((c,i)=>`<div class="audio-clip" data-audio-clip="${i}"><label>Archivo del clip ${i+1}<select data-audio-source="${t.id}" data-index="${i}">${choices(p).map(a=>`<option value="${a.id}" ${a.id===c.assetId?'selected':''}>${esc(label(p,a))}</option>`).join('')}</select></label><div class="audio-fields">${[['start','Posición · s',0,1800,.001],['offset','Recorte desde · s',0,1800,.001],['duration','Duración · s',.001,1800,.001],['gainDb','Nivel · dB',-120,24,.1],['pitch','Transposición · semitonos',-48,48,1],['fine','Afinación · cents',-50,49,1]].map(([key,label,min,max,step])=>`<label>${label}<input aria-label="${label} · ${esc(t.name)} · clip ${i+1}" type="number" min="${min}" max="${max}" step="${step}" data-audio-prop="${key}" data-channel="${t.id}" data-index="${i}" value="${Number(c[key].toFixed(3))}" required></label>`).join('')}</div><label class="check"><input type="checkbox" data-audio-mute="${t.id}" data-index="${i}" ${c.muted?'checked':''}>Silenciar clip ${i+1}</label><div class="row lower"><button data-audio-duplicate="${t.id}" data-index="${i}">Duplicar clip ${i+1}</button><button data-audio-remove="${t.id}" data-index="${i}">Quitar clip ${i+1}</button></div></div>`).join('')}</details></div>`).join('')||'<p class="empty">Los stems del Set vinculado aparecerán aquí al conectar el puente. También puedes añadir un audio de esta canción como stem.</p>';
  const track=id=>getProject().audio_tracks.find(t=>t.id===id);
  document.querySelectorAll('[data-track-name]').forEach(e=>e.oninput=()=>{track(e.dataset.trackName).name=e.value;changed();});
  document.querySelectorAll('[data-audio-prop]').forEach(e=>e.oninput=()=>{
   invalid=[...document.querySelectorAll('[data-audio-prop]')].some(x=>!x.value||!x.checkValidity());
   if(e.value&&e.checkValidity())track(e.dataset.channel).clips[Number(e.dataset.index)][e.dataset.audioProp]=Number(e.value);changed();
  });
  document.querySelectorAll('[data-audio-source]').forEach(e=>e.onchange=()=>{const t=track(e.dataset.audioSource),old=t.clips[Number(e.dataset.index)];Object.assign(old,defaultClip(getProject().assets.find(a=>a.id===e.value)),{start:old.start});changed();render();});
  document.querySelectorAll('[data-audio-mute]').forEach(e=>e.onchange=()=>{track(e.dataset.audioMute).clips[Number(e.dataset.index)].muted=e.checked;changed();});
  document.querySelectorAll('[data-audio-remove]').forEach(e=>e.onclick=()=>{track(e.dataset.audioRemove).clips.splice(Number(e.dataset.index),1);changed();render();});
  document.querySelectorAll('[data-audio-duplicate]').forEach(e=>e.onclick=()=>{const t=track(e.dataset.audioDuplicate),c=structuredClone(t.clips[Number(e.dataset.index)]);c.start=Math.max(...t.clips.map(x=>x.start+x.duration));t.clips.push(c);changed();render();});
 }
 $('#audio-add').onclick=()=>{const p=getProject(),a=p.assets.find(a=>a.id===$('#audio-add-source').value);if(!a)return;p.audio_tracks??=[];p.audio_tracks.push({id:'a-'+crypto.randomUUID().replaceAll('-','').slice(0,12),name:a.name.slice(0,100),clips:[defaultClip(a)]});changed();render();};
 return {render,pending:()=>invalid,saved(){const p=getProject();
  document.querySelectorAll('[data-audio-track]').forEach(card=>{const t=p.audio_tracks?.find(t=>t.id===card.dataset.audioTrack);if(!t)return;card.querySelector('h3').textContent=t.name;card.querySelector('summary').textContent='Editar clips de '+t.name;
   if(t.previewAssetId&&t.clips.length&&!card.querySelector('[data-audio-preview]')){const media=document.createElement('audio');media.controls=true;media.preload='metadata';media.dataset.audioPreview=t.id;card.querySelector('.section-head').after(media);}
  });
  document.querySelectorAll('[data-audio-preview]').forEach(e=>{const t=p.audio_tracks?.find(t=>t.id===e.dataset.audioPreview);if(t?.previewAssetId&&e.getAttribute('src')!==url(p,t.previewAssetId))e.src=url(p,t.previewAssetId);});}};
}
