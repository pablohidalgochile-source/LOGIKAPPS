"""Contrapista's local workbench. Audio stays on this computer."""
import argparse
import errno
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
from urllib.parse import parse_qs, quote, unquote, urlsplit
from urllib.request import build_opener, ProxyHandler
from uuid import uuid4
import webbrowser

from ableton import finish
from engine import reconstruct
from ai import capabilities
from music import plugin_inventory
import projects

ROOT=Path(__file__).resolve().parent
DEMO=ROOT/"demo"/"Umbral IA Project"
MAX_BYTES=1024*1024*1024
ANALYZER=threading.BoundedSemaphore(1)
JOBS={}
JOB_LOCK=threading.Lock()


def update_job(identifier,**fields):
    with JOB_LOCK:
        if "percent" in fields:
            fields["percent"]=max(fields["percent"],JOBS[identifier].get("percent",0))
        JOBS[identifier].update(fields)
        snapshot={k:v for k,v in JOBS[identifier].items() if k!="report"}
        projects.atomic_json(ROOT/"results"/identifier/"Job.json",snapshot)


def analyze_job(identifier,out,scratch,source,bpm,name,quality="fast"):
    try:
        report=reconstruct(scratch/"audio",out,source,bpm,
                           lambda stage,percent:update_job(identifier,stage=stage,percent=percent),quality)
        report["input_name"]=name[:200]
        update_job(identifier,stage="Preparando el Set de Ableton y el ZIP",percent=93)
        finish(out,report)
        projects.metadata(identifier,report)
        update_job(identifier,state="done",stage="Reconstrucción lista",percent=100,report=report)
    except Exception as error:
        shutil.rmtree(out,ignore_errors=True)
        message=str(error) if isinstance(error,ValueError) else (
            "La lectura del audio superó el tiempo permitido." if isinstance(error,subprocess.TimeoutExpired)
            else "Falló el análisis. Revisa el mensaje en la terminal.")
        print(f"Error en análisis {identifier}: {error!r}",flush=True)
        update_job(identifier,state="error",error=message,stage="No se pudo completar el análisis")
    finally:
        shutil.rmtree(scratch,ignore_errors=True)
        ANALYZER.release()


