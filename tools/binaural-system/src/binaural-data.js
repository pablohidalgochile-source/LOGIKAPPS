/* ============================================================
   NANOOK RESET — Datos del Laboratorio Binaural
   Solfeggio · Intenciones · Programas · Meditaciones · Generador
   ============================================================ */

const SOLFEGGIO = [
  { hz:174, label:"174 Hz", meaning:"Tierra · cuerpo denso",        tone:"profundo, estable, mineral",        color:"#3a4a5c" },
  { hz:285, label:"285 Hz", meaning:"Tejido · regeneración simbólica",tone:"suave, reparador, envolvente",    color:"#4a5d7a" },
  { hz:396, label:"396 Hz", meaning:"Raíz · liberación de tensión",  tone:"grave, introspectivo, firme",       color:"#5a4d7a" },
  { hz:417, label:"417 Hz", meaning:"Cambio · movimiento interior",  tone:"medio, flexible, luminoso",         color:"#7a4d6e" },
  { hz:528, label:"528 Hz", meaning:"Centro · armonía cálida",       tone:"claro, cálido, abierto",            color:"#7a6b4d" },
  { hz:639, label:"639 Hz", meaning:"Vínculo · corazón humano",      tone:"redondo, afectivo, presente",       color:"#4d7a6b" },
  { hz:741, label:"741 Hz", meaning:"Claridad · limpieza mental",    tone:"nítido, aireado, preciso",          color:"#4d6e7a" },
  { hz:852, label:"852 Hz", meaning:"Intuición · visión interior",   tone:"alto, expansivo, etéreo",           color:"#5d4d7a" },
  { hz:963, label:"963 Hz", meaning:"Silencio · unidad superior",    tone:"celeste, amplio, contemplativo",    color:"#6b7a8c" },
];

const NOISE_TYPES = [
  { id:"white", label:"Blanco", description:"Todo el espectro, plano" },
  { id:"pink",  label:"Rosa",   description:"Cálido, equilibrado" },
  { id:"brown", label:"Marrón", description:"Profundo, oceánico" },
];

const INTENTIONS = [
  { id:"focus",    name:"Enfoque profundo",      glyph:"◎", solfeggio:741, carrier:220,   beat:14,  noise:0.10, noiseType:"pink",  modulation:0.18, modSpeed:0.08, duration:25, hue:195, description:"Para estudiar, ordenar ideas y entrar en una atención más fina." },
  { id:"calm",     name:"Calma nocturna",         glyph:"☾", solfeggio:396, carrier:180,   beat:5,   noise:0.22, noiseType:"brown", modulation:0.12, modSpeed:0.05, duration:30, hue:235, description:"Para bajar intensidad, respirar más lento, soltar el ruido mental." },
  { id:"creative", name:"Creatividad simbólica",  glyph:"✦", solfeggio:528, carrier:210,   beat:8,   noise:0.08, noiseType:"pink",  modulation:0.28, modSpeed:0.10, duration:20, hue:280, description:"Para escribir, imaginar, diseñar y abrir asociaciones nuevas." },
  { id:"ritual",   name:"Meditación ritual",      glyph:"⟁", solfeggio:963, carrier:136.1, beat:4,   noise:0.18, noiseType:"brown", modulation:0.22, modSpeed:0.04, duration:33, hue:260, description:"Pausa interior, escucha contemplativa, gesto ceremonial." },
  { id:"energy",   name:"Energía suave",          glyph:"✶", solfeggio:417, carrier:240,   beat:16,  noise:0.06, noiseType:"white", modulation:0.30, modSpeed:0.12, duration:15, hue:35,  description:"Activación clara, no agresiva: presencia despierta." },
  { id:"cleanse",  name:"Limpieza mental",        glyph:"△", solfeggio:741, carrier:256,   beat:10,  noise:0.14, noiseType:"white", modulation:0.20, modSpeed:0.09, duration:18, hue:175, description:"Para despejar capas, reordenar y soltar lo que sobra." },
  { id:"sleep",    name:"Sueño / descanso",       glyph:"❍", solfeggio:174, carrier:110,   beat:2.5, noise:0.28, noiseType:"brown", modulation:0.14, modSpeed:0.03, duration:45, hue:215, description:"Descenso suave hacia un cuerpo más quieto." },
  { id:"art",      name:"Inspiración artística",  glyph:"❋", solfeggio:852, carrier:200,   beat:7,   noise:0.09, noiseType:"pink",  modulation:0.34, modSpeed:0.11, duration:22, hue:310, description:"Para abrir imaginería, color interno y juego simbólico." },
  { id:"breath",   name:"Respiración profunda",   glyph:"◌", solfeggio:285, carrier:160,   beat:6,   noise:0.16, noiseType:"pink",  modulation:0.40, modSpeed:0.06, duration:12, hue:165, description:"Modulación lenta acompasada al ciclo respiratorio." },
  { id:"contempl", name:"Estado contemplativo",   glyph:"○", solfeggio:963, carrier:174,   beat:3.5, noise:0.20, noiseType:"brown", modulation:0.18, modSpeed:0.04, duration:40, hue:245, description:"Escucha sin objetivo, dejar que el sonido haga su trabajo." },
];

