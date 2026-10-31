#!/usr/bin/env python3
"""Offline video jobs: durable AI chunks, non-destructive export, JSON progress."""
import argparse, contextlib, fcntl, hashlib, json, math, os, pathlib, shutil
import signal, subprocess, sys, time
from fractions import Fraction
from types import SimpleNamespace
sys.dont_write_bytecode = True
import worker as image_worker

active = None
stopped = False

def emit(**data):
    print(json.dumps(data, ensure_ascii=False), flush=True)

def stop(signum, frame):
    global stopped
    stopped = True
    image_worker.cancel(signum,frame)
    if active and active.poll() is None:
        try: os.killpg(active.pid,signal.SIGTERM)
        except ProcessLookupError: pass

signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)

def tool(name):
    for p in [f'/opt/homebrew/bin/{name}',f'/usr/local/bin/{name}',shutil.which(name)]:
        if p and os.access(p,os.X_OK): return p
    raise ValueError(f'No se encontró {name} en este Mac.')

def command(args, line=None):
    global active
    if stopped: raise InterruptedError()
    active=subprocess.Popen([str(x) for x in args],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
    tail=''
    for text in active.stdout:
        tail=(tail+text)[-12000:]
        if line: line(text.strip())
    active.stdout.close(); active.wait()
    if stopped: raise InterruptedError()
    if active.returncode: raise RuntimeError(tail[-2000:] or 'El proceso de video no pudo terminar.')
    return tail

def probe(path):
    # Machine-readable metadata must not be truncated by the progress runner.
    p=subprocess.run([tool('ffprobe'),'-v','error','-show_streams','-show_format','-of','json','-protocol_whitelist','file,pipe',str(path)],capture_output=True,text=True,timeout=30)
    if p.returncode: raise ValueError('No se pudo leer el video: '+p.stderr[-500:])
    data=json.loads(p.stdout)
    streams=data.get('streams',[])
    videos=[s for s in streams if s.get('codec_type')=='video' and not s.get('disposition',{}).get('attached_pic')]
    if not videos: raise ValueError('El archivo no contiene una pista de video.')
    v=videos[0]
    rotation=next((int(round(s.get('rotation',0))) for s in v.get('side_data_list',[]) if 'rotation' in s),0)
    w,h=v['width'],v['height']
    sar=Fraction(v.get('sample_aspect_ratio','1:1').replace(':','/')) if v.get('sample_aspect_ratio') not in (None,'N/A','0:1') else Fraction(1)
    w=round(w*float(sar))
    if abs(rotation)%180==90: w,h=h,w
    try: fps=Fraction(v.get('avg_frame_rate','0/1'))
    except (ValueError,ZeroDivisionError): fps=Fraction(0)
    duration=float(v.get('duration') or data.get('format',{}).get('duration') or 0)
    if fps<=0 or duration<=0: raise ValueError('No se pudo determinar la duración o cadencia del video.')
    hdr=v.get('color_transfer') in ('smpte2084','arib-std-b67')
    interlaced=v.get('field_order') not in (None,'unknown','progressive')
    return dict(width=w,height=h,duration=duration,fps=float(fps),fps_ratio=str(fps),
                audio_tracks=len([s for s in streams if s.get('codec_type')=='audio']),
                hdr=hdr,interlaced=interlaced,rotation=rotation,video_index=v['index'],
                start_time=float(v.get('start_time') or 0),codec=v.get('codec_name',''),
                variable_hint=v.get('avg_frame_rate')!=v.get('r_frame_rate'),
                file_size=pathlib.Path(path).stat().st_size, nominal_rate=v.get('r_frame_rate') or str(fps))

def target(info,preset,custom):
    w,h=image_worker.dimensions(info['width'],info['height'],preset,custom)
    # Chroma-subsampled codecs need even dimensions. At most one pixel of padding.
    return w+(w%2),h+(h%2),w,h

def encoder(format):
    if format=='prores': return ['-c:v','prores_ks','-profile:v','3','-pix_fmt','yuv422p10le','-threads','4']
    return ['-c:v','libx264','-preset','medium','-bf','0','-crf','18','-pix_fmt','yuv420p','-threads','4']

def audio_encoder(format):
    return ['-c:a','pcm_s24le'] if format=='prores' else ['-c:a','aac','-b:a','256k']

def digest(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def atomic_json(path,data):
    temp=path.with_suffix('.pending')
    with temp.open('w') as f:
        json.dump(data,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
    os.replace(temp,path)

def scan_cfr(source,info):
    """Check EVERY timestamp; never silently normalize VFR in the AI path."""
    emit(message='Comprobando la cadencia del video…',progress=0)
    first=None; count=0; interval=1/info['fps']; bad=False
    def consume(line):
        nonlocal first,count,bad
        try: timestamp=float(line.split(',')[0])
        except ValueError:return
        if first is None: first=timestamp
        if abs(timestamp-first-count*interval)>max(.002,interval*.03): bad=True
        count+=1
    command([tool('ffprobe'),'-v','error','-select_streams',str(info['video_index']),'-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','csv=p=0',source],consume)
    if bad: raise ValueError('Este video tiene cadencia variable. Usa el modo Fiel para conservar sus tiempos; la IA de esta versión requiere cadencia constante.')
    if not count: raise ValueError('No se encontraron fotogramas.')
    return count

def estimate(info,format,mode,duration,pixels):
    # Conservative working reservation, not a prediction of compressed file size.
    seconds=max(0,duration)
    output=int(pixels*info['fps']*seconds*(.12 if format=='mp4' else .7))
    scratch=int(pixels*3*min(48,math.ceil(seconds*info['fps']))*2) if mode=='ai' else 0
    return output*3+scratch+512*1024*1024

def process(args):
    source=pathlib.Path(args.input).expanduser().resolve(strict=True)
    destination=pathlib.Path(args.output).expanduser().resolve()
    if source==destination or destination.exists(): raise ValueError('Elige una salida nueva; Elephant no reemplaza archivos existentes.')
    if not destination.parent.is_dir(): raise ValueError('La carpeta de salida ya no existe.')
    info=probe(source)
    if info['hdr']: raise ValueError('Este video es HDR. Esta versión exporta SDR; convierte una copia a SDR antes de ampliarla para evitar cambios de color.')
    if info['interlaced']: raise ValueError('Este video es entrelazado. Desentrelaza una copia antes de ampliarla.')
    if args.mode=='ai' and not image_worker.dependencies()['ai']: raise ValueError('El motor Real-ESRGAN no está disponible.')
    tw,th,iw,ih=target(info,args.preset,args.custom)
    if args.start<0 or args.start>=info['duration']: raise ValueError('El inicio está fuera del video.')
    duration=min(args.duration or info['duration'],info['duration']-args.start)
    if duration<=0: raise ValueError('La duración debe ser mayor que cero.')
    work=pathlib.Path(args.work).expanduser().resolve();work.mkdir(parents=True,exist_ok=True)
    with (work/'lock').open('w') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise ValueError('Este trabajo ya se está ejecutando.')
        stat=source.stat()
        signature=dict(version=1,source=str(source),size=stat.st_size,mtime=stat.st_mtime_ns,
                       mode=args.mode,preset=args.preset,custom=args.custom,format=args.format,
                       start=args.start,duration=duration,width=tw,height=th,chunk_frames=args.chunk_frames)
        state_path=work/'state.json'
        state=json.loads(state_path.read_text()) if state_path.exists() else dict(signature=signature,chunks=[],frames={})
        if state['signature']!=signature: raise ValueError('El archivo o los ajustes cambiaron. Crea un trabajo nuevo para no mezclar resultados.')
        reserve=estimate(info,args.format,args.mode,duration,tw*th)
        if shutil.disk_usage(work).free<reserve or shutil.disk_usage(destination.parent).free<reserve:
            raise ValueError(f'No hay espacio suficiente para este trabajo. Reserva aproximada: {reserve/1024**3:.1f} GB. Prueba un fragmento o una resolución menor.')
        atomic_json(state_path,state)
        ff=tool('ffmpeg');base=[ff,'-hide_banner','-loglevel','error','-nostdin','-y']
        ext='mov' if args.format=='prores' else 'mp4'
        partial=work/f'final.partial.{ext}'
        clock=time.monotonic()
        if args.mode=='faithful':
            emit(message='Ampliando video · modo Fiel…',progress=.01)
            def progress(line):
                if line.startswith('out_time_us='):
                    try: seconds=int(line.split('=')[1])/1e6
                    except ValueError:return
                    fraction=max(0,min(.98,seconds/duration));elapsed=time.monotonic()-clock
                    emit(progress=fraction,eta_seconds=elapsed*(1-fraction)/max(fraction,.001))
            command(base+['-ss',str(args.start),'-i',source]+(['-t',str(duration)] if args.duration else [])+['-map',f"0:{info['video_index']}",'-map','0:a?',
                          '-vf',f'scale={iw}:{ih}:flags=lanczos,setsar=1,pad={tw}:{th}:0:0',
                          '-fps_mode','passthrough','-enc_time_base','demux']+encoder(args.format)+audio_encoder(args.format)+
                    ['-map_metadata','-1','-metadata:s:v:0','rotate=0','-movflags','+faststart','-progress','pipe:1',partial],progress)
        else:
            all_frames=scan_cfr(source,info)
            fps=info['fps']; start_frame=math.ceil(args.start*fps-1e-6)
            total=min(all_frames-start_frame,max(1,math.ceil(duration*fps-1e-6)))
            duration=total/fps; actual_start=start_frame/fps
            size=args.chunk_frames; done=0; completed=[]
            for chunk in state['chunks']:
                path=work/chunk['file']
                if not path.is_file() or digest(path)!=chunk['sha256']: break
                completed.append(chunk);done+=chunk['count']
            state['chunks']=completed
            if done>total: raise ValueError('El punto de recuperación no corresponde al video.')
            initial_done=done
            emit(progress=.95*done/total,message=f'Reanudando desde el fotograma {done+1} de {total}…')
            while done<total:
                if stopped: raise InterruptedError()
                count=min(size,total-done);number=len(state['chunks'])
                frames=work/'frames';frames.mkdir(exist_ok=True)
                # Decode only one bounded chunk. Seeking is accurate (transcoding).
                command(base+['-ss',f'{actual_start+done/fps:.9f}','-i',source,'-map',f"0:{info['video_index']}",'-frames:v',str(count),
                              '-vf',f"scale={info['width']}:{info['height']},setsar=1",'-fps_mode','passthrough',frames/'input-%04d.png'])
                for k in range(1,count+1):
                    raw=frames/f'input-{k:04d}.png';out=frames/f'out-{k:04d}.png'
                    if not raw.exists(): raise ValueError('La cantidad de fotogramas decodificados no coincide. El original queda intacto.')
                    key=str(done+k)
                    valid=out.is_file() and state['frames'].get(key)==digest(out)
                    if not valid:
                        out.unlink(missing_ok=True)
                        # Reuse the tested tiled image engine; replace only its progress sink.
                        def report(**event):
                            f=(done+k-1+event.get('progress',0))/total
                            elapsed=time.monotonic()-clock;processed=(done-initial_done+k-1+event.get('progress',0))
                            emit(progress=.95*f,message=f'IA · fotograma {done+k} de {total}',
                                 eta_seconds=elapsed*(total-done-k+1)/max(processed,.1))
                        previous=image_worker.emit;image_worker.emit=report
                        try: image_worker.process(SimpleNamespace(input=str(raw),output=str(out),mode='ai',preset=args.preset,custom=args.custom))
                        finally: image_worker.emit=previous
                        state['frames'][key]=digest(out);atomic_json(state_path,state)
                    raw.unlink(missing_ok=True)
                segment=work/f'chunk-{number:06d}.{ext}'
                temp=work/f'chunk-{number:06d}.partial.{ext}'
                command(base+['-framerate',info['fps_ratio'],'-i',frames/'out-%04d.png','-frames:v',str(count),'-an',
                              '-vf',f'pad={tw}:{th}:0:0,setsar=1']+encoder(args.format)+['-video_track_timescale','1000000',temp])
                os.replace(temp,segment)
                state['chunks'].append(dict(file=segment.name,count=count,sha256=digest(segment)))
                state['frames']={};atomic_json(state_path,state)
                shutil.rmtree(frames);done+=count
                emit(progress=.95*done/total,message=f'Bloque guardado · {done} de {total} fotogramas')
            concat=work/'segments.txt'
            concat.write_text(''.join("file '%s'\n" % c['file'] for c in state['chunks']))
            emit(progress=.96,message='Uniendo video y audio original…')
            command(base+['-f','concat','-safe','1','-i',concat,'-ss',str(actual_start),'-i',source,
                          '-map','0:v:0','-map','1:a?','-c:v','copy']+audio_encoder(args.format)+
                    ['-t',str(duration),'-map_metadata','-1','-metadata:s:v:0','rotate=0','-movflags','+faststart',partial])
        if stopped: raise InterruptedError()
        result=probe(partial)
        if (result['width'],result['height'])!=(tw,th): raise RuntimeError('La resolución exportada no coincide con el trabajo.')
        if abs(result['duration']-duration)>max(.15,2/info['fps']): raise RuntimeError('La duración exportada no coincide con el original.')
        if result['audio_tracks']!=info['audio_tracks']: raise RuntimeError('No se conservaron todas las pistas de audio.')
        # Atomic, exclusive publish even when export and job folders are on different disks.
        import tempfile
        fd,temp=tempfile.mkstemp(prefix='.Elephant-',suffix='.'+ext,dir=destination.parent)
        try:
            with os.fdopen(fd,'wb') as out,partial.open('rb') as src:
                shutil.copyfileobj(src,out);out.flush();os.fsync(out.fileno())
            if stopped: raise InterruptedError()
            os.link(temp,destination) # fails if a file appeared in the meantime
        finally: os.unlink(temp)
        state['output']=str(destination);state['complete']=True;atomic_json(state_path,state)
        # Finished exports need no recovery payload. Keep only the small receipt.
        partial.unlink(missing_ok=True)
        for chunk in state['chunks']: (work/chunk['file']).unlink(missing_ok=True)
        emit(progress=1,message='Video terminado.',output=str(destination),width=tw,height=th,duration=result['duration'],processing_seconds=time.monotonic()-clock)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--inspect');p.add_argument('--input');p.add_argument('--output');p.add_argument('--work')
    p.add_argument('--mode',choices=['faithful','ai'],default='faithful');p.add_argument('--format',choices=['mp4','prores'],default='mp4')
    p.add_argument('--preset',choices=['2x','4x','4K','8K','custom'],default='2x');p.add_argument('--custom',type=int,default=10000)
    p.add_argument('--chunk-frames',type=int,choices=range(1,121),default=48)
    p.add_argument('--start',type=float,default=0);p.add_argument('--duration',type=float,default=0)
    args=p.parse_args()
    try:
        if args.inspect: emit(info=probe(pathlib.Path(args.inspect)));return
        if not all([args.input,args.output,args.work]): p.error('Faltan entrada, salida o carpeta de trabajo.')
        process(args)
    except InterruptedError: emit(paused=True,message='Trabajo pausado. Puedes reanudarlo.');sys.exit(130)
    except Exception as error: emit(error=str(error));sys.exit(1)

if __name__=='__main__': main()
