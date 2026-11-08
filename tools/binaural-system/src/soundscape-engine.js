/* ============================================================
   NANOOK RESET — Soundscape Engine v2
   Paisajes sonoros por sintesis WebAudio pura. Sin samples.
   v2: reverb por convolución, formantes vocales, parciales
   inarmónicos con batimiento, eventos irregulares (no LFOs
   perfectos), espacialización estéreo.
   ============================================================ */

class SoundscapeEngine {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this._unsupported = true; return; }
    this._AC    = AC;
    this.ctx    = null;
    this.nodes  = [];
    this.timers = [];
    this.active = null;
    this.output = null;
  }

  _ensureCtx() {
    if (this.ctx) return true;
    try {
      this.ctx = new this._AC();
      this.output = this.ctx.createGain();
      this.output.gain.value = 0;
      this.output.connect(this.ctx.destination);
      return true;
    } catch { return false; }
  }

  connect(dest) { return this; }

  setVolume(v, fade = 0.8) {
    if (!this.ctx || !this.output) return;
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), now, fade / 3);
  }

  _clearNodes() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this.nodes.forEach(n => {
      try { n.stop?.(); } catch {}
      try { n.disconnect?.(); } catch {}
    });
    this.nodes = [];
  }

  stop(graceful = true) {
    clearTimeout(this._stopTimer);
    this.active = null;
    if (!this.ctx || !this.output) { this._clearNodes(); return; }
    if (graceful) {
      const now = this.ctx.currentTime;
      this.output.gain.cancelScheduledValues(now);
      this.output.gain.setTargetAtTime(0, now, 0.8);
      this._stopTimer=setTimeout(() => this._clearNodes(), 2500);
    } else {
      this.output.gain.value = 0;
      this._clearNodes();
    }
  }

  play(type, vol = 0.35) {
    clearTimeout(this._stopTimer);
    if (this._unsupported) return;
    if (!this._ensureCtx()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
    if (this.active === type) { this.setVolume(vol); return; }
    this._clearNodes();
    this.output.gain.value = 0;
    this.active = type;
    const builders = {
      ocean:this._ocean, rain:this._rain, wind:this._wind, forest:this._forest,
      om:this._om, bowls:this._bowls, gregorian:this._gregorian,
      shaman:this._shaman, overtone:this._overtone,
    };
    if (builders[type]) builders[type].call(this);
    this.timers.push(setTimeout(() => this.setVolume(vol, 2), 30));
  }

  // ── Utilidades básicas ───────────────────────────────────────
  _noise(type = 'white') {
    const ctx = this.ctx;
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < len; i++) {
        const w = Math.random()*2-1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
      }
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        d[i] = (last + 0.02*(Math.random()*2-1)) / 1.02;
        last = d[i]; d[i] *= 3.5;
        if (d[i] >  1) d[i] =  1;
        if (d[i] < -1) d[i] = -1;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    return src;
  }

  _filt(type, freq, Q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = Q; return f;
  }

  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  _lfo(freq, type = 'sine') {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq; return o;
  }

  _dc(offset) {
    const c = this.ctx.createConstantSource();
    c.offset.value = offset; return c;
  }

  _pan(v) {
    if (!this.ctx.createStereoPanner) return this._gain(1);
    const p = this.ctx.createStereoPanner(); p.pan.value = v; return p;
  }

  _push(...nodes) { this.nodes.push(...nodes); }

  _timer(fn, ms) {
    const id = setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  }

  /* ── Reverb por convolución (impulso sintético) ──────────────
     seconds: cola del espacio. decay: caída exponencial.
     Devuelve un GainNode de ENTRADA al bus de reverb; el wet ya
     está conectado al output. Conectar fuentes con .connect(bus). */
  _reverb(seconds = 3.2, decay = 2.8, wet = 0.35) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const impulse = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // ruido decreciente + densidad temprana (early reflections)
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = impulse;
    const bus  = this._gain(1.0);
    const wetG = this._gain(wet);
    // tono de la cola: catedral = oscura
    const tone = this._filt('lowpass', 3200, 0.5);
    bus.connect(conv); conv.connect(tone); tone.connect(wetG); wetG.connect(this.output);
    this._push(bus, conv, tone, wetG);
    return bus;
  }

  /* ── Voz por formantes ───────────────────────────────────────
     Crea una "voz" cantando una vocal: sawtooth filtrado por
     3 bandpass en las formantes de la vocal. Devuelve { osc, out, voiceG }. */
  _formantVoice(freq, vowel = 'o', level = 0.1) {
    const ctx = this.ctx;
    // Formantes (Hz): [F1, F2, F3] y ganancias relativas
    const VOWELS = {
      a: [[800, 1.0], [1150, 0.50], [2900, 0.12]],
      o: [[450, 1.0], [800,  0.45], [2830, 0.08]],
      u: [[325, 1.0], [700,  0.35], [2530, 0.06]],
      m: [[250, 1.0], [900,  0.15], [2200, 0.03]],  // boca cerrada (mmm)
    };
    const fmts = VOWELS[vowel] || VOWELS.o;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const out = this._gain(level);
    fmts.forEach(([fHz, amp]) => {
      const bp = this._filt('bandpass', fHz, 9);
      const g  = this._gain(amp);
      osc.connect(bp); bp.connect(g); g.connect(out);
      this._push(bp, g);
    });
    // Aliento: ruido suave filtrado en la primera formante
    const breath = this._noise('pink');
    const bF = this._filt('bandpass', fmts[0][0], 2);
    const bG = this._gain(0.012);
    breath.connect(bF); bF.connect(bG); bG.connect(out);
    breath.start();
    // Drift de afinación humano (lento, irregular: 2 LFOs sumados)
    const d1 = this._lfo(0.13); const d1g = this._gain(freq * 0.004);
    const d2 = this._lfo(0.071); const d2g = this._gain(freq * 0.003);
    d1.connect(d1g); d1g.connect(osc.frequency);
    d2.connect(d2g); d2g.connect(osc.frequency);
    d1.start(); d2.start();
    // Vibrato sutil
    const vib = this._lfo(4.5 + Math.random()); const vg = this._gain(freq * 0.006);
    vib.connect(vg); vg.connect(osc.frequency); vib.start();
    osc.start();
    this._push(osc, out, breath, bF, bG, d1, d1g, d2, d2g, vib, vg);
    return { osc, out };
  }

  // ── OCEAN — olas irregulares programadas ─────────────────────
  _ocean() {
    const o = this.output, ctx = this.ctx, self = this;

    // Fondo profundo constante: el cuerpo del mar
    const deep   = this._noise('brown');
    const deepLPF= this._filt('lowpass', 180, 0.7);
    const deepG  = this._gain(0.5);
    deep.connect(deepLPF); deepLPF.connect(deepG); deepG.connect(o);
    deep.start(); this._push(deep, deepLPF, deepG);

    // Sub-grave del fondo marino (45 Hz, muy sutil)
    const sub = ctx.createOscillator();
    const subG = this._gain(0.05);
    sub.type = 'sine'; sub.frequency.value = 45;
    sub.connect(subG); subG.connect(o); sub.start();
    const subLFO = this._lfo(0.04); const subMod = this._gain(0.02);
    subLFO.connect(subMod); subMod.connect(subG.gain); subLFO.start();
    this._push(sub, subG, subLFO, subMod);

    // Capa de oleaje: cada ola es un evento programado con envolvente propia
    const surf    = this._noise('pink');
    const surfHPF = this._filt('highpass', 90);
    const surfBPF = this._filt('bandpass', 520, 0.4);
    const surfG   = this._gain(0);
    const surfPan = this._pan(0);
    surf.connect(surfHPF); surfHPF.connect(surfBPF); surfBPF.connect(surfG);
    surfG.connect(surfPan); surfPan.connect(o);
    surf.start(); this._push(surf, surfHPF, surfBPF, surfG, surfPan);

    // Espuma post-rompiente
    const foam   = this._noise('white');
    const foamHP = this._filt('highpass', 2400);
    const foamG  = this._gain(0);
    foam.connect(foamHP); foamHP.connect(foamG); foamG.connect(o);
    foam.start(); this._push(foam, foamHP, foamG);

    function scheduleWave() {
      if (self.active !== 'ocean') return;
      const period = 8 + Math.random() * 6;          // 8-14s por ola — irregular
      const t0  = ctx.currentTime + 0.1;
      const rise = period * (0.35 + Math.random() * 0.1);
      const peak = 0.26 + Math.random() * 0.18;      // cada ola con fuerza distinta
      // Subida lenta, rompiente, retirada
      surfG.gain.cancelScheduledValues(t0);
      surfG.gain.setValueAtTime(surfG.gain.value, t0);
      surfG.gain.linearRampToValueAtTime(peak, t0 + rise);
      surfG.gain.exponentialRampToValueAtTime(0.04, t0 + period * 0.92);
      // La ola viaja en el estéreo
      try {
        surfPan.pan.cancelScheduledValues(t0);
        surfPan.pan.setValueAtTime((Math.random()*2-1) * 0.5, t0);
        surfPan.pan.linearRampToValueAtTime((Math.random()*2-1) * 0.5, t0 + period);
      } catch {}
      // Espuma justo después del pico
      foamG.gain.cancelScheduledValues(t0);
      foamG.gain.setValueAtTime(0.001, t0 + rise * 0.9);
      foamG.gain.linearRampToValueAtTime(peak * 0.22, t0 + rise + 0.6);
      foamG.gain.exponentialRampToValueAtTime(0.001, t0 + period * 0.85);
      self._timer(scheduleWave, (period * 0.85) * 1000);
    }
    scheduleWave();
  }

  // ── RAIN — fondo + gotas individuales + chubascos ────────────
  _rain() {
    const o = this.output, ctx = this.ctx, self = this;

    // Cuerpo: white noise filtrado — la "cortina" de lluvia
    const rain   = this._noise('white');
    const bpf    = this._filt('bandpass', 3200, 0.28);
    const lpf    = this._filt('lowpass', 7500);
    const rG     = this._gain(0.22);
    rain.connect(bpf); bpf.connect(lpf); lpf.connect(rG); rG.connect(o);
    rain.start(); this._push(rain, bpf, lpf, rG);

    // Fondo grave (lluvia sobre tierra/techo lejano)
    const bg   = this._noise('pink');
    const bgLPF= this._filt('lowpass', 800);
    const bgG  = this._gain(0.10);
    bg.connect(bgLPF); bgLPF.connect(bgG); bgG.connect(o);
    bg.start(); this._push(bg, bgLPF, bgG);

    // Chubascos: la intensidad varía lentamente y de forma irregular
    function scheduleIntensity() {
      if (self.active !== 'rain') return;
      const t0 = ctx.currentTime;
      const target = 0.14 + Math.random() * 0.20;    // 0.14-0.34
      const dur = 12 + Math.random() * 20;           // transición de 12-32s
      rG.gain.cancelScheduledValues(t0);
      rG.gain.setValueAtTime(rG.gain.value, t0);
      rG.gain.linearRampToValueAtTime(target, t0 + dur);
      self._timer(scheduleIntensity, dur * 1000);
    }
    scheduleIntensity();

    // Gotas individuales cercanas (transientes resonantes)
    function scheduleDrop() {
      if (self.active !== 'rain') return;
      const delay = 0.15 + Math.random() * 0.8;
      const t = ctx.currentTime + delay;
      const hz = 800 + Math.random() * 2600;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const pan = self._pan((Math.random()*2-1) * 0.7);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, t);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.6, t + 0.025);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.018 + Math.random() * 0.025, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0008, t + 0.05 + Math.random() * 0.05);
      osc.connect(env); env.connect(pan); pan.connect(o);
      osc.start(t); osc.stop(t + 0.13);
      self.nodes.push(osc, env, pan);
      self._timer(scheduleDrop, delay * 1000);
    }
    scheduleDrop();

    // Goteo grave ocasional (canaleta, charco grande)
    function scheduleDrip() {
      if (self.active !== 'rain') return;
      const delay = 2.5 + Math.random() * 6;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320 + Math.random() * 120, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.07);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.05, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(env); env.connect(o);
      osc.start(t); osc.stop(t + 0.3);
      self.nodes.push(osc, env);
      self._timer(scheduleDrip, delay * 1000);
    }
    scheduleDrip();
  }

  // ── WIND — ráfagas con barrido de filtro resonante ──────────
  _wind() {
    const o = this.output, ctx = this.ctx, self = this;

    // Cuerpo: pink noise con filtro resonante que barre — el "aullido"
    const wind  = this._noise('pink');
    const hpf   = this._filt('highpass', 100);
    const swp   = this._filt('bandpass', 600, 2.2);   // resonante: da el carácter
    const lpf   = this._filt('lowpass', 1800);
    const wG    = this._gain(0.18);
    wind.connect(hpf); hpf.connect(swp); swp.connect(lpf); lpf.connect(wG); wG.connect(o);
    wind.start(); this._push(wind, hpf, swp, lpf, wG);

    // Capa base sin resonancia (cuerpo constante)
    const base  = this._noise('pink');
    const bLPF  = this._filt('lowpass', 900);
    const bG    = this._gain(0.10);
    base.connect(bLPF); bLPF.connect(bG); bG.connect(o);
    base.start(); this._push(base, bLPF, bG);

    // Ráfagas programadas: amplitud + barrido de la resonancia juntos
    function scheduleGust() {
      if (self.active !== 'wind') return;
      const period = 5 + Math.random() * 9;
      const t0 = ctx.currentTime + 0.1;
      const strength = 0.15 + Math.random() * 0.30;
      const rise = period * (0.3 + Math.random() * 0.2);
      // Amplitud
      wG.gain.cancelScheduledValues(t0);
      wG.gain.setValueAtTime(wG.gain.value, t0);
      wG.gain.linearRampToValueAtTime(strength, t0 + rise);
      wG.gain.linearRampToValueAtTime(0.10, t0 + period * 0.95);
      // El filtro sube con la fuerza (el aullido sube de tono)
      swp.frequency.cancelScheduledValues(t0);
      swp.frequency.setValueAtTime(swp.frequency.value, t0);
      swp.frequency.linearRampToValueAtTime(500 + strength * 2200, t0 + rise);
      swp.frequency.linearRampToValueAtTime(450 + Math.random() * 250, t0 + period * 0.95);
      // Silbido agudo solo en ráfagas fuertes
      if (strength > 0.32) {
        const sil = ctx.createOscillator();
        const sEnv = ctx.createGain();
        sil.type = 'sine';
        sil.frequency.setValueAtTime(2400 + Math.random() * 900, t0 + rise * 0.7);
        sil.frequency.linearRampToValueAtTime(1900 + Math.random() * 500, t0 + rise + 2);
        sEnv.gain.setValueAtTime(0, t0 + rise * 0.7);
        sEnv.gain.linearRampToValueAtTime(0.012, t0 + rise);
        sEnv.gain.exponentialRampToValueAtTime(0.0008, t0 + rise + 2.5);
        sil.connect(sEnv); sEnv.connect(o);
        sil.start(t0 + rise * 0.7); sil.stop(t0 + rise + 3);
        self.nodes.push(sil, sEnv);
      }
      self._timer(scheduleGust, period * 900);
    }
    scheduleGust();
  }

  // ── FOREST — pájaros FM con distancia + hojas + grillos ─────
  _forest() {
    const o = this.output, ctx = this.ctx, self = this;

    // Fondo: ambiente grave del bosque
    const bg   = this._noise('brown');
    const bgLPF= this._filt('lowpass', 450);
    const bgG  = this._gain(0.15);
    bg.connect(bgLPF); bgLPF.connect(bgG); bgG.connect(o);
    bg.start(); this._push(bg, bgLPF, bgG);

    // Hojas: ruido filtrado con ráfagas suaves de brisa
    const leaves = this._noise('white');
    const lvBPF  = this._filt('bandpass', 4500, 0.5);
    const lvG    = this._gain(0.015);
    leaves.connect(lvBPF); lvBPF.connect(lvG); lvG.connect(o);
    leaves.start(); this._push(leaves, lvBPF, lvG);
    function scheduleBreeze() {
      if (self.active !== 'forest') return;
      const period = 6 + Math.random() * 10;
      const t0 = ctx.currentTime + 0.1;
      const peak = 0.02 + Math.random() * 0.05;
      lvG.gain.cancelScheduledValues(t0);
      lvG.gain.setValueAtTime(lvG.gain.value, t0);
      lvG.gain.linearRampToValueAtTime(peak, t0 + period * 0.4);
      lvG.gain.linearRampToValueAtTime(0.012, t0 + period * 0.95);
      self._timer(scheduleBreeze, period * 950);
    }
    scheduleBreeze();

    // Grillo grave de fondo (pulsos regulares suaves)
    const cricket = ctx.createOscillator();
    const crEnv   = this._gain(0);
    const crPulse = this._lfo(11, 'square');
    const crMod   = this._gain(0.006);
    const crDC    = this._dc(0.006);
    cricket.type = 'sine'; cricket.frequency.value = 4200;
    crPulse.connect(crMod); crMod.connect(crEnv.gain);
    crDC.connect(crEnv.gain);
    cricket.connect(crEnv); crEnv.connect(o);
    cricket.start(); crPulse.start(); crDC.start();
    this._push(cricket, crEnv, crPulse, crMod, crDC);

    // Pájaros: FM de 2 osciladores, con distancia variable
    function scheduleBird() {
      if (self.active !== 'forest') return;
      const delay  = 2 + Math.random() * 7;
      const t0     = ctx.currentTime + delay;
      const dist   = Math.random();                    // 0 = cerca, 1 = lejos
      const baseHz = 1800 + Math.random() * 1700;
      const chirps = 2 + Math.floor(Math.random() * 5);
      const pan    = self._pan((Math.random()*2-1) * 0.8);
      const distF  = self._filt('lowpass', 6000 - dist * 3800);
      const distG  = self._gain(1 - dist * 0.75);
      distF.connect(distG); distG.connect(pan); pan.connect(o);
      self.nodes.push(distF, distG, pan);

      for (let c = 0; c < chirps; c++) {
        const dur = 0.05 + Math.random() * 0.12;
        const t   = t0 + c * (dur + 0.05 + Math.random() * 0.08);
        const hz  = baseHz * (0.9 + Math.random() * 0.2);
        // Portadora + modulador FM = trino orgánico
        const car = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const mG  = ctx.createGain();
        const env = ctx.createGain();
        car.type = 'sine'; mod.type = 'sine';
        car.frequency.setValueAtTime(hz, t);
        car.frequency.exponentialRampToValueAtTime(hz * (1.05 + Math.random() * 0.25), t + dur * 0.5);
        car.frequency.exponentialRampToValueAtTime(hz * (0.85 + Math.random() * 0.15), t + dur);
        mod.frequency.value = 40 + Math.random() * 90;   // velocidad del trino
        mG.gain.value = hz * (0.05 + Math.random() * 0.12); // profundidad FM
        mod.connect(mG); mG.connect(car.frequency);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.03, t + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
        car.connect(env); env.connect(distF);
        car.start(t); car.stop(t + dur + 0.02);
        mod.start(t); mod.stop(t + dur + 0.02);
        self.nodes.push(car, mod, mG, env);
      }
      self._timer(scheduleBird, delay * 1000);
    }
    scheduleBird();
  }

  // ── OM / AUM — voz humana por formantes (136.1 Hz) ──────────
  _om() {
    const o = this.output, ctx = this.ctx, self = this;
    const fundamental = 136.1;
    const rev = this._reverb(3.5, 2.6, 0.40);

    // 3 voces: la principal en "o", dos de soporte en "m" (boca cerrada)
    const v1 = this._formantVoice(fundamental, 'o', 0.30);
    const v2 = this._formantVoice(fundamental * 0.998, 'm', 0.18);
    const v3 = this._formantVoice(fundamental * 1.003, 'm', 0.14);
    // Quinta por encima, muy sutil (resonancia de garganta)
    const v4 = this._formantVoice(fundamental * 1.5, 'u', 0.05);

    [v1, v2, v3, v4].forEach(v => { v.out.connect(o); v.out.connect(rev); });

    // Respiración: ciclo irregular 6-9s — sube, sostiene, baja, silencio corto
    const master = this._gain(0);
    // re-rutear: las voces pasan por master
    [v1, v2, v3, v4].forEach(v => {
      try { v.out.disconnect(); } catch {}
      v.out.connect(master);
    });
    master.connect(o); master.connect(rev);
    this._push(master);

    function breathCycle() {
      if (self.active !== 'om') return;
      const t0 = ctx.currentTime + 0.05;
      const inhale  = 0.8 + Math.random() * 0.5;   // pausa para "respirar"
      const attack  = 1.2 + Math.random() * 0.8;
      const sustain = 3.5 + Math.random() * 2.5;
      const release = 1.5 + Math.random() * 1.0;
      master.gain.cancelScheduledValues(t0);
      master.gain.setValueAtTime(master.gain.value, t0);
      master.gain.linearRampToValueAtTime(0.02, t0 + inhale);
      master.gain.linearRampToValueAtTime(1.0, t0 + inhale + attack);
      master.gain.setValueAtTime(1.0, t0 + inhale + attack + sustain);
      master.gain.linearRampToValueAtTime(0.04, t0 + inhale + attack + sustain + release);
      self._timer(breathCycle, (inhale + attack + sustain + release) * 1000);
    }
    breathCycle();
  }

  // ── CUENCOS TIBETANOS — parciales medidos + batimiento + reverb ──
  _bowls() {
    const o = this.output, ctx = this.ctx, self = this;
    const rev = this._reverb(4.5, 2.4, 0.45);
    const strikeFreqs = [432, 528, 396, 288];

    // Parciales de cuenco real (medidos): ratio, amplitud, decay relativo
    const PARTIALS = [
      [1.000, 1.00, 1.00], [2.710, 0.55, 0.85], [5.180, 0.32, 0.62],
      [8.400, 0.18, 0.45], [12.10, 0.10, 0.32], [16.30, 0.06, 0.22],
      [1.003, 0.60, 1.00], [2.718, 0.30, 0.85],   // duplicados desafinados → batimiento
    ];

    function strikeBowl(baseHz, when, strength) {
      const t0 = when;
      const baseDecay = 9 + Math.random() * 5;

      // Transiente del mazo: burst de ruido metálico
      const tick = self._noise('white');
      const tickBP = self._filt('bandpass', baseHz * 6, 3);
      const tickG  = ctx.createGain();
      tickG.gain.setValueAtTime(0, t0);
      tickG.gain.linearRampToValueAtTime(strength * 0.10, t0 + 0.003);
      tickG.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.08);
      tick.connect(tickBP); tickBP.connect(tickG);
      tickG.connect(o); tickG.connect(rev);
      tick.start(t0); tick.stop(t0 + 0.12);
      self.nodes.push(tick, tickBP, tickG);

      // Parciales
      PARTIALS.forEach(([ratio, amp, decayMul]) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        // ligeras variaciones por golpe — ningún cuenco suena 2 veces igual
        osc.frequency.value = baseHz * ratio * (1 + (Math.random() - 0.5) * 0.002);
        const peak = strength * amp * 0.10;
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(peak, t0 + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0004, t0 + baseDecay * decayMul);
        osc.connect(env);
        env.connect(o); env.connect(rev);
        osc.start(t0); osc.stop(t0 + baseDecay + 1);
        self.nodes.push(osc, env);
      });
    }

    function scheduleBowl() {
      if (self.active !== 'bowls') return;
      const delay = 5 + Math.random() * 9;
      const baseHz = strikeFreqs[Math.floor(Math.random() * strikeFreqs.length)];
      strikeBowl(baseHz, ctx.currentTime + delay, 0.7 + Math.random() * 0.5);
      self._timer(scheduleBowl, delay * 1000);
    }

    // Primer golpe pronto, para que se oiga al activar
    strikeBowl(432, ctx.currentTime + 0.8, 0.9);
    scheduleBowl();

    // Drone de fondo: cuenco "frotado" — 2 osciladores con batimiento lento
    const d1 = ctx.createOscillator(); const d2 = ctx.createOscillator();
    const dG = this._gain(0.028);
    d1.type = 'sine'; d1.frequency.value = 432;
    d2.type = 'sine'; d2.frequency.value = 433.3;   // batimiento de 1.3 Hz
    d1.connect(dG); d2.connect(dG);
    dG.connect(o); dG.connect(rev);
    d1.start(); d2.start();
    this._push(d1, d2, dG);
  }

  // ── GREGORIANO — voces formantes + melodía modal + catedral ──
  _gregorian() {
    const o = this.output, ctx = this.ctx, self = this;
    const rev = this._reverb(5.5, 2.2, 0.55);   // catedral grande

    // Modo dorio sobre D3 (146.83 Hz): D, F, G, A, C
    const SCALE = [146.83, 174.61, 196.00, 220.00, 261.63];
    const voices = [];

    // 4 voces, cada una con su propio "cantor"
    for (let i = 0; i < 4; i++) {
      const vowels = ['o', 'a', 'u', 'o'];
      const v = this._formantVoice(SCALE[0] * (1 + (Math.random() - 0.5) * 0.004),
        vowels[i], 0.10 + (i === 0 ? 0.05 : 0));
      const vMaster = this._gain(0);
      try { v.out.disconnect(); } catch {}
      v.out.connect(vMaster);
      vMaster.connect(o); vMaster.connect(rev);
      this._push(vMaster);
      voices.push({ ...v, master: vMaster, note: 0 });
    }

    // Cada voz se mueve lentamente por la escala — frases con respiración
    function voicePhrase(vi) {
      if (self.active !== 'gregorian') return;
      const v = voices[vi];
      const t0 = ctx.currentTime + 0.05;
      const breathe = 0.5 + Math.random() * 1.5;
      const attack  = 0.8 + Math.random() * 0.6;
      const hold    = 4 + Math.random() * 5;
      const release = 1.2 + Math.random() * 0.8;

      // Movimiento melódico: paso a nota vecina (mayormente) o salto
      const step = Math.random() < 0.7
        ? (Math.random() < 0.5 ? -1 : 1)
        : (Math.random() < 0.5 ? -2 : 2);
      v.note = Math.max(0, Math.min(SCALE.length - 1, v.note + step));
      const targetHz = SCALE[v.note] * (1 + (Math.random() - 0.5) * 0.004);

      // Glissando suave hacia la nota nueva (como voz real)
      v.osc.frequency.cancelScheduledValues(t0);
      v.osc.frequency.setValueAtTime(v.osc.frequency.value, t0 + breathe);
      v.osc.frequency.linearRampToValueAtTime(targetHz, t0 + breathe + 0.35);

      // Envolvente de la frase
      v.master.gain.cancelScheduledValues(t0);
      v.master.gain.setValueAtTime(v.master.gain.value, t0);
      v.master.gain.linearRampToValueAtTime(0.02, t0 + breathe);
      v.master.gain.linearRampToValueAtTime(1.0, t0 + breathe + attack);
      v.master.gain.setValueAtTime(1.0, t0 + breathe + attack + hold);
      v.master.gain.linearRampToValueAtTime(0.05, t0 + breathe + attack + hold + release);

      self._timer(() => voicePhrase(vi), (breathe + attack + hold + release) * 1000);
    }
    // Entradas escalonadas — el coro no empieza junto
    voices.forEach((_, i) => this._timer(() => voicePhrase(i), i * 2200));
  }

  // ── TAMBOR CHAMANICO — golpes humanos con jitter + acentos ──
  _shaman() {
    const o = this.output, ctx = this.ctx, self = this;
    const rev = this._reverb(2.2, 3.2, 0.22);   // espacio: carpa / kiva
    const tempoBPM = 200 + Math.random() * 40;  // 3.3-4 Hz aprox
    const beatSec  = 60 / tempoBPM;
    let beatCount = 0;

    function drumHit(when, strength) {
      // Membrana: oscilador con pitch bend descendente (el "doom")
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95 + strength * 25, when);
      osc.frequency.exponentialRampToValueAtTime(48, when + 0.18);
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(strength * 0.50, when + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, when + 0.35 + strength * 0.15);
      osc.connect(env); env.connect(o); env.connect(rev);
      osc.start(when); osc.stop(when + 0.6);

      // Golpe del parche: burst de ruido corto
      const slap = self._noise('brown');
      const slapBP = self._filt('bandpass', 200, 1.2);
      const slapG  = ctx.createGain();
      slapG.gain.setValueAtTime(0, when);
      slapG.gain.linearRampToValueAtTime(strength * 0.22, when + 0.002);
      slapG.gain.exponentialRampToValueAtTime(0.0008, when + 0.10);
      slap.connect(slapBP); slapBP.connect(slapG);
      slapG.connect(o); slapG.connect(rev);
      slap.start(when); slap.stop(when + 0.15);
      self.nodes.push(osc, env, slap, slapBP, slapG);
    }

    function scheduleBeat() {
      if (self.active !== 'shaman') return;
      // Timing humano: ±3% jitter; acento cada 4 golpes
      const jitter = 1 + (Math.random() - 0.5) * 0.06;
      const accent = (beatCount % 4 === 0) ? 1.0 : 0.65 + Math.random() * 0.15;
      drumHit(ctx.currentTime + 0.05, accent);
      beatCount++;
      self._timer(scheduleBeat, beatSec * jitter * 1000);
    }
    scheduleBeat();

    // Sonajero: ráfaga granular (muchos micro-clicks), no un beep
    function scheduleRattle() {
      if (self.active !== 'shaman') return;
      const delay = 7 + Math.random() * 11;
      const t0 = ctx.currentTime + delay;
      const grains = 14 + Math.floor(Math.random() * 16);
      const dur = 0.5 + Math.random() * 0.7;
      for (let g = 0; g < grains; g++) {
        const t = t0 + (g / grains) * dur + Math.random() * 0.015;
        const click = self._noise('white');
        const cBP = self._filt('bandpass', 3800 + Math.random() * 2500, 6);
        const cG  = ctx.createGain();
        cG.gain.setValueAtTime(0, t);
        cG.gain.linearRampToValueAtTime(0.015 + Math.random() * 0.012, t + 0.001);
        cG.gain.exponentialRampToValueAtTime(0.0005, t + 0.018);
        click.connect(cBP); cBP.connect(cG);
        cG.connect(o); cG.connect(rev);
        click.start(t); click.stop(t + 0.03);
        self.nodes.push(click, cBP, cG);
      }
      self._timer(scheduleRattle, delay * 1000);
    }
    scheduleRattle();
  }

  // ── OVERTONE — canto difónico: drone + armónico que barre ───
  _overtone() {
    const o = this.output, ctx = this.ctx, self = this;
    const rev = this._reverb(3.8, 2.5, 0.38);
    const fundamental = 110;

    // Drone base: voz formante grave constante (la garganta)
    const drone = this._formantVoice(fundamental, 'u', 0.22);
    try { drone.out.disconnect(); } catch {}
    drone.out.connect(o); drone.out.connect(rev);

    // El armónico "silbado": filtro MUY resonante que se mueve
    // exactamente entre los armónicos de la fundamental (técnica real)
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.value = fundamental;
    const whistle = this._filt('bandpass', fundamental * 8, 35);  // Q altísimo = silbido
    const whG = this._gain(0.16);
    src.connect(whistle); whistle.connect(whG);
    whG.connect(o); whG.connect(rev);
    src.start();
    this._push(src, whistle, whG);

    // Sincronizar drift del drone y la fuente del silbido
    const d1 = this._lfo(0.11); const d1g = this._gain(0.5);
    d1.connect(d1g); d1g.connect(src.frequency); d1.start();
    this._push(d1, d1g);

    // El armónico barre la serie: 6→7→8→9→10→9→8… saltos discretos lentos
    let harmIdx = 0;
    const HARMONICS = [6, 7, 8, 9, 10, 11, 10, 9, 8, 7];
    function sweepHarmonic() {
      if (self.active !== 'overtone') return;
      const t0 = ctx.currentTime + 0.05;
      const h = HARMONICS[harmIdx % HARMONICS.length];
      harmIdx++;
      const hold = 2.5 + Math.random() * 3;
      whistle.frequency.cancelScheduledValues(t0);
      whistle.frequency.setValueAtTime(whistle.frequency.value, t0);
      // glissando al armónico siguiente (así suena el khoomei real)
      whistle.frequency.exponentialRampToValueAtTime(fundamental * h, t0 + 0.8);
      self._timer(sweepHarmonic, (0.8 + hold) * 1000);
    }
    sweepHarmonic();

    // Respiración del conjunto
    const master = this._gain(0.9);
    const brLFO = this._lfo(0.09); const brMod = this._gain(0.12);
    brLFO.connect(brMod); brMod.connect(master.gain); brLFO.start();
    this._push(master, brLFO, brMod);
  }

  get state() { return this.active ? 'playing' : 'idle'; }
}