// Programas multi-etapa (original, educativo, no médico)
const PROGRAMS = [
  {
    code:"focus_deep", name:"Enfoque profundo", glyph:"◎", totalMin:40,
    description:"Ciclo de cuatro fases para entrar en estado de flow y mantenerlo.",
    stages:[
      { name:"Calentamiento",  durationMin:5,  beatHz:12, solfeggioHz:741, modulation:0.16, modSpeed:0.09 },
      { name:"Entrada en foco",durationMin:10, beatHz:14, solfeggioHz:741, modulation:0.18, modSpeed:0.08 },
      { name:"Núcleo",         durationMin:20, beatHz:14, solfeggioHz:741, modulation:0.20, modSpeed:0.08 },
      { name:"Cierre",         durationMin:5,  beatHz:10, solfeggioHz:528, modulation:0.14, modSpeed:0.07 },
    ]
  },
  {
    code:"sleep_wind", name:"Descenso al descanso", glyph:"❍", totalMin:35,
    description:"Tres fases que guían el cuerpo de la vigilia al sueño profundo.",
    stages:[
      { name:"Relajación activa", durationMin:10, beatHz:8,   solfeggioHz:396, modulation:0.16, modSpeed:0.06 },
      { name:"Desaceleración",    durationMin:12, beatHz:5,   solfeggioHz:285, modulation:0.12, modSpeed:0.04 },
      { name:"Sueño suave",       durationMin:13, beatHz:2.5, solfeggioHz:174, modulation:0.10, modSpeed:0.03 },
    ]
  },
  {
    code:"creative_flow", name:"Flujo creativo", glyph:"✦", totalMin:30,
    description:"Apertura, expansión y cierre para una sesión de creación libre.",
    stages:[
      { name:"Apertura",    durationMin:5,  beatHz:9,  solfeggioHz:528, modulation:0.30, modSpeed:0.10 },
      { name:"Expansión",   durationMin:20, beatHz:7,  solfeggioHz:852, modulation:0.36, modSpeed:0.11 },
      { name:"Integración", durationMin:5,  beatHz:10, solfeggioHz:528, modulation:0.22, modSpeed:0.09 },
    ]
  },
  {
    code:"morning_ritual", name:"Ritual matutino", glyph:"✶", totalMin:18,
    description:"Transición del reposo a la presencia activa sin impulso artificial.",
    stages:[
      { name:"Despertar",     durationMin:5,  beatHz:6,  solfeggioHz:285, modulation:0.20, modSpeed:0.06 },
      { name:"Activación",    durationMin:8,  beatHz:12, solfeggioHz:417, modulation:0.28, modSpeed:0.10 },
      { name:"Claridad",      durationMin:5,  beatHz:10, solfeggioHz:741, modulation:0.18, modSpeed:0.09 },
    ]
  },
  {
    code:"reset_ritual", name:"Ritual de Reset", glyph:"⟁", totalMin:45,
    description:"El ciclo central del RESET: introspección, limpieza y reapertura.",
    stages:[
      { name:"Silencio",     durationMin:8,  beatHz:4,  solfeggioHz:963, modulation:0.20, modSpeed:0.04 },
      { name:"Liberación",   durationMin:10, beatHz:7,  solfeggioHz:396, modulation:0.24, modSpeed:0.07 },
      { name:"Presencia",    durationMin:15, beatHz:10, solfeggioHz:528, modulation:0.22, modSpeed:0.08 },
      { name:"Integración",  durationMin:8,  beatHz:8,  solfeggioHz:639, modulation:0.18, modSpeed:0.07 },
      { name:"Apertura",     durationMin:4,  beatHz:12, solfeggioHz:741, modulation:0.20, modSpeed:0.09 },
    ]
  },
  {
    code:"power_nap", name:"Siesta de poder", glyph:"◌", totalMin:22,
    description:"Descenso rápido y recuperación activa en tiempo breve.",
    stages:[
      { name:"Descenso",    durationMin:7,  beatHz:5,  solfeggioHz:285, modulation:0.14, modSpeed:0.05 },
      { name:"Reposo",      durationMin:10, beatHz:2,  solfeggioHz:174, modulation:0.10, modSpeed:0.03 },
      { name:"Retorno",     durationMin:5,  beatHz:10, solfeggioHz:417, modulation:0.22, modSpeed:0.09 },
    ]
  },
  {
    code:"breath_cycle", name:"Ciclo de respiración", glyph:"○", totalMin:20,
    description:"Acompañamiento sonoro para una práctica de respiración consciente.",
    stages:[
      { name:"Preparación",  durationMin:3,  beatHz:6,  solfeggioHz:285, modulation:0.38, modSpeed:0.06 },
      { name:"Ciclos",       durationMin:14, beatHz:6,  solfeggioHz:285, modulation:0.42, modSpeed:0.06 },
      { name:"Integración",  durationMin:3,  beatHz:5,  solfeggioHz:396, modulation:0.30, modSpeed:0.05 },
    ]
  },
  {
    code:"study_session", name:"Sesión de estudio", glyph:"△", totalMin:50,
    description:"Alternancia de fases de alta concentración con micro-pausas activas.",
    stages:[
      { name:"Calentamiento", durationMin:5,  beatHz:12, solfeggioHz:741, modulation:0.14, modSpeed:0.08 },
      { name:"Bloque 1",      durationMin:15, beatHz:15, solfeggioHz:741, modulation:0.18, modSpeed:0.08 },
      { name:"Micro-pausa",   durationMin:5,  beatHz:8,  solfeggioHz:528, modulation:0.20, modSpeed:0.07 },
      { name:"Bloque 2",      durationMin:15, beatHz:14, solfeggioHz:741, modulation:0.16, modSpeed:0.08 },
      { name:"Cierre",        durationMin:10, beatHz:10, solfeggioHz:528, modulation:0.18, modSpeed:0.07 },
    ]
  },
  {
    code:"deep_contempl", name:"Contemplación profunda", glyph:"❋", totalMin:60,
    description:"Sesión extendida de escucha interior sin objetivo específico.",
    stages:[
      { name:"Umbral",        durationMin:10, beatHz:7,  solfeggioHz:963, modulation:0.18, modSpeed:0.05 },
      { name:"Profundidad",   durationMin:40, beatHz:4,  solfeggioHz:963, modulation:0.16, modSpeed:0.04 },
      { name:"Emergencia",    durationMin:10, beatHz:8,  solfeggioHz:528, modulation:0.20, modSpeed:0.07 },
    ]
  },
  {
    code:"art_session", name:"Sesión artística", glyph:"❒", totalMin:35,
    description:"Para abrir imaginería interna durante creación visual o escritura.",
    stages:[
      { name:"Apertura",     durationMin:7,  beatHz:8,  solfeggioHz:852, modulation:0.32, modSpeed:0.10 },
      { name:"Flujo",        durationMin:23, beatHz:7,  solfeggioHz:852, modulation:0.38, modSpeed:0.11 },
      { name:"Cierre",       durationMin:5,  beatHz:10, solfeggioHz:528, modulation:0.24, modSpeed:0.09 },
    ]
  },
  {
    code:"night_quiet", name:"Noche quieta", glyph:"☾", totalMin:25,
    description:"Para el tramo entre el trabajo y el descanso: transición sin brusquedad.",
    stages:[
      { name:"Desaceleración",durationMin:10, beatHz:6,  solfeggioHz:396, modulation:0.18, modSpeed:0.06 },
      { name:"Quietud",       durationMin:15, beatHz:4,  solfeggioHz:285, modulation:0.14, modSpeed:0.04 },
    ]
  },
  {
    code:"energy_clear", name:"Energía limpia", glyph:"✺", totalMin:20,
    description:"Activación suave y limpieza mental para el mediodía o después de comer.",
    stages:[
      { name:"Limpieza",    durationMin:8,  beatHz:10, solfeggioHz:741, modulation:0.20, modSpeed:0.09 },
      { name:"Activación",  durationMin:12, beatHz:14, solfeggioHz:417, modulation:0.28, modSpeed:0.11 },
    ]
  },
];

