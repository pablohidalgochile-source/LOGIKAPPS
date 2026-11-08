"""Isolated local ML runtime. Only structured progress is consumed by the app."""
import argparse
import contextlib
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT=Path(__file__).resolve().parent
os.environ.setdefault("TORCH_HOME",str(ROOT/".models"))
os.environ.setdefault("NUMBA_CACHE_DIR",str(ROOT/".models/numba"))


def event(stage,percent):
    print(json.dumps({"stage":stage,"percent":percent}),flush=True)


def separate(src,dest):
    import numpy as np
    import soundfile as sf
    import torch
    import librosa
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    torch.set_num_threads(min(6,os.cpu_count() or 2))
    model=get_model("htdemucs")
    model.eval()
    dest.mkdir(parents=True,exist_ok=True)
    with sf.SoundFile(src) as source:
        sr=source.samplerate
        total=len(source)
        names=model.sources
        files={name:sf.SoundFile(dest/(name+".wav"),"w",samplerate=sr,channels=2,subtype="FLOAT") for name in names}
        try:
            block=round(24*sr);context=round(2*sr)
            for start in range(0,total,block):
                stop=min(total,start+block)
                left,right=max(0,start-context),min(total,stop+context)
                source.seek(left)
                audio=source.read(right-left,dtype="float32",always_2d=True).T.copy()
                if audio.shape[0]==1:audio=np.repeat(audio,2,axis=0)
                audio=audio[:2]
                resized=librosa.resample(audio,orig_sr=sr,target_sr=model.samplerate)
                x=torch.from_numpy(resized)
                center=x.mean(0)
                mean,std=center.mean(),center.std().clamp(min=1e-6)
                with torch.inference_mode():
                    prediction=apply_model(model,((x-mean)/std)[None],device="cpu",
                                           shifts=0,split=True,overlap=.25,progress=False,num_workers=0)[0]*std+mean
                for i,name in enumerate(names):
                    data=librosa.resample(prediction[i].numpy(),orig_sr=model.samplerate,target_sr=sr).T
                    if len(data)<right-left:data=np.pad(data,((0,right-left-len(data)),(0,0)))
                    files[name].write(data[start-left:stop-left])
                event("Separando stems con Demucs",12+int(40*stop/total))
        finally:
            for f in files.values():f.close()
    return {"files":{name:str(dest/(name+".wav")) for name in names}}


def transcribe(src,dest):
    import numpy as np
    import soundfile as sf
    import basic_pitch
    from basic_pitch.inference import Model,predict
    model=Model(next(Path(basic_pitch.__file__).parent.rglob("*.onnx")))
    notes=[]
    with sf.SoundFile(src) as f, tempfile.TemporaryDirectory(prefix="contrapista-midi-") as scratch:
        sr=f.samplerate
        total=len(f)
        block=sr*30
        context=round(.5*sr)
        for a in range(0,total,block):
            b=min(total,a+block)
            left,right=max(0,a-context),min(total,b+context)
            f.seek(left)
            audio=f.read(right-left,dtype="float32",always_2d=True)
            if np.max(np.abs(audio))<.003:continue
            path=Path(scratch)/"window.wav"
            sf.write(path,audio,sr)
            with contextlib.redirect_stdout(sys.stderr):
                _,midi,_=predict(str(path),model,onset_threshold=.55,frame_threshold=.35,
                                 minimum_note_length=120,minimum_frequency=65,maximum_frequency=2100)
            for instrument in midi.instruments:
                for n in instrument.notes:
                    start=n.start+left/sr
                    end=min(n.end+left/sr,total/sr)
                    if a/sr<=start<b/sr and end-start>=.12:
                        notes.append({"start":round(float(start),4),"end":round(float(end),4),
                                      "pitch":int(n.pitch),"velocity":int(n.velocity)})
            event("Transcribiendo con Basic Pitch",58+int(8*b/total))
    dest.write_text(json.dumps({"notes":notes},ensure_ascii=False))
    return {"notes":notes}


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("task",choices=("separate","transcribe"))
    p.add_argument("input",type=Path);p.add_argument("output",type=Path)
    a=p.parse_args()
    result=separate(a.input,a.output) if a.task=="separate" else transcribe(a.input,a.output)
    print(json.dumps({"result":result}),flush=True)
