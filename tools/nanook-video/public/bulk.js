(() => {
  let origin='links',busy=false,batch=null,batchId='',batchShown=50,batchSignature='',results=[],page=1,hasMore=false,lastRequest=null,relatedSeed=null,replacement=null;
  let selected=new Set(),seenReady=new Set(),searchSelected=new Set(),queueBusy=false;
  const message=(text,error=false)=>{const e=$('#bulk-notice');e.textContent=text;e.hidden=!text;e.classList.toggle('error',error);};
  const title=i=>i.info?.title||i.requestedTitle||i.query||i.url||'Entrada no válida';
  function destinations(){for(const id of ['bulk-destination','discover-destination']){const e=$('#'+id),previous=e.value;e.innerHTML='<option value="new">Nuevo lote</option>'+(batch?`<option value="current">Añadir a ${escapeHTML(batch.name)}</option>`:'');e.value=previous==='current'&&batch?'current':'new';}}
  function update(){
    const ready=batch?.items.filter(i=>i.status==='ready')||[],chosen=ready.filter(i=>selected.has(i.id));
    $('#batch-enqueue').disabled=busy||!chosen.length;$('#batch-selection-count').textContent=`${chosen.length} seleccionados`;
    $('#batch-download-count').textContent=chosen.length?`${chosen.length} materiales → ${chosen.length*($('#batch-target').value==='both'?2:1)} archivos antes de omitir duplicados`:'Selecciona material listo.';
    $('#batch-all').checked=!!ready.length&&chosen.length===ready.length;$('#batch-all').indeterminate=chosen.length>0&&chosen.length<ready.length;$('#batch-all').disabled=busy||!ready.length;
    $('#discover-analyze').disabled=busy||!searchSelected.size||(!!replacement&&searchSelected.size!==1);
    $('#discover-analyze').textContent=replacement?'Reemplazar con el seleccionado':`Preparar ${searchSelected.size||''} seleccionados`;
    $('#discover-all').checked=!!results.length&&searchSelected.size===results.length;$('#discover-all').indeterminate=searchSelected.size>0&&searchSelected.size<results.length;
    $('#batch-related').disabled=busy||!ready.length;
    const target=$('#batch-target').value;document.querySelectorAll('.batch-video-field').forEach(e=>e.hidden=target==='audio');document.querySelectorAll('.batch-audio-field').forEach(e=>e.hidden=target==='video');$('#batch-bitrate-field').hidden=target==='video'||!['mp3','m4a'].includes($('#batch-audio-format').value);
    document.querySelectorAll('[data-remove-item],[data-related-item],[data-replace-item]').forEach(e=>e.disabled=busy);
  }
  function busyState(value){busy=value;for(const selector of ['[data-bulk-source]','#bulk-analyze','#load-example','#discover-button','#batch-history','#discover-more','#batch-control','#batch-name-form button'])document.querySelectorAll(selector).forEach(b=>b.disabled=value);update();}
  function selectOrigin(name){
    origin=name;message('');results=[];searchSelected.clear();lastRequest=null;relatedSeed=null;replacement=null;$('#discover-panel').hidden=true;
    document.querySelectorAll('[data-bulk-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bulkSource===name)));
    $('#bulk-links-form').hidden=name!=='links';$('#bulk-discover-form').hidden=name==='links';
    const settings={search:['Tema, artista o palabras clave','Tráilers comedia terror español…','Buscar','Resultados de YouTube por palabras clave. La curaduría con IA está pendiente.'],collection:['Enlace de canal, playlist o página con varios materiales','https://…','Explorar','Hasta 200 materiales por página. Puedes explorar las siguientes páginas y crear más lotes.'],related:['Enlace de referencia','https://…','Buscar relacionados','La búsqueda usa las palabras del título. Puedes ampliarla desde cualquier material de tu lote.']}[name]||[];
    $('#discover-label').textContent=settings[0]||'';$('#discover-query').value='';$('#discover-query').placeholder=settings[1]||'';$('#discover-query').type=name==='collection'||name==='related'?'url':'text';$('#discover-query').required=true;$('#discover-button').textContent=settings[2]||'Buscar';$('#discover-help').textContent=settings[3]||'';update();
  }
  document.querySelectorAll('[data-bulk-source]').forEach(b=>b.addEventListener('click',()=>selectOrigin(b.dataset.bulkSource)));
  document.addEventListener('ingesta:tab',e=>{if(e.detail==='discover')selectOrigin('search');if(e.detail==='bulk')selectOrigin('links');});
  async function history(){const list=await api('/api/batches');$('#batch-history').innerHTML='<option value="">Selecciona un lote…</option>'+list.map(b=>`<option value="${escapeHTML(b.id)}">${escapeHTML(b.name)} · ${b.total} materiales · ${b.counts.ready} listos</option>`).join('');if(batchId)$('#batch-history').value=batchId;return list;}
  function adopt(b){if(batchId!==b.id){batchId=b.id;batchShown=50;batchSignature='';selected.clear();seenReady.clear();try{localStorage.setItem('nanook-last-batch',batchId);}catch{}}batch=b;for(const i of b.items)if(i.status==='ready'&&!seenReady.has(i.id)){seenReady.add(i.id);if(!i.info?.needsReview)selected.add(i.id);}selected=new Set([...selected].filter(id=>b.items.some(i=>i.id===id)));renderBatch();destinations();}
  async function prepare(text,name,destination){
    if(busy)return;busyState(true);message('Preparando el material…');
    try{
      let b;if(replacement)b=await api(`/api/batches/${replacement.batchId}/replace`,{itemId:replacement.itemId,text});
      else if(destination==='current'&&batch)b=await api(`/api/batches/${batch.id}/append`,{text});
      else b=await api('/api/batches',{text,name});
      adopt(b);await history();window.ingestaTab('bulk');message(`${b.total} materiales en el lote.${b.duplicates?` ${b.duplicates} entradas repetidas omitidas.`:''} Los títulos encontrados por búsqueda pueden requerir revisión.`);$('#batch-panel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){message(e.message,true);}finally{busyState(false);}
  }
  $('#bulk-links-form').addEventListener('submit',e=>{e.preventDefault();void prepare($('#bulk-links').value,undefined,$('#bulk-destination').value);});
  $('#load-example').addEventListener('click',async()=>{try{const data=await api('/trailer-example.json');$('#bulk-links').value=JSON.stringify(data,null,2);message('Tu lista de 20 películas está lista para preparar. Se comprobarán los enlaces y se señalarán coincidencias dudosas.');}catch(e){message(e.message,true);}});
  async function discover(more=false){
    if(busy)return;busyState(true);message('Buscando material…');
    try{
      let body;
      if(more)body={...lastRequest,page:page+1};
      else{
        body={kind:origin,query:$('#discover-query').value,page:1,excludeDownloaded:$('#discover-exclude').checked};
        if(origin==='related'){body={...(relatedSeed||{url:$('#discover-query').value}),page:1,excludeDownloaded:$('#discover-exclude').checked};if(relatedSeed&&$('#discover-query').value.trim())body.query=$('#discover-query').value;}
        results=[];searchSelected.clear();
      }
      const data=await api(origin==='related'?'/api/related':'/api/discover',body);lastRequest=body;page=data.page;hasMore=data.hasMore;
      if(origin==='collection'){results=[];searchSelected.clear();}
      const known=new Set(results.map(i=>i.url));for(const i of data.entries)if(!known.has(i.url)){results.push(i);known.add(i.url);}
      if(!more){const count=replacement?1:Number($('#discover-count').value);searchSelected=new Set(results.slice(0,count).map(i=>i.id));}
      $('#discover-panel').hidden=false;$('#discover-title').textContent=origin==='collection'?`${data.title} · página ${page}`:`${results.length} resultados`;
      $('#discover-explanation').textContent=data.explanation||'Selecciona las fuentes que quieres conservar. Se verificarán sus formatos al preparar el lote.';
      $('#discover-more').textContent=origin==='collection'?'Explorar los siguientes 200':'Mostrar 20 más';
      renderDiscovery();message(!results.length?'No se encontraron resultados nuevos. Prueba otras palabras o desmarca la exclusión de material guardado.':origin==='collection'&&data.hasMore?'Hay más material en esta colección. Puedes preparar esta página como lote y continuar con la siguiente.':'');
      if(replacement)message('Elige un resultado para reemplazar el material del lote. Las descargas anteriores se conservan.');
    }catch(e){message(e.message,true);}finally{busyState(false);}
  }
  $('#bulk-discover-form').addEventListener('submit',e=>{e.preventDefault();void discover();});$('#discover-more').addEventListener('click',()=>discover(true));
  function renderDiscovery(){
    $('#discover-results').innerHTML=results.map(i=>`<label class="bulk-result"><input type="checkbox" data-discovery-id="${escapeHTML(i.id)}" ${searchSelected.has(i.id)?'checked':''}>${i.thumbnail?`<img src="${escapeHTML(i.thumbnail)}" alt="" loading="lazy">`:'<span class="bulk-result-placeholder" aria-hidden="true">▶</span>'}<span class="bulk-result-copy"><strong>${escapeHTML(i.title)}</strong><span>${escapeHTML(i.channel||i.source||'')}${i.duration!=null?` · ${duration(i.duration)}`:''}</span>${i.reason?`<span>${escapeHTML(i.reason)}</span>`:''}</span><a href="${escapeHTML(i.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver ${escapeHTML(i.title)} en su fuente">↗</a></label>`).join('');$('#discover-more').hidden=!hasMore;update();
  }
  $('#discover-results').addEventListener('change',e=>{const id=e.target.dataset.discoveryId;if(id){e.target.checked?searchSelected.add(id):searchSelected.delete(id);update();}});
  $('#discover-all').addEventListener('change',e=>{searchSelected=e.target.checked?new Set(results.map(i=>i.id)):new Set();renderDiscovery();});
  $('#discover-analyze').addEventListener('click',()=>prepare(results.filter(i=>searchSelected.has(i.id)).map(i=>i.url).join('\n'),origin==='collection'?$('#discover-title').textContent:`Búsqueda: ${lastRequest?.query||'Relacionados'}`,$('#discover-destination').value));
  $('#batch-history').addEventListener('change',async e=>{if(!e.target.value||busy)return;busyState(true);try{adopt(await api('/api/batches/'+e.target.value));}catch(err){message(err.message,true);}finally{busyState(false);}});
  function renderBatch(){
    if(!batch)return;$('#batch-panel').hidden=false;$('#batch-title').textContent=batch.name;if(document.activeElement!==$('#batch-name'))$('#batch-name').value=batch.name;
    const c=batch.counts,reviews=batch.items.filter(i=>i.info?.needsReview).length;$('#batch-progress').textContent=`${c.ready} listos · ${c.analyzing} analizando · ${c.pending} pendientes${c.error?` · ${c.error} con error`:''}${reviews?` · ${reviews} coincidencias por revisar`:''}${batch.stopped?' · Análisis detenido':''}`;
    $('#batch-meter-fill').style.width=`${Math.round((c.ready+c.error)/Math.max(1,batch.total)*100)}%`;
    $('#batch-control').textContent=batch.stopped?'Continuar análisis':batch.complete?'Reintentar errores':'Detener nuevos análisis';$('#batch-control').hidden=batch.complete&&!c.error;
    const signature=JSON.stringify([batch.items,batchShown,[...selected]]);
    if(signature!==batchSignature){
      batchSignature=signature;const active=document.activeElement?.dataset.batchItem;
      $('#batch-results').innerHTML=batch.items.slice(0,batchShown).map(i=>{
        const ready=i.status==='ready',info=i.info||{};
        const detail=ready?`${info.channel} · ${duration(info.duration)} · ${info.hasVideo===false?'Solo audio':info.maxHeight?`hasta ${info.maxHeight}p`:'Calidad al descargar'}`:i.status==='error'?i.error:i.status==='analyzing'?(i.query?'Buscando y verificando coincidencia…':'Consultando formatos disponibles…'):'Esperando análisis';
        return `<div class="batch-row"><label class="bulk-result ${i.status==='error'?'result-error':''}"><input type="checkbox" data-batch-item="${escapeHTML(i.id)}" ${ready?'':'disabled'} ${selected.has(i.id)&&ready?'checked':''}>${info.thumbnail?`<img src="${escapeHTML(info.thumbnail)}" alt="" loading="lazy">`:'<span class="bulk-result-placeholder" aria-hidden="true">▶</span>'}<span class="bulk-result-copy"><strong>${escapeHTML(title(i))}</strong><span>${escapeHTML(detail)}</span>${info.matchNote?`<span class="${info.needsReview?'review-note':''}">${escapeHTML(info.matchNote)}</span>`:''}</span><span class="result-state">${info.needsReview?'Revisar':{pending:'En espera',analyzing:'Analizando',ready:'Listo',error:'Revisar'}[i.status]}</span></label><div class="batch-item-actions">${ready?`<a class="small-button" href="${escapeHTML(i.url)}" target="_blank" rel="noopener noreferrer">Ver fuente ↗</a><button class="small-button" data-related-item="${escapeHTML(i.id)}">Relacionados</button>`:''}<button class="small-button" data-replace-item="${escapeHTML(i.id)}">Buscar reemplazo</button><button class="small-button" data-remove-item="${escapeHTML(i.id)}">Quitar del lote</button></div></div>`;
      }).join('')+(batch.items.length>batchShown?'<button class="small-button" id="batch-more" type="button">Mostrar 50 más</button>':'');
      if(active)document.querySelector(`[data-batch-item="${CSS.escape(active)}"]`)?.focus({preventScroll:true});
    }update();
  }
  $('#batch-results').addEventListener('change',e=>{const id=e.target.dataset.batchItem;if(id){e.target.checked?selected.add(id):selected.delete(id);update();}});
  async function mutate(action,body){if(!batch||busy)return;busyState(true);try{adopt(await api(`/api/batches/${batch.id}/${action}`,body));await history();}catch(e){message(e.message,true);}finally{busyState(false);}}
  async function related(seed){window.ingestaTab('discover');selectOrigin('related');relatedSeed=seed;$('#discover-query').type='text';$('#discover-query').required=false;$('#discover-query').placeholder='Palabras clave adicionales (opcional)';$('#discover-label').textContent='Relacionado con el material seleccionado';$('#discover-destination').value=batch?'current':'new';await discover();$('#bulk-view').scrollIntoView({behavior:'smooth',block:'start'});}
  $('#batch-results').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.id==='batch-more'){batchShown+=50;renderBatch();}else if(b.dataset.removeItem)void mutate('edit',{removeIds:[b.dataset.removeItem]});else if(b.dataset.relatedItem)void related({batchId:batch.id,itemId:b.dataset.relatedItem});else if(b.dataset.replaceItem){const id=b.dataset.replaceItem,i=batch.items.find(i=>i.id===id),ref=batch.id;window.ingestaTab('discover');selectOrigin('search');replacement={batchId:ref,itemId:id};$('#discover-query').value=[i.requestedTitle||i.info?.title||i.query||'',i.requestedYear||''].filter(Boolean).join(' ');if($('#discover-query').value)void discover();else message('Escribe el título que quieres encontrar para reemplazar este material.');}});
  $('#batch-related').addEventListener('click',()=>related({batchId:batch.id}));
  $('#jobs').addEventListener('click',e=>{const b=e.target.closest('[data-related-job]');if(b&&!busy)void related({jobId:b.dataset.relatedJob});});
  $('#batch-name-form').addEventListener('submit',e=>{e.preventDefault();void mutate('edit',{name:$('#batch-name').value});});
  $('#batch-all').addEventListener('change',e=>{selected=e.target.checked?new Set(batch.items.filter(i=>i.status==='ready').map(i=>i.id)):new Set();renderBatch();});
  for(const id of ['batch-target','batch-audio-format'])$('#'+id).addEventListener('change',update);
  $('#batch-control').addEventListener('click',()=>mutate(batch.stopped||batch.complete?'resume':'stop',{}));
  $('#batch-enqueue').addEventListener('click',async()=>{
    if(!batch||busy)return;busyState(true);message('');
    try{
      const r=await api(`/api/batches/${batch.id}/enqueue`,{itemIds:batch.items.filter(i=>i.status==='ready'&&selected.has(i.id)).map(i=>i.id),requestId:crypto.randomUUID(),target:$('#batch-target').value,mode:$('#batch-mode').value,quality:$('#batch-quality').value,audioFormat:$('#batch-audio-format').value,audioQuality:$('#batch-audio-quality').value,skipDuplicates:$('#batch-skip-duplicates').checked});
      for(const i of [...r.added,...r.duplicates])selected.delete(i.id);
      message(`${r.count} archivos añadidos.${r.duplicates.length?` ${r.duplicates.length} materiales repetidos omitidos.`:''}${r.errors.length?` Revisa ${r.errors.length}: ${r.errors.map(e=>e.title+' — '+e.error).join(' / ')}`:''}`,!!r.errors.length);renderBatch();await refreshJobs();$('#downloads-heading').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){message(e.message,true);}finally{busyState(false);}
  });
  function renderQueue(){const q=state.queue;if(!q)return;$('#queue-summary').textContent=`${q.waiting} en espera · ${q.running} en curso${q.paused?' · Cola pausada':''}`;$('#queue-detail').textContent=`${q.available} espacios libres de ${q.limit}`;$('#queue-concurrency').value=String(q.concurrency);$('#queue-pause').textContent=q.paused?'Reanudar cola':'Pausar nuevos';for(const id of ['queue-pause','queue-concurrency','queue-cancel','queue-retry'])$('#'+id).disabled=queueBusy;$('#queue-cancel').disabled=queueBusy||!q.waiting;$('#queue-retry').disabled=queueBusy||!q.failed;}
  async function queueAction(path,body){if(queueBusy)return;queueBusy=true;renderQueue();try{const r=await api(path,body);await refreshJobs();$('#queue-notice').textContent=r.count!=null?`${r.count} trabajos actualizados.`:state.queue.paused?'Cola pausada. Los archivos en curso terminan normalmente.':'Cola activa.';}catch(e){$('#queue-notice').textContent=e.message;}finally{queueBusy=false;renderQueue();}}
  $('#queue-pause').addEventListener('click',()=>queueAction('/api/queue/config',{paused:!state.queue?.paused}));$('#queue-concurrency').addEventListener('change',e=>queueAction('/api/queue/config',{concurrency:Number(e.target.value)}));$('#queue-cancel').addEventListener('click',()=>queueAction('/api/queue/cancel-waiting',{}));$('#queue-retry').addEventListener('click',()=>queueAction('/api/queue/retry-errors',{}));document.addEventListener('nanook:queue',renderQueue);
  async function tick(){try{if(batchId&&!busy){const id=batchId,b=await api('/api/batches/'+id);if(id===batchId)adopt(b);}}catch{}finally{setTimeout(tick,batch&&!batch.complete&&!batch.stopped?1500:5000);}}
  (async()=>{try{const list=await history();let last;try{last=localStorage.getItem('nanook-last-batch');}catch{}const id=list.find(b=>b.id===last)?.id||list[0]?.id;if(id){adopt(await api('/api/batches/'+id));$('#batch-history').value=id;}}catch{}finally{void tick();}})();
  selectOrigin(location.hash==='#descubrir'?'search':'links');renderQueue();
})();
