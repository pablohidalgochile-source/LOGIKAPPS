(function(){
  'use strict';
  var body=document.body;
  var id=body.getAttribute('data-resource');
  var stage=document.getElementById('stage');
  var q=new URLSearchParams(location.search);
  var escapeHTML=function(value){return String(value).replace(/[&<>"']/g,function(character){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]})};
  var f=function(key,fallback){return escapeHTML(q.get(key)||fallback)};
  /* La ruta relativa funciona tanto en el sitio como dentro del pack local para OBS. */
  var logo='<img class="logo" src="../../brand/fratv-horizontal.svg" alt="FRATV">';
  var duration={
    'ident-long':1900,'ident-short':900,stinger:800,flag:0,countdown:0,
    'bumper-in':7000,'bumper-out':7000,'program-title':8000,schedule:8000,
    engagement:8000,sponsor:8000,ticker:18000,'end-credits':22000
  }[id];
  if(duration===undefined) duration=8000;
  document.documentElement.style.setProperty('--fr-dur',duration+'ms');
  var markup='<div class="safe"></div>';
  if(id==='ident-long'||id==='ident-short'){
    markup+='<img class="logo center-logo" src="../../brand/fratv-horizontal.svg" alt="FRATV">';
  }else if(id==='stinger'){
    markup+='<div class="stinger-a"></div><div class="stinger-b"></div><img class="logo stinger-logo" src="../../brand/fratv-horizontal.svg" alt="FRATV">';
  }else if(id==='flag'){
    markup+='<img class="logo flag-logo" src="../../brand/fratv-horizontal.svg" alt="FRATV">';
  }else if(id==='countdown'){
    markup+='<div class="countdown plate"><strong data-field="clock">'+f('clock','00:04:58')+'</strong><span data-field="caption">'+f('caption','PARA EMPEZAR')+'</span></div>';
  }else if(id==='bumper-in'||id==='bumper-out'){
    var incoming=id==='bumper-in';
    markup+='<div class="bumper">'+logo+'<h1 data-field="title">'+f('title',incoming?'EN BREVE\nCOMIENZA':'GRACIAS\nPOR VER')+'</h1><p data-field="subtitle">'+f('subtitle',incoming?'GRACIAS POR ACOMPAÑARNOS':'NOS VEMOS EN EL PRÓXIMO PROGRAMA')+'</p></div>';
  }else if(id==='program-title'){
    markup+='<div class="program"><span class="tag red" data-field="label">'+f('label','NUEVO EPISODIO')+'</span><h1 data-field="title">'+f('title','HISTORIAS\nDE BARRIO')+'</h1><p data-field="meta">'+f('meta','JUEVES · 21:00 · @FRATV')+'</p></div>';
  }else if(id==='schedule'){
    markup+='<div class="schedule plate"><h1 data-field="title">'+f('title','PROGRAMACIÓN')+'</h1><pre data-field="items">'+f('items','20:00  ENTREVISTA DEL JUEVES\n21:30  RESUMEN DE LA SEMANA\n23:00  FRATE SESSIONS')+'</pre></div>';
  }else if(id==='engagement'){
    markup+='<div class="stack"><div class="eng-card plate"><small>COMENTARIO DESTACADO</small><strong data-field="comment">'+f('comment','¿CUÁNDO SALE EL PRÓXIMO EPISODIO?')+'</strong></div><div class="eng-card plate"><small>VOTACIÓN DEL PÚBLICO</small><strong data-field="poll">'+f('poll','SÍ 66%  ███████░░░  NO 34%')+'</strong></div><div class="eng-card plate"><small>META DEL MES</small><strong data-field="goal">'+f('goal','78% COMPLETADO')+'</strong></div></div>';
  }else if(id==='sponsor'){
    markup+='<div class="sponsor"><small data-field="label">'+f('label','PRESENTADO POR')+'</small><strong data-field="sponsor">'+f('sponsor','LOGO SPONSOR')+'</strong></div>';
  }else if(id==='ticker'){
    markup+='<div class="ticker"><b data-field="label">'+f('label','AHORA')+'</b><span data-field="text">'+f('text','PRÓXIMO PROGRAMA 21:00   ◆   ESCRIBE CON #FRATV   ◆   SÍGUENOS   ◆   CONTENIDO DIGITAL HUMANO')+'</span></div>';
  }else{
    markup+='<div class="credits"><pre data-field="credits">'+f('credits','DIRECCIÓN\nTU NOMBRE\n\nPRODUCCIÓN\nEQUIPO FRATV\n\nREALIZACIÓN\nCAMPUS CENTRAL\n\nGRACIAS POR ACOMPAÑARNOS')+'</pre><img class="logo" src="../../brand/fratv-horizontal.svg" alt="FRATV"></div>';
  }
  stage.innerHTML=markup;
  var hooks;
  var startCountdown;
  if(id==='countdown'){
    var clock=document.querySelector('[data-field="clock"]');
    var defaultSeconds=298;
    var totalMs=defaultSeconds*1000;
    var remainingMs=totalMs;
    var deadline=0;
    var timer=null;
    var playing=false;
    function seconds(value){
      var match=/^(\d{2}):([0-5]\d):([0-5]\d)$/.exec(String(value||''));
      return match ? Number(match[1])*3600+Number(match[2])*60+Number(match[3]) : defaultSeconds;
    }
    function stopTimer(){ if(timer!==null) clearInterval(timer); timer=null; playing=false; }
    function draw(){
      if(playing) remainingMs=Math.max(0,deadline-Date.now());
      var left=Math.ceil(remainingMs/1000);
      clock.textContent=[Math.floor(left/3600),Math.floor(left/60)%60,left%60].map(function(n){return String(n).padStart(2,'0')}).join(':');
      if(remainingMs===0) stopTimer();
    }
    function pause(){ draw(); stopTimer(); }
    function play(){
      if(playing||remainingMs===0) return;
      deadline=Date.now()+remainingMs;
      playing=true;
      timer=setInterval(draw,100);
      draw();
    }
    function reset(value){
      var resume=playing;
      stopTimer();
      totalMs=seconds(value)*1000;
      remainingMs=totalMs;
      draw();
      if(resume) play();
    }
    reset(q.get('clock')||'00:04:58');
    hooks={
      onSeek:function(t){ pause(); remainingMs=Math.max(0,totalMs-t); draw(); },
      onPlay:play,
      onPause:pause,
      onFields:function(fields){
        if(!Object.prototype.hasOwnProperty.call(fields,'clock')) return;
        if(fields.clock===''||fields.clock==null){ pause(); return; }
        reset(fields.clock);
      }
    };
    startCountdown=play;
    window.addEventListener('pagehide',pause);
  }
  window.FRATVRuntime.create({id:id,durationMs:duration,loop:id==='flag'||id==='countdown'||id==='ticker',alpha:id!=='stinger'&&id!=='bumper-in'&&id!=='bumper-out'},hooks);
  if(startCountdown&&q.get('autoplay')!=='0') startCountdown();
}());
