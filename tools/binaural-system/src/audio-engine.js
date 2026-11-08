/* BINAURAL SYSTEM — extracted from RESET DETOX's stereo/LFO/noise engine.
   Live playback and WAV export share the same synthesis graph. */
import { normalizePatch, clamp } from './patch.js';

export function makeNoiseBuffer(ctx, type) {
  const size = Math.ceil(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, size, ctx.sampleRate), d = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0,last=0;
  for(let i=0;i<size;i++) {
    const w=Math.random()*2-1;
    if(type==='white') d[i]=w;
    else if(type==='brown') { last=(last+.02*w)/1.02; d[i]=last*3.5; }
    else {
      b0=.99886*b0+w*.0555179; b1=.99332*b1+w*.0750759;
      b2=.969*b2+w*.153852; b3=.8665*b3+w*.3104856;
      b4=.55*b4+w*.5329522; b5=-.7616*b5-w*.016898;
      d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11; b6=w*.115926;
    }
  }
  return buf;
}

export function createSynthesisGraph(ctx, input, destination, when=ctx.currentTime, duration=Infinity) {
  const p=normalizePatch(input), master=ctx.createGain();
  const fade=Math.min(p.fadeSeconds,Number.isFinite(duration)?duration/2:p.fadeSeconds);
  master.gain.setValueAtTime(0,when);
  master.gain.linearRampToValueAtTime(p.volume,when+fade);
  if(Number.isFinite(duration)) {
    master.gain.setValueAtTime(p.volume,when+duration-fade);
    master.gain.linearRampToValueAtTime(0,when+duration);
  }
  master.connect(destination);
  const gain = (value,dest) => { const g=ctx.createGain();g.gain.value=value;g.connect(dest);return g; };
  const binauralGain=gain(p.binauralGain,master),solfeggioGain=gain(p.solfeggioGain,master),noiseGain=gain(p.noiseAmount,master);
  const leftPan=ctx.createStereoPanner(),rightPan=ctx.createStereoPanner();leftPan.pan.value=-1;rightPan.pan.value=1;
  leftPan.connect(binauralGain);rightPan.connect(binauralGain);
  const leftGain=gain(p.leftGain,leftPan),rightGain=gain(p.rightGain,rightPan);
  const oscillator = (hz,dest) => { const osc=ctx.createOscillator();osc.type='sine';osc.frequency.value=hz;osc.connect(dest);return osc; };
  const leftOsc=oscillator(p.leftHz,leftGain),rightOsc=oscillator(p.rightHz,rightGain),solOsc=oscillator(p.solfeggioHz,solfeggioGain);
  const lfoGain=gain(p.modulation*p.solfeggioGain*.5,solfeggioGain.gain),lfo=oscillator(p.modSpeed,lfoGain);
  const binLfoL=gain(p.beatDrift,leftOsc.frequency),binLfoR=gain(-p.beatDrift,rightOsc.frequency);
  const binLfo=oscillator(p.beatDriftSpeed,binLfoL);binLfo.connect(binLfoR);
  const noiseSrc=ctx.createBufferSource();noiseSrc.buffer=makeNoiseBuffer(ctx,p.noiseType);noiseSrc.loop=true;noiseSrc.connect(noiseGain);
  const nodes=[leftOsc,rightOsc,solOsc,lfo,noiseSrc,binLfo];
  nodes.forEach(n=>{n.start(when);if(Number.isFinite(duration))n.stop(when+duration);});
  return {nodes,gains:{master,binauralGain,solfeggioGain,noiseGain,leftGain,rightGain,lfoGain,binLfoL,binLfoR},patch:p};
}

function compressor(ctx) {
  const c=ctx.createDynamicsCompressor();c.threshold.value=-6;c.knee.value=6;c.ratio.value=8;c.attack.value=.003;c.release.value=.25;return c;
}