// Meditaciones guiadas (scripts originales, educativo/bienestar)
const MEDITATIONS_SEED = [
  // Meditacion de referencia — muestra el formato completo (script visual + narration TTS)
  {
    id:"m_ref_respiro",
    title:"Un respiro",
    tags:["pausa","cuerpo","breve"],
    durationMin:5,
    archetype:"TIERRA",
    recommendedProgram:"breath_cycle",
    desc:"Cinco minutos para volver al cuerpo. Sin técnica, sin objetivo. Solo respirar y estar.",
    // Script visual — lo que se muestra en pantalla (puede tener formato)
    script:`Una práctica de 5 minutos.

Sirve para cualquier momento del día donde la mente está demasiado activa y el cuerpo demasiado olvidado.

No hay técnica correcta. Solo atención.`,
    // Narration — lo que lee el TTS (texto puro con pausas reales)
    narration:`Cierra los ojos.
[pausa 4s]
Siente dónde está tu cuerpo ahora mismo.
El contacto con la silla o la cama.
[pausa 5s]
Una respiración lenta.
[pausa 4s]
Y otra.
[pausa 5s]
No hay nada que resolver ahora.
[pausa 8s]
Deja que el cuerpo haga lo que sabe hacer.
[pausa 10s]
Cuando estés listo, abre los ojos.`,
  },
];

