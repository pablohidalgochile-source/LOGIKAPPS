"""Subprocess bridge: the web app never needs to import PyTorch."""
from pathlib import Path
import json
import os
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parent
PYTHON=ROOT/".venv-ai/bin/python"


def capabilities():
    models=ROOT/".models/hub/checkpoints"
    return {"demucs":PYTHON.exists() and any(models.glob("955717e8-*.th")),
            "basic_pitch":PYTHON.exists() and any((ROOT/".venv-ai/lib").glob("python*/site-packages/basic_pitch/saved_models/**/*.onnx"))}


def run(task,src,out,progress):
    env=os.environ.copy()
    env["TORCH_HOME"]=str(ROOT/".models")
    env["PYTHONDONTWRITEBYTECODE"]="1"
    result=None
    with tempfile.TemporaryFile(mode="w+") as errors:
        with subprocess.Popen([str(PYTHON),str(ROOT/"ai_worker.py"),task,str(src),str(out)],
                              stdout=subprocess.PIPE,stderr=errors,text=True,env=env) as proc:
            for line in proc.stdout:
                try:message=json.loads(line)
                except json.JSONDecodeError:continue
                if "stage" in message:progress(message["stage"],message["percent"])
                if "result" in message:result=message["result"]
            code=proc.wait()
        if code or result is None:
            errors.seek(0)
            detail=errors.read()[-2500:]
            raise ValueError("El motor local de IA no pudo completar el análisis. "+detail.splitlines()[-1] if detail else "Falló el motor local de IA.")
    return result
