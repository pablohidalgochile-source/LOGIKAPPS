export const escapeXML=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function cleanNotes(notes,duration){return notes.filter(n=>Number.isFinite(n.startTimeSeconds)&&Number.isFinite(n.durationSeconds)&&Number.isFinite(n.pitchMidi)&&n.pitchMidi>=21&&n.pitchMidi<=108&&n.startTimeSeconds<duration&&n.durationSeconds>=.07).map((n,i)=>({id:i,start:Math.max(0,n.startTimeSeconds),duration:Math.min(n.durationSeconds,duration-Math.max(0,n.startTimeSeconds)),pitch:Math.round(n.pitchMidi),amplitude:Math.max(.01,Math.min(1,n.amplitude||.5))})).sort((a,b)=>a.start-b.start||a.pitch-b.pitch)}
export function estimateTempo(samples,sr=22050){const hop=220,env=[];for(let i=0;i<samples.length;i+=hop){let e=0;for(let j=i;j<Math.min(i+hop,samples.length);j++)e+=samples[j]*samples[j];env.push(Math.sqrt(e/hop))}const flux=env.map((v,i)=>Math.max(0,v-(env[i-1]??v)));let best=0,bpm=100;for(let b=60;b<=180;b++){const lag=Math.round(60/b*sr/hop);let score=0;for(let i=lag;i<flux.length;i++)score+=flux[i]*flux[i-lag];score/=Math.max(1,flux.length-lag);score*=Math.exp(-.5*(Math.log2(b/110)/.8)**2);if(score>best){best=score;bpm=b}}return {bpm:best>1e-8?bpm:100,estimated:best>1e-8}}
// The printable score is a quantized principal line. MIDI retains all detected polyphony.
export function principalLine(notes,bpm,duration){const unit=60/bpm/4,length=Math.max(16,Math.ceil(duration/unit/16)*16),grid=Array(length).fill(null);for(const n of notes){const start=Math.max(0,Math.round(n.start/unit)),end=Math.min(length,Math.max(start+1,Math.round((n.start+n.duration)/unit)));for(let i=start;i<end;i++)if(!grid[i]||grid[i].amplitude<n.amplitude)grid[i]=n}return grid}
// Retain every detected pitch. Chords are split only at actual note boundaries;
// ties preserve independent note lengths without substituting the loudest pitch.
export function scoreGrid(notes,bpm,duration){
 const unit=60/bpm/4,length=Math.max(16,Math.ceil(duration/unit/16)*16);
 const grid=Array.from({length},()=>[]);
 notes.forEach((n,id)=>{const start=Math.max(0,Math.round(n.start/unit)),end=Math.min(length,Math.max(start+1,Math.round((n.start+n.duration)/unit)));
 for(let t=start;t<end;t++){const existing=grid[t].findIndex(x=>x.pitch===n.pitch);const entry={...n,identity:id};if(existing<0)grid[t].push(entry);else if(grid[t][existing].amplitude<n.amplitude)grid[t][existing]=entry;}});
 return grid.map(cell=>cell.sort((a,b)=>a.pitch-b.pitch));
}
export function scoreXML(project,index=0,fromMeasure=0,count=Infinity){
 const part=project.parts[index],grid=scoreGrid(part.notes,project.bpm,project.duration);
 const bars=grid.length/16,end=Math.min(bars,fromMeasure+count),steps=['C','C','D','D','E','F','F','G','G','A','A','B'];
 const same=(a,b)=>a.length===b.length&&a.every((n,i)=>n.identity===b[i].identity);
 let measures='';
 for(let m=fromMeasure;m<end;m++){
  let content='';
  for(let s=m*16;s<(m+1)*16;){
   const notes=grid[s];let run=1;while(s+run<(m+1)*16&&same(notes,grid[s+run]))run++;
   let used=0;while(used<run){
    const pos=s+used,len=[16,8,4,2,1].find(v=>v<=run-used&&pos%v===0),typ={16:'whole',8:'half',4:'quarter',2:'eighth',1:'16th'}[len];
    if(!notes.length)content+=`<note><rest/><duration>${len}</duration><voice>1</voice><type>${typ}</type></note>`;
    notes.forEach((n,i)=>{
     const before=pos>fromMeasure*16&&grid[pos-1].some(x=>x.identity===n.identity),after=pos+len<end*16&&grid[pos+len].some(x=>x.identity===n.identity);
     content+=`<note>${i?'<chord/>':''}<pitch><step>${steps[n.pitch%12]}</step>${[1,3,6,8,10].includes(n.pitch%12)?'<alter>1</alter>':''}<octave>${Math.floor(n.pitch/12)-1}</octave></pitch><duration>${len}</duration>${before?'<tie type="stop"/>':''}${after?'<tie type="start"/>':''}<voice>1</voice><type>${typ}</type>${before||after?`<notations>${before?'<tied type="stop"/>':''}${after?'<tied type="start"/>':''}</notations>`:''}</note>`;
    });used+=len;
   }s+=run;
  }
  measures+=`<measure number="${m+1}">${m===fromMeasure?`<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${part.key==='bass'?'F':'G'}</sign><line>${part.key==='bass'?4:2}</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${project.bpm}</per-minute></metronome></direction-type><sound tempo="${project.bpm}"/></direction>`:''}${content}</measure>`;
 }
 return `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${escapeXML(project.title)}</work-title></work><identification><creator type="composer">${project.origin==='hits'?'Composición con JAVITA hits':'Transcripción automática · revisar'}</creator></identification><part-list><score-part id="P1"><part-name>${escapeXML(part.name)}</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}
export function midiBytes(project){const be=(n,l)=>Array.from({length:l},(_,i)=>(n>>((l-i-1)*8))&255),vl=n=>{const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a},chunk=(s,b)=>[...Array.from(s,c=>c.charCodeAt(0)),...be(b.length,4),...b];const tracks=project.parts.filter(p=>p.notes.length).map((p,c)=>{let data=[0,255,81,3,...be(Math.round(60000000/project.bpm),3),0,192+c,p.key==='bass'?33:0],events=[];for(const n of p.notes){const t=Math.max(0,Math.round(n.start*project.bpm/60*480)),end=Math.max(t+1,Math.round((n.start+n.duration)*project.bpm/60*480));events.push({t,b:[144+c,n.pitch,Math.max(1,Math.round(n.amplitude*110))]},{t:end,b:[128+c,n.pitch,0]})}events.sort((a,b)=>a.t-b.t||a.b[0]-b.b[0]);let last=0;for(const e of events){data.push(...vl(e.t-last),...e.b);last=e.t}data.push(0,255,47,0);return chunk('MTrk',data)});return new Uint8Array([...chunk('MThd',[0,1,...be(tracks.length,2),1,224]),...tracks.flat()])}
export function wavBytes(left,right,sr=44100){const channels=right?2:1,b=new ArrayBuffer(44+left.length*channels*2),v=new DataView(b);const str=(i,s)=>[...s].forEach((c,j)=>v.setUint8(i+j,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,sr,true);v.setUint32(28,sr*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,b.byteLength-44,true);for(let i=0;i<left.length;i++){v.setInt16(44+i*channels*2,Math.max(-1,Math.min(1,left[i]))*32767,true);if(right)v.setInt16(46+i*channels*2,Math.max(-1,Math.min(1,right[i]))*32767,true)}return b}