// ── Meditaciones profundas con pausas reales ──────────────────
// Formato: [pausa Xs] = silencio real de X segundos en el narrador

const MEDITATIONS_DEEP = [
  {
    id:'med_soltar',
    title:'Soltar',
    tags:['liberacion','profunda','reset','20min'],
    durationMin:20,
    archetype:'MOON_SELENE',
    recommendedProgram:'reset_ritual',
    objective:'Soltar una carga que ya no te pertenece. Identificar algo que sigues sosteniendo y elegir, aunque sea momentaneamente, depositarlo.',
    breathing:'Respiración diafragmatica lenta: 4 segundos inhala por la nariz, 6 segundos exhala por la boca con un ligero suspiro. Repite 3 veces antes de comenzar.',
    recommendations:'Ideal de noche o al cerrar el día. Acostado. Con cuencos tibetanos o OM a 20-30% de volumen. Temperatura comoda, sin luz directa. Desconecta el teléfono.',
    desc:`Hay cosas que cargamos porque en algún momento fueron necesarias. Una historia sobre quienes somos. Una culpa que no terminamos de dejar ir. Una versión de nosotros que ya pasó pero que seguimos habitando.

Esta meditación no pide que olvides ni que perdones forzadamente. Solo te invita a depositar ese peso por un momento. A sentir, aunque sea brevemente, como se siente el cuerpo sin cargarlo.

Duración aproximada: 18-20 minutos. Ideal con cuencos tibetanos o OM de fondo, a volumen bajo. Se recomienda estar acostado o en una postura comoda donde no tengas que sostener nada.`,
    script:`Cierra los ojos.
[pausa 4s]
No hay nada que hacer ahora.
Nada que resolver.
Nada que recordar.
[pausa 5s]
Siente el peso de tu cuerpo.
Como si la tierra te sostuviera desde abajo.
Como si el suelo dijera: aquí estoy. No te caes.
[pausa 6s]
Deja que los hombros bajen.
Solo eso. Que bajen.
[pausa 5s]
Afloja la mandibula.
Separa levemente los dientes.
[pausa 4s]
Hay una tensión que llevas hace tiempo.
No tienes que nombrarla ahora.
Solo siente donde vive en tu cuerpo.
[pausa 6s]
Respira hacia ese lugar.
Aire que entra.
[pausa 3s]
Aire que sale llevandose algo.
[pausa 5s]
Otra vez.
Aire que entra.
[pausa 3s]
Aire que sale.
[pausa 6s]
Tu cuerpo sabe como hacer esto.
No necesitas controlarlo.
[pausa 5s]
Piensa en algo que cargas.
Algo que ya no te pertenece pero que todavia sostienes.
Puede ser una historia sobre quién eres.
Puede ser una culpa vieja.
Puede ser una versión de tú que ya paso.
[pausa 8s]
No tienes que forzar nada.
Solo mira eso que apareció.
Míralo como si lo vieras desde lejos.
[pausa 6s]
Ese peso... ¿qué forma tiene?
¿Dónde lo sientes en el cuerpo?
[pausa 8s]
Ahora imagina que tus manos lo sostienen.
Lo sientes en las palmas.
Tiene un peso real.
[pausa 5s]
Y suavemente...
sin apurarte...
lo depositas en el suelo frente a ti.
[pausa 7s]
No lo tiras.
No lo rechazas.
Solo lo dejas apoyar.
[pausa 6s]
Siente cómo se siente tu cuerpo un poco más liviano.
[pausa 8s]
Eso que dejaste no desaparece.
Sigue existiendo.
Pero ya no lo cargas tú.
[pausa 6s]
Ahora lleva la atención al pecho.
Al centro del pecho.
[pausa 4s]
Hay algo ahí que siempre estuvo.
Antes de las historias.
Antes de los nombres.
[pausa 6s]
Es tranquilo.
No necesita nada de afuera para existir.
[pausa 8s]
Quédate aquí un momento.
Sin ir a ningún lado.
[pausa 12s]
¿Qué queda cuando sueltas lo que no es tuyo?
[pausa 10s]
Queda esto.
Este silencio.
Esta presencia.
[pausa 8s]
tú.
[pausa 10s]
Lentamente, empieza a sentir el cuerpo de nuevo.
Los pies.
Las manos.
[pausa 5s]
Un respiro profundo.
[pausa 4s]
Cuando estés listo, abre los ojos.
Sin apuro.
[pausa 6s]
Bienvenido de vuelta.`,
  },
  {
    id:'med_cuerpo_vivo',
    title:'El cuerpo vivo',
    tags:['cuerpo','presencia','detox','15min'],
    durationMin:15,
    archetype:'GEA',
    recommendedProgram:'breath_cycle',
    objective:'Acompanar el proceso de detox con presencia. Llevar la atención al cuerpo que trabaja sin ser visto: sus órganos, su ritmo, su silencio interior.',
    breathing:'Respiración abdominal suave: mano en el vientre, deja que suba al inhalar y baje al exhalar. Sin controlar, solo observar. El cuerpo respira solo.',
    recommendations:'Como cierre de día o antes de dormir. Cualquier posición comoda. Bosque o silencio. Temperatura neutra. Apagar pantallas 30 minutos antes.',
    desc:`En un proceso de detox, el cuerpo trabaja sin parar. Limpia, regenera, reorganiza. Lo hace en silencio, sin pedir atención, sin necesitar que lo gestiones.

Esta meditación es una forma de hacerle compania a ese proceso. De llevar la atención hacia adentro, sin objetivos ni análisis. Solo presencia.

Duración: 12-15 minutos. Funciona muy bien como cierre de día o antes de dormir. Recomendado con bosque o cuencos a volumen muy bajo.`,
    script:`Lleva la atención a las plantas de los pies.
[pausa 4s]
No necesitas moverlos.
Solo sentirlos.
El contacto con el suelo.
La temperatura.
[pausa 5s]
Sube lentamente por las piernas.
Los músculos de las pantorrillas.
Los huesos.
[pausa 5s]
Sube por las rodillas.
[pausa 3s]
Los muslos.
[pausa 3s]
La pelvis.
El lugar donde el cuerpo se asienta.
[pausa 6s]
Siente el vientre.
Cómo se mueve con cada respiración.
[pausa 5s]
Hay mucho trabajo invisible que pasa aquí adentro.
Tu cuerpo está procesando.
Limpiando.
Renovando.
Ahora mismo. Sin que tú hagas nada.
[pausa 7s]
Lleva la atención al pecho.
Al corazón.
Escúchalo si puedes.
[pausa 6s]
Cuántos latidos desde que naciste.
Sin descanso.
Sin pausas.
Sin pedirte nada.
[pausa 8s]
Los hombros.
Ese lugar donde guardamos tanto.
[pausa 4s]
Déjalos caer.
Un poco más.
[pausa 5s]
El cuello.
La cabeza.
[pausa 4s]
Todo esto es tuyo.
Este cuerpo que a veces olvidamos que existe.
[pausa 6s]
Hoy le dedicas tiempo.
Hoy lo escuchas.
[pausa 8s]
¿Qué necesita tu cuerpo hoy?
No pienses la respuesta.
Siente si llega algo.
[pausa 10s]
Puede ser una imagen.
Una sensación.
Una palabra.
[pausa 8s]
Guárdala.
Es tuya.
[pausa 5s]
Respira hondo una vez.
[pausa 4s]
Suelta.
[pausa 5s]
El cuerpo ya sabe el camino.
Confía en él.
[pausa 6s]
Cuando quieras, regresa.`,
  },
];

