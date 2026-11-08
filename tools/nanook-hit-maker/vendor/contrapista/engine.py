"""Local DSP and portable Ableton export for Contrapista."""
import argparse
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import wave

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as windows

SR = 32000
MAX_SECONDS = 30 * 60
BLOCK_SAMPLES = SR * 10


def disk_array(shape):
    """Anonymous disk-backed storage; released when the last view is dropped."""
    with tempfile.TemporaryFile(prefix="contrapista-audio-") as f:
        f.truncate(math.prod(shape)*4)
        return np.memmap(f,dtype=np.float32,mode="r+",shape=shape)


def peak(audio):
    return max(float(np.max(np.abs(audio[i:i+BLOCK_SAMPLES])))
               for i in range(0,len(audio),BLOCK_SAMPLES))


def read_audio(path,allow_silence=False):
    if not shutil.which("ffmpeg"):
        raise ValueError("FFmpeg no está instalado.")
    with tempfile.TemporaryFile(prefix="contrapista-decode-") as decoded:
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe",
             "-format_whitelist", "wav,aiff,flac,mp3,ogg,mov,aac",
             "-i", str(path), "-vn", "-sn",
             "-t", str(MAX_SECONDS + 1), "-ar", str(SR), "-ac", "2", "-f", "f32le", "pipe:1"],
            stdout=decoded,stderr=subprocess.PIPE, timeout=180,
        )
        size=decoded.tell()
        if result.returncode or not size or size%8:
            raise ValueError("No pude leer el archivo de audio.")
        audio=np.memmap(decoded,dtype="<f4",mode="r",shape=(size//8,2))
    if len(audio) < SR or len(audio) > SR * MAX_SECONDS:
        raise ValueError("Usa un audio de entre 1 segundo y 30 minutos.")
    if any(not np.isfinite(audio[i:i+BLOCK_SAMPLES]).all()
           for i in range(0,len(audio),BLOCK_SAMPLES)) or (not allow_silence and peak(audio) < 1e-5):
        raise ValueError("El audio está vacío o contiene muestras inválidas.")
    return audio


def wav(path, audio, gain=1):
    audio = np.asarray(audio)
    channels = audio.shape[1] if audio.ndim == 2 else 1
    with wave.open(str(path), "wb") as f:
        f.setparams((channels, 2, SR, 0, "NONE", "not compressed"))
        for i in range(0,len(audio),BLOCK_SAMPLES):
            block=audio[i:i+BLOCK_SAMPLES]*gain
            f.writeframes(np.rint(np.clip(block, -1, 1) * 32767).astype("<i2").tobytes())


def db(x):
    return float(20 * np.log10(max(float(x), 1e-8)))


def rms(x):
    total=sum(float(np.sum(np.square(x[i:i+BLOCK_SAMPLES],dtype=np.float64)))
              for i in range(0,len(x),BLOCK_SAMPLES))
    return float(np.sqrt(total/x.size))


def separation(audio, progress=None):
    """Process overlapping blocks, retaining context across block boundaries."""
    tracks={name:disk_array(audio.shape) for name in ("Percusion","Bajo estimado","Resto")}
    context=SR//2
    for start in range(0,len(audio),BLOCK_SAMPLES):
        stop=min(start+BLOCK_SAMPLES,len(audio))
        left,right=max(0,(start-context)//512*512),min(len(audio),stop+context)
        parts=separation_block(audio[left:right])
        for name,part in parts.items():
            tracks[name][start:stop]=part[start-left:stop-left]
        if progress:
            progress("Separando pistas",12+int(43*stop/len(audio)))
    return tracks


def separation_block(audio):
    """Complementary masks: sustained centered low end, percussive, residual."""
    n, hop = 2048, 512
    win = np.sqrt(np.hanning(n + 1)[:-1]).astype(np.float32)
    padded = np.pad(audio, ((n // 2, n), (0, 0)))
    frames = windows(padded, n, axis=0)[::hop]
    spec = np.fft.rfft(frames * win, axis=-1).astype(np.complex64)
    mid = (spec[:, 0] + spec[:, 1]) * 0.5
    side = (spec[:, 0] - spec[:, 1]) * 0.5
    mag = np.abs(mid)
    harmonic = np.median(windows(np.pad(mag, ((7, 7), (0, 0)), mode="edge"), 15, axis=0), axis=-1)
    percussion = np.median(windows(np.pad(mag, ((0, 0), (5, 5)), mode="edge"), 11, axis=1), axis=-1)
    freq = np.fft.rfftfreq(n, 1 / SR)
    low = np.clip((220 - freq) / 92, 0, 1) * np.clip((freq - 17) / 15, 0, 1)
    tonal = (harmonic / (harmonic + 1.25 * percussion + 1e-6)) ** 1.3
    centered = np.abs(mid) / (np.abs(mid) + 1.7 * np.abs(side) + 1e-6)
    bass_weight = low * centered * tonal
    perc_weight = (1 - bass_weight) * np.minimum(
        (percussion / (percussion + 1.9 * harmonic + 1e-6)) ** 1.25 * 1.5, 1)
    den = np.zeros(len(padded), dtype=np.float32)
    for i in range(len(spec)):
        pos = i * hop
        den[pos:pos + n] += win * win

    def invert(mask):
        out = np.zeros_like(padded)
        samples = np.fft.irfft(spec * mask[:, None, :], n=n, axis=-1).astype(np.float32)
        for i, sample in enumerate(samples):
            pos = i * hop
            out[pos:pos + n] += sample.T * win[:, None]
        sl = slice(n // 2, n // 2 + len(audio))
        return out[sl] / np.maximum(den[sl, None], 1e-8)

    bass, drums = invert(bass_weight), invert(perc_weight)
    return {"Percusion": drums, "Bajo estimado": bass, "Resto": audio - bass - drums}


def detect_tempo(audio):
    """Find periodicity in spectral novelty. No guaranteed downbeat."""
    n, hop = 1024, 160
    mono = np.mean(audio, axis=1)
    frames = windows(np.pad(mono, (n // 2, n // 2)), n)[::hop]
    low_env=np.empty(len(frames),np.float32)
    high_env=np.empty(len(frames),np.float32)
    previous_low=previous_high=None
    for i in range(0,len(frames),1024):
        spec=np.abs(np.fft.rfft(frames[i:i+1024]*np.hanning(n),axis=-1))
        low=np.log1p(spec[:,1:6]*2)
        high=np.log1p(spec[:,6:300])
        low_env[i:i+len(spec)]=np.maximum(np.diff(low,axis=0,
            prepend=low[:1] if previous_low is None else previous_low),0).mean(axis=1)
        high_env[i:i+len(spec)]=np.maximum(np.diff(high,axis=0,
            prepend=high[:1] if previous_high is None else previous_high),0).mean(axis=1)
        previous_low,previous_high=low[-1:],high[-1:]
    def novelty(env):
        return env / max(float(np.percentile(env, 95)), 1e-6)
    env = novelty(low_env) * 0.8 + novelty(high_env) * 0.2
    lags = np.arange(round(60 * SR / hop / 170), round(60 * SR / hop / 72) + 1)
    bpm_range = 60 * SR / hop / lags
    signal = env - env.mean()
    if len(env) < 6 * max(lags) or np.linalg.norm(signal) < 1e-6:
        return None, None
    def corr(lag):
        a, b = signal[lag:], signal[:-lag]
        return np.dot(a, b) / max(np.linalg.norm(a) * np.linalg.norm(b), 1e-9)
    base = np.array([corr(k) for k in lags])
    multiples = np.array([corr(2 * k) for k in lags])
    score = base + 0.4 * multiples - 0.04 * np.abs(np.log2(bpm_range / 122))
    peaks = np.where((score >= np.r_[score[0], score[:-1]]) & (score >= np.r_[score[1:], score[-1]]))[0]
    i = peaks[np.argmax(score[peaks])]
    lag = float(lags[i])
    if 0 < i < len(lags) - 1:
        a, b, c = score[i-1:i+2]
        if 2 * b > a + c:
            lag += 0.5 * (c - a) / (2 * b - a - c)
    return round(60 * SR / hop / lag, 2), round(float(base[i]), 3)


def bass_notes(audio):
    mono = np.mean(audio, axis=1)
    frame, hop, fft = 4096, 480, 16384
    frames = windows(np.pad(mono, (frame//2, frame//2)), frame)[::hop]
    energies=np.empty(len(frames),np.float32)
    for i in range(0,len(frames),512):
        energies[i:i+512]=np.sqrt(np.mean(frames[i:i+512]**2,axis=1))
    threshold = max(float(np.percentile(energies, 90)) * 0.18, 0.001)
    # FFT oversampling and peak interpolation refine low frequency pitch.
    labels = np.full(len(frames), -1, dtype=int)
    selected = np.where(energies >= threshold)[0]
    win = np.hanning(frame)
    low, high = round(32 * fft / SR), round(225 * fft / SR)
    for indices in np.array_split(selected, max(1, math.ceil(len(selected)/256))):
        if not len(indices):
            continue
        mag = np.abs(np.fft.rfft(frames[indices] * win, n=fft))
        # Bass-first weighting helps prevent octave errors without forcing a key.
        k = np.argmax(mag[:, low:high] / np.sqrt(np.arange(low, high)), axis=1) + low
        q = np.arange(len(k))
        a, b, c = np.log(mag[q,k-1]+1e-8), np.log(mag[q,k]+1e-8), np.log(mag[q,k+1]+1e-8)
        interp = np.clip(0.5 * (a-c) / np.minimum(a-2*b+c, -1e-8), -0.5, 0.5)
        f = (k + interp) * SR / fft
        pitch = np.rint(69 + 12 * np.log2(f / 440)).astype(int)
        tonal = mag[q,k] / np.maximum(np.linalg.norm(mag[:,low:high], axis=1), 1e-8)
        keep = (tonal > 0.25) & (pitch >= 24) & (pitch <= 57)
        labels[indices[keep]] = pitch[keep]

    def runs(x):
        edges = np.r_[0, np.flatnonzero(x[1:] != x[:-1])+1, len(x)]
        return [(int(a), int(b), int(x[a])) for a,b in zip(edges[:-1],edges[1:])]

    old = runs(labels)
    for i, (a,b,pitch) in enumerate(old[1:-1], 1):
        if b-a <= 6 and old[i-1][2] == old[i+1][2] >= 0:
            labels[a:b] = old[i-1][2]
    notes = []
    peak = max(np.percentile(energies, 95), 1e-6)
    for a,b,pitch in runs(labels):
        if pitch < 0 or (b-a)*hop/SR < .115:
            continue
        vel = int(np.clip(82 * np.sqrt(np.median(energies[a:b]) / peak), 35, 110))
        notes.append({"pitch": pitch, "start": round(a*hop/SR, 4),
                      "end": round(min(len(audio)/SR,b*hop/SR), 4), "velocity": vel})
    return notes


def section_map(audio, bpm):
    bar = 240/bpm
    blocks = [(i, rms(audio[round(i*bar*SR):min(len(audio),round((i+1)*bar*SR))]))
              for i in range(max(1, int(len(audio)/SR/bar)))]
    markers = [{"bar": 1, "time": 0, "name": "Inicio de referencia"}]
    for (i,a), (_,b) in zip(blocks, blocks[1:]):
        if (i >= 1 and db(b/max(a,1e-8)) > 4.0 and i+2 < len(blocks)
                and db(blocks[i+2][1]/max(a,1e-8)) > 3):
            markers.append({"bar": i+2, "time": round((i+1)*bar,3), "name": "Sube la energía"})
        elif (i >= 1 and db(b/max(a,1e-8)) < -4.0 and i+2 < len(blocks)
              and db(blocks[i+2][1]/max(a,1e-8)) < -3):
            markers.append({"bar": i+2, "time": round((i+1)*bar,3), "name": "Baja la energía"})
    return markers


def spectral_metrics(audio):
    l, r = audio.T
    mid, side = (l+r)/2, (l-r)/2
    n = 4096
    frames = windows(np.pad(mid,(0,max(0,n-len(mid)))),n)[::2048]
    energy=np.zeros(n//2+1)
    for i in range(0,len(frames),512):
        energy+=np.sum(np.abs(np.fft.rfft(frames[i:i+512]*np.hanning(n)))**2,axis=0)
    energy/=len(frames)
    f = np.fft.rfftfreq(n,1/SR)
    total = max(float(np.sum(energy)),1e-12)
    return {"rms_dbfs": round(db(rms(audio)),1), "peak_dbfs": round(db(peak(audio)),1),
            "balance_lr_db": round(db(rms(l)/max(rms(r),1e-8)),1),
            "side_mid_db": round(db(rms(side)/max(rms(mid),1e-8)),1),
            "energy_under_160hz_pct": round(100 * float(np.sum(energy[f<160]))/total,1)}


def overview(audio, bins=72, gain=1):
    blocks=np.array_split(audio,bins)
    return [round(peak(x)*gain,4) for x in blocks]


def ducking(audio, drums, bpm, reliable):
    """Estimate a repeatable kick-aligned level dip; no processor attribution."""
    if not reliable:
        return None
    hop = 320
    count = len(audio)//hop
    frames = audio[:count*hop].reshape(count,hop,2)
    env = np.sqrt(np.mean(frames**2,axis=(1,2)))
    mono = drums.mean(axis=1)
    kick_frames=windows(np.pad(mono,(512,512)),1024)[::hop][:count]
    kick=np.empty(count,np.float32)
    for i in range(0,count,1024):
        spec=np.fft.rfft(kick_frames[i:i+1024]*np.hanning(1024))
        kick[i:i+len(spec)]=np.abs(spec[:,1:5]).sum(axis=1)
    novelty = np.maximum(np.diff(kick,prepend=kick[0]),0)
    stride = 60/bpm*SR/hop
    phases = np.arange(max(1,round(stride)))
    def at(phase):
        ticks = np.rint(np.arange(phase,count,stride)).astype(int)
        ticks = ticks[(ticks>=12)&(ticks<count-20)]
        return ticks
    phase = max(phases,key=lambda p: float(np.sum(novelty[at(p)])))
    ticks = at(phase)
    if len(ticks) < 8:
        return None
    profiles = []
    for t in ticks:
        before = float(np.median(env[t-10:t-4]))
        late = float(np.median(env[t+13:t+20]))
        if min(before,late) < .005 or not .6 < before/late < 1.65:
            continue
        profiles.append(env[t-2:t+19] / ((before+late)/2))
    if len(profiles) < 6:
        return None
    p = np.median(profiles, axis=0)
    depth = -db(np.min(p[2:11]))
    if depth < 2.5 or np.mean(p[13:]) < np.min(p[2:11])+.15:
        return None
    dip = int(np.argmin(p[2:11])+2)
    recovery = next((j for j in range(dip+1,len(p)) if p[j]>=.85), len(p)-1)
    return {"depth_db":round(depth,1), "recovery_ms":int(max(20,(recovery-dip)*10)),
            "observations":len(profiles), "phase_s":float(phase)*hop/SR,
            "hypothesis":"Compatible con compresión sidechain, envolvente o automatización."}


def synth(notes, samples, duck=None, bpm=120, harmonic=.16, harmonic3=0):
    out = disk_array((samples,))
    out[:]=0
    for note in notes:
        a,b = round(note["start"]*SR), min(samples,round(note["end"]*SR))
        if b<=a:
            continue
        for pos in range(a,b,BLOCK_SAMPLES):
            end=min(pos+BLOCK_SAMPLES,b)
            t=np.arange(pos-a,end-a)/SR
            env = np.minimum(t/.014,1) * np.minimum(((b-a-1)/SR-t)/.035,1)
            phi = 2*np.pi*440*2**((note["pitch"]-69)/12)*t
            out[pos:end] += (np.sin(phi)+harmonic*np.sin(2*phi)+harmonic3*np.sin(3*phi)) * env * note["velocity"]/90
    if duck:
        for start in range(0,samples,BLOCK_SAMPLES):
            stop=min(start+BLOCK_SAMPLES,samples)
            phase = (np.arange(start,stop)/SR-duck["phase_s"]) % (60/bpm)
            out[start:stop] *= 1-(1-10**(-duck["depth_db"]/20))*np.exp(-phase/(duck["recovery_ms"]/1000/2.0))
    return out


def vlq(x):
    digits = [x & 127]
    while x >> 7:
        x >>= 7
        digits.append((x & 127) | 128)
    return bytes(reversed(digits))


def write_midi(path, notes, bpm, name="Bajo Contrapista", channel=0):
    tempo = round(60_000_000 / bpm)
    ticks = 480 * bpm / 60
    title=name.encode("utf-8")
    track = bytearray(b"\x00\xff\x03"+vlq(len(title))+title)
    track += b"\x00\xff\x51\x03" + tempo.to_bytes(3,"big")
    events = []
    for n in notes:
        start = round(n["start"]*ticks)
        events += [(start, 1, n["pitch"], n["velocity"]),
                   (max(start+1,round(n["end"]*ticks)), 0, n["pitch"], 0)]
    last = 0
    for tick, on, pitch, velocity in sorted(events):
        track += vlq(tick-last)+bytes(((0x90 if on else 0x80)|channel,pitch,velocity))
        last = tick
    track += b"\x00\xff\x2f\x00"
    path.write_bytes(b"MThd"+struct.pack(">IHHH",6,0,1,480)+b"MTrk"+struct.pack(">I",len(track))+track)


def reconstruct(input_path, output, source="mix", bpm_override=None, progress=None, quality="fast"):
    progress=progress or (lambda message,percent:None)
    if source not in {"mix","bass","stem","drums","melody","voice"}:
        raise ValueError("Tipo de entrada desconocido.")
    if quality not in {"fast","ai"}:
        raise ValueError("Modo de análisis desconocido.")
    if bpm_override is not None and (not math.isfinite(bpm_override) or not 40 <= bpm_override <= 260):
        raise ValueError("El tempo manual debe estar entre 40 y 260 BPM.")
    progress("Leyendo la canción completa",3)
    audio = read_audio(input_path)
    progress("Detectando tempo",7)
    est, pulse = detect_tempo(audio)
    reliable = pulse is not None and pulse >= .19
    bpm = bpm_override or (est if reliable else 120)
    from music import drum_notes,tonal_analysis,arrange,fit_bass,recipes
    from ai import capabilities,run as ai_run
    capabilities_=capabilities()
    ai_warnings=[]
    if source=="mix" and quality=="ai":
        if not capabilities_["demucs"]:
            raise ValueError("Demucs no está listo en este equipo. Selecciona análisis rápido.")
        with tempfile.TemporaryDirectory(prefix="contrapista-stems-") as scratch:
            scratch=Path(scratch)
            wav(scratch/"input.wav",audio)
            progress("Preparando Demucs local",11)
            manifest=ai_run("separate",scratch/"input.wav",scratch/"stems",progress)
            tracks={}
            for key,name in (("drums","Percusion"),("bass","Bajo estimado"),("vocals","Voz"),("other","Resto")):
                data=read_audio(manifest["files"][key],allow_silence=True)
                if abs(len(data)-len(audio))>SR//10:
                    raise ValueError("El separador devolvió un stem con duración incorrecta.")
                target=disk_array(audio.shape);target[:]=0
                target[:min(len(data),len(audio))]=data[:len(audio)]
                tracks[name]=target
            # Preserve mixture consistency without hiding the extracted vocal.
            for start in range(0,len(audio),BLOCK_SAMPLES):
                stop=min(start+BLOCK_SAMPLES,len(audio))
                residual=audio[start:stop]-sum(t[start:stop] for t in tracks.values())
                tracks["Resto"][start:stop]+=residual
    elif source=="mix":
        tracks=separation(audio,progress)
    else:
        tracks={{"bass":"Bajo estimado","drums":"Percusion","voice":"Voz","melody":"Melodia"}.get(source,"Stem"):audio}
    tempo_signal="Original"
    if not reliable and bpm_override is None and "Percusion" in tracks:
        estimated,pulse_drums=detect_tempo(tracks["Percusion"])
        if pulse_drums is not None and pulse_drums>=.19:
            est,pulse=estimated,pulse_drums
            reliable=True
            bpm=estimated
            tempo_signal="Percusion"
    bass = tracks.get("Bajo estimado")
    progress("Transcribiendo el bajo",57)
    notes = bass_notes(bass) if bass is not None else []
    progress("Detectando batería y armonía",58)
    drums=drum_notes(tracks["Percusion"]) if "Percusion" in tracks else []
    tonal=tonal_analysis(tracks.get("Resto",tracks.get("Melodia",tracks.get("Voz",audio))),bpm)
    structure=arrange(audio,bpm,drums)
    fit=fit_bass(bass) if notes else None
    extra_midi={}
    if quality=="ai" and capabilities_["basic_pitch"]:
        with tempfile.TemporaryDirectory(prefix="contrapista-pitch-") as scratch:
            scratch=Path(scratch)
            for name in ("Melodia","Voz","Resto"):
                if name not in tracks or rms(tracks[name])<.002:continue
                wav(scratch/"input.wav",tracks[name])
                progress("Transcribiendo "+name+" con IA",60)
                result=ai_run("transcribe",scratch/"input.wav",scratch/"notes.json",progress)
                if result["notes"]:
                    extra_midi[name]=result["notes"]
    elif source in {"voice","melody"}:
        ai_warnings.append("Para transcribir melodía o voz selecciona el modo IA.")
    if not notes and source=="mix":
        # Keep the separated low band as audio when a pitch is not defensible.
        source_warning = "No aparecieron notas de bajo suficientemente estables; se conserva en WAV."
    else:
        source_warning = None
    duck = ducking(bass, tracks["Percusion"], bpm, reliable or bool(bpm_override)) if source=="mix" and notes else None
    progress("Reconstruyendo el sonido",68)
    recreated = None
    recreate = audio
    if notes:
        chosen=fit["chosen"] if fit else {"harmonic2":.16,"harmonic3":0}
        recreated = synth(notes,len(audio),duck,bpm,chosen["harmonic2"],chosen["harmonic3"])
        recreated *= rms(bass)/max(rms(recreated),1e-8)
        recreate=disk_array(audio.shape)
        for start in range(0,len(audio),BLOCK_SAMPLES):
            stop=min(start+BLOCK_SAMPLES,len(audio))
            recreate[start:stop]=audio[start:stop]-bass[start:stop]+recreated[start:stop,None]
    # One common attenuation preserves comparison levels and prevents clipping.
    common = min(1,.97/max(peak(audio),peak(recreate),peak(recreated) if notes else 0,
                           *(peak(t) for t in tracks.values()),1e-8))
    samples = output/"Samples"
    samples.mkdir(parents=True, exist_ok=True)
    files = {"Original":"A - Original.wav"}
    progress("Exportando los audios completos",76)
    wav(samples/files["Original"], audio,common)
    for i,(name,data) in enumerate(tracks.items(),1):
        files[name] = f"{i:02d} - {name}.wav"
        wav(samples/files[name], data,common)
    if notes:
        files["Bajo sintetizado"] = "Bajo sintetizado.wav"
        wav(samples/files["Bajo sintetizado"],np.broadcast_to(recreated[:,None],audio.shape),common)
        write_midi(output/"Bajo editable.mid",notes,bpm)
    midi_files={}
    if notes:midi_files["Bajo estimado"]="Bajo editable.mid"
    if drums:
        midi_files["Percusion"]="Bateria editable.mid"
        write_midi(output/midi_files["Percusion"],drums,bpm,"Bateria Contrapista",9)
    for name,data in extra_midi.items():
        midi_files[name]=name+" editable.mid"
        write_midi(output/midi_files[name],data,bpm,name+" Contrapista")
    chord_notes=[]
    for chord in tonal["chords"]:
        for p in (chord["root"]+48,chord["root"]+48+chord["third"],chord["root"]+55):
            chord_notes.append({"pitch":p,"start":chord["start"],"end":chord["end"],"velocity":65})
    if chord_notes:
        midi_files["Acordes"]="Acordes candidatos.mid"
        write_midi(output/midi_files["Acordes"],chord_notes,bpm,"Acordes candidatos")
    wav(output/"B - Reconstruccion.wav",recreate,common)
    variants=[]
    if notes and fit:
        for index,candidate in enumerate(fit["candidates"][:3]):
            signal=synth(notes,len(audio),duck,bpm,candidate["harmonic2"],candidate["harmonic3"])
            signal*=rms(bass)/max(rms(signal),1e-8)
            variant=disk_array(audio.shape)
            for start in range(0,len(audio),BLOCK_SAMPLES):
                stop=min(start+BLOCK_SAMPLES,len(audio))
                variant[start:stop]=audio[start:stop]-bass[start:stop]+signal[start:stop,None]
            gain=min(common,.97/max(peak(variant),1e-8))
            filename=f"B - Variante {index+1}.wav"
            wav(output/filename,variant,gain)
            variants.append({"name":candidate["name"],"file":filename,"harmonic_distance":candidate["distance"],
                             "gain_db":round(db(gain),2)})
    progress("Midiendo pistas y preparando el informe",85)
    report = {
        "source": source, "duration_s": round(len(audio)/SR,3), "sample_count":len(audio), "sample_rate":SR,
        "bpm": bpm, "tempo_source": "manual" if bpm_override else ("estimado" if reliable else "referencia"),
        "tempo_candidate":est, "pulse_periodicity":pulse,
        "tempo_signal":tempo_signal,
        "sections":structure["sections"],
        "notes":notes,"audio_files":files,"metrics":{name:spectral_metrics(data) for name,data in tracks.items()},
        "waves":{name:overview(data,gain=common) for name,data in {"Original":audio,**tracks}.items()},
        "ducking":duck,"common_gain_db":round(db(common),2),
        "quality":quality,"separation_model":"Demucs htdemucs" if quality=="ai" and source=="mix" else "DSP local",
        "key":tonal["key"],"chords":tonal["chords"],"tempo_windows":structure["tempo_windows"],
        "pulse_grid":structure["pulse_grid"],"drum_notes":drums,"extra_midi":extra_midi,
        "chord_notes":chord_notes,"midi_files":midi_files,"sound_fit":fit,"variants":variants,
        "comparison_levels":{"A":round(db(rms(audio))+db(common),2),"B":round(db(rms(recreate))+db(common),2)},
        "recipe":{
            "instrument":"Operator · Sub Sine Bass como punto de partida" if notes else None,
            "eq":"Si el sub invade el bombo, prueba EQ Eight: filtro pasa altos suave a 25–30 Hz y compara." if notes else None,
            "mix":"Empieza en el centro. Ajusta el fader comparando con el bajo estimado a igual nivel." if notes else None,
            "limits":"Las mediciones describen la salida. Los faders, efectos y presets de la sesión original no se pueden leer desde el máster.",
        },
        "warnings": ai_warnings+[s for s in (source_warning,
            "Los stems de IA pueden tener artefactos y cruces entre instrumentos." if quality=="ai" and source=="mix" else
            "Separación rápida por frecuencia y transitorios; puede haber cruces y no hay stems vocales aislados." if source=="mix" else None,
            "Batería, acordes y secciones son candidatos editables. Revisa los eventos contra el audio.",
            "No hay pulso suficientemente claro. 120 BPM es solo una cuadrícula provisional." if not reliable and not bpm_override else None,
            "Los compases toman el inicio del archivo como referencia; corrige el primer tiempo si hace falta." if source=="mix" else None) if s],
    }
    report["track_recipes"]=recipes(report["metrics"],notes,fit)
    (output/"Recetas.txt").write_text("\n\n".join(name+"\n"+"\n".join("- "+c for c in r["chain"])+"\n"+r["status"]
                                                 for name,r in report["track_recipes"].items()),encoding="utf-8")
    (output/"Informe.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio",type=Path)
    parser.add_argument("output",type=Path)
    parser.add_argument("--source",choices=("mix","bass","stem","drums","melody","voice"),default="mix")
    parser.add_argument("--quality",choices=("fast","ai"),default="fast")
    parser.add_argument("--bpm",type=float)
    args=parser.parse_args()
    from ableton import finish
    try:
        report=reconstruct(args.audio,args.output,args.source,args.bpm,quality=args.quality)
        finish(args.output,report)
    except (ValueError, subprocess.TimeoutExpired) as e:
        parser.error(str(e))
    print(f'{report["bpm"]} BPM · {len(report["notes"])} notas · {args.output.resolve()}')


if __name__ == "__main__":
    main()
