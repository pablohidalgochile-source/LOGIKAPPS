"""Disk-backed project metadata, shared by the library and job recovery."""
from datetime import datetime,timezone
import json
from pathlib import Path
import re
import threading

ROOT=Path(__file__).resolve().parent/"results"
LOCK=threading.RLock()


def directory(identifier):
    if not re.fullmatch(r"[a-f0-9]{32}",identifier):
        raise ValueError("Proyecto no válido.")
    return ROOT/identifier


def atomic_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+".pending")
    tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n")
    tmp.replace(path)


def metadata(identifier,report=None):
    folder=directory(identifier)
    path=folder/"Proyecto.json"
    with LOCK:
        data=json.loads(path.read_text()) if path.is_file() else {}
        if report is not None:
            data.setdefault("name",report.get("input_name","Mi canción"))
            data.setdefault("created",datetime.now(timezone.utc).isoformat())
            data.setdefault("favorite",False)
            data.update(duration_s=report.get("duration_s"),bpm=report.get("bpm"),
                        quality=report.get("quality","fast"),
                        tracks=len(report.get("audio_files",{})),notes=sum(len(x) for x in
                            [report.get("notes",[]),report.get("drum_notes",[])])+sum(len(x) for x in report.get("extra_midi",{}).values()))
            atomic_json(path,data)
    return {"id":identifier,**data}


def library():
    result=[]
    if not ROOT.is_dir():return result
    for folder in ROOT.iterdir():
        if not re.fullmatch(r"[a-f0-9]{32}",folder.name):continue
        path=folder/"Informe.json"
        try:
            if path.is_file():
                report=json.loads(path.read_text())
                if not (folder/"Contrapista.zip").is_file():continue
                result.append(metadata(folder.name,report))
        except (OSError,ValueError,TypeError):
            continue
    return sorted(result,key=lambda d:(d.get("favorite",False),d.get("created","")),reverse=True)[:200]


def edit(identifier,changes):
    folder=directory(identifier)
    if not (folder/"Informe.json").is_file():raise ValueError("No encontré el proyecto.")
    with LOCK:
        data=metadata(identifier)
        if "name" in changes:
            name=changes["name"]
            if not isinstance(name,str) or not name.strip() or len(name)>160:
                raise ValueError("El nombre debe tener entre 1 y 160 caracteres.")
            data["name"]=name.strip()
        if "favorite" in changes:
            if not isinstance(changes["favorite"],bool):raise ValueError("Favorito no válido.")
            data["favorite"]=changes["favorite"]
        data.pop("id",None)
        atomic_json(folder/"Proyecto.json",data)
    return {"id":identifier,**data}
