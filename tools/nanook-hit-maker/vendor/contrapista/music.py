"""Musical estimates and measured synthesis search, without plugin attribution."""
from pathlib import Path
import plistlib
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

NAMES=("Do","Do♯","Re","Mi♭","Mi","Fa","Fa♯","Sol","La♭","La","Si♭","Si")


def features(audio,sr=32000):
    mono=audio.mean(axis=1)
    n,hop=2048,320
    frames=sliding_window_view(np.pad(mono,(n//2,n//2)),n)[::hop]
    freq=np.fft.rfftfreq(n,1/sr)
    bands=[(35,170),(180,4200),(5000,14500)]
    energies=np.zeros((len(frames),3),np.float32)
    chroma=np.zeros((len(frames),12),np.float32)
    valid=np.where((freq>130)&(freq<2400))[0]
    pitches=np.rint(69+12*np.log2(freq[valid]/440)).astype(int)%12
    for start in range(0,len(frames),1024):
        mag=np.abs(np.fft.rfft(frames[start:start+1024]*np.hanning(n),axis=1))
        for j,(lo,hi) in enumerate(bands):
            energies[start:start+len(mag),j]=np.sqrt(np.mean(mag[:,(freq>=lo)&(freq<hi)]**2,axis=1))
        compressed=np.sqrt(mag[:,valid])
        for p in range(12):
            chroma[start:start+len(mag),p]=compressed[:,pitches==p].sum(axis=1)
    return energies,chroma,hop/sr


def pick_peaks(signal,step,refractory=.1):
    if len(signal)<3 or float(np.max(signal))<1e-5:
        return []
    threshold=max(float(np.percentile(signal,90))*.35,float(np.median(signal))+float(np.std(signal))*.45)
    candidates=np.where((signal>np.r_[0,signal[:-1]])&(signal>=np.r_[signal[1:],0])&(signal>threshold))[0]
    kept=[]
    blocked=np.zeros(len(signal),bool)
    radius=max(1,round(refractory/step))
    for i in sorted(candidates,key=lambda k:float(signal[k]),reverse=True):
        if not blocked[i]:
            kept.append(int(i))
            blocked[max(0,i-radius):i+radius+1]=True
    return sorted(kept)


def drum_notes(audio,sr=32000):
    energy,_,step=features(audio,sr)
    flux=np.maximum(np.diff(np.log1p(energy),axis=0,prepend=np.zeros((1,3))),0)
    notes=[]
    for band,pitch,name,gap in [(0,36,"Kick",.14),(1,38,"Snare",.13),(2,42,"Hi-hat",.065)]:
        peaks=pick_peaks(flux[:,band],step,gap)
        scale=max(float(np.percentile(flux[:,band],98)),1e-6)
        for k in peaks:
            # Reject mid-band tails dominated by an isolated low-frequency kick.
            if band==1 and flux[k,0]>flux[k,1]*1.9:
                continue
            velocity=int(np.clip(92*np.sqrt(flux[k,band]/scale),28,120))
            start=max(0,k*step-.012)
            notes.append({"pitch":pitch,"start":round(start,4),"end":round(min(len(audio)/sr,start+.07),4),
                          "velocity":velocity,"label":name})
    return sorted(notes,key=lambda x:(x["start"],x["pitch"]))


def tonal_analysis(audio,bpm,sr=32000):
    energy,chroma,step=features(audio,sr)
    active=np.linalg.norm(chroma,axis=1)
    if max(active,default=0)<1e-5:
        return {"key":None,"chords":[],"tempo_windows":[]}
    normalized=chroma/np.maximum(np.linalg.norm(chroma,axis=1,keepdims=True),1e-8)
    profile=np.mean(normalized[active>np.percentile(active,30)],axis=0)
    major=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
    minor=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
    scores=[]
    for root in range(12):
        for mode,template in (("mayor",major),("menor",minor)):
            score=float(np.corrcoef(profile,np.roll(template,root))[0,1])
            scores.append((score,root,mode))
    scores.sort(reverse=True)
    score,root,mode=scores[0]
    key={"name":NAMES[root]+" "+mode,"root":root,"mode":mode,"correlation":round(score,3),
         "alternative":NAMES[scores[1][1]]+" "+scores[1][2],
         "evidence":"Perfil de clases de altura; tonalidad candidata, no certeza."} if score>.25 else None
    templates=[]
    for root in range(12):
        for suffix,third in (("",4),("m",3)):
            v=np.zeros(12);v[root]=1;v[(root+third)%12]=.85;v[(root+7)%12]=.85
            templates.append((NAMES[root]+suffix,v/np.linalg.norm(v),root,third))
    bar=240/bpm
    chords=[]
    for a in np.arange(0,len(audio)/sr,bar):
        values=chroma[int(a/step):int((a+bar)/step)]
        if not len(values):continue
        v=values.mean(axis=0)
        if float(np.linalg.norm(v))<float(np.max(active))*.08:continue
        v=v/max(np.linalg.norm(v),1e-8)
        ranked=sorted([(float(v@t),name,root,third) for name,t,root,third in templates],reverse=True)
        similarity,name,root,third=ranked[0]
        if similarity<.65:continue
        end=min(len(audio)/sr,a+bar)
        if chords and chords[-1]["name"]==name and abs(chords[-1]["end"]-a)<.01:
            chords[-1]["end"]=round(end,3)
        else:chords.append({"name":name,"start":round(float(a),3),"end":round(end,3),
                            "root":root,"third":third,"similarity":round(similarity,3)})
    return {"key":key,"chords":chords,"energy":energy,"step":step}


def arrange(audio,bpm,drums=None,sr=32000):
    from engine import rms,db,detect_tempo
    duration=len(audio)/sr
    bar=240/bpm
    # Label changes as candidates: only energy differences are observed.
    step_bars=4
    hop=bar*step_bars
    values=[rms(audio[round(t*sr):min(len(audio),round((t+hop)*sr))]) for t in np.arange(0,duration,hop)]
    sections=[]
    previous=None
    for i,value in enumerate(values):
        t=i*hop
        change=db(value/max(previous or value,1e-8))
        if i==0:name="Inicio / intro candidata"
        elif change>3:name="Entrada / drop candidato"
        elif change<-3:name="Break candidato"
        elif i==len(values)-1 and value<max(values)*.45:name="Cierre candidato"
        else:
            previous=value
            continue
        sections.append({"time":round(t,3),"bar":i*step_bars+1,"name":name,"energy_dbfs":round(db(value),1)})
        previous=value
    periods=[]
    for t in np.arange(0,duration,30):
        segment=audio[round(t*sr):min(len(audio),round((t+30)*sr))]
        if len(segment)<sr*8:continue
        estimated,pulse=detect_tempo(segment)
        periods.append({"start":round(float(t),2),"bpm":estimated if pulse is not None and pulse>.19 else None,
                        "periodicity":pulse})
    downbeat=None
    if drums:
        kicks=[n["start"] for n in drums if n["pitch"]==36]
        if len(kicks)>5:
            beat=60/bpm
            grid=np.arange(0,beat,.01)
            phase=min(grid,key=lambda p:np.mean(np.minimum((np.array(kicks)-p)%beat,beat-(np.array(kicks)-p)%beat)))
            downbeat={"phase_s":round(float(phase),3),"evidence":"Fase del pulso por kicks; el primer tiempo del compás requiere revisión."}
    return {"sections":sections,"tempo_windows":periods,"pulse_grid":downbeat}


def fit_bass(audio,sr=32000):
    """Measure harmonic ratios and audition nearby oscillator candidates."""
    from engine import db,rms
    candidates=[("Seno",0.,0.),("Seno con armónico suave",.16,.05),
                ("Bajo redondo",.32,.11),("Bajo brillante",.5,.23)]
    n=8192
    mono=audio.mean(axis=1)
    # Time-sampled frames cover the song without a quadratic note search.
    starts=np.linspace(0,max(0,len(mono)-n),min(160,max(1,len(mono)//n))).astype(int)
    frames=np.array([np.pad(mono[a:a+n],(0,max(0,n-len(mono[a:a+n])))) for a in starts])
    spec=np.abs(np.fft.rfft(frames*np.hanning(n)))
    freq=np.fft.rfftfreq(n,1/sr)
    span=np.where((freq>=32)&(freq<180))[0]
    energy=np.sqrt(np.mean(frames**2,axis=1))
    keep=energy>max(float(np.percentile(energy,80))*.25,.0005)
    ratio2,ratio3=[],[]
    for spectrum in spec[keep]:
        k=span[np.argmax(spectrum[span])]
        def harmonic(multiple):
            a,b=max(0,k*multiple-2),min(len(spectrum),k*multiple+3)
            return float(np.max(spectrum[a:b]))/max(float(spectrum[k]),1e-8)
        ratio2.append(harmonic(2));ratio3.append(harmonic(3))
    if not ratio2:return None
    h2,h3=float(np.median(ratio2)),float(np.median(ratio3))
    ranked=sorted([{"name":name,"harmonic2":h,"harmonic3":j,
                    "distance":round(abs(h-h2)+abs(j-h3),4)}
                   for name,h,j in candidates],key=lambda c:c["distance"])
    return {"measured_h2":round(h2,3),"measured_h3":round(h3,3),"candidates":ranked,
            "chosen":ranked[0],"evidence":"Distancia entre proporciones de armónicos medidas. No identifica el sintetizador original."}


def plugin_inventory():
    result=[]
    folders=[Path("/Library/Audio/Plug-Ins"),Path.home()/"Library/Audio/Plug-Ins"]
    for root in folders:
        for kind,suffix in (("Components",".component"),("VST3",".vst3"),("VST",".vst")):
            folder=root/kind
            if not folder.is_dir():continue
            for p in sorted(folder.glob("*"+suffix)):
                info={}
                try:
                    with (p/"Contents/Info.plist").open("rb") as f:info=plistlib.load(f)
                except (OSError,plistlib.InvalidFileException):pass
                result.append({"name":info.get("CFBundleName",p.stem),"format":"AU" if kind=="Components" else kind,
                               "version":info.get("CFBundleShortVersionString"),"verified":"Presente en disco; no se probó su carga."})
    return result


def recipes(metrics,notes,fit=None):
    result={}
    for name,m in metrics.items():
        chain=[]
        if name=="Bajo estimado":
            chain=["Operator · "+(fit["chosen"]["name"] if fit else "Sub Sine Bass"),
                   "EQ Eight · probar HP 25–30 Hz, pendiente suave",
                   "Utility · centro / revisar en mono"]
        elif name=="Percusion":
            chain=["Drum Rack · kick 36, snare 38, hi-hat 42","EQ Eight · revisar resonancias antes de recortar",
                   "Glue Compressor · probar 2:1 solo si se necesita cohesión"]
        elif name=="Voz":
            chain=["EQ Eight · probar HP 70–100 Hz","Compressor · probar 2:1 y ajustar por escucha","Reverb · probar envío corto"]
        else:chain=["Operator o instrumento propio para el MIDI","EQ Eight · quitar solo el solapamiento que se escuche"]
        result[name]={"measured":{"rms_dbfs":m["rms_dbfs"],"peak_dbfs":m["peak_dbfs"],"side_mid_db":m["side_mid_db"]},
                      "chain":chain,"status":"Puntos de partida; efectos no identificados desde el máster."}
    return result
