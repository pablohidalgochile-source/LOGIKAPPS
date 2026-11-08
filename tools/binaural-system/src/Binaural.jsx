import React, { useState, useEffect, useRef } from 'react';
import { useStore, readStore, writeStore } from './store.js';
import { Card, CardHead, FieldRings } from './ui.jsx';
import { Icon } from './icons.jsx';
import { buildLocalMeditation } from './local-meditation.js';
import { normalizePatch, validateProgram, adjustFrequency } from './patch.js';

/* ============================================================
   NANOOK RESET — Binaural Lab
   Player principal + Programas + Presets + Sesiones + Meditaciones
   WebAudio: iniciar SOLO con gesto de usuario (botón Start)
   ADVERTENCIA DE SEGURIDAD visible en primera pantalla
   ============================================================ */

// ── Constantes TTS ────────────────────────────────────────────
// Nota: estas voces hablan en el idioma del texto — si el guion es español, narran en español.
// El acento es neutro-americano. Para acento nativo latinoamericano usa ElevenLabs.
const OPENAI_VOICES = [
  { id: 'nova',    label: 'Nova',    desc: 'Femenina · cálida'    },
  { id: 'shimmer', label: 'Shimmer', desc: 'Femenina · suave'     },
  { id: 'onyx',    label: 'Onyx',    desc: 'Masculina · profunda' },
  { id: 'alloy',   label: 'Alloy',   desc: 'Neutral · clara'      },
  { id: 'echo',    label: 'Echo',    desc: 'Masculina · natural'  },
  { id: 'fable',   label: 'Fable',   desc: 'Cálida · narrativa'  },
];

// ── Visualizador Canvas ───────────────────────────────────────
function BinauralVisualizer({ playing, patch, analyserGetter }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(0);
  const tRef      = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const freqBuf = new Uint8Array(256);

    function resize() {
      const r = canvas.getBoundingClientRect();
      canvas.width  = r.width  * dpr;
      canvas.height = r.height * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw() {
      const W=canvas.width, H=canvas.height, cx=W/2, cy=H/2;
      const t=tRef.current, p=patch||{};
      const beat=p.beatHz||8, sol=p.solfeggioHz||528, mod=p.modulation||0.2, noise=p.noiseAmount||0.1;
      const hue=220;

      ctx.fillStyle = playing ? 'rgba(6,8,16,0.18)' : 'rgba(6,8,16,0.35)';
      ctx.fillRect(0,0,W,H);

      let energy=0.5;
      try {
        const a=analyserGetter&&analyserGetter();
        if(a){ a.getByteFrequencyData(freqBuf); let s=0; for(let i=0;i<64;i++) s+=freqBuf[i]; energy=Math.min(1,s/(64*200)); }
      } catch(_) {}

      const baseR=Math.min(W,H)*0.16;
      const breath=(Math.sin(t*(p.modSpeed||0.08)*6.28)*0.5+0.5);
      const breathR=baseR*(1+mod*(0.18+breath*0.22)+energy*0.05);

      // Anillos de campo electromagnético (mandala)
      const rings=9;
      for(let i=0;i<rings;i++){
        const k=i/rings, r=breathR*(0.55+k*1.6);
        const alpha=(1-k)*(playing?0.55:0.22);
        ctx.beginPath();
        const segs=200;
        for(let s=0;s<=segs;s++){
          const ang=(s/segs)*Math.PI*2;
          const wob=Math.sin(ang*(3+Math.floor(beat/2))+t*beat*0.2+i*0.4)*(4+mod*14)+Math.cos(ang*(sol/90)+t*0.6)*0.8+(Math.random()-0.5)*noise*5;
          const rr=r+wob;
          const x=cx+Math.cos(ang)*rr, y=cy+Math.sin(ang)*rr;
          s===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
        }
        ctx.closePath();
        const h=(hue+i*8)%360;
        ctx.strokeStyle=`hsla(${h},60%,${60-i*3}%,${alpha})`;
        ctx.lineWidth=(1+(rings-i)*0.35)*dpr; ctx.stroke();
      }

      // Núcleo solfeggio
      const coreR=baseR*(0.28+breath*0.06);
      const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,coreR*4);
      grad.addColorStop(0,`hsla(${hue},70%,70%,${playing?0.55:0.22})`);
      grad.addColorStop(0.4,`hsla(${(hue+30)%360},60%,40%,${playing?0.22:0.08})`);
      grad.addColorStop(1,`hsla(220,30%,5%,0)`);
      ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,coreR*4,0,Math.PI*2); ctx.fill();

      // Puntos L/R orbitando
      const orbitR=breathR*1.08;
      const lAng=t*(p.beatHz||8)*0.05;
      ctx.fillStyle=`hsla(${hue},75%,75%,0.9)`;
      ctx.beginPath(); ctx.arc(cx+Math.cos(lAng)*orbitR,cy+Math.sin(lAng)*orbitR,3*dpr,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=`hsla(${(hue+80)%360},75%,75%,0.9)`;
      ctx.beginPath(); ctx.arc(cx+Math.cos(lAng+Math.PI)*orbitR,cy+Math.sin(lAng+Math.PI)*orbitR,3*dpr,0,Math.PI*2); ctx.fill();

      tRef.current += playing ? 0.016 : 0.004;
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [playing, patch.beatHz, patch.solfeggioHz, patch.modulation, patch.modSpeed, patch.noiseAmount]);

  return (
    <canvas role="img" aria-label="Visualizador sonoro de la mezcla binaural" ref={canvasRef} style={{ display:'block', width:'100%', height:'100%',
      background:'radial-gradient(ellipse at center,#0c1220 0%,#050810 70%)' }}/>
  );
}

// ── Knob de control ───────────────────────────────────────────
function BKnob({ label, value, min, max, step=.1, unit='', onChange, hint, fmt, accent='var(--blue)' }) {
  const v = Number.isFinite(+value) ? +value : min;
  return <label className="binaural-control"><span className="control-heading"><span>{label}</span><output style={{color:accent}}>{fmt?fmt(v):+v.toFixed(3)}{unit}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={v} onChange={e=>onChange(+e.target.value)}/>{hint&&<span className="control-hint">{hint}</span>}</label>;
}

// ── Pantalla principal ────────────────────────────────────────
// ── Variables de personalización para la generación IA de meditaciones ──
// Editables / agregables / eliminables; se guardan en el store 'meditationVars'.
const MED_VARS_SEED = [
  { id:'voz',          label:'Voz / tono',                 kind:'select', value:'sereno',      options:['sereno','firme','poético','susurrado','maternal'] },
  { id:'estado',       label:'Estado objetivo',            kind:'select', value:'auto',        options:['auto','delta (sueño)','theta (meditación)','alpha (calma)','beta (foco)','gamma (insight)'] },
  { id:'momento',      label:'Momento del día',            kind:'select', value:'cualquiera',  options:['cualquiera','mañana','tarde','noche','antes de dormir'] },
  { id:'respiracion',  label:'Respiración',                kind:'select', value:'libre',       options:['libre','4-7-8','coherente 5.5','box (4-4-4-4)'] },
  { id:'enfoque',      label:'Enfoque',                    kind:'select', value:'presencia',   options:['presencia','body scan','visualización','mantra','gratitud','soltar'] },
  { id:'pausas',       label:'Ritmo de pausas',            kind:'select', value:'equilibrado', options:['equilibrado','profundas / largas','guía continua'] },
];

// Controles de valor (lo que el usuario ajusta antes de generar)
function MedVarsInputs({ vars, onChange }) {
  return (
    <div style={{ display:'grid', gap:10 }}>
      {vars.map(v => (
        <div key={v.id}>
          <div className="kicker" style={{ marginBottom:6 }}>{v.label}</div>
          {v.kind === 'toggle' ? (
            <button className={`chip ${v.value?'on':''}`} onClick={()=>onChange(v.id, !v.value)}
              style={{ fontSize:11 }}>{v.value ? '✓ Activado' : 'Desactivado'}</button>
          ) : v.kind === 'select' ? (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {(v.options||[]).map(o => (
                <button key={o} className={`chip ${v.value===o?'on':''}`} onClick={()=>onChange(v.id, o)}
                  style={{ fontSize:10 }}>{o}</button>
              ))}
            </div>
          ) : (
            <input className="inp" value={v.value||''} onChange={e=>onChange(v.id, e.target.value)} placeholder="escribe un valor…" style={{ width:'100%' }}/>
          )}
        </div>
      ))}
    </div>
  );
}

