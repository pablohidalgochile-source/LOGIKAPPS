// Musical rules operate in quarter-note beats, independently of browser/audio state.
export const transforms = {
  original: ['Motivo original', 'Conserva alturas y duraciones.'],
  augment: ['Notas más largas ×2', 'Duplica las duraciones; el tempo no cambia.'],
  diminish: ['Notas más cortas ÷2', 'Reduce las duraciones a la mitad; el tempo no cambia.'],
  fragment: ['Fragmentar', 'Repite la primera mitad del motivo.'],
  extend: ['Expandir el cierre', 'Añade dos ataques de la última nota.'],
  octave: ['Subir una octava', 'Conserva el ritmo y los intervalos en un registro más alto.'],
  invert: ['Invertir el contorno', 'Refleja los intervalos alrededor de la primera nota. Puede salir de la escala.']
};
export const defaultSections = [
  {name:'Intro', bars:4, transform:'fragment', energy:1},
  {name:'Verso', bars:8, transform:'original', energy:2},
  {name:'Pre-coro', bars:4, transform:'diminish', energy:2},
  {name:'Coro', bars:8, transform:'original', energy:3},
  {name:'Puente', bars:4, transform:'augment', energy:1},
  {name:'Coro final', bars:8, transform:'octave', energy:3}
];
export const noteName = pitch => pitch === null ? 'Silencio' : ['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'][pitch%12]+(Math.floor(pitch/12)-1);
export function validateMotif(motif) {
  if(!Array.isArray(motif)||motif.length<2||motif.length>16) throw Error('El motivo debe tener entre 2 y 16 eventos.');
  if(motif.some(n=>!n || (n.pitch!==null&&(!Number.isInteger(n.pitch)||n.pitch<36||n.pitch>84)) || ![.25,.5,1,1.5,2,3,4].includes(n.beats))) throw Error('Usa notas entre Do2 y Do6 y duraciones de la lista.');
  if(motif.every(n=>n.pitch===null)) throw Error('Añade al menos una nota al motivo.');
  if(motif.reduce((s,n)=>s+n.beats,0)>16) throw Error('El motivo puede ocupar hasta 16 pulsos (4 compases).');
  return motif.map(({pitch,beats})=>({pitch,beats}));
}
export function generateMotif(seed=1, tonic=60, mode='major') {
  let s=seed>>>0; const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  const scale=mode==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  const a=Math.floor(random()*5), b=Math.min(6,Math.max(0,a+(random()>.5?1:-1)));
  return [a,a,b,random()>.5?a:0].map((degree,i)=>({pitch:tonic+scale[degree],beats:[.5,.5,1,2][i]}));
}
export function transformMotif(motif, kind) {
  const copy=motif.map(n=>({...n})), first=copy.find(n=>n.pitch!==null)?.pitch??60;
  if(!transforms[kind]) throw Error('Transformación desconocida.');
  if(kind==='augment'||kind==='diminish') return copy.map(n=>({...n,beats:n.beats*(kind==='augment'?2:.5)}));
  if(kind==='fragment') {const fragment=copy.slice(0,Math.ceil(copy.length/2));return [...fragment,...fragment.map(n=>({...n}))];}
  if(kind==='extend') {const last=[...copy].reverse().find(n=>n.pitch!==null);return [...copy,{pitch:last.pitch,beats:.5},{pitch:last.pitch,beats:1}];}
  const result=copy.map(n=>({...n,pitch:n.pitch===null?null:kind==='octave'?n.pitch+12:kind==='invert'?2*first-n.pitch:n.pitch}));
  if(result.some(n=>n.pitch!==null&&(n.pitch<21||n.pitch>108))) throw Error('Esta transformación supera el rango del piano. Acerca las alturas del motivo.');
  return result;
}
export function validateSession(x) {
  if(!x||x.format!=='javita-hits'||x.version!==1) throw Error('El archivo no es un proyecto hits versión 1.');
  if(typeof x.title!=='string'||!x.title.trim()||x.title.length>100) throw Error('Escribe un título de hasta 100 caracteres.');
  if(!Number.isInteger(x.bpm)||x.bpm<50||x.bpm>180||!Number.isInteger(x.tonic)||x.tonic<60||x.tonic>71||!['major','minor'].includes(x.mode)) throw Error('Tempo o tonalidad fuera de rango.');
  if(!Array.isArray(x.sections)||x.sections.length!==6||x.sections.some(s=>!s||typeof s.name!=='string'||s.name.length>30||![2,4,8].includes(s.bars)||!transforms[s.transform]||![1,2,3].includes(s.energy))) throw Error('La estructura no es válida.');
  const motif=validateMotif(x.motif);x.sections.forEach(s=>transformMotif(motif,s.transform));
  return {format:'javita-hits',version:1,title:x.title,bpm:x.bpm,tonic:x.tonic,mode:x.mode,motif,sections:x.sections.map(({name,bars,transform,energy})=>({name,bars,transform,energy}))};
}
export function newSession() {
  return {format:'javita-hits',version:1,title:'Mi primera idea',bpm:96,tonic:60,mode:'major',motif:generateMotif(17),sections:defaultSections.map(s=>({...s}))};
}
export function motifNotes(motif,bpm=96) {
  let beat=0; return motif.flatMap(n=>{const start=beat*60/bpm;beat+=n.beats;return n.pitch===null?[]:[{pitch:n.pitch,start,duration:n.beats*60/bpm*.92,amplitude:.8}];});
}
export function compose(input) {
  const session=validateSession(input), sec=60/session.bpm;
  const melody=[],bass=[],pad=[],sections=[];let cursor=0;
  const roots=session.mode==='major'?[0,9,5,7]:[0,8,3,10];
  const thirds=session.mode==='major'?[4,3,4,4]:[3,4,4,4];
  for(const section of session.sections) {
    const variant=transformMotif(session.motif,section.transform), length=section.bars*4;
    // Round each phrase up to a whole bar, preserving silence after the motif.
    const motifLength=variant.reduce((s,n)=>s+n.beats,0), phrase=Math.ceil(motifLength/4)*4;
    for(let offset=0;offset<length;offset+=phrase) {
      let beat=offset;
      for(const n of variant) {
        if(beat>=length)break;
        const duration=Math.min(n.beats,length-beat)*sec;
        if(n.pitch!==null) melody.push({pitch:n.pitch,start:(cursor+beat)*sec,duration:duration*.92,amplitude:[.5,.65,.85][section.energy-1]});
        beat+=n.beats;
      }
    }
    for(let bar=0;bar<section.bars;bar++) {
      const chord=bar%4, root=session.tonic+roots[chord];
      if(section.energy>=2)bass.push({pitch:root-24,start:(cursor+bar*4)*sec,duration:3.8*sec,amplitude:.6});
      if(section.energy>=3)[0,thirds[chord],7].forEach(interval=>pad.push({pitch:root+interval-12,start:(cursor+bar*4)*sec,duration:3.8*sec,amplitude:.35}));
    }
    sections.push({...section,start:cursor*sec,duration:length*sec,phraseBeats:phrase,clipped:motifLength>length||length%phrase>0&&length%phrase<motifLength});
    cursor+=length;
  }
  const parts=[['melody','Melodía',melody],['bass','Bajo',bass],['other','Armonía',pad]].map(([key,name,notes],i)=>({key,name,notes:notes.map((n,id)=>({...n,id})),color:['#f6bd91','#b7a1ed','#9bd5cc'][i],volume:.8,mute:false,solo:false,buffer:null}));
  return {title:session.title,bpm:session.bpm,duration:cursor*sec,sourceStart:0,original:null,parts,sections,origin:'hits'};
}
// Compares contiguous note windows in ONE monophonic part. No audio/genre/hit inference.
export function findRepetitions(notes, startIndex=0, size=4) {
  if(!Array.isArray(notes)||notes.length>5000) throw Error('Analiza una parte de hasta 5.000 notas.');
  if(notes.some(n=>!n||![n.pitch,n.start,n.duration].every(Number.isFinite)||n.duration<=0||n.start<0)) throw Error('Hay notas no válidas en esta parte.');
  const ordered=[...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  if(!Number.isInteger(startIndex)||!Number.isInteger(size)||size<3||size>12||startIndex<0||startIndex+size>ordered.length) throw Error('Elige un motivo de 3 a 12 notas dentro de la parte.');
  const monophonic=window=>!window.some((n,i)=>i&&n.start<window[i-1].start+window[i-1].duration-.04);
  const anchor=ordered.slice(startIndex,startIndex+size);
  if(!monophonic(anchor)) throw Error('El motivo contiene notas simultáneas. Elige una línea melódica o corrige las notas en Estudio.');
  const signature=ns=>({pitch:ns.map(n=>n.pitch-ns[0].pitch),onsets:ns.slice(1).map((n,i)=>n.start-ns[i].start),durations:ns.map(n=>n.duration)});
  const a=signature(anchor),matches=[];let skipped=0;
  for(let i=0;i<=ordered.length-size;i++) {
    if(i<startIndex+size&&i+size>startIndex)continue;
    const candidate=ordered.slice(i,i+size);if(!monophonic(candidate)){skipped++;continue;}
    const b=signature(candidate);if(!a.pitch.every((p,j)=>p===b.pitch[j]))continue;
    const ratio=b.onsets.reduce((s,n)=>s+n,0)/a.onsets.reduce((s,n)=>s+n,0);
    if(!Number.isFinite(ratio)||ratio<.25||ratio>4)continue;
    const sameRhythm=a.onsets.every((n,j)=>Math.abs(n*ratio-b.onsets[j])<=Math.max(.06,n*ratio*.12))&&a.durations.every((n,j)=>Math.abs(n*ratio-b.durations[j])<=Math.max(.08,n*ratio*.2));
    if(!sameRhythm)continue;
    const shift=candidate[0].pitch-anchor[0].pitch;
    const sameTime=a.onsets.every((n,j)=>Math.abs(n-b.onsets[j])<=.06)&&a.durations.every((n,j)=>Math.abs(n-b.durations[j])<=.08);
    matches.push({index:i,start:candidate[0].start,end:candidate.at(-1).start+candidate.at(-1).duration,shift,ratio: sameTime?1:ratio,kind:sameTime?(shift?'transportada':'literal'):'ritmo escalado'});
  }
  return {anchor,startIndex,size,matches,skipped,total:ordered.length,method:'Ventanas contiguas; intervalos exactos; tiempos con tolerancia. No detecta ornamentación ni cambios de contorno.'};
}