// Modos de generacion (simplificados — solo referencia)
const GENERATOR_MODES = [
  { id:'bright',  label:'Luminoso',    icon:'✦', beatHz:10, solfeggioHz:741, modulation:0.22, modSpeed:0.09, noiseType:'pink',  noiseAmount:0.08 },
  { id:'deep',    label:'Profundo',    icon:'❍', beatHz:5,  solfeggioHz:396, modulation:0.14, modSpeed:0.05, noiseType:'brown', noiseAmount:0.18 },
  { id:'calm',    label:'Calmo',       icon:'○', beatHz:7,  solfeggioHz:528, modulation:0.18, modSpeed:0.07, noiseType:'pink',  noiseAmount:0.12 },
  { id:'focus',   label:'Enfoque',     icon:'◎', beatHz:14, solfeggioHz:741, modulation:0.16, modSpeed:0.08, noiseType:'white', noiseAmount:0.06 },
  { id:'dream',   label:'Ensoñación',  icon:'☾', beatHz:3,  solfeggioHz:285, modulation:0.12, modSpeed:0.04, noiseType:'brown', noiseAmount:0.22 },
  { id:'ritual',  label:'Ritual',      icon:'⟁', beatHz:4,  solfeggioHz:963, modulation:0.20, modSpeed:0.04, noiseType:'brown', noiseAmount:0.16 },
];