// Gestor CRUD de variables (modal)
function MedVarsManager({ vars, setVars, onClose }) {
  const [nf, setNf] = useState({ label:'', kind:'select', options:'' });
  const updVar = (id, patch) => setVars(vars.map(v => v.id===id ? { ...v, ...patch } : v));
  const delVar = id => setVars(vars.filter(v => v.id!==id));
  function addVar() {
    if (!nf.label.trim()) return;
    const opts = nf.kind==='select' ? nf.options.split(',').map(s=>s.trim()).filter(Boolean) : [];
    setVars([...vars, { id:'mv_'+Date.now(), label:nf.label.trim(), kind:nf.kind,
      value: nf.kind==='toggle' ? false : (opts[0]||''), options: opts }]);
    setNf({ label:'', kind:'select', options:'' });
  }
  return (
    <div className="modal-overlay" onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'grid', placeItems:'center', zIndex:1000, padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:'var(--panel)', border:'1px solid var(--hair)', borderRadius:'var(--r)', padding:20, width:'min(560px,100%)', maxHeight:'90vh', overflow:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:20, margin:0 }}>Variables de meditación</h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding:'6px 8px' }}><Icon.close size={16}/></button>
        </div>

        <div style={{ display:'grid', gap:10, marginBottom:16 }}>
          {vars.map(v => (
            <div key={v.id} style={{ padding:'10px 12px', borderRadius:'var(--r-sm)', background:'var(--obsidian-2)', border:'1px solid var(--hair-faint)' }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom: v.kind==='select'?8:0 }}>
                <input className="inp" value={v.label} onChange={e=>updVar(v.id,{label:e.target.value})}
                  style={{ flex:1, fontSize:13 }}/>
                <span className="tag dim" style={{ fontSize:9 }}>{v.kind}</span>
                <button className="btn btn-ghost" onClick={()=>delVar(v.id)} style={{ padding:'4px 7px', color:'var(--magenta)' }}><Icon.trash size={14}/></button>
              </div>
              {v.kind==='select' && (
                <input className="inp" value={(v.options||[]).join(', ')}
                  onChange={e=>{ const opts=e.target.value.split(',').map(s=>s.trim()).filter(Boolean); updVar(v.id,{ options:opts, value: opts.includes(v.value)?v.value:(opts[0]||'') }); }}
                  placeholder="opciones separadas por coma"
                  style={{ width:'100%', fontSize:12, fontFamily:'var(--mono)' }}/>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding:'12px 14px', borderRadius:'var(--r-sm)', background:'color-mix(in oklab,var(--blue) 5%,var(--panel))', border:'1px solid color-mix(in oklab,var(--blue) 22%,transparent)' }}>
          <div className="kicker" style={{ marginBottom:8 }}>+ Añadir variable</div>
          <div style={{ display:'grid', gap:8 }}>
            <input className="inp" value={nf.label} onChange={e=>setNf(f=>({...f,label:e.target.value}))} placeholder="Nombre (ej: Elemento, Mantra…)"/>
            <div style={{ display:'flex', gap:6 }}>
              {['select','text','toggle'].map(k=>(
                <button key={k} className={`chip ${nf.kind===k?'on':''}`} onClick={()=>setNf(f=>({...f,kind:k}))} style={{ fontSize:10 }}>
                  {k==='select'?'opciones':k==='text'?'texto':'sí/no'}
                </button>
              ))}
            </div>
            {nf.kind==='select' && (
              <input className="inp" value={nf.options} onChange={e=>setNf(f=>({...f,options:e.target.value}))}
                placeholder="opciones separadas por coma" style={{ fontFamily:'var(--mono)', fontSize:12 }}/>
            )}
            <button className="btn btn-primary" onClick={addVar} disabled={!nf.label.trim()} style={{ fontSize:13 }}>
              <Icon.plus size={15}/> Añadir
            </button>
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', marginTop:14 }}>
          <button className="btn btn-ghost" onClick={()=>setVars(MED_VARS_SEED)} style={{ fontSize:12 }}>↺ Restaurar predeterminadas</button>
          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}

function Binaural({ go }) {
  const { SOLFEGGIO, NOISE_TYPES, INTENTIONS, PROGRAMS, MEDITATIONS_SEED, GENERATOR_MODES } = window.BINAURAL_DATA;
  const fmtTime = window.fmtTime;
  const generateFromMode = window.generateFromMode;

  const [tab, setTab] = useState('player');
  const [studioSection,setStudioSection]=useState('mix');
  const [subTab, setSubTab] = useState('intentions');

  // ── Sugerencia entrante desde otros módulos (p.ej. Bóveda del Observador) ──
  // Lectura aditiva de un store compartido; nunca se aplica automáticamente.
  const [incomingSuggestion, setIncomingSuggestion] = useStore('binauralIncomingSuggestion', null);

  const savedPatch = useRef(normalizePatch(readStore('studioPatch') || {})).current;
  // ── Audio state ──
  const [solfeggioHz, setSolfeggioHz] = useState(savedPatch.solfeggioHz);
  const [carrierHz,   _setCarrierHz]  = useState(savedPatch.carrierHz);
  const [beatHz,      _setBeatHz]     = useState(savedPatch.beatHz);
  const [volume,      setVolume]      = useStore('binauralVolume', 0.22);
  const [solGain,     setSolGain]     = useState(savedPatch.solfeggioGain);
  const [binGain,     setBinGain]     = useState(savedPatch.binauralGain);
  const [noiseAmt,    setNoiseAmt]    = useState(savedPatch.noiseAmount);
  const [noiseType,   setNoiseType]   = useState(savedPatch.noiseType);
  const [modulation,     setModulation]     = useState(savedPatch.modulation);
  const [leftGain,       setLeftGain  ]     = useState(savedPatch.leftGain);
  const [rightGain,      setRightGain ]     = useState(savedPatch.rightGain);
  const [modSpeed,       setModSpeed]       = useState(savedPatch.modSpeed);
  const [beatDrift,      setBeatDrift]      = useState(savedPatch.beatDrift);
  const [beatDriftSpeed, setBeatDriftSpeed] = useState(savedPatch.beatDriftSpeed);
  const [fadeSeconds,    setFadeSeconds]    = useState(savedPatch.fadeSeconds);
  const [sessionMin,     setSessionMin]     = useState(savedPatch.sessionMinutes);
  const [intentionId, setIntentionId] = useState('creative');
  const [genMode,     setGenMode]     = useState('bright');
  // Frecuencias L/R independientes (se sincronizan con carrier/beat bidireccionalmente)
  const [leftHz,      setLeftHzRaw]   = useState(savedPatch.leftHz);
  const [rightHz,     setRightHzRaw]  = useState(savedPatch.rightHz);
  // IA Generator
  const [aiGenConcept, setAiGenConcept] = useState('');
  const [aiGenResult,  setAiGenResult ] = useState(null);
  const [aiGenBusy,    setAiGenBusy  ] = useState(false);
  const [aiGenError,   setAiGenError ] = useState(null);
  const [reading,     setReading]     = useState('"No eliges una canción: diseñas una atmósfera para tu mente."');

  // ── Playback state ──
  const [playing,     setPlaying]     = useState(false);
  const [elapsed,     setElapsed]     = useState(0);
  const [unsupported, setUnsupported] = useState(false);
  const [warning,     setWarning]     = useState(null);
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try { return !localStorage.getItem('binaural-system:disclaimer:v1'); } catch { return true; }
  });

  // ── Programs state ──
  const [activeProgram,  setActiveProgram]  = useState(null);
  const [programStage,   setProgramStage]   = useState(0);
  const [programPlaying, setProgramPlaying] = useState(false);

  // ── Presets (localStorage) ──
  const [presets, setPresets] = useStore('binauralPresets', []);
  const [presetName, setPresetName] = useState('');

  // ── Sessions history ──
  const [sessions, setSessions] = useStore('binauralSessions', []);
  const [sessionStarted, setSessionStarted] = useState(null);
  const [moodBefore, setMoodBefore] = useState(5);
  const [moodAfter,  setMoodAfter]  = useState(null);
  const [sessionNote, setSessionNote] = useState('');

  // ── Meditations ──
  const [userMeditations, setUserMeditations] = useStore('userMeditations', []);
  const [medNote, setMedNote] = useState('');
  const [forgeInput, setForgeInput] = useState({ concept:'', intention:'', archetype:'', durationMin:15 });
  const [medVars, setMedVars] = useStore('meditationVars', null);
  const effMedVars = (Array.isArray(medVars) && medVars.length) ? medVars : MED_VARS_SEED;
  const [showVarMgr, setShowVarMgr] = useState(false);
  const setMedVarValue = (id, value) => setMedVars(effMedVars.map(v => v.id===id ? { ...v, value } : v));
  const [forgeResult, setForgeResult] = useState(null);
  const [forgeBusy,  setForgeBusy ] = useState(false);
  const [forgeError, setForgeError] = useState(null);
  const [meditationSel, setMeditationSel] = useState(null);
  const [guionOpen,    setGuionOpen    ] = useState(true);
  const [medEditId,    setMedEditId    ] = useState(null);
  const [medEditForm,  setMedEditForm  ] = useState(null);
  // hiddenMeds: useState directo (useStore no garantiza re-render al borrar)
  const [hiddenMeds, _setHiddenMeds] = useState(() => {
    const s = window.readStore('hiddenMeditations');
    return Array.isArray(s) ? s : [];
  });
  const setHiddenMeds = fn => {
    _setHiddenMeds(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      window.writeStore('hiddenMeditations', next);
      return next;
    });
  };
  const [confirmDelId, setConfirmDelId] = useState(null);

  // ── CRUD: programas / intenciones (editables) ──
  const [userPrograms,   setUserPrograms  ] = useStore('binauralPrograms',   null);
  const [userIntentions, setUserIntentions] = useStore('binauralIntentions', null);

  // Seed en primer uso
  useEffect(() => {
    if (userPrograms === null) {
      setUserPrograms(PROGRAMS.map(p => ({ ...p, id: p.code || ('p_'+Date.now()+Math.random()), editable:false })));
    }
    if (userIntentions === null) {
      setUserIntentions(INTENTIONS.map(i => ({ ...i, editable:false })));
    }
  }, []);

  const allPrograms   = userPrograms   || PROGRAMS.map(p=>({...p,id:p.code}));
  const allIntentions = userIntentions || INTENTIONS;

  // ── Soundscape ──
  const scapeRef  = useRef(null);
  const [scapeType,   setScapeType  ] = useState(null);
  const [scapeVol,    setScapeVol   ] = useState(0.30);
  // Audio externo
  const [extAudios,   setExtAudios  ] = useStore('binauralExtAudio', []);
  const [extPlaying,  setExtPlaying ] = useState({});   // { id: true/false }
  const extGenerationRef = useRef(0);
  const extCtxRef = React.useRef({});                   // { id: { ctx, source, gainNode } }

  // ── CRUD UI state ──
  const [progEditId,  setProgEditId ] = useState(null);   // null = lista, id = editor
  const [progForm,    setProgForm   ] = useState(null);
  const [intEditId,   setIntEditId  ] = useState(null);
  const [intForm,     setIntForm    ] = useState(null);

  // ── TTS state ──
  const [ttsPlaying,  setTtsPlaying ] = useState(false);
  const [systemVoices,setSystemVoices]=useState(()=>window.speechSynthesis?.getVoices()||[]);
  useEffect(()=>{const update=()=>setSystemVoices(window.speechSynthesis?.getVoices()||[]);update();window.speechSynthesis?.addEventListener('voiceschanged',update);return()=>window.speechSynthesis?.removeEventListener('voiceschanged',update);},[]);
  const [ttsVoice,    setTtsVoice   ] = useState('');
  const [ttsBackend,  setTtsBackend ] = useStore('ttsBackend',   'browser');
  const [oaiVoice,    setOaiVoice   ] = useStore('ttsOaiVoice',  'nova');
  const [oaiModel,    setOaiModel   ] = useStore('ttsOaiModel',  'tts-1-hd');
  const [elVoiceId,   setElVoiceId  ] = useStore('ttsElVoiceId', '');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [elError,     setElError    ] = useState(null);

  const engineRef = useRef(null);
  const transportRef = useRef({});

  // ── Modos de enlace L/R ↔ Carrier/Beat (estudio profesional) ──
  // 'free'    → cada oído independiente; carrier/beat se recalculan (display)
  // 'delta'   → Δ fijo: mover un oído desplaza el otro en paralelo
  // 'carrier' → portadora fija: mover un oído refleja el otro alrededor del centro
  const [linkMode, setLinkMode] = useState(['free','delta','carrier'].includes(savedPatch.linkMode)?savedPatch.linkMode:'free');

  // Cambiar portadora. En Libre es 100% independiente (referencia que el solfeggio fija):
  // mover su slider NO toca los oídos. En Δ fijo / Centro fijo desplaza el par manteniendo Δ.
  function changeFrequency(key, value) {
    const next = adjustFrequency({left:leftHz,right:rightHz,carrier:carrierHz,link:linkMode},key,value);
    setLeftHzRaw(next.left); setRightHzRaw(next.right); _setCarrierHz(next.carrier); _setBeatHz(next.beat);
  }
  function setCarrierHz(v) { changeFrequency('carrier',v); }
  function setBeatHz(v) { changeFrequency('beat',v); }
  function setLeftHz(v) { changeFrequency('left',v); }
  function setRightHz(v) { changeFrequency('right',v); }
  function matchCarrierToSolfeggio() { setCarrierHz(+solfeggioHz); }
  function pickSolfeggio(v) { setSolfeggioHz(v); if(linkMode==='free')_setCarrierHz(v); }

  // Verde cuando la portadora coincide con el solfeggio elegido (el par está centrado en él).
  const carrierMatchesSolf = Math.abs(carrierHz - Number(solfeggioHz)) < 1;
  const carrierAccent      = carrierMatchesSolf ? 'var(--green)' : 'var(--blue)';

  // Patch current — incluye leftHz/rightHz directos para el audio engine
  const patch = normalizePatch({ solfeggioHz, carrierHz, beatHz, leftHz, rightHz, volume, solfeggioGain:solGain, binauralGain:binGain,
    noiseAmount:noiseAmt, noiseType, modulation, modSpeed, beatDrift, beatDriftSpeed,
    fadeSeconds, sessionMinutes:programPlaying?0:sessionMin, leftGain, rightGain, linkMode });

  const beatLabel = beatHz<4?'Delta · rango de frecuencia':beatHz<8?'Theta · rango de frecuencia':beatHz<13?'Alpha · rango de frecuencia':beatHz<30?'Beta · rango de frecuencia':'Gamma · rango de frecuencia';
  const curSol = SOLFEGGIO.find(s => s.hz === Number(solfeggioHz)) || SOLFEGGIO[4];

  // Engine setup — motor GLOBAL: no se detiene al navegar
  useEffect(() => {
    if (!window.NanookAudioEngine) return;
    if (!window.NanookAudioEngine.supported()) { setUnsupported(true); return; }

    // Reutilizar motor global si ya existe
    if (!window._nanookEngine) {
      window._nanookEngine = new window.NanookAudioEngine();
    }
    engineRef.current = window._nanookEngine;
    engineRef.current.onEnd = () => transportRef.current.end?.();
    engineRef.current.onError = error => { setWarning(error.message); transportRef.current.end?.(); };

    // Restaurar estado si estaba reproduciendo al navegar de vuelta
    if (window._nanookMeta?.playing) {
      setPlaying(true);
      setElapsed(engineRef.current.elapsedSeconds?.() || 0);
    }

    // SoundscapeEngine — contexto propio, independiente
    if (window.SoundscapeEngine) {
      if (!window._nanookScape) {
        window._nanookScape = new window.SoundscapeEngine();
      }
      scapeRef.current = window._nanookScape;
    }

    // NO hay cleanup — el audio continua al navegar
    return () => { /* no detener */ };
  }, []);

  // Live update — todos los parametros en tiempo real
  useEffect(() => {
    if (playing && engineRef.current) engineRef.current.setLive(patch);
  }, [patch, playing]);

  // Swap de ruido — necesita reemplazar el BufferSource
  useEffect(() => {
    if (playing && engineRef.current?.swapNoise) {
      engineRef.current.swapNoise(noiseType);
    }
  }, [noiseType]);

  // Tick
  useEffect(() => {
    if (!playing) return;
    let id=0; const tick=()=>{ if(engineRef.current) setElapsed(engineRef.current.elapsedSeconds()); id=requestAnimationFrame(tick); };
    id=requestAnimationFrame(tick); return ()=>cancelAnimationFrame(id);
  }, [playing]);

  function applyIntention(it) {
    if(programPlaying)stopAllAudio(false);
    const c = it.carrier ?? 210, b = it.beat ?? 8;
    setIntentionId(it.id); setSolfeggioHz(it.solfeggio);
    _setCarrierHz(c); _setBeatHz(b);
    setLeftHzRaw(+(c - b/2).toFixed(2)); setRightHzRaw(+(c + b/2).toFixed(2));
    setNoiseAmt(it.noise); setNoiseType(it.noiseType); setModulation(it.modulation); setModSpeed(it.modSpeed);
    setSessionMin(it.duration); setReading(`${it.glyph} ${it.name} — ${it.description}`);
  }

  function generate(mode = genMode) {
    const g = generateFromMode(mode);
    applyIntention(INTENTIONS.find(i=>i.id===g.intentionId)||INTENTIONS[0]);
    const c = g.carrierHz ?? 210, b = g.beatHz ?? 8;
    _setCarrierHz(c); _setBeatHz(b);
    setLeftHzRaw(+(c - b/2).toFixed(2)); setRightHzRaw(+(c + b/2).toFixed(2));
    setNoiseAmt(g.noiseAmount); setNoiseType(g.noiseType);
    setModulation(g.modulation); setModSpeed(g.modSpeed);
    setSessionMin(g.duration); setReading(g.reading);
  }

  async function aiGenerate() {
    if (!aiGenConcept.trim()) return;
    setAiGenBusy(true); setAiGenError(null);
    try {
      const low = aiGenConcept.toLowerCase();
      const id = /dorm|sueño|descans/.test(low)?'sleep':/foco|enfoque|estudi|concentr/.test(low)?'focus':/crea|escrib|arte/.test(low)?'creative':/respir/.test(low)?'breath':'calm';
      const i = allIntentions.find(x=>x.id===id) || INTENTIONS.find(x=>x.id===id) || INTENTIONS[0];
      setAiGenResult({name:i.name,leftHz:i.carrier-i.beat/2,rightHz:i.carrier+i.beat/2,carrierHz:i.carrier,beatHz:i.beat,solfeggioHz:i.solfeggio,noiseType:i.noiseType,noiseAmt:i.noise,modulation:i.modulation,modSpeed:i.modSpeed,duration:i.duration,binGain,solGain,description:'Selección local por palabras clave. Puedes editar todos sus parámetros.',science_note:'No se utilizó IA ni se atribuyen efectos clínicos a esta configuración.'});
    } catch (error) { setAiGenError(error.message); }
    finally { setAiGenBusy(false); }
  }

  function applyAiConfig(cfg) {
    if(programPlaying)stopAllAudio(false);
    _setCarrierHz(cfg.carrierHz); _setBeatHz(cfg.beatHz);
    setLeftHzRaw(cfg.leftHz); setRightHzRaw(cfg.rightHz);
    setSolfeggioHz(cfg.solfeggioHz); setNoiseType(cfg.noiseType);
    setNoiseAmt(cfg.noiseAmt ?? cfg.noiseAmount ?? 0.1);
    setModulation(cfg.modulation); setModSpeed(cfg.modSpeed ?? 0.08);
    if (cfg.binGain != null) setBinGain(cfg.binGain);
    if (cfg.solGain != null) setSolGain(cfg.solGain);
    if (cfg.duration) setSessionMin(cfg.duration);
    setReading(`✦ ${cfg.name} · ${cfg.brainState || ''} · ${cfg.description?.split('.')[0] || ''}`);
    setTab('player');
    setWarning(`✓ Configuración "${cfg.name}" aplicada`);
    setTimeout(()=>setWarning(null), 2500);
  }

  function saveAiPreset(cfg) {
    const nm=cfg.name||'Configuración local';
    const prepared=normalizePatch({...patch,...cfg,noiseAmount:cfg.noiseAmt??cfg.noiseAmount??noiseAmt,binauralGain:cfg.binGain??binGain,solfeggioGain:cfg.solGain??solGain,sessionMinutes:cfg.duration??sessionMin});
    setPresets(ps=>[{id:'bp_'+Date.now(),name:nm,intentionId,intentionName:nm,...prepared,noiseAmt:prepared.noiseAmount,sessionMin:prepared.sessionMinutes},...ps]);
    setWarning(`✓ Preset "${nm}" guardado`);
  }

  async function togglePlay() {
    if (unsupported || !engineRef.current) return;
    if (playing) {
      stopAllAudio(true);
    } else {
      try {
        const started = await engineRef.current.start({...patch,name:reading});
        if (!started) return;
        setPlaying(true); setElapsed(0);
        setSessionStarted(Date.now());
        // Guardar estado global para mini-player y restauracion
        window._nanookMeta = {
          playing: true,
          label:   intentionId,
          beatHz:  beatHz,
          beatLabel: beatLabel,
          patch,
        };
      } catch(e) { setWarning('No se pudo iniciar el audio: '+(e?.message||e)); }
    }
  }

  function finishSession() {
    if (!sessionStarted) return;
    const dur = Math.round((Date.now()-sessionStarted)/1000);
    const it = INTENTIONS.find(i=>i.id===intentionId)||INTENTIONS[0];
    setSessions(ss => [{ id:'bs_'+Date.now(), date:new Date().toISOString(), intentionId, intentionName:it.name,
      ...patch, beatHz, solfeggioHz, carrierHz, noiseType, sessionMin, durationSec:dur, moodBefore, moodAfter, note:sessionNote }, ...ss]);
    setSessionStarted(null); setMoodAfter(null); setSessionNote('');
    setWarning(`✓ Sesión guardada · ${Math.floor(dur/60)}m ${dur%60}s`);
    setTimeout(()=>setWarning(null),3000);
  }

  function savePreset() {
    const nm=presetName.trim()||`Preset ${new Date().toLocaleTimeString('es-CL')}`;
    setPresets(ps=>[{id:'bp_'+Date.now(),name:nm,intentionId,intentionName:nm,...patch,noiseAmt,sessionMin,sessionMinutes:sessionMin,createdAt:new Date().toISOString()},...ps]);
    setPresetName('');setWarning('✓ Preset binaural guardado');
  }
  function loadPreset(p) {
    if(programPlaying)stopAllAudio(false);
    if(['free','delta','carrier'].includes(p.linkMode))setLinkMode(p.linkMode);
    const next=normalizePatch({...p,noiseAmount:p.noiseAmount??p.noiseAmt,sessionMinutes:p.sessionMinutes??p.sessionMin});
    setIntentionId(p.intentionId||'creative');setSolfeggioHz(next.solfeggioHz);_setCarrierHz(next.carrierHz);_setBeatHz(next.beatHz);setLeftHzRaw(next.leftHz);setRightHzRaw(next.rightHz);
    setNoiseAmt(next.noiseAmount);setNoiseType(next.noiseType);setModulation(next.modulation);setModSpeed(next.modSpeed);setBeatDrift(next.beatDrift);setBeatDriftSpeed(next.beatDriftSpeed);setSolGain(next.solfeggioGain);setBinGain(next.binauralGain);setLeftGain(next.leftGain);setRightGain(next.rightGain);setFadeSeconds(next.fadeSeconds);setSessionMin(next.sessionMinutes||20);setVolume(next.volume);setReading(p.name);
  }

  async function startProgram(prog) {
    if (!engineRef.current) return;
    let valid;
    try { valid = validateProgram(prog); }
    catch(error) { setWarning(error.message); return; }
    if(sessionStarted)finishSession();
    setActiveProgram(valid); setProgramStage(0); setProgramPlaying(true);
    setSessionMin(valid.totalMin); setSessionStarted(Date.now());
    await engineRef.current.runProgram(valid.stages, carrierHz, noiseAmt, noiseType, volume,
      (si, st) => {
        const p=engineRef.current.currentPatch;
        setProgramStage(si); setReading(`${valid.name} · ${st.name}`);
        setLeftHzRaw(p.leftHz);setRightHzRaw(p.rightHz);_setCarrierHz(p.carrierHz);_setBeatHz(p.beatHz);
        setSolfeggioHz(p.solfeggioHz);setModulation(p.modulation);setModSpeed(p.modSpeed);
        setPlaying(true);
      },
      () => { transportRef.current.end?.(); setWarning('✓ Programa completado'); }
    );
  }
  function stopProgram() { stopAllAudio(true); }

  // Meditation Forge — genera guion con [pausa Xs] real para TTS
  // Generación con IA (con fallback al template local)
  // Contexto personal opcional (toggle 'personalizar') para una meditación más a medida
  async function forgeMeditation() {
    if (!forgeInput.concept.trim()) return;
    setForgeError(null); setForgeBusy(true);
    try { forgeMeditationLocal(); }
    catch (error) { setForgeError(error.message || 'No se pudo crear el borrador.'); }
    finally { setForgeBusy(false); }
  }

  function forgeMeditationLocal() {
    setForgeResult(buildLocalMeditation({...forgeInput,variables:effMedVars,rate:ttsRate}));
  }

  function saveForgeResult() {
    if (!forgeResult) return;
    setUserMeditations(ms => [{ id:'um_'+Date.now(), ...forgeResult, createdAt:new Date().toISOString() }, ...(ms||[])]);
    setForgeResult(null); setForgeInput({concept:'',intention:'',archetype:'',durationMin:15});
    setWarning('✓ Meditación guardada en tu biblioteca');
    setTimeout(()=>setWarning(null),2500);
  }

  // ── Soundscape handlers ────────────────────────────────────────
  function toggleScape(type) {
    if (!scapeRef.current) return;
    if (scapeType === type) {
      scapeRef.current.stop(true);
      setScapeType(null);
      window._nanookScapeMeta = null;
    } else {
      scapeRef.current.play(type, scapeVol);
      setScapeType(type);
      window._nanookScapeMeta = { type };
    }
  }
  useEffect(() => {
    if (scapeRef.current && scapeType) scapeRef.current.setVolume(scapeVol);
  }, [scapeVol]);

  // ── CRUD Programas ────────────────────────────────────────────
  function newProgram() {
    const id = 'prog_' + Date.now();
    setProgForm({ id, name:'Nuevo programa', description:'', glyph:'◉', totalMin:20, editable:true,
      stages:[{ name:'Etapa 1', durationMin:20, beatHz:8, solfeggioHz:528, modulation:0.22, modSpeed:0.08 }] });
    setProgEditId(id);
  }
  function editProgram(p) { setProgForm({...p}); setProgEditId(p.id); }
  function deleteProgram(id) {
    if (!confirm('Eliminar este programa?')) return;
    setUserPrograms(ps => (ps||[]).filter(p=>p.id!==id));
    if (progEditId===id) { setProgEditId(null); setProgForm(null); }
  }
  function saveProgram() {
    try {
      const valid=validateProgram(progForm);
      setUserPrograms(ps=>{const list=ps||[];return list.some(p=>p.id===valid.id)?list.map(p=>p.id===valid.id?valid:p):[...list,valid];});
      setProgEditId(null);setProgForm(null);setWarning('✓ Programa guardado');
    } catch(error) { setWarning(error.message); }
  }
  function addStage() {
    setProgForm(f => ({...f, stages:[...f.stages,
      { name:`Etapa ${f.stages.length+1}`, durationMin:10, beatHz:8, solfeggioHz:528, modulation:0.22, modSpeed:0.08 }
    ]}));
  }
  function updateStage(i, key, val) {
    setProgForm(f => ({ ...f, stages: f.stages.map((s,si)=>si===i?{...s,[key]:val}:s) }));
  }
  function removeStage(i) {
    setProgForm(f => ({ ...f, stages: f.stages.filter((_,si)=>si!==i) }));
  }

  // ── CRUD Intenciones ──────────────────────────────────────────
  function newIntention() {
    const id = 'int_' + Date.now();
    setIntForm({ id, name:'Nueva intención', description:'', tags:[], editable:true, solfeggio:solfeggioHz, carrier:carrierHz, beat:beatHz, noise:noiseAmt, noiseType, modulation, modSpeed, duration:sessionMin, glyph:'◎', hue:220 });
    setIntEditId(id);
  }
  function editIntention(i) { setIntForm({...i}); setIntEditId(i.id); }
  function deleteIntention(id) {
    if (!confirm('Eliminar esta intención?')) return;
    setUserIntentions(is => (is||[]).filter(i=>i.id!==id));
    if (intEditId===id) { setIntEditId(null); setIntForm(null); }
  }
  function saveIntention() {
    if (!intForm?.name?.trim()) { setWarning('Escribe un nombre para la intención.'); return; }
    const keys=['solfeggio','carrier','beat','noise','modulation','modSpeed','duration'];
    if(keys.some(k=>!Number.isFinite(+intForm[k]))||intForm.duration<1||intForm.duration>120||intForm.beat<0||intForm.beat>100||intForm.carrier<20||intForm.carrier>1000||intForm.solfeggio<20||intForm.solfeggio>1200){setWarning('Revisa las frecuencias y la duración de la intención.');return;}
    setUserIntentions(list=>{list=list||[];return list.some(i=>i.id===intForm.id)?list.map(i=>i.id===intForm.id?intForm:i):[...list,intForm];});
    setIntEditId(null);setIntForm(null);setWarning('✓ Intención guardada');
  }

  // ── Audio externo ─────────────────────────────────────────────
  // El archivo va a IndexedDB (NanookBlobs); en el store solo quedan los datos
  // del audio. Antes iba en base64 dentro de localStorage y un MP3 grande
  // llenaba la cuota: desde ahí no se guardaba nada más en la sesión.
  async function loadExtAudio(file) {
    if(file.size>25*1024*1024||!(/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)||file.type.startsWith('audio/'))){setWarning('Elige un archivo de audio de hasta 25 MB.');return;}
    const id = 'ext_' + crypto.randomUUID();
    try {
      await window.NanookBlobs.put(id, file);
    } catch (err) {
      setWarning('No se pudo guardar el audio en este dispositivo: ' + (err?.message || err));
      setTimeout(() => setWarning(null), 6000);
      return;
    }
    const newAudio = {
      id, name: file.name.replace(/\.[^.]+$/, ''),
      size: Math.round(file.size / 1024) + ' KB',
      type: file.type,
      vol: 0.7, loop: false,
    };
    setExtAudios(prev => [...prev, newAudio]);
  }

  async function toggleExtAudio(audio) {
    const previous=extCtxRef.current[audio.id];
    if(previous){
      delete extCtxRef.current[audio.id];
      try{previous.source?.stop();}catch{}
      previous.ctx.close().catch(()=>{});
      setExtPlaying(p=>({...p,[audio.id]:false}));return;
    }
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){setWarning('Este navegador no permite reproducir el archivo.');return;}
    const ctx=new AC(),record={ctx,source:null,gainNode:null},generation=extGenerationRef.current;
    extCtxRef.current[audio.id]=record;
    try{
      await ctx.resume();
      const blob=await window.NanookBlobs.get(audio.id);
      if(!blob)throw new Error('El archivo no está en este dispositivo. Restaura un respaldo completo o vuelve a cargarlo.');
      const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
      if(generation!==extGenerationRef.current||extCtxRef.current[audio.id]!==record||ctx.state==='closed'){ctx.close().catch(()=>{});return;}
      const source=ctx.createBufferSource(),gainNode=ctx.createGain();record.source=source;record.gainNode=gainNode;
      source.buffer=decoded;source.loop=audio.loop||false;gainNode.gain.value=audio.vol??.7;
      source.connect(gainNode);gainNode.connect(ctx.destination);
      source.onended=()=>{if(extCtxRef.current[audio.id]!==record)return;delete extCtxRef.current[audio.id];setExtPlaying(p=>({...p,[audio.id]:false}));ctx.close().catch(()=>{});};
      source.start();setExtPlaying(p=>({...p,[audio.id]:true}));
    }catch(error){
      const current=extCtxRef.current[audio.id]===record;
      if(current)delete extCtxRef.current[audio.id];ctx.close().catch(()=>{});
      if(current&&generation===extGenerationRef.current)setWarning('No se pudo reproducir el archivo: '+error.message);
    }
  }

  function setExtVol(id, vol) {
    setExtAudios(prev => prev.map(a => a.id===id ? {...a, vol} : a));
    const state = extCtxRef.current[id];
    if (state?.gainNode) state.gainNode.gain.setTargetAtTime(vol, state.ctx.currentTime, 0.05);
  }

  function setExtLoop(id,loop){
    setExtAudios(prev=>prev.map(a=>a.id===id?{...a,loop}:a));
    const record=extCtxRef.current[id];if(record?.source)record.source.loop=loop;
  }
  async function deleteExtAudio(id){
    const record=extCtxRef.current[id];delete extCtxRef.current[id];
    if(record){try{record.source?.stop();}catch{}record.ctx.close().catch(()=>{});}
    try{await window.NanookBlobs.del(id);setExtAudios(prev=>prev.filter(a=>a.id!==id));setExtPlaying(p=>{const next={...p};delete next[id];return next;});}
    catch(error){setWarning('No se pudo eliminar el archivo: '+error.message);}
  }

  // ── TTS con pausas reales ─────────────────────────────────────
  const ttsBlocksRef   = React.useRef([]);
  const ttsBlockIdxRef = React.useRef(0);
  const ttsPausedRef   = React.useRef(false);
  const ttsPauseTimer  = React.useRef(null);   // timeout de bloques [pausa Xs]
  // Fuente única de verdad para "está pausado" (compartida con mini-player)
  const isPaused = () => ttsPausedRef.current || !!(window._ttsState && window._ttsState.paused);
  const [ttsProgress,  setTtsProgress ] = useState(0);
  const [ttsRate,      setTtsRate     ] = useState(0.82);
  const [ttsVolume,    setTtsVolume   ] = useState(1.0);
  const [ttsPaused,    setTtsPaused   ] = useState(false);
  const [reverbLevel,  setReverbLevel ] = useState(0.6); // 0-1 (se mapea a 0-0.18)

  // Reverb ambiental para meditaciones (nodo independiente, no procesa TTS)
  const reverbRef = React.useRef(null);

  function startReverbAmbience(vol = 0.12) {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    try {
      stopReverbAmbience();
      const AC  = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      // Impulso de reverb: ruido exponencialmente decreciente
      const secs = 3.2, sr = ctx.sampleRate;
      const buf  = ctx.createBuffer(2, Math.floor(secs * sr), sr);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.4);
        }
      }
      const conv  = ctx.createConvolver();
      conv.buffer = buf;
      const src   = ctx.createBufferSource();
      // Fuente: ruido rosa muy suave
      const noise = ctx.createBuffer(1, sr * 2, sr);
      const nd    = noise.getChannelData(0);
      let b0=0,b1=0,b2=0;
      for (let i=0;i<nd.length;i++){
        const w=Math.random()*2-1;
        b0=0.99886*b0+w*0.0555179;
        b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520;
        nd[i]=(b0+b1+b2)*0.11;
      }
      src.buffer = noise; src.loop = true;
      const g = ctx.createGain(); g.gain.value = vol;
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass'; lpf.frequency.value = 900;
      src.connect(lpf); lpf.connect(conv); conv.connect(g); g.connect(ctx.destination);
      src.start();
      reverbRef.current = { ctx, src, gain: g };
    } catch {}
  }

  function stopReverbAmbience() {
    if (!reverbRef.current) return;
    try { reverbRef.current.src.stop(); reverbRef.current.ctx.close(); } catch {}
    reverbRef.current = null;
  }

  function setReverbVol(v) {
    if (reverbRef.current?.gain) {
      reverbRef.current.gain.gain.setTargetAtTime(v, reverbRef.current.ctx.currentTime, 0.1);
    }
  }

  // ── TTS via motor global (NanookTTS) ──────────────────────────
  function ttsRead(text, title) {
    if (ttsBackend!=='browser') { setWarning('Proveedor remoto sin configurar. Elige Voz del sistema para narrar sin cuenta.'); return; }
    try {
      setTtsPaused(false);
      window.NanookTTS.speak(text,{title:title||'Meditación'},{backend:'browser',rate:ttsRate,volume:ttsVolume,voiceName:ttsVoice});
      startReverbAmbience(reverbLevel*.18);
    } catch(error) { stopReverbAmbience();setWarning(error.message); }
  }

  async function previewVoice(backend, voiceParam) {
    if (previewBusy) return;
    setPreviewBusy(true);
    setElError(null);
    try {
      await window.NanookTTS.preview(
        backend,
        backend === 'openai'       ? voiceParam : null,
        backend === 'openai'       ? oaiModel   : null,
        backend === 'elevenlabs'   ? voiceParam : null,
      );
    } catch (e) {
      setWarning(e.message || 'Proveedor remoto sin configurar.');
    } finally {
      setPreviewBusy(false);
    }
  }

  function ttsPauseToggle() {
    if (!window.NanookTTS) return;
    window.NanookTTS.toggle();
    setTtsPaused(window.NanookTTS.getState().paused);
  }

  function ttsStop() {
    if (window.NanookTTS) window.NanookTTS.stop();
    setTtsPaused(false); setTtsProgress(0);
    stopReverbAmbience();
  }

  // Sincronizar estado del motor global con React (progreso, fin)
  useEffect(() => {
    if (!window.NanookTTS) return;
    window.NanookTTS.setUpdateCallback(() => {
      const st = window._ttsState;
      setTtsPlaying(!!st?.playing);
      setTtsPaused(!!st?.paused);
      setTtsProgress(st?.progress || 0);
    });
    window._onTTSEnd = () => {
      stopReverbAmbience();
      // Si la narración se cortó por un error (sin sesión, sin key, sin red), decirlo
      if (window._ttsLastError) {
        setWarning('⚠ La narración se detuvo: ' + window._ttsLastError);
        window._ttsLastError = null;
        setTimeout(() => setWarning(null), 9000);
      }
    };
    return () => { window.NanookTTS.setUpdateCallback(null); };
  }, []);

  // Cambios de voz/velocidad/volumen en vivo
  useEffect(() => { if (window.NanookTTS) window.NanookTTS.setVoice(ttsVoice); }, [ttsVoice]);
  useEffect(() => { if (window.NanookTTS) window.NanookTTS.setRate(ttsRate); }, [ttsRate]);
  useEffect(() => { if (window.NanookTTS) window.NanookTTS.setVolume(ttsVolume); }, [ttsVolume]);

  const progressPct = Math.min(100,(elapsed/Math.max(1,sessionMin*60))*100);

  function openNewMed() {
    setMedEditForm({ id:'um_'+Date.now(), title:'', desc:'', tags:'',
      durationMin:15, archetype:'', script:'', recommendedProgram:'' });
    setMedEditId('new');
  }
  function openEditMed(m) {
    // Para built-ins: editar crea una copia en userMeditations (no modifica el original)
    const isBuiltin = !userMeditations.find(u=>u.id===m.id);
    const editId    = isBuiltin ? 'new-copy-'+m.id : m.id;
    setMedEditForm({
      ...m,
      id: isBuiltin ? 'um_'+Date.now() : m.id,
      tags: (m.tags||[]).join(', '),
      _originalId: isBuiltin ? m.id : null,
    });
    setMedEditId(editId);
  }
  function saveMedEdit() {
    if (!medEditForm?.title?.trim()) return;
    const { _originalId, ...rest } = medEditForm;
    const saved = { ...rest,
      tags: (rest.tags||'').split(',').map(t=>t.trim()).filter(Boolean) };
    // Si es copia de built-in, ocultar el original y guardar la copia
    if (_originalId) {
      setHiddenMeds(hs => [...hs.filter(h=>h!==_originalId), _originalId]);
      setUserMeditations(ms => [...(ms||[]), saved]);
    } else if (medEditId === 'new' || medEditId?.startsWith('um_') || medEditId?.startsWith('new-copy-')) {
      setUserMeditations(ms => { ms = ms||[];
        const idx = ms.findIndex(m=>m.id===saved.id);
        return idx>=0 ? ms.map(m=>m.id===saved.id?saved:m) : [...ms, saved];
      });
    } else {
      setUserMeditations(ms => (ms||[]).map(m=>m.id===medEditId?saved:m));
    }
    setMedEditId(null); setMedEditForm(null);
  }
  function deleteMed(id) {
    // Confirmacion inline — sin window.confirm (que puede bloquearse)
    setConfirmDelId(id);
  }
  function confirmDelete(id) {
    const isUser = !!userMeditations.find(u=>u.id===id);
    if (isUser) {
      setUserMeditations(ms => (ms||[]).filter(m => m.id !== id));
    } else {
      setHiddenMeds(hs => [...hs.filter(h=>h!==id), id]);
    }
    if (meditationSel?.id === id) setMeditationSel(null);
    setConfirmDelId(null);
  }

  const MEDITATIONS_DEEP = window.BINAURAL_DATA.MEDITATIONS_DEEP || [];
  // Filtrar built-ins ocultas (editadas → reemplazadas por copia de usuario)
  const safeHidden = Array.isArray(hiddenMeds) ? hiddenMeds : [];
  const allMeditations = React.useMemo(() => [
    ...MEDITATIONS_DEEP.filter(m => !safeHidden.includes(m.id)),
    ...MEDITATIONS_SEED.filter(m => !safeHidden.includes(m.id)),
    ...(Array.isArray(userMeditations) ? userMeditations : []),
  ], [userMeditations, safeHidden]);
  function loadRitual(r){
    if(programPlaying)stopAllAudio(false);
    const p=normalizePatch({leftHz:r.leftHz,rightHz:r.rightHz,carrierHz:r.carrierHz,beatHz:r.beatHz,solfeggioHz:r.solfeggioHz,noiseType:r.noiseType,noiseAmount:r.noiseAmt,modulation:r.modulation,modSpeed:r.modSpeed,sessionMinutes:r.duration});
    setLeftHzRaw(p.leftHz);setRightHzRaw(p.rightHz);_setCarrierHz(p.carrierHz);_setBeatHz(p.beatHz);
    setSolfeggioHz(p.solfeggioHz);setNoiseType(p.noiseType);setNoiseAmt(p.noiseAmount);setModulation(p.modulation);setModSpeed(p.modSpeed);setSessionMin(p.sessionMinutes);setReading(`${r.glyph} ${r.name} — ${r.description}`);setTab('player');
  }

  const RITUALS_LIST = (window.BINAURAL_DATA && window.BINAURAL_DATA.RITUALS) || [];
  const [wavExporting,setWavExporting]=useState(false);
  const [wavSeconds,setWavSeconds]=useState(30);
  async function exportSynthesis(){
    setWavExporting(true);
    try{const blob=await window.renderPatchToWav(patch,wavSeconds);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`binaural-${leftHz}-${rightHz}-${wavSeconds}s.wav`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(error){setWarning('No se pudo exportar: '+error.message);}
    finally{setWavExporting(false);}
  }
  function stopAllAudio(graceful=false){
    engineRef.current?.stop(graceful);
    scapeRef.current?.stop(false);setScapeType(null);window._nanookScapeMeta=null;
    extGenerationRef.current++;
    for(const v of Object.values(extCtxRef.current)){try{v.source?.stop();}catch{}v.ctx.close().catch(()=>{});}
    extCtxRef.current={};setExtPlaying({});
    window.NanookTTS?.stop();stopReverbAmbience();
    setPlaying(false);setElapsed(0);setProgramPlaying(false);setActiveProgram(null);window._nanookMeta=null;
    if(sessionStarted)finishSession();
  }
  transportRef.current={toggle:togglePlay,stop:()=>stopAllAudio(false),end:()=>stopAllAudio(false)};
  useEffect(()=>{
    window._binauralTransport={toggle:()=>transportRef.current.toggle(),stop:()=>transportRef.current.stop()};
    return()=>{transportRef.current.stop();delete window._binauralTransport;};
  },[]);
  useEffect(()=>{
    const id=setTimeout(()=>writeStore('studioPatch',{...patch,sessionMinutes:sessionMin||20}),250);
    return()=>clearTimeout(id);
  },[solfeggioHz,carrierHz,beatHz,leftHz,rightHz,volume,solGain,binGain,noiseAmt,noiseType,modulation,modSpeed,beatDrift,beatDriftSpeed,fadeSeconds,sessionMin,leftGain,rightGain,linkMode]);

  const TABS = [{k:'player',l:'Estudio'},{k:'library',l:'Biblioteca'},{k:'programs',l:'Programas'},{k:'sessions',l:'Sesiones'},{k:'meditations',l:'Meditaciones'},{k:'rituals',l:'Rituales'}];
  const [libFilter, setLibFilter] = useState('intenciones'); // todos | intenciones | gateway | ia | mios

  return (
    <div className="fade-in">
      <div className="topbar" style={{marginBottom:16}}>
        <div>
          <div className="kicker" style={{color:'var(--blue)'}}>ESCUCHA · CREA · CONSERVA</div>
          <h1 style={{fontSize:30}}>{{player:'Laboratorio sonoro',library:'Biblioteca',programs:'Programas',sessions:'Sesiones',meditations:'Meditaciones',rituals:'Rituales'}[tab]}</h1>
        </div>
      </div>

      {/* Aviso de seguridad */}
      <div style={{marginBottom:16,padding:'10px 16px',borderRadius:'var(--r)',display:'flex',gap:10,alignItems:'flex-start',
        background:'color-mix(in oklab, var(--gold) 8%, transparent)',border:'1px solid color-mix(in oklab, var(--gold) 25%, transparent)'}}>
        <Icon.warn size={15} style={{color:'var(--gold)',flexShrink:0,marginTop:2}}/>
        <span style={{fontSize:12.5,color:'var(--ink-dim)',lineHeight:1.5}}>
          <strong style={{color:'var(--gold)'}}>Uso responsable.</strong> Usa audífonos cómodos a volumen bajo. Detén la sesión si sientes molestia.
          No usar conduciendo ni operando maquinaria. No reemplaza atención médica.
        </span>
      </div>

      {/* Sugerencia entrante desde Reset Cosmos / otros módulos */}
      {incomingSuggestion && incomingSuggestion.solfeggioHz && (
        <div style={{marginBottom:16,padding:'10px 16px',borderRadius:'var(--r)',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',
          background:'color-mix(in oklab, var(--blue) 8%, transparent)',border:'1px solid color-mix(in oklab, var(--blue) 25%, transparent)'}}>
          <span style={{fontSize:12.5,color:'var(--ink-dim)',lineHeight:1.5}}>
            {incomingSuggestion.archetypeEmoji || '🎧'} Sugerencia desde <strong>Bóveda del Observador</strong>
            {incomingSuggestion.archetypeName ? ` (arquetipo ${incomingSuggestion.archetypeName})` : ''}:
            frecuencia solfeggio <strong style={{color:'var(--blue)'}}>{incomingSuggestion.solfeggioHz} Hz</strong>.
          </span>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-primary" style={{fontSize:11.5}} onClick={() => {
              setSolfeggioHz(incomingSuggestion.solfeggioHz);
              setTab('player');
              setIncomingSuggestion(null);
            }}>Aplicar frecuencia</button>
            <button className="btn btn-ghost" style={{fontSize:11.5}} onClick={() => setIncomingSuggestion(null)}>Descartar</button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div role="navigation" aria-label="Secciones de BINAURAL SYSTEM" className="binaural-tabs" style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--hair-faint)',paddingBottom:0,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
        {TABS.map(t=>(
          <button key={t.k} aria-current={tab===t.k?'page':undefined} onClick={()=>{setWarning(null);setTab(t.k);}}
            style={{background:'none',border:'none',borderBottom:tab===t.k?'2px solid var(--blue)':'2px solid transparent',
              color:tab===t.k?'var(--ink)':'var(--ink-faint)',fontFamily:'var(--mono)',fontSize:11,
              letterSpacing:'.14em',textTransform:'uppercase',padding:'10px 12px',cursor:'pointer',marginBottom:-1,
              whiteSpace:'nowrap',flexShrink:0}}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── TAB: PLAYER ── */}
      {tab==='player'&&(
        <div className="studio-layout">

          {/* Reproductor */}
          <div className="studio-player" style={{display:'grid',gap:14}}>

            {/* Visualizador + Transport */}
            <Card>
              <FieldRings color="var(--blue)" size={320} top="50%" left="110%" opacity={0.2} count={4}/>
              <div style={{height:220,borderRadius:'var(--r)',overflow:'hidden',position:'relative',marginBottom:14}}>
                <BinauralVisualizer playing={playing} patch={patch} analyserGetter={()=>engineRef.current?.getAnalyser?.()}/>
                <div style={{position:'absolute',top:10,left:10,right:10,display:'flex',justifyContent:'space-between',pointerEvents:'none'}}>
                  <div style={{padding:'3px 10px',borderRadius:20,background:'#00000066',backdropFilter:'blur(4px)',
                    fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:'.14em',color:'rgba(200,210,240,0.7)'}}>
                    {playing?'● REPRODUCIENDO':programPlaying?'◎ PROGRAMA':'EN PAUSA'}
                  </div>
                  <div style={{padding:'3px 10px',borderRadius:20,background:'#00000066',backdropFilter:'blur(4px)',
                    fontFamily:'var(--mono)',fontSize:11,color:'rgba(200,210,240,0.8)'}}>
                    {fmtTime(elapsed)} / {fmtTime(sessionMin*60)}
                  </div>
                </div>
                <div style={{position:'absolute',bottom:10,left:10,right:10,pointerEvents:'none'}}>
                  <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:12.5,
                    color:'rgba(180,190,220,0.6)',lineHeight:1.4}}>{reading}</div>
                </div>
              </div>

              <div style={{height:3,borderRadius:2,background:'var(--hair-faint)',marginBottom:14,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${progressPct}%`,transition:'width .3s',
                  background:'linear-gradient(90deg,var(--blue),oklch(0.72 0.15 280))'}}/>
              </div>

              <div style={{display:'grid',gap:10}}>
                <button className="btn btn-primary btn-block btn-lg" onClick={togglePlay} disabled={unsupported||!window.NanookAudioEngine}>
                  <Icon.bolt size={18}/> {playing?'■ Detener sesión':'▶ Iniciar sesión'}
                </button>
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,
                  background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                  <Icon.bolt size={14} style={{color:'var(--blue)',flexShrink:0}}/>
                  <span style={{fontFamily:'var(--mono)',fontSize:9.5,color:'var(--ink-faint)',letterSpacing:'.1em',
                    textTransform:'uppercase',flexShrink:0,minWidth:48}}>Volumen</span>
                  <input type="range" min="0.01" max="0.70" step="0.01" value={volume}
                    onChange={e=>setVolume(+e.target.value)} style={{flex:1}}/>
                  <span className="tnum" style={{fontSize:11,color:'var(--blue)',minWidth:36,textAlign:'right'}}>
                    {Math.round(volume*100)}%</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <button className="btn" onClick={savePreset} style={{fontSize:12}}><Icon.star size={14}/> Guardar preset</button>
                  <button className="btn" onClick={exportSynthesis} disabled={wavExporting}>{wavExporting?'Exportando…':'↓ WAV estéreo'}</button>

                </div>
              </div>

              <div className="export-options section-note"><label>Duración del WAV <select aria-label="Duración del WAV" value={wavSeconds} onChange={e=>setWavSeconds(+e.target.value)}><option value={30}>30 s</option><option value={120}>2 min</option><option value={300}>5 min</option></select></label><span>Síntesis estéreo: binaural, tono y ruido. Sin ambientes, archivos ni voz.</span></div>
              {/* Stats en vivo */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:14}}>
                {[
                  {l:'Oído L',v:`${leftHz}`,u:'Hz',sub:'canal izquierdo'},
                  {l:'Δ Binaural',v:`${+Math.abs(rightHz-leftHz).toFixed(2)}`,u:'Hz',sub:beatLabel.split('·')[0].trim()},
                  {l:'Oído R',v:`${rightHz}`,u:'Hz',sub:'canal derecho'},
                ].map(({l,v,u,sub})=>(
                  <div key={l} style={{padding:'10px 12px',borderRadius:'var(--r-sm)',background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                    <div className="kicker">{l}</div>
                    <div className="tnum" style={{fontSize:18,margin:'4px 0',color:'var(--blue)'}}>{v}<span style={{fontSize:11,color:'var(--ink-faint)',marginLeft:2}}>{u}</span></div>
                    <div style={{fontSize:10,color:'var(--ink-faint)',fontFamily:'var(--mono)'}}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
                <div style={{padding:'8px 12px',borderRadius:'var(--r-sm)',background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                  <div className="kicker">Portadora</div>
                  <div className="tnum" style={{fontSize:16,color:'var(--magenta)',margin:'3px 0'}}>{carrierHz}Hz</div>
                  <div style={{fontSize:10,color:'var(--ink-faint)',fontFamily:'var(--mono)'}}>{beatLabel}</div>
                </div>
                <div style={{padding:'8px 12px',borderRadius:'var(--r-sm)',background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                  <div className="kicker">Solfeggio activo</div>
                  <div style={{fontSize:12.5,margin:'3px 0',color:'var(--ink)'}}>{curSol.tone.split(',')[0]}</div>
                  <div style={{fontSize:10,color:'var(--ink-faint)',fontFamily:'var(--mono)'}}>{curSol.meaning}</div>
                </div>
              </div>
            </Card>

          </div>

          {/* Controles de estudio */}
          <div className="studio-controls" style={{display:'grid',gap:14}}>

            {/* ── Card Frecuencias ── */}
            <Card className="studio-frequencies">
              <CardHead title="Frecuencias" sub="PORTADORA · OÍDO L/R · SOLFEGGIO"/>

              {/* Modo de enlace L/R */}
              <div style={{marginBottom:12}}>
                <div className="kicker" style={{marginBottom:6}}>Modo de enlace</div>
                <div style={{display:'flex',gap:6}}>
                  {[
                    {v:'free',   l:'🆓 Libre',     hint:'cada oído 100% independiente'},
                    {v:'delta',  l:'🔗 Δ fijo',    hint:'mover un oído desplaza el otro en paralelo'},
                    {v:'carrier',l:'🎯 Centro fijo',hint:'mover un oído refleja el otro alrededor de la portadora'},
                  ].map(m=>(
                    <button key={m.v} className={`chip ${linkMode===m.v?'on':''}`}
                      onClick={()=>setLinkMode(m.v)} title={m.hint}
                      style={{flex:1,justifyContent:'center',fontSize:10.5}}>{m.l}</button>
                  ))}
                </div>
                <div style={{marginTop:5,fontSize:10.5,color:'var(--ink-ghost)'}}>
                  {linkMode==='free'?'Libre · portadora, oído L y oído R 100% independientes. El solfeggio fija la portadora (verde = coinciden).':
                   linkMode==='delta'?'Δ fijo · el beat se mantiene; ambos oídos se desplazan juntos':
                   'Centro fijo · la portadora se mantiene; los oídos se abren en espejo'}
                </div>
              </div>

              {/* Portadora */}
              <div style={{marginBottom:14}}>
                <BKnob label="Portadora" value={carrierHz} min={20} max={1000} step={0.5} unit=" Hz" onChange={setCarrierHz}
                  accent={carrierAccent}
                  hint={carrierMatchesSolf
                    ? `${carrierHz}Hz · ✓ coincide con el solfeggio (${solfeggioHz}Hz)`
                    : `${carrierHz}Hz · ${linkMode==='free'?'independiente (referencia)':'desplaza el par'} · ${carrierHz<150?'grave · resonancia profunda':carrierHz<280?'media · zona natural para binaural':'alta · más aérea y etérea'}`}/>
                <button className="btn btn-ghost" onClick={matchCarrierToSolfeggio}
                  style={{marginTop:6,width:'100%',fontSize:11,
                    borderColor: carrierMatchesSolf?'var(--green)':'var(--hair)',
                    color: carrierMatchesSolf?'var(--green)':'var(--ink-dim)'}}>
                  {carrierMatchesSolf ? '✓ Portadora = solfeggio' : `✦ Igualar al solfeggio (${solfeggioHz}Hz)`}
                </button>
              </div>

              {/* Oídos */}
              <div className="kicker" style={{marginBottom:8}}>Oídos L / R</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <BKnob label="Oído L" value={leftHz} min={20} max={1000} step={0.5} unit=" Hz" onChange={setLeftHz}
                  hint={`${leftHz}Hz · canal izquierdo`}/>
                <BKnob label="Oído R" value={rightHz} min={20} max={1000} step={0.5} unit=" Hz" onChange={setRightHz}
                  hint={`${rightHz}Hz · canal derecho`}/>
              </div>

              {/* Entrada numérica exacta + ajuste fino ±0.1 */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
                {[
                  {l:'L exacto', v:leftHz,    set:setLeftHz},
                  {l:'Portadora',v:carrierHz, set:setCarrierHz, accent:carrierAccent},
                  {l:'R exacto', v:rightHz,   set:setRightHz},
                ].map(f=>(
                  <div key={f.l} style={{padding:'7px 8px',borderRadius:'var(--r-sm)',
                    background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:8.5,color:'var(--ink-ghost)',
                      letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>{f.l}</div>
                    <div style={{display:'flex',gap:3,alignItems:'center'}}>
                      <button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:11}}
                        onClick={()=>f.set(Math.max(20,+(f.v-0.1).toFixed(2)))}>−</button>
                      <input aria-label={f.l} type="number" step="0.1" min="20" max="1000" value={f.v}
                        onChange={e=>{const n=parseFloat(e.target.value);if(!isNaN(n)&&n>=20&&n<=1000)f.set(+n.toFixed(2));}}
                        style={{width:'100%',background:'transparent',border:'none',color:f.accent||'var(--blue)',
                          fontFamily:'var(--mono)',fontSize:13,textAlign:'center',outline:'none',transition:'color .2s'}}/>
                      <button className="btn btn-ghost" style={{padding:'2px 6px',fontSize:11}}
                        onClick={()=>f.set(Math.min(1000,+(f.v+0.1).toFixed(2)))}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{padding:'8px 12px',borderRadius:'var(--r-sm)',background:'var(--obsidian-2)',
                border:'1px solid color-mix(in oklab, var(--magenta) 30%, transparent)',marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontFamily:'var(--mono)',fontSize:9.5,color:'var(--ink-faint)',
                    letterSpacing:'.12em',textTransform:'uppercase'}}>Δ Binaural</span>
                  <span className="tnum" style={{fontSize:15,color:'var(--magenta)',fontWeight:700}}>
                    {+(rightHz-leftHz).toFixed(2)}Hz
                  </span>
                </div>
                <div style={{fontSize:11,color:'var(--ink-dim)',marginTop:3}}>{beatLabel}</div>
              </div>

              {/* Solfeggio */}
              <div>
                <div className="kicker" style={{marginBottom:6}}>Frecuencia Solfeggio</div>
                <select value={solfeggioHz} onChange={e=>pickSolfeggio(Number(e.target.value))}
                  style={{width:'100%',background:'var(--obsidian-2)',border:'1px solid var(--hair)',borderRadius:8,
                    padding:'8px 12px',color:'var(--ink)',fontSize:13,fontFamily:'var(--mono)'}}>
                  {SOLFEGGIO.map(s=><option key={s.hz} value={s.hz}>{s.hz}Hz — {s.label} · {s.meaning}</option>)}
                </select>
                <div style={{marginTop:6,fontSize:11.5,color:'var(--ink-ghost)',lineHeight:1.4,
                  padding:'6px 10px',borderRadius:6,background:'var(--obsidian-2)'}}>
                  ◈ {curSol.tone} — {curSol.meaning}
                </div>
              </div>
            </Card>

            <div className="studio-subnav" aria-label="Capas del estudio">{[{k:'mix',l:'Mezcla y modulación'},{k:'scapes',l:'Ambientes y ruido'},{k:'audio',l:'Audio personal'}].map(x=><button key={x.k} className={`btn ${studioSection===x.k?'studio-tab-active':''}`} aria-pressed={studioSection===x.k} onClick={()=>setStudioSection(x.k)}>{x.l}</button>)}</div>
            {/* ── Card Mezcla y Modulación ── */}
            <Card className="studio-mix" style={{display:studioSection==='mix'?'block':'none'}}>
              <CardHead title="Mezcla y modulación" sub="CAPAS · RUIDO · TIMING"/>
              <div style={{display:'grid',gap:14}}>

                {/* Capas */}
                <div>
                  <div className="kicker" style={{marginBottom:8}}>Capas de audio</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <BKnob label="Binaural" value={binGain} min={0} max={0.9} step={0.01} onChange={setBinGain}
                      hint={`${+(binGain*100).toFixed(0)}% · onda binaural pura`}/>
                    <BKnob label="Solfeggio" value={solGain} min={0} max={0.8} step={0.01} onChange={setSolGain}
                      hint={`${+(solGain*100).toFixed(0)}% · tono solfeggio`}/>
                  </div>
                </div>

                {/* Volumen por oído */}
                <div>
                  <div className="kicker" style={{marginBottom:8}}>Volumen por oído</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <BKnob label="Vol L" value={leftGain} min={0} max={1.2} step={0.01} onChange={setLeftGain}
                      hint={`${+(leftGain*100).toFixed(0)}% · izquierdo`}/>
                    <BKnob label="Vol R" value={rightGain} min={0} max={1.2} step={0.01} onChange={setRightGain}
                      hint={`${+(rightGain*100).toFixed(0)}% · derecho`}/>
                  </div>
                </div>

                {/* Modulación */}
                <div>
                  <div className="kicker" style={{marginBottom:8}}>Modulación · Solfeggio</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <BKnob label="Profundidad" value={modulation} min={0} max={0.5} step={0.01} onChange={setModulation}
                      hint={modulation<0.1?'apagado':modulation<0.25?'sutil · pulso suave':'notable · respiración del tono'}/>
                    <BKnob label="Velocidad" value={modSpeed} min={0.02} max={0.3} step={0.005} unit=" Hz" onChange={setModSpeed}
                      hint={`${modSpeed<0.06?'lenta · marea profunda':modSpeed<0.15?'media · pulso regular':'rápida · energizante'}`}/>
                  </div>
                </div>

                {/* Deriva binaural */}
                <div>
                  <div className="kicker" style={{marginBottom:8}}>Deriva · Beat Binaural</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <BKnob label="Amplitud" value={beatDrift} min={0} max={3} step={0.1} unit=" Hz" onChange={setBeatDrift}
                      hint={beatDrift===0?'sin deriva · beat fijo':beatDrift<1?'suave · beat vivo':beatDrift<2?'media · ola lenta':'intensa · beat respira'}/>
                    <BKnob label="Ciclo" value={beatDriftSpeed} min={0.01} max={0.2} step={0.005} unit=" Hz" onChange={setBeatDriftSpeed}
                      hint={`${beatDriftSpeed<0.04?'muy lento · ~'+(1/beatDriftSpeed|0)+'s':beatDriftSpeed<0.1?'lento · ~'+(1/beatDriftSpeed|0)+'s':'rápido · ~'+(1/beatDriftSpeed|0)+'s'}`}/>
                  </div>
                </div>

                {/* Temporizado */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <BKnob label="Fade in/out" value={fadeSeconds} min={1} max={12} step={1} unit=" s" onChange={setFadeSeconds}
                    hint="suavidad de entrada y salida"/>
                  <BKnob label="Duración" value={sessionMin} min={1} max={120} step={1} unit=" min" onChange={setSessionMin}
                    hint={`${sessionMin<15?'sesión corta':sessionMin<40?'sesión estándar':'sesión larga'}`}/>
                </div>
              </div>
            </Card>

            {/* ── Atmósfera: ruido + ambiente + audio personal ── */}
            {window.SOUNDSCAPES && (
              <Card className="studio-atmosphere" style={{display:studioSection==='mix'?'none':'block'}}>
                <CardHead title={studioSection==='audio'?'Audio personal':'Atmósfera'} sub={studioSection==='audio'?'ARCHIVOS · NIVEL · REPETICIÓN':'RUIDO · AMBIENTES SINTETIZADOS'}/>
                <div hidden={studioSection!=='scapes'}>

                {/* Ruido de fondo */}
                <div style={{marginBottom:14,padding:'10px 12px',borderRadius:'var(--r)',
                  background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                  <div className="kicker" style={{marginBottom:8}}>Ruido de fondo</div>
                  <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:8}}>
                    <div style={{display:'flex',gap:6,flex:1}}>
                      {(window.BINAURAL_DATA?.NOISE_TYPES||[]).map(n=>(
                        <button key={n.id} className={`chip ${noiseType===n.id?'on':''}`}
                          onClick={()=>setNoiseType(n.id)}
                          style={{flex:1,justifyContent:'center',fontSize:11}}
                          title={n.description}>
                          {n.name||n.label||n.id}
                        </button>
                      ))}
                    </div>
                    <input type="range" min="0" max="0.5" step="0.01" value={noiseAmt}
                      onChange={e=>setNoiseAmt(+e.target.value)} style={{width:80}}/>
                    <span className="tnum" style={{fontSize:11,color:'var(--blue)',minWidth:32,textAlign:'right'}}>
                      {Math.round(noiseAmt*100)}%
                    </span>
                  </div>
                  <div style={{fontSize:10.5,color:'var(--ink-ghost)'}}>
                    {noiseType==='pink'?'Rosa · el más relajante, espectro natural, ideal para Alpha/Theta':
                     noiseType==='white'?'Blanco · energético, favorece enfoque Beta, enmascara distracciones':'Marrón · grave y envolvente, profundo, ideal para Delta y meditación larga'}
                  </div>
                </div>

                <div className="kicker" style={{marginBottom:6}}>Naturaleza</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:10}}>
                  {(window.SOUNDSCAPES||[]).filter(s=>s.cat==='naturaleza').map(s=>(
                    <button key={s.k} onClick={()=>toggleScape(s.k)}
                      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                        padding:'8px 4px',borderRadius:'var(--r-sm)',cursor:'pointer',
                        background:scapeType===s.k?'var(--obsidian-3)':'var(--obsidian-2)',
                        border:`1.5px solid ${scapeType===s.k?s.color:'var(--hair-faint)'}`,transition:'all .15s'}}>
                      <span style={{fontSize:18}}>{s.icon}</span>
                      <span style={{fontFamily:'var(--mono)',fontSize:9,color:scapeType===s.k?s.color:'var(--ink-faint)',
                        letterSpacing:'.06em',textTransform:'uppercase'}}>{s.l}</span>
                    </button>
                  ))}
                </div>
                <div className="kicker" style={{marginBottom:6}}>Sagrado</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,marginBottom:12}}>
                  {(window.SOUNDSCAPES||[]).filter(s=>s.cat==='sagrado').map(s=>(
                    <button key={s.k} onClick={()=>toggleScape(s.k)}
                      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                        padding:'8px 4px',borderRadius:'var(--r-sm)',cursor:'pointer',
                        background:scapeType===s.k?'var(--obsidian-3)':'var(--obsidian-2)',
                        border:`1.5px solid ${scapeType===s.k?s.color:'var(--hair-faint)'}`,transition:'all .15s'}}>
                      <span style={{fontSize:16}}>{s.icon}</span>
                      <span style={{fontFamily:'var(--mono)',fontSize:8.5,color:scapeType===s.k?s.color:'var(--ink-faint)',
                        letterSpacing:'.06em',textTransform:'uppercase',lineHeight:1.2,textAlign:'center'}}>{s.l}</span>
                    </button>
                  ))}
                </div>
                {scapeType && (
                  <div style={{display:'flex',gap:10,alignItems:'center'}}>
                    <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                      background:(window.SOUNDSCAPES||[]).find(s=>s.k===scapeType)?.color||'var(--blue)',
                      boxShadow:`0 0 8px ${(window.SOUNDSCAPES||[]).find(s=>s.k===scapeType)?.color||'var(--blue)'}`,
                      animation:'pulse 2s ease-in-out infinite'}}/>
                    <span style={{fontSize:12,color:'var(--ink-dim)',flex:1}}>
                      {(window.SOUNDSCAPES||[]).find(s=>s.k===scapeType)?.desc}
                    </span>
                    <input type="range" min="0" max="1" step="0.02" value={scapeVol}
                      onChange={e=>setScapeVol(+e.target.value)} style={{width:80}}/>
                    <span className="tnum" style={{fontSize:11,color:'var(--blue)',minWidth:30}}>
                      {Math.round(scapeVol*100)}%
                    </span>
                    <button className="btn btn-ghost" style={{padding:'5px 8px',fontSize:11,color:'var(--magenta)'}}
                      onClick={()=>{scapeRef.current?.stop(true);setScapeType(null);}}>■</button>
                  </div>
                )}

                </div>
                {/* Audio personal */}
                <div hidden={studioSection!=='audio'} style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--hair-faint)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div className="kicker">Audio personal · MP3, WAV, OGG</div>
                <label className="btn file-picker"><Icon.plus size={14}/> Subir audio
                  <input aria-label="Subir audio personal" type="file" accept="audio/*"
                    onChange={e=>{const f=e.target.files?.[0];if(f)loadExtAudio(f);e.target.value='';}}/>
                </label>
              </div>
              <div style={{fontSize:11.5,color:'var(--ink-faint)',marginBottom:8,lineHeight:1.5}}>
                Los audios se guardan solo en este dispositivo (no se sincronizan con la nube).
              </div>
              {extAudios.length===0 ? (
                <div style={{fontSize:13,color:'var(--ink-ghost)',fontStyle:'italic',padding:'8px 0'}}>
                  Sube un audio personal — música, canto, voz guía, mantras.
                </div>
              ) : (
                <div style={{display:'grid',gap:8}}>
                  {extAudios.map(a=>(
                    <div key={a.id} style={{display:'flex',gap:10,alignItems:'center',
                      padding:'10px 12px',borderRadius:10,background:'var(--obsidian-2)',
                      border:`1px solid ${extPlaying[a.id]?'color-mix(in oklab, var(--blue) 30%, transparent)':'var(--hair-faint)'}`}}>
                      <button onClick={()=>toggleExtAudio(a)}
                        style={{width:32,height:32,borderRadius:'50%',border:'none',cursor:'pointer',
                          background:extPlaying[a.id]?'var(--magenta)':'var(--blue)',
                          color:'#fff',fontSize:13,display:'grid',placeItems:'center',flexShrink:0}}>
                        {extPlaying[a.id]?'■':'▶'}
                      </button>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                        <div style={{fontFamily:'var(--mono)',fontSize:9.5,color:'var(--ink-ghost)'}}>{a.size}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-faint)'}}>Vol</span>
                        <input type="range" min="0" max="1" step="0.02" value={a.vol??0.7}
                          onChange={e=>setExtVol(a.id,+e.target.value)} style={{width:60}}/>
                        <span className="tnum" style={{fontSize:10,color:'var(--blue)',minWidth:28}}>
                          {Math.round((a.vol??0.7)*100)}%
                        </span>
                      </div>
                      <label style={{cursor:'pointer'}}>
                        <input type="checkbox" checked={a.loop||false} style={{display:'none'}}
                          onChange={e=>setExtLoop(a.id,e.target.checked)}/>
                        <span className={`chip ${a.loop?'on':''}`} style={{fontSize:9}}>∞ Loop</span>
                      </label>
                      <button className="btn btn-ghost" style={{padding:6,color:'var(--magenta)'}}
                        onClick={()=>deleteExtAudio(a.id)}><Icon.trash size={13}/></button>
                    </div>
                  ))}
                </div>
              )}
                </div>{/* fin Audio personal */}
              </Card>
            )}

          </div>
        </div>
      )}

      {/* ── TAB: BIBLIOTECA ── */}
      {tab==='library'&&(
        <div>
          {/* Filtros */}
          <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
            {[
              {v:'todos',l:'Todos'},
              {v:'intenciones',l:'◎ Intenciones'},
              {v:'gateway',l:'◈ Gateway'},
              {v:'ia',l:'✦ Generador local / IA'},
              {v:'mios',l:'★ Míos'},
            ].map(f=>(
              <button key={f.v} className={`chip ${libFilter===f.v?'on':''}`}
                onClick={()=>setLibFilter(f.v)} style={{fontSize:11.5}}>{f.l}</button>
            ))}
          </div>

          <div className="grid g2" style={{alignItems:'start'}}>
            <div style={{display:'grid',gap:14}}>

              {/* ── Intenciones ── */}
              {(libFilter==='todos'||libFilter==='intenciones') && (
                <Card>
                  <CardHead title="Intenciones" sub="CARGA · EDITA · CONSERVA" right={<button className="btn" onClick={newIntention}>＋ Nueva intención</button>}/>
                  {intEditId&&intForm&&<section className="intentions-editor card" aria-label="Editor de intención"><div className="grid g2"><label>Nombre<input className="inp" aria-label="Nombre de la intención" value={intForm.name} onChange={e=>setIntForm(f=>({...f,name:e.target.value}))}/></label><label>Descripción<input className="inp" aria-label="Descripción de la intención" value={intForm.description||''} onChange={e=>setIntForm(f=>({...f,description:e.target.value}))}/></label>{[{k:'solfeggio',l:'Tono central · Hz',min:20,max:1200,step:1},{k:'carrier',l:'Portadora · Hz',min:20,max:1000,step:.1},{k:'beat',l:'Diferencia · Hz',min:0,max:100,step:.1},{k:'duration',l:'Duración · min',min:1,max:120,step:1}].map(({k,l,min,max,step})=><label key={k}>{l}<input className="inp" aria-label={l} type="number" min={min} max={max} step={step} value={intForm[k]??0} onChange={e=>setIntForm(f=>({...f,[k]:+e.target.value}))}/></label>)}</div><div className="player-actions" style={{marginTop:12}}><button className="btn btn-primary" onClick={saveIntention}>Guardar intención</button><button className="btn" onClick={()=>{setIntEditId(null);setIntForm(null);}}>Cancelar</button></div></section>}

                  <div style={{display:'grid',gap:6}}>
                    {allIntentions.map(it=>(
                      <div key={it.id} style={{padding:'10px 12px',borderRadius:'var(--r)',
                        border:`1px solid ${intentionId===it.id?'color-mix(in oklab, var(--blue) 45%, transparent)':'var(--hair-faint)'}`,
                        background:intentionId===it.id?'var(--blue-soft)':'var(--obsidian-2)',
                        cursor:'pointer',transition:'all .15s'}}
                        onClick={()=>{applyIntention(it);setWarning(`✓ "${it.name}" cargada al Estudio`);setTimeout(()=>setWarning(null),2000);}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <span style={{fontSize:16,width:22,textAlign:'center'}}>{it.glyph}</span>
                            <span style={{fontSize:13.5}}>{it.name}</span>
                          </div>
                          <span className="tnum" style={{fontSize:10,color:'var(--ink-faint)'}}>{it.solfeggio}·{it.beat}Hz</span>
                        </div>
                        <p style={{fontSize:12,color:'var(--ink-dim)',margin:'0 0 0 30px',lineHeight:1.4}}>{it.description}</p>
                        <div className="intention-actions"><button className="btn" onClick={e=>{e.stopPropagation();applyIntention(it);setTab('player');}}>Cargar</button><button className="btn btn-ghost" onClick={e=>{e.stopPropagation();editIntention(it);}}>Editar intención</button>{it.editable&&<button className="btn btn-ghost" onClick={e=>{e.stopPropagation();deleteIntention(it.id);}}>Eliminar intención</button>}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* ── Protocolos Gateway ── */}
              {(libFilter==='todos'||libFilter==='gateway') && (
                <Card>
                  <CardHead title="Protocolos Gateway" sub="PRESETS HEREDADOS · EDITABLES"/>
                  <p className="service-note">Presets heredados de RESET DETOX. Los nombres Focus son etiquetas de la biblioteca; sus frecuencias no acreditan estados mentales o efectos terapéuticos.</p>
                  {[
                    { level:10, name:'Focus 10', desc:'Mente despierta · cuerpo dormido', leftHz:200, rightHz:208, beatHz:8,  solfeggioHz:528, noise:'pink',  science:'Umbral Alpha-Theta. Primeros pasos del Gateway. El cuerpo entra en parálisis voluntaria mientras la mente permanece activa.' },
                    { level:12, name:'Focus 12', desc:'Conciencia expandida · visualización', leftHz:200, rightHz:204, beatHz:4,  solfeggioHz:396, noise:'brown', science:'Theta profundo. Acceso al inconsciente, visualización intensa, puerta al sueño lúcido. Gateway Stage 4.' },
                    { level:15, name:'Focus 15', desc:'Sin tiempo · disociación suave', leftHz:200, rightHz:202, beatHz:2,  solfeggioHz:963, noise:'brown', science:'Delta-Theta límite. Estado de "no tiempo". El ego se disuelve parcialmente. Gateway Stage 6.' },
                    { level:21, name:'Focus 21', desc:'Umbral · borde del espacio-tiempo', leftHz:200, rightHz:200.5, beatHz:0.5, solfeggioHz:963, noise:'brown', science:'Delta extremo. Monroe lo describía como el borde de la realidad ordinaria. Requiere práctica previa.' },
                  ].map(gw=>(
                    <div key={gw.level} style={{marginBottom:8,padding:'10px 12px',borderRadius:'var(--r)',
                      background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                        <div>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--blue)',fontWeight:700}}>{gw.name}</span>
                            <span style={{fontSize:12.5}}>{gw.desc}</span>
                          </div>
                          <div style={{fontFamily:'var(--mono)',fontSize:9.5,color:'var(--ink-ghost)',marginTop:3}}>
                            L:{gw.leftHz}Hz · R:{gw.rightHz}Hz · Δ{gw.beatHz}Hz · {gw.solfeggioHz}Hz Sol
                          </div>
                          <div style={{fontSize:11,color:'var(--ink-ghost)',marginTop:4,lineHeight:1.4,
                            borderLeft:'2px solid color-mix(in oklab, var(--blue) 30%, transparent)',paddingLeft:8}}>
                            {'Configuración experimental editable.'}
                          </div>
                        </div>
                        <button className="btn btn-primary" style={{fontSize:11,marginLeft:10,flexShrink:0}}
                          onClick={()=>{
                            setLeftHzRaw(gw.leftHz); setRightHzRaw(gw.rightHz);
                            _setBeatHz(gw.beatHz); _setCarrierHz((gw.leftHz+gw.rightHz)/2);
                            setSolfeggioHz(gw.solfeggioHz); setNoiseType(gw.noise);
                            setReading(`◈ ${gw.name} · ${gw.desc}`);
                            setWarning(`✓ ${gw.name} cargado al Estudio`);
                            setTimeout(()=>setWarning(null),2000);
                          }}>Cargar</button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>

            <div style={{display:'grid',gap:14}}>

              {/* ── Generador local / IA ── */}
              {(libFilter==='todos'||libFilter==='ia') && (
                <Card>
                  <CardHead title="Generador local / IA" sub="SELECCIÓN LOCAL · IA OPCIONAL"/>
                  <div style={{marginBottom:10,fontSize:12.5,color:'var(--ink-dim)',lineHeight:1.5}}>
                    Describe una idea. El selector local busca un punto de partida entre las intenciones; la conexión de IA es opcional y todavía no está configurada.
                  </div>
                  <textarea className="inp" rows={2}
                    value={aiGenConcept}
                    onChange={e=>setAiGenConcept(e.target.value)}
                    placeholder="Ej: sueño lúcido, meditación profunda, concentración sin tensión, exploración astral…"
                    style={{width:'100%',resize:'vertical',marginBottom:10,minHeight:56}}/>
                  <button className="btn btn-primary btn-block" onClick={aiGenerate} disabled={aiGenBusy||!aiGenConcept.trim()}>
                    {aiGenBusy ? '⏳ Generando…' : '✦ Crear configuración local'}
                  </button>
                  {aiGenError && (
                    <div style={{marginTop:8,fontSize:12,color:'var(--magenta)',padding:'6px 10px',
                      borderRadius:6,background:'color-mix(in oklab, var(--magenta) 8%, transparent)'}}>
                      {aiGenError}
                    </div>
                  )}
                  {aiGenResult && (
                    <div className="fade-in" style={{marginTop:12,padding:'12px 14px',borderRadius:'var(--r)',
                      background:'color-mix(in oklab, var(--blue) 6%, transparent)',
                      border:'1px solid color-mix(in oklab, var(--blue) 25%, transparent)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                        <div>
                          <div style={{fontFamily:'var(--serif)',fontSize:16,fontWeight:600,color:'var(--blue)'}}>{aiGenResult.name}</div>
                          <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ink-ghost)',marginTop:2}}>
                            {aiGenResult.brainState} · L:{aiGenResult.leftHz}Hz · R:{aiGenResult.rightHz}Hz · Δ{aiGenResult.beatHz}Hz · {aiGenResult.solfeggioHz}Hz Sol
                          </div>
                        </div>
                        <span style={{padding:'2px 8px',borderRadius:20,background:'var(--obsidian-2)',
                          fontFamily:'var(--mono)',fontSize:9.5,color:'var(--ink-faint)',flexShrink:0}}>
                          {aiGenResult.duration}min
                        </span>
                      </div>
                      <div style={{fontSize:12.5,color:'var(--ink-dim)',lineHeight:1.5,marginBottom:8}}>
                        {aiGenResult.description}
                      </div>
                      {aiGenResult.science_note && (
                        <div style={{fontSize:11.5,color:'var(--ink-ghost)',lineHeight:1.5,
                          padding:'6px 10px',borderRadius:6,background:'var(--obsidian-2)',marginBottom:10,
                          borderLeft:'2px solid color-mix(in oklab, var(--blue) 40%, transparent)'}}>
                          🔬 {aiGenResult.science_note}
                        </div>
                      )}
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-primary" style={{flex:1,fontSize:12}} onClick={()=>applyAiConfig(aiGenResult)}>
                          ▶ Cargar al Estudio
                        </button>
                        <button className="btn" style={{fontSize:12}} onClick={()=>saveAiPreset(aiGenResult)}>
                          <Icon.star size={13}/> Guardar en Míos
                        </button>
                        <button className="btn btn-ghost" style={{fontSize:12,padding:'7px 10px'}}
                          onClick={()=>setAiGenResult(null)}>✕</button>
                      </div>
                    </div>
                  )}
                  {/* Fallback aleatorio */}
                  <div style={{marginTop:12,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontFamily:'var(--mono)',fontSize:9.5,color:'var(--ink-ghost)',letterSpacing:'.1em',
                      textTransform:'uppercase'}}>Aleatorio:</span>
                    {GENERATOR_MODES.map(m=>(
                      <button key={m.id} className={`chip ${genMode===m.id?'on':''}`}
                        onClick={()=>{setGenMode(m.id); generate(m.id);}}
                        style={{fontSize:10}}>{m.label}</button>
                    ))}
                  </div>
                </Card>
              )}

              {/* ── Míos: presets guardados ── */}
              {(libFilter==='todos'||libFilter==='mios') && (
                <Card>
                  <CardHead title="Míos" sub="TUS CONFIGURACIONES GUARDADAS"/>
                  <div style={{display:'flex',gap:8,marginBottom:12}}>
                    <input className="inp" value={presetName} onChange={e=>setPresetName(e.target.value)}
                      placeholder="Guardar la configuración actual del Estudio…" style={{flex:1,fontSize:12}}/>
                    <button className="btn btn-primary" onClick={savePreset} style={{flex:'none'}}>
                      <Icon.plus size={15}/> Guardar
                    </button>
                  </div>
                  {presets.length===0
                    ? <div style={{color:'var(--ink-faint)',fontSize:13,padding:'14px 0',textAlign:'center',fontStyle:'italic'}}>
                        Aún no tienes configuraciones guardadas. Diseña una en el Estudio y guárdala aquí.
                      </div>
                    : <div style={{display:'grid',gap:8}}>
                        {presets.map(p=>(
                          <div key={p.id} style={{padding:'12px 14px',borderRadius:'var(--r)',
                            background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)',
                            display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
                            <div>
                              <div style={{fontWeight:600,fontSize:13.5,marginBottom:2}}>{p.name}</div>
                              <div className="tnum" style={{fontSize:10.5,color:'var(--ink-faint)'}}>
                                {p.solfeggioHz}Hz · Δ{p.beatHz}Hz · {p.noiseType} · {p.sessionMin}min
                              </div>
                            </div>
                            <div style={{display:'flex',gap:6,flexShrink:0}}>
                              <button className="btn" onClick={()=>{loadPreset(p);setTab('player');setWarning(`✓ "${p.name}" cargado al Estudio`);setTimeout(()=>setWarning(null),2000);}}
                                style={{fontSize:11.5}}>▶ Cargar</button>
                              <button className="btn btn-ghost" onClick={()=>setPresets(ps=>ps.filter(x=>x.id!==p.id))}
                                style={{padding:'6px 9px'}}><Icon.trash size={13}/></button>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PROGRAMAS ── */}
      {tab==='programs'&&(
        <div>
          {activeProgram&&(
            <Card style={{marginBottom:14,borderColor:'color-mix(in oklab, var(--magenta) 40%, transparent)'}}>
              <FieldRings color="var(--magenta)" size={280} top="50%" left="105%" opacity={0.3} count={4}/>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                <div>
                  <div className="kicker" style={{color:'var(--magenta)'}}>● PROGRAMA EN CURSO</div>
                  <div style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:600,marginTop:4}}>{activeProgram.name}</div>
                </div>
                <button className="btn" style={{color:'var(--magenta)'}} onClick={stopProgram}>■ Detener</button>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {activeProgram.stages.map((st,i)=>(
                  <div key={i} style={{padding:'6px 14px',borderRadius:20,
                    background:i===programStage?'var(--magenta)':i<programStage?'color-mix(in oklab, var(--blue) 20%, transparent)':'var(--obsidian-2)',
                    color:i===programStage?'#0a0a12':'var(--ink-faint)',fontFamily:'var(--mono)',fontSize:11}}>
                    {st.name} <span style={{opacity:0.7}}>{st.durationMin}m</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {/* Editor de programa */}
          {progEditId && progForm ? (
            <Card className="fade-in">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600}}>
                  {progForm.id.startsWith('prog_') ? 'Nuevo programa' : 'Editar programa'}
                </div>
                <button className="btn btn-ghost" style={{padding:7}} onClick={()=>{setProgEditId(null);setProgForm(null);}}>
                  <Icon.close size={16}/>
                </button>
              </div>
              <div style={{display:'grid',gap:12}}>
                <div style={{display:'grid',gridTemplateColumns:'48px 1fr',gap:8}}>
                  <input className="inp" value={progForm.glyph} onChange={e=>setProgForm(f=>({...f,glyph:e.target.value}))}
                    style={{textAlign:'center',fontSize:20}}/>
                  <input className="inp" value={progForm.name} onChange={e=>setProgForm(f=>({...f,name:e.target.value}))}
                    placeholder="Nombre del programa"/>
                </div>
                <textarea className="inp" value={progForm.description}
                  onChange={e=>setProgForm(f=>({...f,description:e.target.value}))}
                  placeholder="Descripción breve..." style={{minHeight:52}}/>
                <div className="kicker" style={{marginBottom:4}}>Etapas</div>
                {progForm.stages.map((st,i)=>(
                  <div key={i} style={{padding:'12px 14px',borderRadius:10,background:'var(--obsidian-2)',
                    border:'1px solid var(--hair-faint)',display:'grid',gap:8}}>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <input className="inp" value={st.name}
                        onChange={e=>updateStage(i,'name',e.target.value)}
                        placeholder="Nombre etapa" style={{flex:1}}/>
                      <button className="btn btn-ghost" style={{padding:6,color:'var(--magenta)'}}
                        onClick={()=>removeStage(i)} disabled={progForm.stages.length<=1}>
                        <Icon.trash size={13}/>
                      </button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                      {[
                        {k:'durationMin',l:'Duración',u:'min',min:1,max:120,step:1},
                        {k:'beatHz',l:'Beat Hz',u:'Hz',min:0.5,max:40,step:0.5},
                        {k:'solfeggioHz',l:'Solfeg.',u:'Hz',min:0,max:963,step:1},
                        {k:'modulation',l:'Modulac.',u:'',min:0,max:1,step:0.01},
                      ].map(({k,l,u,min,max,step})=>(
                        <label key={k}>
                          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-ghost)',
                            letterSpacing:'.1em',textTransform:'uppercase',display:'block',marginBottom:3}}>{l}</span>
                          <input type="number" className="inp" value={st[k]} min={min} max={max} step={step}
                            onChange={e=>updateStage(i,k,+e.target.value)}
                            style={{fontFamily:'var(--mono)',fontSize:13,textAlign:'center',padding:'6px'}}/>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn" onClick={addStage}><Icon.plus size={14}/> Agregar etapa</button>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn btn-primary" style={{flex:1}} onClick={saveProgram}>
                    <Icon.check size={15}/> Guardar programa
                  </button>
                  <button className="btn btn-ghost" onClick={()=>{setProgEditId(null);setProgForm(null);}}>Cancelar</button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
                <button className="btn btn-primary" onClick={newProgram}><Icon.plus size={15}/> Nuevo programa</button>
              </div>
              <div style={{display:'grid',gap:12}}>
                {allPrograms.map(p=>(
                  <Card key={p.id||p.code} style={{padding:'16px 18px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                          <span style={{fontSize:20}}>{p.glyph}</span>
                          <span style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:600}}>{p.name}</span>
                          <span className="tnum" style={{fontSize:10,color:'var(--ink-ghost)'}}>
                            {p.totalMin || p.stages.reduce((a,s)=>a+(s.durationMin||0),0)} min
                          </span>
                        </div>
                        <p style={{color:'var(--ink-dim)',fontSize:12.5,marginBottom:8}}>{p.description}</p>
                        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                          {p.stages.map((st,i)=>(
                            <span key={i} style={{padding:'2px 8px',borderRadius:20,background:'var(--obsidian-2)',
                              border:'1px solid var(--hair-faint)',fontFamily:'var(--mono)',fontSize:9.5,color:'var(--ink-dim)'}}>
                              {st.name} · {st.durationMin}m · {st.beatHz}Hz
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                        <button className="btn btn-primary" style={{fontSize:12}}
                          onClick={()=>startProgram(p)} disabled={programPlaying}>
                          {programPlaying&&(activeProgram?.id||activeProgram?.code)===(p.id||p.code)?'En curso…':'▶ Iniciar'}
                        </button>
                        <button className="btn btn-ghost" style={{fontSize:11,padding:'5px 10px'}}
                          onClick={()=>editProgram(p)}>
                          <Icon.edit size={12}/> Editar
                        </button>
                        {p.editable && (
                          <button className="btn btn-ghost" style={{fontSize:11,padding:'5px 10px',color:'var(--magenta)'}}
                            onClick={()=>deleteProgram(p.id)}>
                            <Icon.trash size={12}/>
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: SESIONES ── */}
      {tab==='sessions'&&(
        <div>
          {sessionStarted&&(
            <Card style={{marginBottom:14,borderColor:'color-mix(in oklab, var(--green) 35%, transparent)'}}>
              <CardHead title="Sesión en curso" sub={`Iniciada hace ${Math.floor((Date.now()-sessionStarted)/60000)} min`}/>
              <div style={{display:'grid',gap:10}}>
                <div>
                  <div className="kicker" style={{marginBottom:6}}>Estado de ánimo antes: {moodBefore}/10</div>
                  <div style={{display:'flex',gap:4}}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                      <button key={n} className={`chip ${moodBefore===n?'on':''}`} onClick={()=>setMoodBefore(n)} style={{padding:'4px 8px'}}>{n}</button>
                    ))}
                  </div>
                </div>
                <label className="section-note">Estado al terminar (opcional)<select aria-label="Estado al terminar" value={moodAfter??''} onChange={e=>setMoodAfter(e.target.value?+e.target.value:null)}><option value="">Sin registrar</option>{[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n}/10</option>)}</select></label>
                <input className="inp" value={sessionNote} onChange={e=>setSessionNote(e.target.value)} placeholder="Nota breve (opcional)…"/>
                <button className="btn btn-primary" onClick={finishSession}><Icon.check size={15}/> Cerrar sesión</button>
              </div>
            </Card>
          )}
          {sessions.length===0
            ? <div style={{color:'var(--ink-faint)',fontSize:14,padding:'24px',textAlign:'center',fontStyle:'italic'}}>
                Aún no hay sesiones registradas. Inicia una sesión desde el Estudio.
              </div>
            : (<>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
                  {[
                    {l:'Sesiones totales',v:sessions.length,c:'var(--blue)'},
                    {l:'Tiempo total',v:`${Math.floor(sessions.reduce((a,s)=>a+s.durationSec,0)/60)}m`,c:'var(--magenta)'},
                    {l:'Sesión más larga',v:`${Math.floor(Math.max(...sessions.map(s=>s.durationSec))/60)}m`,c:'var(--gold)'},
                    {l:'Ánimo promedio',v:(sessions.filter(s=>s.moodAfter).reduce((a,s)=>a+(s.moodAfter||0),0)/Math.max(1,sessions.filter(s=>s.moodAfter).length)).toFixed(1),c:'var(--green)'},
                  ].map(({l,v,c})=>(
                    <div key={l} className="kpi">
                      <div className="lab">{l}</div>
                      <div className="val tnum" style={{fontSize:24,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gap:8}}>
                  {sessions.map(s=>(
                    <div key={s.id} className="card" style={{padding:'12px 16px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
                        <div>
                          <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>{s.intentionName}</div>
                          <div className="tnum" style={{fontSize:10.5,color:'var(--ink-faint)'}}>
                            {s.solfeggioHz}Hz · {s.beatHz}Hz · {s.noiseType} · {Math.floor(s.durationSec/60)}m {s.durationSec%60}s
                          </div>
                          {s.note&&<div style={{fontSize:12.5,color:'var(--ink-dim)',marginTop:4,fontStyle:'italic'}}>{s.note}</div>}
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div className="tnum" style={{fontSize:11,color:'var(--ink-faint)'}}>{new Date(s.date).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</div>
                          {s.moodBefore&&<div style={{fontSize:10,color:'var(--ink-faint)',marginTop:2}}>Ánimo antes: {s.moodBefore}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>)
          }
        </div>
      )}

      {/* ── TAB: MEDITACIONES ── */}
      {tab==='meditations'&&(
        <div>
          <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
            <button className={`chip ${subTab!=='forge'?'on':''}`} onClick={()=>setSubTab('library')}>Biblioteca</button>
            <button className={`chip ${subTab==='forge'?'on':''}`} onClick={()=>setSubTab('forge')}>Forja de meditaciones</button>
          </div>

          {subTab!=='forge'&&(
            <div>
              {/* Modal editor de meditacion */}
              {medEditId && medEditForm && (
                <div style={{position:'fixed',inset:0,zIndex:2000,
                  background:'rgba(6,8,16,.85)',display:'grid',placeItems:'center'}}
                  onClick={()=>{setMedEditId(null);setMedEditForm(null);}}>
                  <div style={{background:'var(--panel)',borderRadius:'var(--r-lg)',padding:24,
                    border:'1px solid var(--hair)',width:520,maxWidth:'95vw',
                    maxHeight:'90vh',overflowY:'auto',boxShadow:'0 0 48px rgba(0,0,0,.75)'}}
                    onClick={e=>e.stopPropagation()}>
                    <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:600,marginBottom:16}}>
                      {medEditId==='new' ? 'Nueva meditación' : 'Editar meditación'}
                    </div>
                    <div style={{display:'grid',gap:12}}>
                      <input className="inp" placeholder="Título"
                        value={medEditForm.title}
                        onChange={e=>setMedEditForm(f=>({...f,title:e.target.value}))} autoFocus/>
                      <textarea className="inp" placeholder="Descripción breve (visible al abrir)"
                        value={medEditForm.desc||''}
                        onChange={e=>setMedEditForm(f=>({...f,desc:e.target.value}))}
                        style={{minHeight:60}}/>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                        <label>
                          <span className="fl" style={{display:'block',marginBottom:4}}>Duración (min)</span>
                          <input type="number" className="inp" min="1" max="60"
                            value={medEditForm.durationMin||15}
                            onChange={e=>setMedEditForm(f=>({...f,durationMin:+e.target.value}))}
                            style={{fontFamily:'var(--mono)'}}/>
                        </label>
                        <label>
                          <span className="fl" style={{display:'block',marginBottom:4}}>Tags (coma)</span>
                          <input className="inp" placeholder="relajación, sueño..."
                            value={medEditForm.tags||''}
                            onChange={e=>setMedEditForm(f=>({...f,tags:e.target.value}))}/>
                        </label>
                      </div>
                      <label>
                        <span className="fl" style={{display:'block',marginBottom:4}}>
                          Texto visual (lo que se muestra en pantalla — puede tener formato)
                        </span>
                        <textarea className="inp"
                          placeholder="Descripción completa, secciones, instrucciones de postura..."
                          value={medEditForm.script||''}
                          onChange={e=>setMedEditForm(f=>({...f,script:e.target.value}))}
                          style={{minHeight:80,fontSize:13}}/>
                      </label>
                      <label>
                        <span className="fl" style={{display:'block',marginBottom:4}}>
                          Guion de narración TTS (usa [pausa 5s] para silencios reales)
                        </span>
                        <textarea className="inp"
                          placeholder="Cierra los ojos.[pausa 4s]Respira lento.[pausa 6s]Siente el peso del cuerpo..."
                          value={medEditForm.narration||''}
                          onChange={e=>setMedEditForm(f=>({...f,narration:e.target.value}))}
                          style={{minHeight:120,fontFamily:'var(--mono)',fontSize:12}}/>
                      </label>
                      <div style={{fontSize:11,color:'var(--ink-ghost)'}}>
                        El narrador lee el guion TTS. Si no hay guion, lee el texto visual limpio.
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button className="btn btn-primary" style={{flex:1}} onClick={saveMedEdit}>
                          <Icon.check size={15}/> Guardar
                        </button>
                        <button className="btn btn-ghost" onClick={()=>{setMedEditId(null);setMedEditForm(null);}}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!meditationSel
                ? (<div>
                    {/* Boton nueva meditacion */}
                    <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12,gap:8}}>
                      <button className="btn btn-ghost" style={{fontSize:12}}
                        onClick={()=>setSubTab('forge')}>
                        ✦ Forja
                      </button>
                      <button className="btn btn-primary" style={{fontSize:12}}
                        onClick={openNewMed}>
                        <Icon.plus size={14}/> Nueva meditación
                      </button>
                    </div>
                    <div style={{display:'grid',gap:10}}>
                    {allMeditations.map(m=>{
                      return (
                      <div key={m.id} style={{display:'flex',gap:0,borderRadius:'var(--r)',
                        border:`1px solid ${m.script?.includes('[pausa')
                          ?'color-mix(in oklab, var(--gold) 20%, transparent)'
                          :'var(--hair-faint)'}`,overflow:'hidden'}}>
                        <div className="card" style={{flex:1,padding:'14px 16px',cursor:'pointer',
                          border:'none',borderRadius:0}}
                          onClick={()=>setMeditationSel(m)}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                            <div style={{fontFamily:'var(--serif)',fontSize:16,fontWeight:600}}>{m.title}</div>
                            {m.script?.includes('[pausa') && (
                              <span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--gold)',
                                letterSpacing:'.1em',border:'1px solid color-mix(in oklab, var(--gold) 30%, transparent)',
                                padding:'2px 6px',borderRadius:4}}>GUIADA</span>
                            )}
                          </div>
                          {m.desc && (
                            <div style={{fontSize:12,color:'var(--ink-faint)',marginBottom:5,lineHeight:1.5,
                              overflow:'hidden',display:'-webkit-box',WebkitLineClamp:1,
                              WebkitBoxOrient:'vertical'}}>
                              {m.desc.split('\n')[0]}
                            </div>
                          )}
                          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                            {(m.tags||[]).map(t=><span key={t} className="tag gold" style={{fontSize:8}}>{t}</span>)}
                            {m.durationMin&&<span className="tag blue" style={{fontSize:8}}>{m.durationMin} min</span>}
                          </div>
                        </div>
                        {/* Acciones en TODAS las meditaciones */}
                        <div style={{display:'flex',flexDirection:'column',
                          borderLeft:'1px solid var(--hair-faint)',flexShrink:0}}>
                          {confirmDelId === m.id ? (
                            // Confirmacion inline — sin window.confirm
                            <div style={{display:'flex',flexDirection:'column',gap:4,
                              padding:'8px 10px',background:'color-mix(in oklab, var(--magenta) 10%, transparent)'}}>
                              <div style={{fontSize:10,color:'var(--magenta)',textAlign:'center',
                                fontFamily:'var(--mono)',letterSpacing:'.08em'}}>¿Borrar?</div>
                              <button className="btn" style={{fontSize:11,padding:'4px 8px',
                                color:'var(--magenta)',borderColor:'color-mix(in oklab, var(--magenta) 30%, transparent)'}}
                                onClick={e=>{e.stopPropagation();confirmDelete(m.id);}}>
                                Sí
                              </button>
                              <button className="btn btn-ghost" style={{fontSize:11,padding:'4px 8px'}}
                                onClick={e=>{e.stopPropagation();setConfirmDelId(null);}}>
                                No
                              </button>
                            </div>
                          ) : (
                            <>
                              <button className="btn btn-ghost" style={{borderRadius:0,padding:'10px 14px',
                                borderBottom:'1px solid var(--hair-faint)',flex:1}}
                                title="Editar"
                                onClick={e=>{e.stopPropagation();openEditMed(m);}}>
                                <Icon.edit size={14}/>
                              </button>
                              <button className="btn btn-ghost" style={{borderRadius:0,padding:'10px 14px',
                                color:'var(--magenta)',flex:1}}
                                title="Eliminar"
                                onClick={e=>{e.stopPropagation();deleteMed(m.id);}}>
                                <Icon.trash size={14}/>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );})}</div>
                  </div>)
                : (<div>
                    <button className="btn" style={{marginBottom:14}} onClick={()=>{
                      setMeditationSel(null);
                      // NO detener TTS al volver a lista — sigue sonando en mini-player
                    }}>
                      <Icon.back size={15}/> Biblioteca
                    </button>
                    <Card style={{padding:28}}>
                      <FieldRings color="var(--gold)" size={320} top="50%" left="105%" opacity={0.2} count={4}/>
                      {/* Header */}
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                        <div>
                          <div style={{fontFamily:'var(--serif)',fontSize:24,fontWeight:600,marginBottom:8}}>
                            {meditationSel.title}
                          </div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            {(meditationSel.tags||[]).map(t=><span key={t} className="tag gold">{t}</span>)}
                            {meditationSel.durationMin&&<span className="tag blue">{meditationSel.durationMin} min</span>}
                          </div>
                        </div>
                      </div>
                      {/* Estructura rica de la meditacion */}
                      <div style={{marginBottom:20,paddingBottom:20,borderBottom:'1px solid var(--hair-faint)',
                        display:'grid',gap:16}}>

                        {/* Objetivo */}
                        {meditationSel.objective && (
                          <div style={{padding:'12px 16px',borderRadius:10,
                            background:'color-mix(in oklab, var(--gold) 6%, transparent)',
                            border:'1px solid color-mix(in oklab, var(--gold) 18%, transparent)'}}>
                            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--gold)',
                              letterSpacing:'.14em',textTransform:'uppercase',marginBottom:6}}>Objetivo</div>
                            <p style={{fontSize:14,color:'var(--ink-dim)',lineHeight:1.6,margin:0}}>
                              {meditationSel.objective}
                            </p>
                          </div>
                        )}

                        {/* Descripcion */}
                        {meditationSel.desc && (
                          <div>
                            {meditationSel.desc.split('\n\n').map((p,i)=>(
                              <p key={i} style={{fontSize:14,color:'var(--ink-dim)',lineHeight:1.7,margin:'0 0 10px'}}>
                                {p}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Respiracion */}
                        {meditationSel.breathing && (
                          <div style={{padding:'12px 16px',borderRadius:10,
                            background:'color-mix(in oklab, var(--blue) 6%, transparent)',
                            border:'1px solid color-mix(in oklab, var(--blue) 18%, transparent)'}}>
                            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--blue)',
                              letterSpacing:'.14em',textTransform:'uppercase',marginBottom:6}}>
                              Respiración recomendada
                            </div>
                            <p style={{fontSize:14,color:'var(--ink-dim)',lineHeight:1.6,margin:0}}>
                              {meditationSel.breathing}
                            </p>
                          </div>
                        )}

                        {/* Recomendaciones */}
                        {meditationSel.recommendations && (
                          <div style={{padding:'12px 16px',borderRadius:10,
                            background:'color-mix(in oklab, var(--green) 5%, transparent)',
                            border:'1px solid color-mix(in oklab, var(--green) 15%, transparent)'}}>
                            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--green)',
                              letterSpacing:'.14em',textTransform:'uppercase',marginBottom:6}}>
                              Cuando y como
                            </div>
                            <p style={{fontSize:14,color:'var(--ink-dim)',lineHeight:1.6,margin:0}}>
                              {meditationSel.recommendations}
                            </p>
                          </div>
                        )}
                      </div>
                      {/* TTS — Narrador con controles completos */}
                      {(
                        <div style={{marginBottom:16,padding:'14px 16px',borderRadius:12,
                          background:'color-mix(in oklab, var(--blue) 7%, transparent)',
                          border:'1px solid color-mix(in oklab, var(--blue) 22%, transparent)'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:9.5,color:'var(--blue)',
                            letterSpacing:'.12em',textTransform:'uppercase',marginBottom:10}}>
                            Narrador · Meditación guiada
                          </div>

                          {/* Barra de progreso */}
                          {ttsPlaying && (
                            <div style={{height:3,borderRadius:2,background:'var(--hair-faint)',
                              overflow:'hidden',marginBottom:10}}>
                              <div style={{height:'100%',width:`${ttsProgress}%`,
                                background:'linear-gradient(90deg,var(--blue),var(--magenta))',
                                transition:'width .5s'}}/>
                            </div>
                          )}

                          {/* Controles principales */}
                          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}>
                            {!ttsPlaying ? (
                              <button className="btn btn-primary" style={{gap:8}}
                                onClick={()=>ttsRead(
                                  meditationSel.narration || meditationSel.script || meditationSel.title,
                                  meditationSel.title
                                )}>
                                ▶ Iniciar meditación
                              </button>
                            ) : (
                              <>
                                <button className="btn" style={{fontSize:14,padding:'8px 14px'}}
                                  onClick={ttsPauseToggle}>
                                  {ttsPaused ? '▶ Reanudar' : '⏸ Pausa'}
                                </button>
                                <button className="btn btn-ghost" style={{fontSize:13,color:'var(--magenta)'}}
                                  onClick={ttsStop}>■ Detener</button>
                                {ttsPlaying && !ttsPaused && (
                                  <span style={{fontFamily:'var(--mono)',fontSize:10,
                                    color:'var(--blue)',marginLeft:4,animation:'pulse 2s infinite'}}>
                                    ● narrando
                                  </span>
                                )}
                              </>
                            )}
                          </div>

                          {/* Aviso ducking: Sistema + binaural activo */}
                          {playing && ttsBackend === 'browser' && (
                            <div style={{marginBottom:10,padding:'8px 12px',borderRadius:8,
                              background:'color-mix(in oklab, var(--gold) 8%, transparent)',
                              border:'1px solid color-mix(in oklab, var(--gold) 25%, transparent)',
                              display:'flex',gap:10,alignItems:'flex-start'}}>
                              <Icon.warn size={13} style={{color:'var(--gold)',flexShrink:0,marginTop:1}}/>
                              <div style={{flex:1}}>
                                <span style={{fontSize:11.5,color:'var(--ink-dim)',lineHeight:1.5}}>
                                  El backend <strong style={{color:'var(--gold)'}}>Sistema</strong> puede bajar el volumen del binaural al narrar (ducking del OS). La compensación automática está activa (+9dB). Para mezcla perfecta sin ducking usa{' '}
                                  <button style={{background:'none',border:'none',cursor:'pointer',
                                    color:'var(--blue)',fontFamily:'var(--mono)',fontSize:11,padding:0,
                                    textDecoration:'underline'}}
                                    onClick={()=>setTtsBackend('openai')}>OpenAI</button>.
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Motor de voz — selector de backend */}
                          <div style={{marginBottom:10}}>
                            {/* Chips de backend */}
                            <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
                              {[
                                { k:'openai',      l:'OpenAI ★' },
                                { k:'elevenlabs',  l:'ElevenLabs' },
                                { k:'browser',     l:'Sistema' },
                              ].map(({k,l}) => (
                                <button key={k}
                                  onClick={() => setTtsBackend(k)}
                                  style={{
                                    padding:'5px 12px',
                                    borderRadius:20,
                                    fontSize:11,
                                    fontFamily:'var(--mono)',
                                    letterSpacing:'.06em',
                                    cursor:'pointer',
                                    border: ttsBackend===k
                                      ? '1.5px solid var(--blue)'
                                      : '1.5px solid var(--hair-faint)',
                                    background: ttsBackend===k
                                      ? 'color-mix(in oklab, var(--blue) 18%, transparent)'
                                      : 'transparent',
                                    color: ttsBackend===k ? 'var(--blue)' : 'var(--ink-faint)',
                                  }}>
                                  {l}
                                </button>
                              ))}
                            </div>

                            {ttsBackend!=='browser'&&<p className="service-note">Proveedor remoto sin conectar. La voz del sistema está disponible sin cuenta; este proveedor necesita configurar su acceso antes de usarlo.</p>}
                            {/* Panel OpenAI */}
                            {ttsBackend === 'openai' && (
                              <div style={{marginBottom:8}}>
                                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-faint)',
                                  letterSpacing:'.1em',textTransform:'uppercase',marginBottom:6}}>
                                  Voz OpenAI
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:8}}>
                                  {OPENAI_VOICES.map(v => (
                                    <div key={v.id}
                                      onClick={() => setOaiVoice(v.id)}
                                      style={{
                                        display:'flex',flexDirection:'column',gap:3,
                                        padding:'8px 10px',borderRadius:10,cursor:'pointer',
                                        background: oaiVoice===v.id
                                          ? 'color-mix(in oklab, var(--blue) 14%, var(--obsidian-2))'
                                          : 'var(--obsidian-2)',
                                        border: `1.5px solid ${oaiVoice===v.id ? 'var(--blue)' : 'var(--hair-faint)'}`,
                                        transition:'border-color .15s,background .15s',
                                      }}>
                                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                        <span style={{
                                          fontFamily:'var(--mono)',fontSize:10.5,
                                          color: oaiVoice===v.id ? 'var(--blue)' : 'var(--ink)',
                                        }}>{v.label}</span>
                                        <button
                                          onClick={e => { e.stopPropagation(); previewVoice('openai', v.id); }}
                                          disabled={previewBusy}
                                          style={{
                                            background:'none',border:'none',cursor:'pointer',
                                            padding:'2px 4px',
                                            color: previewBusy ? 'var(--ink-ghost)' : 'var(--ink-faint)',
                                            fontSize:11,lineHeight:1,
                                          }}>
                                          {previewBusy && oaiVoice===v.id ? '◌' : '▶'}
                                        </button>
                                      </div>
                                      <span style={{fontSize:9.5,color:'var(--ink-ghost)',lineHeight:1.3}}>
                                        {v.desc}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {/* Modelo */}
                                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                                  <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-ghost)',
                                    letterSpacing:'.08em',textTransform:'uppercase'}}>Calidad:</span>
                                  {[
                                    { k:'tts-1',    l:'Estándar' },
                                    { k:'tts-1-hd', l:'HD ✦' },
                                  ].map(({k,l}) => (
                                    <button key={k}
                                      onClick={() => setOaiModel(k)}
                                      style={{
                                        padding:'4px 10px',borderRadius:16,fontSize:10,
                                        fontFamily:'var(--mono)',cursor:'pointer',
                                        border: oaiModel===k
                                          ? '1.5px solid var(--blue)'
                                          : '1.5px solid var(--hair-faint)',
                                        background: oaiModel===k
                                          ? 'color-mix(in oklab, var(--blue) 18%, transparent)'
                                          : 'transparent',
                                        color: oaiModel===k ? 'var(--blue)' : 'var(--ink-faint)',
                                      }}>
                                      {l}
                                    </button>
                                  ))}
                                </div>
                                {/* Nota sobre idioma */}
                                <div style={{marginTop:8,padding:'7px 10px',borderRadius:8,
                                  background:'color-mix(in oklab, var(--gold) 6%, transparent)',
                                  border:'1px solid color-mix(in oklab, var(--gold) 18%, transparent)'}}>
                                  <span style={{fontSize:10,color:'var(--ink-faint)',lineHeight:1.5}}>
                                    💡 Estas voces hablan en el idioma del texto — si el guion es en español, narran en español. El acento es neutro-americano. Para acento latinoamericano nativo, usa{' '}
                                    <span style={{color:'var(--gold)',fontFamily:'var(--mono)',fontSize:9.5}}>ElevenLabs</span>.
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Panel ElevenLabs */}
                            {ttsBackend === 'elevenlabs' && (
                              <div style={{marginBottom:8}}>
                                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-faint)',
                                  letterSpacing:'.1em',textTransform:'uppercase',marginBottom:6}}>
                                  Voice ID · ElevenLabs
                                </div>
                                <div style={{display:'flex',gap:8,marginBottom:6}}>
                                  <input className="cfg-sel"
                                    value={elVoiceId}
                                    onChange={e => setElVoiceId(e.target.value)}
                                    placeholder="ej. pNInz6obpgDQGcFmaJgB"
                                    style={{flex:1,fontFamily:'var(--mono)',fontSize:11}}/>
                                  <button
                                    onClick={() => previewVoice('elevenlabs', elVoiceId)}
                                    disabled={previewBusy || !elVoiceId.trim()}
                                    style={{
                                      padding:'8px 14px',borderRadius:10,fontSize:12,
                                      background:'transparent',cursor:'pointer',
                                      border:'1.5px solid var(--hair-faint)',
                                      color: (!elVoiceId.trim() || previewBusy) ? 'var(--ink-ghost)' : 'var(--ink)',
                                      flexShrink:0,
                                    }}>
                                    {previewBusy ? '◌' : '▶'}
                                  </button>
                                </div>
                                <div style={{fontSize:10.5,color:'var(--ink-ghost)',lineHeight:1.6}}>
                                  Obtén tu Voice ID en{' '}
                                  <span style={{color:'var(--ink-faint)',fontFamily:'var(--mono)',fontSize:10}}>
                                    elevenlabs.io → Voices
                                  </span>.
                                  La clave va en Vercel → Settings → <span style={{fontFamily:'var(--mono)',fontSize:10}}>ELEVENLABS_API_KEY</span>.
                                </div>
                                {elError && (
                                  <div style={{marginTop:6,fontSize:11.5,
                                    color:'var(--magenta)',lineHeight:1.4}}>
                                    ⚠ {elError}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Panel Browser (sistema) */}
                            {ttsBackend === 'browser' && (
                              <div style={{marginBottom:8}}><button className="btn" onClick={()=>previewVoice('browser')}>Probar voz del sistema</button>
                                <select aria-label="Voz del sistema" className="cfg-sel" style={{fontSize:11,width:'100%'}}
                                  value={ttsVoice} onChange={e => setTtsVoice(e.target.value)}>
                                  <option value="">Voz del sistema (español)</option>
                                  {systemVoices
                                    .filter(v => v.lang.startsWith('es') || v.lang.startsWith('ES'))
                                    .map(v => (
                                      <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                                    ))}
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Velocidad (solo browser) + Volumen (todos) */}
                          <div style={{display:'grid',
                            gridTemplateColumns: ttsBackend==='browser' ? '1fr 1fr' : '1fr',
                            gap:10,marginBottom:8}}>
                            {ttsBackend === 'browser' && (
                              <div>
                                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-faint)',
                                  letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>
                                  Velocidad
                                </div>
                                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                                  <input type="range" min="0.5" max="1.3" step="0.02"
                                    value={ttsRate} onChange={e => setTtsRate(+e.target.value)}
                                    style={{flex:1}}/>
                                  <span className="tnum" style={{fontSize:10,color:'var(--blue)',minWidth:28}}>
                                    {ttsRate.toFixed(2)}x
                                  </span>
                                </div>
                              </div>
                            )}
                            <div>
                              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-faint)',
                                letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>
                                Volumen voz
                              </div>
                              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                                <input aria-label="Volumen de narración" type="range" min="0" max="1" step="0.02"
                                  value={ttsVolume} onChange={e => setTtsVolume(+e.target.value)}
                                  style={{flex:1}}/>
                                <span className="tnum" style={{fontSize:10,color:'var(--blue)',minWidth:28}}>
                                  {Math.round(ttsVolume*100)}%
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Reverb ambiental */}
                          <div>
                            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-faint)',
                              letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>
                              Ambiente / Reverb
                            </div>
                            <div style={{display:'flex',gap:8,alignItems:'center'}}>
                              <input type="range" min="0" max="1" step="0.05"
                                aria-label="Ambiente de narración" value={reverbLevel} onChange={e=>{
                                  const v = +e.target.value;
                                  setReverbLevel(v);
                                  if (ttsPlaying) setReverbVol(v * 0.18);
                                  else if (v > 0 && !ttsPlaying) {
                                    // Preview rápido del reverb
                                    startReverbAmbience(v * 0.18);
                                    setTimeout(stopReverbAmbience, 2000);
                                  }
                                }}
                                style={{flex:1}}/>
                              <span className="tnum" style={{fontSize:10,color:'var(--blue)',minWidth:28}}>
                                {Math.round(reverbLevel*100)}%
                              </span>
                            </div>
                            <div style={{fontSize:10.5,color:'var(--ink-ghost)',marginTop:4}}>
                              Sala acustica ambiental. 0 = seco · 100 = caverna
                            </div>
                          </div>
                          <div style={{marginTop:8,fontSize:11,color:'var(--ink-ghost)'}}>
                            Pausas [pausa Xs] = silencios reales. Headings y markdown se omiten.
                          </div>
                        </div>
                      )}
                      {/* Guion — colapsable, muestra narration completa con pausas */}
                      {(meditationSel.narration || meditationSel.script) && (
                        <div style={{marginTop:6}}>
                          {/* Header colapsable */}
                          <button onClick={()=>setGuionOpen(o=>!o)}
                            style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                              width:'100%',background:'none',border:'none',cursor:'pointer',
                              padding:'8px 0',marginBottom:guionOpen?8:0}}>
                            <div style={{display:'flex',gap:10,alignItems:'center'}}>
                              <span className="kicker" style={{margin:0}}>Guion de la meditación</span>
                              {meditationSel.narration && (
                                <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-ghost)',
                                  padding:'2px 7px',borderRadius:10,background:'var(--obsidian-2)',
                                  border:'1px solid var(--hair-faint)'}}>
                                  TTS completo
                                </span>
                              )}
                            </div>
                            <span style={{fontSize:14,color:'var(--ink-faint)',
                              transition:'transform .2s',
                              display:'inline-block',transform:guionOpen?'rotate(180deg)':'rotate(0deg)'}}>
                              ▾
                            </span>
                          </button>

                          {guionOpen && (
                            <div className="fade-in" style={{
                              maxHeight:520, overflowY:'auto',
                              padding:'14px 16px', borderRadius:'var(--r)',
                              background:'var(--obsidian-2)',
                              border:'1px solid var(--hair-faint)',
                              lineHeight:1.75
                            }}>
                              {(meditationSel.narration || meditationSel.script || '')
                                .split(/\[pausa\s+(\d+(?:\.\d+)?)s?\]/gi)
                                .reduce((acc, part, i) => {
                                  // split con captura alterna entre texto y valor de pausa
                                  if (i % 2 === 0) {
                                    if (part.trim()) acc.push({ type:'text', content:part.trim(), key:i });
                                  } else {
                                    acc.push({ type:'pause', secs:part, key:i });
                                  }
                                  return acc;
                                }, [])
                                .map(item => item.type === 'text' ? (
                                  <div key={item.key} style={{marginBottom:6,fontSize:14,color:'var(--ink-dim)'}}>
                                    {item.content.split('\n').map((line,li)=>(
                                      <React.Fragment key={li}>
                                        {line}
                                        {li < item.content.split('\n').length-1 && <br/>}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                ) : (
                                  <div key={item.key} style={{
                                    display:'flex',alignItems:'center',gap:8,
                                    margin:'10px 0',opacity:0.45
                                  }}>
                                    <div style={{flex:1,height:1,background:'var(--hair-faint)'}}/>
                                    <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--blue)',
                                      letterSpacing:'.1em'}}>
                                      ⏸ {item.secs}s
                                    </span>
                                    <div style={{flex:1,height:1,background:'var(--hair-faint)'}}/>
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </div>
                      )}
                      {meditationSel.recommendedProgram&&(
                        <div style={{marginTop:20,padding:'10px 14px',borderRadius:'var(--r)',background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                          <div className="kicker" style={{marginBottom:4}}>Programa recomendado</div>
                          <div style={{fontSize:13.5}}>
                            {allPrograms.find(p=>(p.code||p.id)===meditationSel.recommendedProgram)?.name||meditationSel.recommendedProgram}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>)
              }
            </div>
          )}

          {subTab==='forge'&&(
            <div className="grid g2" style={{alignItems:'start'}}>
              {showVarMgr && <MedVarsManager vars={effMedVars} setVars={setMedVars} onClose={()=>setShowVarMgr(false)}/>}
              <div>
                <Card style={{marginBottom:14}}>
                  <CardHead title="Forja de meditaciones" sub="BORRADOR LOCAL EDITABLE"/>
                  <div style={{display:'grid',gap:12}}>
                    <div>
                      <div className="kicker" style={{marginBottom:6}}>Concepto o tema central *</div>
                      <input className="inp" value={forgeInput.concept} onChange={e=>setForgeInput(f=>({...f,concept:e.target.value}))} placeholder="ej: el foco ante el impulso"/>
                    </div>
                    <div>
                      <div className="kicker" style={{marginBottom:6}}>Intención (opcional)</div>
                      <input className="inp" value={forgeInput.intention} onChange={e=>setForgeInput(f=>({...f,intention:e.target.value}))} placeholder="ej: soltar la urgencia"/>
                    </div>
                    <div>
                      <div className="kicker" style={{marginBottom:6}}>Arquetipo</div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        {['ZEUS','SELENE','MARTE','VENUS','TIERRA','GEA'].map(a=>(
                          <button key={a} className={`chip ${forgeInput.archetype===a?'on':''}`} onClick={()=>setForgeInput(f=>({...f,archetype:a}))} style={{fontSize:10}}>{a}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="kicker" style={{marginBottom:6}}>Duración: {forgeInput.durationMin} min</div>
                      <input type="range" min="5" max="30" value={forgeInput.durationMin} onChange={e=>setForgeInput(f=>({...f,durationMin:Number(e.target.value)}))} style={{width:'100%'}}/>
                    </div>
                    <div style={{ borderTop:'1px solid var(--hair-faint)', paddingTop:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <div className="kicker">Variables de personalización</div>
                        <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 9px' }} onClick={()=>setShowVarMgr(true)}>⚙ Gestionar</button>
                      </div>
                      <MedVarsInputs vars={effMedVars} onChange={setMedVarValue}/>
                    </div>
                    <button className="btn btn-primary" onClick={forgeMeditation}
                      disabled={!forgeInput.concept.trim() || forgeBusy}>
                      {forgeBusy
                        ? <><span style={{display:'inline-block',animation:'spin 1s linear infinite'}}>◌</span> Creando borrador…</>
                        : <>✦ Crear borrador local</>}
                    </button>
                    {forgeError && (
                      <div style={{fontSize:11.5,color:'var(--gold)',marginTop:6}}>{forgeError}</div>
                    )}
                  </div>
                </Card>
              </div>
              <div>
                {forgeResult && (
                  <Card style={{padding:24}}>
                    <FieldRings color="var(--gold)" size={280} top="50%" left="105%" opacity={0.2} count={4}/>
                    <div style={{fontFamily:'var(--serif)',fontSize:20,fontWeight:600,marginBottom:6}}>
                      {forgeResult.title}
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                      {forgeResult.tags.map(t=><span key={t} className="tag gold" style={{fontSize:9}}>{t}</span>)}
                      <span className="tag blue" style={{fontSize:9}}>{forgeResult.durationMin} min</span>
                    </div>
                    {/* Descripcion */}
                    {forgeResult.desc && (
                      <p style={{fontSize:13,color:'var(--ink-dim)',lineHeight:1.6,marginBottom:12}}>
                        {forgeResult.desc}
                      </p>
                    )}
                    {/* Preview del guion — [pausa Xs] renderizados como separadores */}
                    <div style={{marginBottom:14,padding:'12px 14px',borderRadius:10,
                      background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)',
                      maxHeight:280,overflowY:'auto'}}>
                      <div style={{fontFamily:'var(--mono)',fontSize:8.5,color:'var(--ink-ghost)',
                        letterSpacing:'.12em',textTransform:'uppercase',marginBottom:8}}>
                        Vista previa del guion
                      </div>
                      {(forgeResult.script||'')
                        .split(/\[pausa\s+(?:\d+(?:\.\d+)?)s?\]/gi)
                        .map((block,i,arr)=>(
                          <React.Fragment key={i}>
                            {block.trim() && (
                              <p style={{fontSize:13,color:'var(--ink-dim)',lineHeight:1.6,
                                margin:'0 0 4px',fontStyle:'normal'}}>
                                {block.trim()}
                              </p>
                            )}
                            {i < arr.length-1 && (
                              <div style={{display:'flex',alignItems:'center',gap:8,
                                margin:'6px 0',opacity:0.35}}>
                                <div style={{flex:1,height:1,background:'var(--hair-faint)'}}/>
                                <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-ghost)',
                                  letterSpacing:'.12em'}}>· · ·</span>
                                <div style={{flex:1,height:1,background:'var(--hair-faint)'}}/>
                              </div>
                            )}
                          </React.Fragment>
                        ))
                      }
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button className="btn btn-primary" style={{flex:1}} onClick={saveForgeResult}>
                        <Icon.plus size={15}/> Guardar en mi biblioteca
                      </button>
                      <button className="btn btn-ghost" onClick={()=>setForgeResult(null)}>
                        Descartar
                      </button>
                    </div>
                  </Card>
                )}
                {!forgeResult&&(
                  <div style={{color:'var(--ink-faint)',fontSize:14,textAlign:'center',padding:'40px 20px',
                    border:'1px dashed var(--hair-faint)',borderRadius:'var(--r-lg)',fontStyle:'italic'}}>
                    Aquí aparecerá un borrador local editable, con pausas para narrarlo.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: RITUALES ── */}
      {tab==='rituals'&&(
        <div>
          <div style={{marginBottom:20}}>
            <div className="kicker" style={{color:'var(--blue)',marginBottom:4}}>◉ RITUALES DEL DETOX</div>
            <p style={{fontSize:13.5,color:'var(--ink-dim)',lineHeight:1.6,margin:0}}>
              Secuencias guiadas para momentos específicos del proceso. Selecciona un ritual para cargarlo en el Laboratorio Sonoro.
            </p>
          </div>

          <div style={{display:'grid',gap:14}}>
            {RITUALS_LIST.map(r => (
              <Card key={r.id}>
                <div style={{display:'flex',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
                  {/* Glifo */}
                  <div style={{width:52,height:52,borderRadius:'50%',flexShrink:0,
                    background:'color-mix(in oklab, var(--blue) 10%, transparent)',
                    border:'1px solid color-mix(in oklab, var(--blue) 25%, transparent)',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontFamily:'var(--serif)',fontSize:22,color:'var(--blue)'}}>
                    {r.glyph}
                  </div>

                  {/* Info */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:4}}>
                      <span style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:600}}>{r.name}</span>
                      <span className="tag blue" style={{fontSize:9}}>{r.context}</span>
                      <span className="tag" style={{fontSize:9,color:'var(--ink-faint)'}}>{r.duration} min</span>
                    </div>
                    <div style={{fontSize:13,color:'var(--ink-dim)',lineHeight:1.5,marginBottom:10}}>
                      {r.description}
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                      {r.tags.map(t=><span key={t} className="chip" style={{fontSize:10,pointerEvents:'none'}}>{t}</span>)}
                    </div>

                    {/* Parámetros binaural compactos */}
                    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:14}}>
                      {[
                        {l:'Beat',v:`${r.beatHz} Hz`},
                        {l:'Solfeggio',v:`${r.solfeggioHz} Hz`},
                        {l:'Portadora',v:`${r.carrierHz} Hz`},
                        {l:'Ruido',v:r.noiseType},
                      ].map(({l,v})=>(
                        <div key={l} style={{padding:'5px 10px',borderRadius:8,
                          background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)'}}>
                          <div style={{fontFamily:'var(--mono)',fontSize:8.5,color:'var(--ink-ghost)',
                            letterSpacing:'.1em',textTransform:'uppercase'}}>{l}</div>
                          <div className="tnum" style={{fontSize:12,color:'var(--blue)',marginTop:1}}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Script preview */}
                    <details style={{marginBottom:14}}>
                      <summary style={{fontSize:11.5,color:'var(--ink-faint)',cursor:'pointer',
                        fontFamily:'var(--mono)',letterSpacing:'.08em',textTransform:'uppercase',listStyle:'none'}}>
                        ▸ Ver guión de meditación
                      </summary>
                      <div style={{marginTop:10,padding:'12px 14px',borderRadius:10,
                        background:'var(--obsidian-2)',border:'1px solid var(--hair-faint)',
                        maxHeight:240,overflowY:'auto'}}>
                        {(r.script||'').split(/\[pausa\s+\d+(?:\.\d+)?s?\]/gi).map((block,i,arr)=>(
                          <React.Fragment key={i}>
                            {block.trim()&&<p style={{fontSize:13,color:'var(--ink-dim)',lineHeight:1.6,margin:'0 0 4px'}}>{block.trim()}</p>}
                            {i<arr.length-1&&(
                              <div style={{display:'flex',alignItems:'center',gap:8,margin:'5px 0',opacity:.3}}>
                                <div style={{flex:1,height:1,background:'var(--hair-faint)'}}/>
                                <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ink-ghost)',letterSpacing:'.1em'}}>· · ·</span>
                                <div style={{flex:1,height:1,background:'var(--hair-faint)'}}/>
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </details>

                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button className="btn btn-primary" onClick={()=>loadRitual(r)}>
                        <Icon.bolt size={14}/> Cargar al laboratorio
                      </button>
                      <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>{
                        loadRitual(r);
                        setTimeout(()=>ttsRead(r.script, r.name), 600);
                      }}>
                        ▶ Iniciar con guía de voz
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {RITUALS_LIST.length===0&&(
              <div style={{color:'var(--ink-faint)',fontSize:14,textAlign:'center',
                padding:'40px 20px',border:'1px dashed var(--hair-faint)',borderRadius:'var(--r-lg)'}}>
                No hay rituales disponibles.
              </div>
            )}
          </div>
        </div>
      )}

      {warning&&<div className="binaural-toast" role="status"><span>{warning}</span><button className="btn btn-ghost" aria-label="Cerrar aviso" onClick={()=>setWarning(null)}>×</button></div>}

      {/* Modal disclaimer */}
      {showDisclaimer&&(
        <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" style={{position:'fixed',inset:0,zIndex:200,background:'#000000b0',backdropFilter:'blur(6px)',
          display:'grid',placeItems:'center',padding:20}}>
          <div style={{maxWidth:460,width:'100%',background:'var(--panel)',border:'1px solid var(--hair)',
            borderRadius:'var(--r-xl)',padding:'32px 28px'}}>
            <div className="kicker" style={{color:'var(--blue)',marginBottom:8}}>BINAURAL SYSTEM</div>
            <h2 id="welcome-title" style={{fontFamily:'var(--serif)',fontSize:26,fontWeight:600,margin:'0 0 16px'}}>Antes de empezar</h2>
            <p style={{color:'var(--ink-dim)',fontSize:14,lineHeight:1.6,marginBottom:12}}>
              Este laboratorio es una herramienta experimental de bienestar sonoro. No es un dispositivo médico ni garantiza ningún efecto específico.
            </p>
            <ul style={{color:'var(--ink-dim)',fontSize:13,lineHeight:1.7,paddingLeft:18,marginBottom:20}}>
              <li>Usa audífonos cómodos a volumen bajo.</li>
              <li>Sube el volumen muy despacio al iniciar.</li>
              <li>Detén la sesión si sientes molestia o mareo.</li>
              <li>No usar conduciendo ni operando maquinaria.</li>
              <li>No reemplaza atención médica o psicológica.</li>
            </ul>
            <button className="btn btn-primary btn-block btn-lg" onClick={()=>{
              setShowDisclaimer(false);
              try{localStorage.setItem('binaural-system:disclaimer:v1','1');}catch{}
            }}>Entendido · Entrar al laboratorio</button>
          </div>
        </div>
      )}

      {unsupported&&(
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#7f1d1d',color:'#fff',fontSize:13,padding:12,textAlign:'center',zIndex:99}}>
          Tu navegador no soporta Web Audio API. Prueba Chrome, Edge, Firefox o Safari recientes.
        </div>
      )}
    </div>
  );
}

window.Binaural = Binaural;

export default Binaural;
