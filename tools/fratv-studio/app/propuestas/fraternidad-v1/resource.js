/* Pilotos de diseño, aislados del catálogo aprobado y de las fuentes de emisión. */
(() => {
  const query = new URLSearchParams(location.search);
  const piece = ['mosca','nombre','inicio'].includes(query.get('piece')) ? query.get('piece') : 'mosca';
  const aspect = query.get('aspecto') === '9:16' ? '9:16' : '16:9';
  document.documentElement.dataset.aspecto = aspect;
  document.documentElement.dataset.piece = piece;
  const signature = '<div class="signature"><img src="/media/assets/eventos/fraternidad-horizontal-blanco.png" alt="Fraternidad · Campus Central"></div>';
  const emblem = '<div class="emblem intro-emblem" data-check-bounds><img src="/media/assets/eventos/fraternidad-insignia.png" alt="Insignia Frate · Fraternidad Campus Central"></div>';
  const art = document.getElementById('art');
  art.innerHTML = piece === 'mosca' ? `<div class="channel-bug" data-check-bounds>${signature}</div>` : piece === 'nombre' ? `<div class="lower" data-check-bounds><div class="lower-brand">${signature}</div><div class="lower-copy"><h1 class="person-name" data-field="name">ANA PÉREZ</h1><p class="person-role" data-field="role">CONDUCTORA</p></div></div>` : `<div class="intro-stage"><div class="intro-content" data-check-bounds><div class="intro-copy"><p class="intro-kicker">NOS ENCONTRAMOS EN VIVO</p><h1 class="intro-title" data-field="title">ENCUENTRO\nFRATERNIDAD</h1><p class="intro-subtitle" data-field="subtitle">Campus Central</p><div class="clock-block"><span class="clock-caption">COMENZAMOS EN</span><span class="clock-digits" data-clock>05:00</span></div></div>${emblem}</div><footer class="intro-footer" data-check-bounds><span>La transmisión comenzará en unos minutos</span><span>FRATERNIDAD · CAMPUS CENTRAL</span></footer></div>`;
  let animations=[], startedAt=performance.now(), remaining=300000, running=false;
  function clockValue(){return Math.max(0,remaining-(running?performance.now()-startedAt:0));}
  function paintClock(){const value=clockValue();const seconds=Math.ceil(value/1000);const hours=Math.floor(seconds/3600);const label=(hours?String(hours).padStart(2,'0')+':':'')+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');document.querySelectorAll('[data-clock]').forEach(el=>{el.textContent=label;});if(value===0&&running){running=false;remaining=0;}}
  function fitName(){const name=document.querySelector('.person-name');if(!name)return;const unit=innerWidth/(aspect==='9:16'?1000:1920);name.style.whiteSpace='nowrap';let size=aspect==='9:16'?58:52;name.style.fontSize=`${size*unit}px`;while(name.scrollWidth>name.clientWidth+1&&size>30){size--;name.style.fontSize=`${size*unit}px`;}if(name.scrollWidth>name.clientWidth+1)name.style.whiteSpace='normal';}
  const api={
    ready:Promise.all([document.fonts.ready,...[...document.images].map(img=>img.decode())]).then(()=>new Promise(resolve=>requestAnimationFrame(()=>{fitName();animations=document.getAnimations();if(query.get('autoplay')==='0')api.seek(1600);resolve(true);}))),
    seek(ms){animations.forEach(a=>{a.pause();a.currentTime=Math.max(0,Math.min(1600,Number(ms)||0));});},
    play(){animations.forEach(a=>a.play());},pause(){animations.forEach(a=>a.pause());},
    setFields(fields){const limits={name:32,role:60,title:55,subtitle:60};for(const [key,value]of Object.entries(fields||{})){const el=document.querySelector(`[data-field="${key}"]`);if(el&&key in limits)el.textContent=String(value).replace(/\\n/g,'\n').slice(0,limits[key]);}fitName();},
    setClock(config={}){remaining=clockValue();if(config.durationMs!==undefined){const value=Number(config.durationMs);if(!Number.isFinite(value)||value<0||value>86400000)throw new Error('Duración no válida.');remaining=value;}if(config.running!==undefined)running=Boolean(config.running);startedAt=performance.now();paintClock();},
    setBackground(value){document.body.dataset.background=['scene','black','ivory','checker','transparent'].includes(value)?value:'scene';},
    setSafe(value){document.querySelector('.review-safe').hidden=!value;},
  };
  window.PILOT=api;
  setInterval(paintClock,100);
  addEventListener('resize',fitName);
})();