function generateFromMode(modeId, intentionId, durationMin) {
  const mode = GENERATOR_MODES.find(m=>m.id===modeId) || GENERATOR_MODES[0];
  const int  = INTENTIONS.find(i=>i.id===intentionId) || INTENTIONS[0];
  return {
    solfeggioHz:  mode.solfeggioHz,
    carrierHz:    int.carrier || 210,
    beatHz:       mode.beatHz,
    noiseType:    mode.noiseType,
    noiseAmount:  mode.noiseAmount,
    modulation:   mode.modulation,
    modSpeed:     mode.modSpeed,
    sessionMinutes: durationMin || int.duration || 20,
    intentionId,
    reading: `${int.glyph} ${int.name} — ${int.description}`,
  };
}

function fmtTime(secs) {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

const RITUALS = [
  {
    id: 'rit-amanecer',
    name: 'Amanecer del Detox',
    glyph: '☀',
    context: 'mañana',
    duration: 10,
    tags: ['mañana', 'energía', 'inicio'],
    description: 'Activa el día con claridad y propósito. Para los primeros minutos después de despertar.',
    beatHz: 10, solfeggioHz: 528, carrierHz: 200, leftHz: 195, rightHz: 205,
    noiseType: 'pink', noiseAmt: 0.07, modulation: 0.3, modSpeed: 0.08,
    script: `Cierra los ojos. Lleva una mano al pecho.

[pausa 4s]

Con cada inhalo, siente cómo el aire limpio entra en tu cuerpo. Con cada exhalo, sueltas lo que quedó del día anterior.

[pausa 6s]

Hoy tu cuerpo está un día más libre. Eso no es un dato menor. Es una victoria real.

[pausa 6s]

Imagina que con la primera luz del día entra también claridad dentro de ti. Claridad para tus decisiones. Calma en tu pecho.

[pausa 8s]

Llevas tu proceso contigo. No tienes que hacer nada extraordinario hoy, solo estar presente en las pequeñas decisiones que ya sabes tomar.

[pausa 8s]

Cuando estés listo, abre los ojos despacio. El día te espera.`,
  },
  {
    id: 'rit-purificacion',
    name: 'Purificación del Deseo',
    glyph: '◈',
    context: 'antojo',
    duration: 8,
    tags: ['antojo', 'deseo', 'urgencia', 'ancla'],
    description: 'Para los momentos en que aparece la urgencia. Redirige la energía del deseo hacia claridad.',
    beatHz: 6, solfeggioHz: 396, carrierHz: 200, leftHz: 197, rightHz: 203,
    noiseType: 'brown', noiseAmt: 0.12, modulation: 0.5, modSpeed: 0.06,
    script: `Para. Respira. No tienes que decidir nada en este momento.

[pausa 5s]

El deseo que sientes es energía. No es una orden. No te define.

[pausa 6s]

Lleva la atención a tus pies. Siente el peso de tu cuerpo. Estás en el suelo. Estás aquí.

[pausa 8s]

Con cada exhalación, imagina que esa urgencia se afloja un poco. No desaparece de golpe, solo pierde fuerza. El poder te pertenece a ti.

[pausa 8s]

Recuerda por qué comenzaste este proceso. No tienes que pensar en mañana. Solo en los próximos minutos. En este aliento.

[pausa 8s]

La urgencia pasa. Siempre pasa. Y cuando pase, estarás del otro lado, más entero que antes.

[pausa 6s]

Respira. Sigue.`,
  },
  {
    id: 'rit-cuerpo',
    name: 'Cuerpo sin Tóxicos',
    glyph: '⬡',
    context: 'cuerpo',
    duration: 12,
    tags: ['cuerpo', 'sanación', 'consciencia', 'mediodía'],
    description: 'Meditación de escucha del cuerpo. Para reconectar con las señales de sanación interna.',
    beatHz: 8, solfeggioHz: 285, carrierHz: 200, leftHz: 196, rightHz: 204,
    noiseType: 'pink', noiseAmt: 0.10, modulation: 0.4, modSpeed: 0.07,
    script: `Encuentra una postura cómoda. Cierra los ojos.

[pausa 4s]

Lleva la atención a la coronilla. Luego bájala lentamente... frente... ojos... mandíbula. Suelta cualquier tensión que encuentres.

[pausa 8s]

Cuello y hombros. No hace falta forzar nada, solo notar. Con cada exhalación, los hombros bajan un poco más.

[pausa 8s]

Pecho. Aquí vive mucho. El cansancio, el alivio, la esperanza. Respira hacia ese lugar con intención.

[pausa 8s]

Vientre. El cuerpo trabaja sin descanso: procesa, filtra, sana. Agradécele ese trabajo silencioso que ocurre sin que tengas que pedirlo.

[pausa 10s]

Piernas y pies. Siente el peso completo de tu cuerpo. Estás aquí. Tu cuerpo está aquí.

[pausa 8s]

Este cuerpo se está limpiando. Célula a célula. Día a día. El proceso ya está ocurriendo.

[pausa 8s]

Cuando abras los ojos, llevas contigo esa consciencia.`,
  },
  {
    id: 'rit-sueno',
    name: 'Sueño Limpio',
    glyph: '☽',
    context: 'noche',
    duration: 15,
    tags: ['sueño', 'noche', 'descanso', 'cierre'],
    description: 'Ritual de cierre del día. Prepara el cuerpo y la mente para un sueño profundo y reparador.',
    beatHz: 2.5, solfeggioHz: 432, carrierHz: 180, leftHz: 178.75, rightHz: 181.25,
    noiseType: 'brown', noiseAmt: 0.15, modulation: 0.6, modSpeed: 0.04,
    script: `Este día terminó. Ya hiciste lo que pudiste.

[pausa 5s]

Permítete soltar lo que no pudo ser. No hay nada que resolver ahora. Solo hay descanso.

[pausa 8s]

Imagina que con cada exhalación, el día se va alejando suavemente, como agua que escurre.

[pausa 8s]

Tu cuerpo sabe cómo sanar durante el sueño. Sabe regenerar, limpiar, ordenar. Confía en ese proceso que ocurre sin que tengas que hacer nada.

[pausa 10s]

Lleva la atención a los puntos de contacto con la cama. El peso de tu cabeza. El calor de tus pies. La quietud.

[pausa 10s]

Mañana estará ahí. Pero ahora, solo existe este momento. Solo existe tu respiración, lenta y profunda.

[pausa 12s]

Que el descanso que venga sea completo. Buenas noches.`,
  },
  {
    id: 'rit-racha',
    name: 'Celebración de Racha',
    glyph: '◆',
    context: 'logro',
    duration: 8,
    tags: ['racha', 'logro', 'celebración', 'fuerza'],
    description: 'Para los momentos de reconocimiento. Cada día de racha merece ser sentido, no solo contado.',
    beatHz: 12, solfeggioHz: 528, carrierHz: 210, leftHz: 204, rightHz: 216,
    noiseType: 'pink', noiseAmt: 0.08, modulation: 0.35, modSpeed: 0.09,
    script: `Llegas aquí con días de proceso en el cuerpo. Eso tiene peso real.

[pausa 5s]

Piensa en los momentos difíciles que ya pasaste. Los días en que hubiera sido más fácil rendirse y no lo hiciste. ¿Los sientes?

[pausa 8s]

No tuviste que ser perfecto. Solo tuviste que seguir. Y seguiste.

[pausa 8s]

Deja que esa realidad aterrice completamente. No como un dato en una pantalla. Como algo que sientes en el pecho.

[pausa 8s]

Eres la misma persona que tomó esa decisión y la sostuvo día tras día. Eso no te lo quita nadie.

[pausa 8s]

Respira profundo. Celebra desde adentro. Sigue.`,
  },
  {
    id: 'rit-emergencia',
    name: 'Reset de Emergencia',
    glyph: '▣',
    context: 'crisis',
    duration: 5,
    tags: ['urgencia', 'crisis', 'ancla', 'rápido'],
    description: 'Para los momentos más difíciles. Corto, directo, sin adornos. Respiración 4-4-6.',
    beatHz: 4, solfeggioHz: 174, carrierHz: 200, leftHz: 198, rightHz: 202,
    noiseType: 'brown', noiseAmt: 0.10, modulation: 0.5, modSpeed: 0.05,
    script: `Para. Respira. Inhala contando cuatro tiempos.

[pausa 5s]

Sostén el aire. Cuatro tiempos.

[pausa 5s]

Exhala despacio. Seis tiempos.

[pausa 7s]

Otra vez. Inhala... dos... tres... cuatro.

[pausa 5s]

Sostén... dos... tres... cuatro.

[pausa 5s]

Exhala despacio... dos... tres... cuatro... cinco... seis.

[pausa 7s]

Estás aquí. Estás en el proceso. Este momento va a pasar.

[pausa 6s]

Una respiración más. Y luego otra. Sigues.`,
  },
];

window.BINAURAL_DATA = { SOLFEGGIO, NOISE_TYPES, INTENTIONS, PROGRAMS, MEDITATIONS_SEED, MEDITATIONS_DEEP, GENERATOR_MODES, RITUALS };
window.generateFromMode = generateFromMode;
window.fmtTime = fmtTime;