const SOUNDSCAPES = [
  // Naturaleza
  { k:'ocean',     l:'Oceano',    icon:'🌊', desc:'Olas irregulares, espuma y fondo marino', color:'#4080e8', cat:'naturaleza' },
  { k:'rain',      l:'Lluvia',    icon:'🌧', desc:'Cortina de lluvia, gotas y chubascos',    color:'#70a0c0', cat:'naturaleza' },
  { k:'wind',      l:'Viento',    icon:'🍃', desc:'Ráfagas con aullido natural',             color:'#70c8a0', cat:'naturaleza' },
  { k:'forest',    l:'Bosque',    icon:'🌿', desc:'Pájaros, hojas y grillos',                color:'#50c870', cat:'naturaleza' },
  // Sagrado
  { k:'om',        l:'OM / AUM',  icon:'🕉',  desc:'Síntesis vocal · 136.1 Hz',        color:'#c040c8', cat:'sagrado' },
  { k:'bowls',     l:'Cuencos',   icon:'🔔', desc:'Cuencos por síntesis y resonancia',   color:'#e8c820', cat:'sagrado' },
  { k:'gregorian', l:'Gregoriano',icon:'🎵', desc:'Coro modal en catedral',                  color:'#6040c8', cat:'sagrado' },
  { k:'shaman',    l:'Chamanico', icon:'🥁', desc:'Tambor de mano y sonajero',               color:'#e84040', cat:'sagrado' },
  { k:'overtone',  l:'Overtone',  icon:'〰', desc:'Canto difónico · khoomei',                color:'#40c8c0', cat:'sagrado' },
];

window.SoundscapeEngine = SoundscapeEngine;
window.SOUNDSCAPES      = SOUNDSCAPES;

export { SoundscapeEngine, SOUNDSCAPES };
