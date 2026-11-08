"""Experimental Live 12 Set writer, derived from this installation's Core Library.

WAV and MIDI are always available independently of Live's private Set format.
"""
from copy import deepcopy
import gzip
import json
import os
from pathlib import Path
import xml.etree.ElementTree as E
import zipfile

RESOURCES = Path(os.environ.get(
    "CONTRAPISTA_LIVE_RESOURCES",
    "/Applications/Ableton Live 12 Suite.app/Contents/App-Resources"))


def xml(path):
    with gzip.open(path, "rb") as f:
        return E.parse(f).getroot()


def val(node, path, value):
    target = node.find(path)
    if target is not None:
        target.set("Value",str(value))
    return target


def fresh_ids(node, counter):
    mapping={}
    for el in node.iter():
        if is_pointee(el) and "Id" in el.attrib:
            old=el.get("Id")
            new=str(next(counter))
            mapping[old]=new
            el.set("Id",new)
    for el in node.iter():
        if el.tag=="PointeeId" and el.get("Value") in mapping:
            el.set("Value",mapping[el.get("Value")])


def is_pointee(node):
    return (node.tag=="Pointee" or node.tag.endswith(("AutomationTarget","ModulationTarget"))
            or node.tag.startswith("ControllerTargets."))


def arrangement(track):
    target = "ClipTimeable" if track.tag == "MidiTrack" else "Sample"
    return track.find(f"DeviceChain/MainSequencer/{target}/ArrangerAutomation/Events")


def title(track, name, color, enabled=True):
    for field in ("EffectiveName","UserName"):
        val(track,"Name/"+field,name)
    val(track,"Color",color)
    val(track,"TrackUnfolded","true")
    val(track,"DeviceChain/Mixer/Speaker/Manual","true" if enabled else "false")


def setup_clip(clip, name, color, beats, domain):
    clip.attrib.update(Id="0",Time="0")
    for path,value in {
        "Name":name,"Annotation":"","Color":color,"CurrentStart":0,"CurrentEnd":beats,
        "Loop/LoopStart":0,"Loop/LoopEnd":domain,"Loop/StartRelative":0,"Loop/LoopOn":"false",
        "Loop/OutMarker":domain,"Loop/HiddenLoopStart":0,"Loop/HiddenLoopEnd":domain,
        "TakeId":1,"IsInKey":"false","TimeSelection/AnchorTime":0,"TimeSelection/OtherTime":0,
        "ScrollerTimePreserver/LeftTime":0,"ScrollerTimePreserver/RightTime":domain,
    }.items():
        val(clip,path,value)
    env=clip.find("Envelopes/Envelopes")
    for child in list(env):
        env.remove(child)
    return clip


def audio_clip(template, filename, name, color, beats, report, output):
    clip=setup_clip(deepcopy(template),name,color,beats,report["sample_count"]/report["sample_rate"])
    file=output/"Samples"/filename
    for path,value in {
        "RelativePathType":3,"RelativePath":f"Samples/{filename}",
        "Path":"","Type":2,"LivePackName":"","LivePackId":"",
        "OriginalFileSize":file.stat().st_size,"OriginalCrc":0,"SourceHint":"",
    }.items():
        val(clip,"SampleRef/FileRef/"+path,value)
    val(clip,"SampleRef/DefaultDuration",report["sample_count"])
    val(clip,"SampleRef/DefaultSampleRate",report["sample_rate"])
    val(clip,"SampleRef/LastModDate",int(file.stat().st_mtime))
    val(clip,"IsWarped","false")
    warp=clip.find("WarpMarkers")
    for child in list(warp):
        warp.remove(child)
    E.SubElement(warp,"WarpMarker",Id="0",SecTime="0",BeatTime="0")
    E.SubElement(warp,"WarpMarker",Id="1",SecTime=str(60/report["bpm"]),BeatTime="1")
    return clip


