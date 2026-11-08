import {unpackProject,packProject} from './vendor/javita/projects.mjs';
import {validateSession,compose,noteName} from './vendor/javita/hits-core.mjs';
import {readSession,readBackup,normalizeBrief,emptyProposal,serializeSession,sunoTransferText} from './vendor/magic-contracts.mjs';
export {newSession,generateMotif,transformMotif,transforms,noteName,compose} from './vendor/javita/hits-core.mjs';
import {scoreXML as javitaScoreXML} from './vendor/javita/music.mjs';

const plainParts=(p,source)=>p.parts.map(x=>({key:x.key,name:x.name,source,reviewed:false,notes:x.notes.map(({pitch,start,duration,amplitude})=>({pitch,start,duration,amplitude}))}));
export function importChoices(input){
 if(input?.format==='javita'){
  const p=unpackProject(input);
  return [{label:p.title,module:'JAVITA',patch:{title:p.title,bpm:p.bpm,duration:p.duration,parts:plainParts(p,'javita'),sourceStart:p.sourceStart},raw:input}];
 }
 if(input?.format==='javita-hits'){
  const hits=validateSession(input),p=compose(hits);
  return [{label:p.title,module:'JAVITA hits',patch:{title:p.title,bpm:p.bpm,duration:p.duration,parts:plainParts(p,'javita-hits'),structure:p.sections,hits,key:noteName(hits.tonic).replace(/\d+$/,'')+' '+(hits.mode==='major'?'mayor':'menor')},raw:input}];
 }
 if(input?.format==='magic-music-session'){
  const s=readSession(JSON.stringify(input));return [fromMagic(s.current,input)];
 }
 if(input?.format==='magic-music-prompt'){
  return readBackup(JSON.stringify(input)).map(x=>fromMagic({brief:x.brief,proposal:x.proposal,variantIndex:0,projectName:x.project||x.proposal.title},x));
 }
 throw Error('Importa un proyecto JAVITA, hits, un borrador o una biblioteca de MAGIC. Para Contrapista utiliza su ZIP.');
}
function fromMagic(w,raw){
 const {brief,proposal}=w,v=proposal.variants[w.variantIndex||0];
 return {label:w.projectName||proposal.title,module:'MAGIC MUSIC PROMPT',patch:{title:proposal.title,bpm:proposal.tempo,key:proposal.tonality,chords:brief.advanced?.chords||'',idea:brief.idea,lyrics:proposal.lyrics,style:v.style,exclude:v.exclude,magic:w},raw};
}
export function applyImport(p,choice){
 return {...p,...choice.patch,imports:[...p.imports,{module:choice.module,at:new Date().toISOString(),raw:choice.raw}]};
}
export function asJavita(p){
 if(p.duration>300)throw Error('El formato JAVITA actual admite hasta 5 minutos. El proyecto NANOOK y el MIDI conservan toda la duración.');
 const allowed=['vocals','bass','other','drums','original','melody'];
 if(p.parts.some(part=>!allowed.includes(part.key)))throw Error('Hay instrumentos que JAVITA todavía no admite como partes. Exporta MIDI o el respaldo completo.');
 if(!p.parts.length||p.duration<=0)throw Error('Primero añade o importa notas.');
 const packed=packProject({...p,origin:p.hits?'hits':undefined});unpackProject(packed);return packed;
}
export function asMagic(p){
 const existing=p.magic||{},tempo=existing.generationId?existing.brief?.bpm:(Number.isInteger(p.bpm)&&p.bpm<=220?p.bpm:existing.brief?.bpm);
 if(!Number.isInteger(tempo)||tempo<40||tempo>220)throw Error('Crea una propuesta en MAGIC con un tempo entero entre 40 y 220 BPM antes de transferir este arreglo.');
 const brief=normalizeBrief({...existing.brief,idea:p.idea.slice(0,3000),bpm:tempo,lyricsIdea:(existing.brief?.lyricsIdea||'').slice(0,2000)});
 brief.advanced={...brief.advanced,key:p.key,chords:p.chords};
 const proposal=structuredClone(existing.proposal||emptyProposal),index=existing.variantIndex||0;
 Object.assign(proposal,{title:p.title,tempo,tonality:p.key||'Por definir',lyrics:p.lyrics});
 proposal.variants[index]={...proposal.variants[index],style:p.style,exclude:p.exclude};
 const current={brief,proposal,baseline:brief,source:'NANOOK HIT MAKER',variantIndex:index,tab:'style',projectName:p.title};
 return {current,text:serializeSession(current,null)};
}
export function sunoText(p){const {current}=asMagic(p);return sunoTransferText(current.proposal,current.variantIndex,current.brief);}