export class NanookAudioEngine {
  constructor() {
    this.ctx=null;this.nodes=[];this.gains={};this.state='idle';this.currentPatch=null;
    this.endTimer=null;this.fadeOutTimer=null;this.stageRunner=null;this.startedAt=0;
    this.onEnd=null;this.onError=null;this._runId=0;this._programId=0;
  }
  static supported(){return !!(window.AudioContext||window.webkitAudioContext);}
  async start(input) {
    const run=++this._runId;this._teardownNow();
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error('Este navegador no ofrece Web Audio.');
    const ctx=new AC();this.ctx=ctx;this.state='starting';
    try {
      if(ctx.state==='suspended')await ctx.resume();
      if(run!==this._runId||ctx.state==='closed'){await ctx.close().catch(()=>{});return false;}
      if(ctx.state!=='running')throw new Error('El navegador no permitió activar el audio. Pulsa Iniciar nuevamente.');
      try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
      const p=normalizePatch(input),comp=compressor(ctx);this.compressor=comp;
      // A stream-backed element supports media controls where the browser permits it.
      let stream;
      try {
        stream=ctx.createMediaStreamDestination();
        const el=document.createElement('audio');el.setAttribute('playsinline','');el.srcObject=stream.stream;el.hidden=true;
        document.body.appendChild(el);this._streamEl=el;await el.play();
        if(run!==this._runId){el.pause();el.remove();return false;}
        comp.connect(stream);
      } catch {
        this._streamEl?.remove();this._streamEl=null;comp.connect(ctx.destination);
      }
      if(run!==this._runId)return false;
      const now=ctx.currentTime+.025;
      const graph=createSynthesisGraph(ctx,p,comp,now);
      this.nodes=graph.nodes;this.gains=graph.gains;this.master=graph.gains.master;this.currentPatch=p;
      const analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.85;
      this.master.connect(analyser);this.analyser=analyser;
      this.startedAt=now;this.state='playing';
      window._nanookAudioCtx=ctx;
      this._onVis=()=>{if(document.visibilityState==='visible'&&this.state==='playing'){ctx.resume().catch(()=>{});this._streamEl?.play().catch(()=>{});}};
      document.addEventListener('visibilitychange',this._onVis);
      this._scheduleEnd(p.sessionMinutes);
      this._setupMediaSession(p);
      return true;
    } catch(error) {
      if(run===this._runId)this._teardownNow();
      else await ctx.close().catch(()=>{});
      throw error;
    }
  }
  _scheduleEnd(minutes) {
    clearTimeout(this.endTimer);this.endTimer=null;
    if(minutes<=0||!this.ctx)return;
    const remaining=Math.max(0,minutes*60-this.elapsedSeconds());
    this.endTimer=setTimeout(()=>this.stop(true,'completed'),remaining*1000);
  }
  setLive(input) {
    if(this.state!=='playing'||!this.ctx)return;
    const p=normalizePatch({...this.currentPatch,...input}),g=this.gains,now=this.ctx.currentTime,ramp=.06;
    const [l,r,s,lfo,,drift]=this.nodes;
    l.frequency.setTargetAtTime(p.leftHz,now,ramp);r.frequency.setTargetAtTime(p.rightHz,now,ramp);s.frequency.setTargetAtTime(p.solfeggioHz,now,ramp);
    lfo.frequency.setTargetAtTime(p.modSpeed,now,ramp);drift.frequency.setTargetAtTime(p.beatDriftSpeed,now,ramp);
    for(const [key,value] of Object.entries({binauralGain:p.binauralGain,solfeggioGain:p.solfeggioGain,noiseGain:p.noiseAmount,leftGain:p.leftGain,rightGain:p.rightGain,lfoGain:p.modulation*p.solfeggioGain*.5,binLfoL:p.beatDrift,binLfoR:-p.beatDrift}))g[key].gain.setTargetAtTime(value,now,ramp);
    if(p.volume!==this.currentPatch.volume){g.master.gain.cancelScheduledValues(now);g.master.gain.setTargetAtTime(p.volume,now,.12);}
    if(p.sessionMinutes!==this.currentPatch.sessionMinutes)this._scheduleEnd(p.sessionMinutes);
    if(p.noiseType!==this.currentPatch.noiseType)this.swapNoise(p.noiseType);
    this.currentPatch=p;
  }
  swapNoise(type) {
    if(this.state!=='playing'||!this.ctx||type===this.currentPatch.noiseType)return;
    const old=this.nodes[4],next=this.ctx.createBufferSource();next.buffer=makeNoiseBuffer(this.ctx,type);next.loop=true;next.connect(this.gains.noiseGain);next.start();
    try{old.stop();old.disconnect();}catch{}
    this.nodes[4]=next;this.currentPatch={...this.currentPatch,noiseType:type};
  }
  async runProgram(stages,carrier,noise,noiseType,volume,onStageChange,onComplete) {
    if(!Array.isArray(stages)||!stages.length)throw new Error('El programa no tiene etapas.');
    this.stop(false);this._teardownNow();
    const program=++this._programId;
    let i=0;
    const run=async()=>{
      if(program!==this._programId)return;
      if(i>=stages.length){this.stop(true,'program-completed');onComplete?.();return;}
      const s=stages[i];
      const patch={carrierHz:carrier,leftHz:carrier-s.beatHz/2,rightHz:carrier+s.beatHz/2,beatHz:s.beatHz,solfeggioHz:s.solfeggioHz,noiseAmount:noise,noiseType,volume,sessionMinutes:0,modulation:s.modulation??.2,modSpeed:s.modSpeed??.08,...s.patchOverride};
      try {
        if(this.state==='idle'){if(!await this.start(patch))return;}else this.setLive(patch);
        if(program!==this._programId){this.stop(false);return;}
        onStageChange?.(i,s);i++;
        this.stageRunner=setTimeout(run,s.durationMin*60000);
      } catch(error){this.stop(false);this.onError?.(error);}
    };
    await run();
  }
  stop(graceful=true,reason='stopped') {
    ++this._runId;++this._programId;
    clearTimeout(this.endTimer);clearTimeout(this.stageRunner);clearTimeout(this.fadeOutTimer);
    this.endTimer=null;this.stageRunner=null;
    if(!this.ctx||this.state==='idle'){this._teardownNow();return;}
    this.state='stopping';const ctx=this.ctx,fade=graceful?(this.currentPatch?.fadeSeconds||2):.03;
    try{const g=this.gains.master?.gain;if(g){g.cancelScheduledValues(ctx.currentTime);g.setValueAtTime(g.value,ctx.currentTime);g.linearRampToValueAtTime(0,ctx.currentTime+fade);}}catch{}
    const run=this._runId;
    this.fadeOutTimer=setTimeout(()=>{if(run!==this._runId)return;this._teardownNow();this.onEnd?.(reason);},fade*1000+30);
  }
  _setupMediaSession(p) {
    if(!navigator.mediaSession)return;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:p.name||'Sesión binaural',artist:'BINAURAL SYSTEM'});
      navigator.mediaSession.playbackState='playing';
      for(const key of ['pause','stop'])navigator.mediaSession.setActionHandler(key,()=>window._binauralTransport?.stop());
    }catch{}
  }
  _teardownNow() {
    clearTimeout(this.endTimer);clearTimeout(this.fadeOutTimer);clearTimeout(this.stageRunner);
    this.endTimer=this.fadeOutTimer=this.stageRunner=null;
    if(this._onVis)document.removeEventListener('visibilitychange',this._onVis);this._onVis=null;
    this.nodes.forEach(n=>{try{n.stop();n.disconnect();}catch{}});
    try{this.master?.disconnect();this.compressor?.disconnect();}catch{}
    try{this._streamEl?.pause();this._streamEl?.remove();}catch{}this._streamEl=null;
    if(this.ctx){if(window._nanookAudioCtx===this.ctx)window._nanookAudioCtx=null;this.ctx.close().catch(()=>{});}
    this.ctx=null;this.nodes=[];this.gains={};this.master=null;this.compressor=null;this.analyser=null;this.state='idle';
    try{if(navigator.mediaSession){navigator.mediaSession.playbackState='none';for(const k of ['pause','stop'])navigator.mediaSession.setActionHandler(k,null);}}catch{}
  }
  setDuckBoost(){ /* Browser speech volume remains under operating-system control. */ }
  getAnalyser(){return this.analyser;}
  getContext(){return this.ctx;}
  elapsedSeconds(){return this.ctx&&this.state==='playing'?Math.max(0,this.ctx.currentTime-this.startedAt):0;}
  dispose(){++this._runId;++this._programId;this._teardownNow();}
}

export async function renderPatchToWav(input,seconds=30) {
  const p=normalizePatch(input),sr=44100,duration=clamp(seconds,.25,600,30);
  const OC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!OC)throw new Error('Este navegador no permite exportar audio sin conexión.');
  const ctx=new OC(2,Math.round(sr*duration),sr),comp=compressor(ctx);comp.connect(ctx.destination);
  createSynthesisGraph(ctx,p,comp,0,duration);
  return audioBufferToWav(await ctx.startRendering());
}
export function audioBufferToWav(buffer) {
  const channels=buffer.numberOfChannels,length=buffer.length,sr=buffer.sampleRate,bytes=44+length*channels*2;
  const data=new ArrayBuffer(bytes),view=new DataView(data),write=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,bytes-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,sr,true);view.setUint32(28,sr*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,bytes-44,true);
  const arrays=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));let at=44;
  for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const sample=Math.max(-1,Math.min(1,arrays[c][i]));view.setInt16(at,sample<0?sample*32768:sample*32767,true);at+=2;}
  return new Blob([data],{type:'audio/wav'});
}
window.NanookAudioEngine=NanookAudioEngine;
window.renderPatchToWav=renderPatchToWav;