def midi_clip(template, notes, bpm, beats, name="Bajo reconstruido · MIDI",color=21):
    clip=setup_clip(deepcopy(template),name,color,beats,beats)
    n=clip.find("Notes")
    for path in ("KeyTracks","PerNoteEventStore/EventLists","NoteProbabilityGroups"):
        parent=n.find(path)
        if parent is not None:
            for child in list(parent):
                parent.remove(child)
    val(n,"NoteIdGenerator/NextId",len(notes)+1)
    keys=n.find("KeyTracks")
    for i,pitch in enumerate(sorted({note["pitch"] for note in notes})):
        k=E.SubElement(keys,"KeyTrack",Id=str(i))
        events=E.SubElement(k,"Notes")
        for j,note in enumerate(notes,1):
            if note["pitch"]==pitch:
                E.SubElement(events,"MidiNoteEvent",Time=str(note["start"]*bpm/60),
                             Duration=str((note["end"]-note["start"])*bpm/60),
                             Velocity=str(note["velocity"]),OffVelocity="64",NoteId=str(j),
                             IsEnabled="true")
        E.SubElement(k,"MidiKey",Value=str(pitch))
    val(clip,"NoteEditorFoldOutZoom",116)
    val(clip,"NoteEditorFoldOutScroll",-105)
    return clip


def duck_automation(track, duck, bpm, duration, base):
    vol=track.find("DeviceChain/Mixer/Volume")
    vol.find("Manual").set("Value",str(base))
    if not duck:
        return
    envs=track.find("AutomationEnvelopes/Envelopes")
    env=E.SubElement(envs,"AutomationEnvelope",Id="0")
    target=E.SubElement(env,"EnvelopeTarget")
    E.SubElement(target,"PointeeId",Value=vol.find("AutomationTarget").get("Id"))
    automation=E.SubElement(env,"Automation")
    events=E.SubElement(automation,"Events")
    gain=10**(-duck["depth_db"]/20)
    points={-63072000:base,0:base}
    kick=duck["phase_s"]
    while kick < duration:
        if kick>0.004:
            points[(kick-.004)*bpm/60]=base
        for f in (0,.25,.5,1,1.65):
            sec=kick+duck["recovery_ms"]/1000*f
            if sec < duration:
                points[sec*bpm/60]=base*(1-(1-gain)*(2.718281828**(-2*f)))
        kick+=60/bpm
    for i,(beat,value) in enumerate(sorted(points.items())):
        E.SubElement(events,"FloatEvent",Id=str(i),Time=str(beat),Value=str(value))
    transform=E.SubElement(automation,"AutomationTransformViewState")
    E.SubElement(transform,"IsTransformPending",Value="false")
    E.SubElement(transform,"TimeAndValueTransforms")