// MIDI export preserves all note times, end-of-project silence and percussion channel 10.
export function projectMidi(p){
 const te=new TextEncoder(),be=(n,l)=>Array.from({length:l},(_,i)=>(n>>>((l-i-1)*8))&255);
 const vl=n=>{const a=[n&127];while(n=Math.floor(n/128))a.unshift((n&127)|128);return a;};
 const chunk=(name,data)=>[...te.encode(name),...be(data.length,4),...data];
 const tick=s=>Math.round(s*p.bpm/60*480),end=tick(p.duration);
 let melodic=0;
 const tracks=p.parts.filter(x=>x.notes.length).map(part=>{
  const drum=part.key==='drums';let channel=9;
  if(!drum){channel=melodic++;if(channel>=9)channel++;if(channel>15)throw Error('El MIDI admite 15 canales melódicos y uno de batería. Reduce las partes antes de exportar.');}
  const label=[...te.encode(part.name)],events=[];
  let data=[0,255,3,...vl(label.length),...label,0,255,81,3,...be(Math.round(60000000/p.bpm),3)];
  if(!drum)data.push(0,192+channel,part.key==='bass'?33:0);
  for(const n of part.notes){const start=tick(n.start);events.push({t:start,bytes:[144+channel,n.pitch,Math.max(1,Math.round(n.amplitude*127))]},{t:Math.max(start+1,tick(n.start+n.duration)),bytes:[128+channel,n.pitch,0]});}
  events.sort((a,b)=>a.t-b.t||a.bytes[0]-b.bytes[0]);let last=0;
  for(const event of events){data.push(...vl(event.t-last),...event.bytes);last=event.t;}
  data.push(...vl(Math.max(0,end-last)),255,47,0);return chunk('MTrk',data);
 });
 if(!tracks.length)throw Error('El proyecto todavía no tiene notas para exportar.');
 return new Uint8Array([...chunk('MThd',[0,1,...be(tracks.length,2),1,224]),...tracks.flat()]);
}
export function scoreWindow(p,index,page=0){
 const part=p.parts[index];if(!part)throw Error('Elige una parte musical.');
 if(part.key==='drums')throw Error('La notación de batería está pendiente. Sus golpes se conservan en MIDI.');
 const from=page*32*60/p.bpm,to=Math.min(p.duration,from+32*60/p.bpm);
 if(to<=from)throw Error('No hay compases en esta página.');
 const sections=timedSections(p),current=sections.filter(s=>s.time<from).at(-1);
 const structure=sections.filter(s=>s.time>=from&&s.time<to).map(s=>({...s,time:s.time-from}));
 if(current&&!structure.some(s=>s.time===0))structure.unshift({...current,name:current.name+' (cont.)',time:0});
 return {...p,duration:to-from,scoreMeasureOffset:page*8,structure,parts:[{...part,notes:part.notes.filter(n=>n.start<to&&n.start+n.duration>from).map(n=>({...n,start:Math.max(0,n.start-from),duration:Math.min(n.start+n.duration,to)-Math.max(n.start,from)}))}]};
}

function timedSections(p){
 return (p.structure||[]).filter(s=>s&&typeof s==='object').map(s=>({...s,name:String(s.name||s.label||'Sección'),time:s.time??s.start??((s.bar-1)*4*60/p.bpm)})).filter(s=>Number.isFinite(s.time)&&s.time>=0&&s.time<p.duration).sort((a,b)=>a.time-b.time);
}

// Adapter-owned rehearsal marks; the frozen JAVITA engine remains unchanged.
export function scoreXML(p,index=0){
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const marks=new Map();
 for(const section of timedSections(p)){
  const tick=Math.round(section.time*p.bpm/60*4),measure=Math.floor(tick/16)+1,offset=tick%16;
  const direction=`<direction placement="above"><direction-type><rehearsal enclosure="rectangle" font-size="10">${escape(section.name.slice(0,120))}</rehearsal></direction-type><offset sound="no">${offset}</offset></direction>`;
  marks.set(measure,(marks.get(measure)||'')+direction);
 }
 return javitaScoreXML(p,index).replace(/<measure number="(\d+)">(<attributes>[\s\S]*?<\/attributes>)?/g,(_,n,attributes='')=>`<measure number="${Number(n)+(p.scoreMeasureOffset||0)}">${attributes}${marks.get(Number(n))||''}`);
}