class LocalHandler(BaseHTTPRequestHandler):
    def authorized(self):
        return self.headers.get("Host") in {
            f"127.0.0.1:{self.server.server_port}",f"localhost:{self.server.server_port}"
        }

    def error(self,status,message):
        self.reply(status,{"error":message})

    def reply(self,status,obj):
        raw=json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Length",str(len(raw)))
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):
            pass

    def file(self,path,download=False):
        if not path.is_file():
            self.error(404,"No encontré el archivo.")
            return
        size=path.stat().st_size
        start,end,status=0,size-1,200
        range_=self.headers.get("Range")
        if range_ and path.suffix==".wav":
            m=re.fullmatch(r"bytes=(\d*)-(\d*)",range_)
            if not m or not (m[1] or m[2]):
                self.send_response(416)
                self.send_header("Content-Range",f"bytes */{size}")
                self.end_headers()
                return
            start=int(m[1]) if m[1] else max(0,size-int(m[2]))
            end=min(size-1,int(m[2])) if m[1] and m[2] else size-1
            if not 0<=start<=end<size:
                self.send_response(416)
                self.send_header("Content-Range",f"bytes */{size}")
                self.end_headers()
                return
            status=206
        self.send_response(status)
        self.send_header("Content-Type",mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Length",str(end-start+1))
        if path.suffix==".wav":
            self.send_header("Accept-Ranges","bytes")
        if status==206:
            self.send_header("Content-Range",f"bytes {start}-{end}/{size}")
        if download:
            self.send_header("Content-Disposition","attachment; filename*=UTF-8''"+quote(path.name))
        self.end_headers()
        try:
            with path.open("rb") as f:
                f.seek(start)
                left=end-start+1
                while left:
                    part=f.read(min(left,1024*128))
                    if not part:
                        break
                    self.wfile.write(part)
                    left-=len(part)
        except (BrokenPipeError,ConnectionResetError):
            pass

    def do_GET(self):
        if not self.authorized():
            self.error(403,"Contrapista solo acepta conexiones locales.")
            return
        path=unquote(urlsplit(self.path).path)
        job=re.fullmatch(r"/jobs/([a-f0-9]{32})",path)
        if job:
            with JOB_LOCK:
                status=JOBS.get(job[1])
                status=dict(status) if status else None
            if status:
                self.reply(200,status)
            else:
                folder=ROOT/"results"/job[1]
                if (folder/"Contrapista.zip").is_file() and (folder/"Informe.json").is_file():
                    self.reply(200,{"id":job[1],"state":"done","percent":100,
                                   "report":json.loads((folder/"Informe.json").read_text())})
                elif (folder/"Job.json").is_file():
                    self.reply(200,{"id":job[1],"state":"error",
                                   "error":"El análisis se interrumpió al cerrar la app. Vuelve a iniciarlo."})
                else:self.error(404,"No encontré ese análisis.")
            return
        if path=="/projects":
            self.reply(200,{"projects":projects.library()})
            return
        if path=="/capabilities":
            self.reply(200,{**capabilities(),"plugins":plugin_inventory(),"version":"0.3"})
            return
        if path=="/":
            self.file(ROOT/"index.html")
            return
        m=re.fullmatch(r"/result/(demo|[a-f0-9]{32})/(.+)",path)
        if m:
            directory=DEMO if m[1]=="demo" else ROOT/"results"/m[1]
            name=m[2]
            allowed={"Informe.json","Validacion.json","Contrapista.zip","B - Reconstruccion.wav","Recetas.txt"}
            if name in allowed or re.fullmatch(r"(Samples/[^/\\]+\.wav|[^/\\]+\.mid|B - Variante [1-3]\.wav)",name):
                self.file(directory/name,name.endswith((".zip",".mid",".txt")))
                return
        self.error(404,"No encontré esa página.")

    def do_POST(self):
        if not self.authorized() or self.headers.get("X-Contrapista")!="1":
            self.error(403,"Solicitud local no válida.")
            return
        url=urlsplit(self.path)
        project=re.fullmatch(r"/projects/([a-f0-9]{32})/(edit|reanalyze)",url.path)
        if project:
            self.project_action(project[1],project[2])
            return
        if url.path!="/analyze":
            self.error(404,"No encontré esa página.")
            return
        try:
            size=int(self.headers.get("Content-Length","0"))
        except ValueError:
            size=0
        if not 0<size<=MAX_BYTES:
            self.error(413,"El archivo está vacío o supera 1 GB.")
            return
        args=parse_qs(url.query)
        name=args.get("filename",["pista.wav"])[0]
        source=args.get("source",["mix"])[0]
        quality=args.get("quality",["fast"])[0]
        if not ANALYZER.acquire(blocking=False):
            self.error(429,"Ya hay un análisis en curso.")
            return
        identifier=uuid4().hex
        out=ROOT/"results"/identifier
        scratch=Path(tempfile.mkdtemp(prefix="contrapista-"))
        try:
            self.connection.settimeout(300)
            bpm=float(args["bpm"][0]) if "bpm" in args else None
            with (scratch/"audio").open("wb") as f:
                left=size
                while left:
                    data=self.rfile.read(min(left,1024*1024))
                    if not data:
                        raise ValueError("La transferencia del archivo quedó incompleta.")
                    f.write(data)
                    left-=len(data)
        except (ValueError,subprocess.TimeoutExpired,TimeoutError) as error:
            shutil.rmtree(scratch,ignore_errors=True)
            ANALYZER.release()
            self.error(422,str(error) if isinstance(error,ValueError) else "El análisis superó el tiempo permitido.")
        except Exception as error:
            shutil.rmtree(scratch,ignore_errors=True)
            ANALYZER.release()
            self.log_error("Error durante el análisis: %r",error)
            self.error(500,"Falló el análisis. Revisa el mensaje en la terminal.")
        else:
            with JOB_LOCK:
                JOBS[identifier]={"id":identifier,"state":"running","stage":"Audio recibido","percent":1}
            worker=threading.Thread(target=analyze_job,args=(identifier,out,scratch,source,bpm,name,quality),daemon=True)
            try:
                worker.start()
            except RuntimeError:
                shutil.rmtree(scratch,ignore_errors=True)
                ANALYZER.release()
                update_job(identifier,state="error",error="No se pudo iniciar el análisis.")
                self.error(503,"No se pudo iniciar el análisis.")
                return
            self.reply(202,{"id":identifier,"state":"running"})

    def project_action(self,identifier,action):
        try:
            size=int(self.headers.get("Content-Length","0"))
            if not 0<size<=8192:raise ValueError("Solicitud no válida.")
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict):raise ValueError("Solicitud no válida.")
            if action=="edit":
                self.reply(200,projects.edit(identifier,body))
                return
            folder=projects.directory(identifier)
            report=json.loads((folder/"Informe.json").read_text())
            source_file=folder/"Samples"/report["audio_files"]["Original"]
            if not source_file.is_file():raise ValueError("El audio original ya no está disponible.")
            if not ANALYZER.acquire(blocking=False):
                self.error(429,"Ya hay un análisis en curso.");return
            scratch=Path(tempfile.mkdtemp(prefix="contrapista-reanalysis-"))
            new_id=uuid4().hex
            try:
                shutil.copyfile(source_file,scratch/"audio")
                with JOB_LOCK:
                    JOBS[new_id]={"id":new_id,"state":"running","stage":"Reabriendo audio guardado","percent":1}
                thread=threading.Thread(target=analyze_job,args=(new_id,ROOT/"results"/new_id,scratch,
                    report.get("source","mix"),body.get("bpm"),report.get("input_name","Mi canción"),body.get("quality","ai")),daemon=True)
                thread.start()
            except Exception:
                shutil.rmtree(scratch,ignore_errors=True);ANALYZER.release();raise
            self.reply(202,{"id":new_id,"state":"running"})
        except (ValueError,OSError,KeyError,TypeError) as e:
            self.error(422,str(e) if isinstance(e,ValueError) else "No se pudo abrir el proyecto.")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--port",type=int,default=8765)
    p.add_argument("--no-browser",action="store_true")
    args=p.parse_args()
    try:
        server=ThreadingHTTPServer(("127.0.0.1",args.port),LocalHandler)
    except OSError as e:
        if e.errno==errno.EADDRINUSE and not args.no_browser:
            url=f"http://127.0.0.1:{args.port}/"
            try:
                opener=build_opener(ProxyHandler({}))
                with opener.open(url,timeout=2) as response:
                    existing=b'id="source-form"' in response.read(65536) and response.status==200
            except OSError:
                existing=False
            if existing:
                print(f"Contrapista ya está en {url}",flush=True)
                webbrowser.open(url)
                return
        raise
    with server:
        url=f"http://127.0.0.1:{server.server_port}/"
        print(f"Contrapista está en {url} · Ctrl+C para salir",flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__=="__main__":
    main()
