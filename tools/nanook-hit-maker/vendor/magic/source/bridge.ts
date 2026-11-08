export type Variant = { id: "balanced" | "club" | "melodic"; label: string; description: string; style: string; exclude: string };
export type Proposal = { title: string; summary: string; tempo: number; tonality: string; hook: string; lyrics: string; direction?: string; variants: Variant[]; tips: string[] };
export type InstrumentRole = { instrument: string; sound: string; character: string; moment: string };
export type SongSection = { id: string; label: string; energy: number; voice: string; delivery: string; instruments: string; notes: string; reference: string };
export type LyricDirection = { energy: string; delivery: string; story: string; structure: string; voiceA: string; voiceB: string; interaction: string };
export type AdvancedDirection = { enabled: boolean; key: string; scale: string; chords: string; groove: string; arrangement: string; instruments: InstrumentRole[] };
export type Brief = { recipeId?:string; inspiration: string; idea: string; bpm: number; moods: string[]; vocals: string; language: string; withLyrics: boolean; lyricsIdea: string; lyricDirection: LyricDirection; advanced: AdvancedDirection; sections: SongSection[]; reference: { style: string; lyrics: string; arrangement: string } };
export const vocalOptions = ["Dúo masculino", "Dúo femenino", "Dúo mixto", "Voz masculina", "Voz femenina", "Coro / grupo", "Instrumental"];
export const vocalDescriptions: Record<string,string> = {
  "Dúo masculino": "Dos voces masculinas. Define un carácter para cada una y cómo se responden.",
  "Dúo femenino": "Dos voces femeninas. Pueden alternar versos, contrastar timbres y unirse en armonías.",
  "Dúo mixto": "Una voz masculina y una femenina. Asigna los papeles A y B y el encuentro del coro.",
  "Voz masculina": "Un solista masculino; puedes pedir dobles y coros de apoyo.",
  "Voz femenina": "Una solista femenina; puedes pedir dobles y coros de apoyo.",
  "Coro / grupo": "Varias voces: líder, respuestas colectivas, unísonos o armonías.",
  "Instrumental": "El protagonismo pasa a los instrumentos. No se generará una letra cantada.",
};
export const emptyLyricDirection: LyricDirection = { energy: "Media", delivery: "", story: "", structure: "", voiceA: "", voiceB: "", interaction: "" };
export const emptyAdvanced: AdvancedDirection = { enabled: false, key: "", scale: "", chords: "", groove: "", arrangement: "", instruments: [] };
export function normalizeBrief(value: Partial<Brief>): Brief {
  const fields = <T extends Record<string,string>>(defaults:T, incoming:unknown):T => Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,incoming && typeof incoming==='object' && typeof (incoming as Record<string,unknown>)[key]==='string' ? (incoming as Record<string,string>)[key] : fallback])) as T;
  const instruments = Array.isArray(value.advanced?.instruments) ? value.advanced.instruments.slice(0,8).filter(x=>x&&typeof x==='object').map(x=>fields({instrument:'',sound:'',character:'',moment:''},x)) : [];
  const musical=fields({key:'',scale:'',chords:'',groove:'',arrangement:''},value.advanced);
  const sections = Array.isArray(value.sections) ? value.sections.slice(0,16).filter(x=>x&&typeof x==='object').map((x,i)=>({...fields({id:`section-${i}`,label:'Verse',voice:'Según dirección vocal',delivery:'',instruments:'',notes:'',reference:''},x),energy:Number.isInteger(x.energy)&&x.energy>=1&&x.energy<=10?x.energy:5})) : [];
  return { ...defaultBrief, ...value, recipeId:typeof value.recipeId==='string'?value.recipeId:'', sections, lyricDirection: fields(emptyLyricDirection,value.lyricDirection), advanced: {...musical,enabled:value.advanced?.enabled===true,instruments}, reference:fields({style:'',lyrics:'',arrangement:''},value.reference) };
}
export type SavedIdea = { id: string; date: string; brief: Brief; proposal: Proposal; project?: string; favorite?: boolean; notes?: string };
export const defaultBrief: Brief = {
  recipeId:"", inspiration: "", idea: "", bpm: 120, moods: [], vocals: "Voz masculina", language: "Español", withLyrics: true,
  lyricDirection: emptyLyricDirection, advanced: emptyAdvanced, sections: [], reference: {style:"",lyrics:"",arrangement:""}, lyricsIdea: "",
};
export const exampleBrief: Brief = {
  inspiration: "", idea: "Un electro flow estilo Wisin y Yandel, oscuro pero bailable, entre 110 y 115 BPM, con una melodía muy pegajosa.", bpm: 112, moods: ["Oscuro", "Bailable"], vocals: "Dúo masculino", language: "Español", withLyrics: true,
  lyricDirection: {...emptyLyricDirection, energy:"Creciente", delivery:"Rap en versos, melodía en coro", structure:"Intro → Verso 1 → Precoro → Coro → Verso 2 → Puente → Coro final → Outro", interaction:"Llamada y respuesta; juntos en el coro"}, advanced: emptyAdvanced, sections: [], reference: { style: "", lyrics: "", arrangement: "" },
  lyricsIdea: "Una letra sencilla y pegajosa sobre enamorarse en una fiesta de una chica con chasquilla.",
};
// An empty workspace is never presented as a generated proposal.
export const emptyProposal: Proposal = {title:"Tu próxima canción",summary:"Por crear",tempo:120,tonality:"Por definir",hook:"Por definir",lyrics:"",direction:"",variants:([['balanced','Equilibrado'],['club','Más club'],['melodic','Más melódico']] as const).map(([id,label])=>({id,label,description:"",style:"",exclude:""})),tips:["Describe tu idea para crear una propuesta."]};
export const example: Proposal = {
  title: "La de la chasquilla", summary: "Electro urbano de madrugada: un bajo profundo, un gancho que vuelve y dos voces que se responden.", tempo: 112, tonality: "Modo menor",
  hook: "Un motivo de cuatro notas abre el tema y regresa en cada coro. La frase «la de la chasquilla» le da una respuesta vocal fácil de recordar.",
  lyrics: `[Intro]\nEh-eh…\nLa de la chasquilla…\nTú y yo.\n\n[Verse 1]\nTe vi cruzando la pista,\nme miraste y sonreí.\nTe acomodaste la chasquilla\ny viniste hacia mí.\n\n[Pre-Chorus]\nMe dijiste: “Ven, bailemos”,\nyo me dejé llevar.\nEntre luces y canciones,\nno te pude soltar.\n\n[Chorus]\nAy, la de la chasquilla,\ncómo baila, cómo brilla.\nYo venía por la fiesta\ny me quedé por su sonrisa.\n\nAy, la de la chasquilla,\ncerquita de mi mejilla.\nQue no termine esta noche,\nquédate otra cancioncita.\n\n[Verse 2]\nYa se fue toda tu gente,\nya está por salir el sol.\nTú me tomas de la mano:\n“Una más, la pido yo”.\n\n[Bridge]\nY si prenden las luces,\ny si apagan el lugar,\nnos llevamos esta música\ny seguimos al caminar.\n\n[Chorus]\nAy, la de la chasquilla,\ncómo baila, cómo brilla.\nYo venía por la fiesta\ny me quedé por su sonrisa.\n\nAy, la de la chasquilla,\ncerquita de mi mejilla.\nQue no termine esta noche,\nquédate otra cancioncita.\n\n[Outro]\nOtra cancioncita…\nTú y yo…\nLa de la chasquilla.`,
  variants: [
    { id: "balanced", label: "Equilibrado", description: "El punto justo entre melodía y pista.", style: "Dark Latin electro-reggaeton, 112 BPM, minor key, late-2000s futuristic club energy. Driving dembow groove, punchy kick, crisp claps, syncopated percussion, deep controlled sub-bass, gritty electro synths and atmospheric dark pads. An instantly memorable four-note synth hook, introduced early and repeated throughout the chorus with small variations. Two contrasting male vocal deliveries in Spanish: energetic rhythmic rap verses and smooth melodic choruses, with call-and-response and tight doubles. Seductive, nocturnal, confident and highly danceable. Short intro, rising pre-chorus, explosive catchy chorus, brief breakdown and a bigger final chorus. Strong rhythmic bounce and clear separation between vocals, bass and drums.", exclude: "slow ballad, acoustic arrangement, long ambient intro, abrupt tempo changes" },
    { id: "club", label: "Más club", description: "Más golpe, bajo y respuesta del público.", style: "Dark club electro-reggaeton at 112 BPM in a minor key. Forward, hard-hitting dembow drums, tight kick and clap, driving syncopated sub-bass and gritty staccato electro leads. A catchy four-note synth riff arrives immediately and returns after each short vocal phrase. Spanish male duo alternating percussive rap with a melodic chant. Call-and-response chorus, compact verses, brief tension build and a bass-heavy final chorus. Nocturnal, seductive dance-floor energy. Dry punchy drums, controlled low end, wide synth accents and vocals clearly up front.", exclude: "slow ballad, acoustic arrangement, long breakdowns, abrupt tempo changes" },
    { id: "melodic", label: "Más melódico", description: "Un coro que se queda contigo.", style: "Melodic dark electro-reggaeton, 112 BPM, minor key. Danceable dembow groove with a punchy kick, crisp claps and warm syncopated sub-bass. Memorable four-note plucked synth motif, soft nocturnal pads and restrained electro accents. Two male voices in Spanish: rhythmic verses answered by a warm, instantly singable melodic chorus. A simple repeating vocal hook with subtle harmonies, clear phrasing and space between lines. Romantic late-night party atmosphere. Short intro, lift into the chorus, intimate bridge and a fuller final chorus. Keep the groove present throughout.", exclude: "slow ballad, harsh screamed vocals, long ambient intro, abrupt tempo changes" },
  ],
  tips: ["Pega el prompt en Styles y la letra en Lyrics, dentro del modo Custom.", "Prueba las tres direcciones con la misma letra para comparar el carácter musical.", "El tempo y la estructura son indicaciones: comprueba el audio que genere Suno."],
};
export function proposalText(proposal: Proposal, variant: Variant) { return `${proposal.title}\n${proposal.tempo} BPM · ${proposal.tonality}\n\nSTYLES — ${variant.label}\n${variant.style}\n\nEXCLUDE\n${variant.exclude}\n\nLYRICS\n${proposal.lyrics || "Sin letra incluida"}\n\nGUION DE PRODUCCIÓN\n${proposal.direction || "Sin guion adicional"}\n\nGANCHO\n${proposal.hook}`; }