def make_set(output, report):
    core=RESOURCES/"Core Library"
    root=xml(RESOURCES/"Builtin/Templates/DefaultLiveSet.als")
    demo=xml(core/"Lessons/Demo Songs/Chuck Sutton - Patience (Live 12 Suite Demo).als").find("LiveSet")
    a_demo=demo.find(".//AudioTrack//ArrangerAutomation/Events/AudioClip")
    m_demo=demo.find(".//MidiTrack//ArrangerAutomation/Events/MidiClip")
    loc=demo.find("Locators/Locators/Locator")
    s=root.find("LiveSet")
    tracks=s.find("Tracks")
    audio_seed=deepcopy(tracks.find("AudioTrack"))
    midi_seed=deepcopy(tracks.find("MidiTrack"))
    for t in list(tracks):
        if t.tag!="ReturnTrack":
            tracks.remove(t)
    from itertools import count
    occupied=[int(e.get("Id")) for e in root.iter()
              if is_pointee(e) and e.get("Id","").isdigit()]
    id_source=count(max(occupied,default=10000)+100)
    track_id=count(100)
    num_tracks=0

    def add(seed,name,color,enabled):
        nonlocal num_tracks
        t=deepcopy(seed)
        t.set("Id",str(next(track_id)))
        fresh_ids(t,id_source)
        title(t,name,color,enabled)
        tracks.insert(num_tracks,t)
        num_tracks+=1
        return t

    beats=report["sample_count"]/report["sample_rate"]*report["bpm"]/60
    names={"Original":("A · Referencia original",13),"Percusion":("Percusión estimada",10),
           "Bajo estimado":("Bajo estimado · referencia",26),"Resto":("Resto de la mezcla",17),
           "Stem":("Stem original",17),"Bajo sintetizado":("B · Bajo sintetizado (WAV)",22),
           "Voz":("Voz · stem IA",24),"Melodia":("Instrumento melódico",17)}
    for key,file in report["audio_files"].items():
        if key=="Bajo sintetizado":
            continue
        name,color=names.get(key,(key,17))
        t=add(audio_seed,name,color,key!="Original" and not (key=="Bajo estimado" and report["notes"]))
        arrangement(t).append(audio_clip(a_demo,file,name,color,beats,report,output))
    if report["notes"]:
        t=add(midi_seed,"B · Bajo editable / Operator",21,True)
        operator=xml(core/"Devices/Instruments/Operator/Bass/Sub Sine Bass.adv").find("Operator")
        operator.set("Id","0")
        fresh_ids(operator,id_source)
        operator.find("LastPresetRef/Value").clear()
        val(operator,"UserName","Sub Sine Bass")
        t.find("DeviceChain/DeviceChain/Devices").append(operator)
        arrangement(t).append(midi_clip(m_demo,report["notes"],report["bpm"],beats))
        # Calibrated against the native Operator render of the controlled demo.
        # Other note/velocity patterns can still need a fader adjustment.
        measured=report["metrics"]["Bajo estimado"]["rms_dbfs"]
        gain=min(1.1,max(.001,10**((measured+report["common_gain_db"]+8.55)/20)))
        duck_automation(t,report.get("ducking"),report["bpm"],report["sample_count"]/report["sample_rate"],gain)
        name,color=names["Bajo sintetizado"]
        a=add(audio_seed,name,color,False)
        arrangement(a).append(audio_clip(a_demo,report["audio_files"]["Bajo sintetizado"],name,color,beats,report,output))
    if report.get("drum_notes"):
        t=add(midi_seed,"Batería MIDI · activar para probar",10,False)
        song=xml(core/"MIDI Clips/Drums/Drum Machines/808 Core Kit Straight 130 bpm.alc")
        rack=deepcopy(song.find(".//MidiTrack/DeviceChain/DeviceChain/Devices/DrumGroupDevice"))
        rack.set("Id","0")
        for branch in rack.find("Branches"):
            label=branch.find("Name/EffectiveName").get("Value")
            if label in {"Kick 808","Snare 808","Hihat Closed 808"}:
                # Drum Rack serializes receiving notes as 128 minus MIDI pitch.
                val(branch,"BranchInfo/ReceivingNote",128-{"Kick 808":36,"Snare 808":38,"Hihat Closed 808":42}[label])
        fresh_ids(rack,id_source)
        val(rack,"UserName","Contrapista · kit de prueba")
        t.find("DeviceChain/DeviceChain/Devices").append(rack)
        arrangement(t).append(midi_clip(m_demo,report["drum_notes"],report["bpm"],beats,"Batería candidata · MIDI",10))
        val(t,"DeviceChain/Mixer/Volume/Manual",.5)
    melodic={**report.get("extra_midi",{})}
    if report.get("chord_notes"):melodic["Acordes candidatos"]=report["chord_notes"]
    for name,notes in melodic.items():
        t=add(midi_seed,name+" MIDI · activar para probar",17,False)
        instrument=xml(core/"Devices/Instruments/Operator/Components/Sine Waveforms.adv").find("Operator")
        instrument.set("Id","0")
        fresh_ids(instrument,id_source)
        instrument.find("LastPresetRef/Value").clear()
        val(instrument,"UserName","Seno · referencia MIDI")
        t.find("DeviceChain/DeviceChain/Devices").append(instrument)
        arrangement(t).append(midi_clip(m_demo,notes,report["bpm"],beats,name+" · MIDI",17))
        val(t,"DeviceChain/Mixer/Volume/Manual",.25)
    val(s,"SelectedDocumentViewInMainWindow",0)
    val(s,"SequencerNavigator/BeatTimeHelper/CurrentZoom",0.12)
    val(s,"Transport/LoopStart",0)
    val(s,"Transport/LoopLength",beats)
    val(s,"MainTrack/DeviceChain/Mixer/Tempo/Manual",report["bpm"])
    target=s.find("MainTrack/DeviceChain/Mixer/Tempo/AutomationTarget").get("Id")
    for envelope in s.findall("MainTrack/AutomationEnvelopes/Envelopes/AutomationEnvelope"):
        if envelope.find("EnvelopeTarget/PointeeId").get("Value")==target:
            for event in envelope.findall("Automation/Events/FloatEvent"):
                event.set("Value",str(report["bpm"]))
    locators=s.find("Locators/Locators")
    for i,section in enumerate(report["sections"]):
        point=deepcopy(loc)
        point.set("Id",str(i))
        val(point,"Time",section["time"]*report["bpm"]/60)
        val(point,"Name",section["name"])
        locators.append(point)
    val(s,"NextPointeeId",next(id_source)+1)
    # Force arrangement clips to play on opening, regardless of the template's clip slots.
    for t in list(tracks)[:num_tracks]:
        val(t,"SavedPlayingSlot",-1)
        val(t,"DeviceChain/MainSequencer/IsPlaying", "false")
    path=output/"Contrapista.als"
    # Live resolves project-relative media only if it recognizes the project root.
    (output/"Ableton Project Info").mkdir(exist_ok=True)
    with gzip.open(path,"wb") as f:
        f.write(E.tostring(root,encoding="utf-8",xml_declaration=True))
    return path


def finish(output, report):
    try:
        make_set(output,report)
        report["live_set"]="Contrapista.als"
    except (FileNotFoundError, AttributeError, E.ParseError, gzip.BadGzipFile):
        report["live_set"]=None
        report["warnings"].append("No encontré una plantilla de Live 12 Suite compatible. Importa los WAV y el MIDI manualmente.")
    (output/"Informe.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    warns="\n".join("- "+item for item in report["warnings"])
    start="Abre Contrapista.als manteniendo Samples y Ableton Project Info a su lado." if report["live_set"] else (
        "Crea un Set nuevo. Arrastra los WAV de Samples al compás 1 y fija el BPM del informe.")
    (output/"LEEME.txt").write_text(f"""CONTRAPISTA / RECONSTRUCCIÓN LOCAL

{start}
Tempo: {report['bpm']} BPM ({report['tempo_source']}). Duración: {report['duration_s']} s.
Notas de bajo: {len(report['notes'])}.
Golpes de batería candidatos: {len(report.get('drum_notes',[]))}.
Motor: {report.get('separation_model','DSP local')}.

Para escuchar A, activa la pista Referencia original y ponla en Solo.
Quita Solo y vuelve a apagar esa pista para escuchar el arreglo.
Si hay bajo MIDI, abre su clip para editar notas y selecciona Operator para ajustar el sonido.
Para usar el bajo WAV, apaga la pista MIDI y enciende solo una de las pistas de bajo WAV.
El archivo B - Reconstruccion.wav usa el sintetizador de Contrapista, no el render de Operator.
También puedes importar Bajo editable.mid en una pista vacía y cargar Operator manualmente.
Las pistas MIDI adicionales comienzan apagadas para evitar doblar los stems.
Para probar batería MIDI, apaga la percusión WAV y activa la pista Batería MIDI.
Las melodías, la voz y los acordes candidatos requieren revisar notas y elegir un instrumento.

{warns}
""",encoding="utf-8")
    files=["Informe.json","LEEME.txt","B - Reconstruccion.wav","Validacion.json","Recetas.txt"]
    files += ["Samples/"+p for p in report["audio_files"].values()]
    if report["notes"]:
        files.append("Bajo editable.mid")
    files.extend(report.get("midi_files",{}).values())
    files.extend(v["file"] for v in report.get("variants",[]))
    files=list(dict.fromkeys(files))
    if report["live_set"]:
        files.append(report["live_set"])
    with zipfile.ZipFile(output/"Contrapista.zip","w",zipfile.ZIP_DEFLATED,compresslevel=3) as z:
        if report["live_set"]:
            z.write(output/"Ableton Project Info","Ableton Project Info")
        for name in files:
            if (output/name).is_file():
                z.write(output/name,name)
