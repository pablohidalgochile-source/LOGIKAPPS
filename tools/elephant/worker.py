#!/usr/bin/env python3
"""Elephant's offline image pipeline. JSON lines on stdout; never changes the source."""
import argparse, json, math, os, pathlib, re, shutil, signal, subprocess, sys, tempfile

child = None
cancelled = False

def emit(**event):
    print(json.dumps(event, ensure_ascii=False), flush=True)

def cancel(signum, frame):
    global cancelled
    cancelled = True
    if child and child.poll() is None:
        try: os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError: pass

signal.signal(signal.SIGTERM, cancel)
signal.signal(signal.SIGINT, cancel)

def run(args, progress=None):
    global child
    if cancelled: raise InterruptedError('Cancelado')
    child = subprocess.Popen([str(a) for a in args], stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, start_new_session=True)
    tail = ''
    for line in child.stdout:
        tail = (tail + line)[-4000:]
        if progress:
            match = re.search(r'(\d+(?:\.\d+)?)%', line)
            if match: progress(min(100, float(match.group(1))))
    child.stdout.close()
    child.wait()
    if cancelled: raise InterruptedError('Cancelado')
    if child.returncode: raise RuntimeError(tail.strip()[-1500:] or 'El motor no pudo procesar la imagen.')
    return tail.strip()

def magick_path():
    return next((p for p in ['/opt/homebrew/bin/magick', '/usr/local/bin/magick', shutil.which('magick')] if p and os.path.isfile(p)), None)

def dependencies():
    root = pathlib.Path.home() / 'AI-UPSCALER'
    binary = root / 'realesrgan-ncnn-vulkan'
    ai = os.access(binary, os.X_OK) and all((root / 'models' / ('realesrgan-x4plus.' + e)).is_file() for e in ['bin','param'])
    return dict(magick=magick_path(), ai=ai, engine=str(binary), models=str(root / 'models'))

def dimensions(width, height, preset, custom):
    if preset in ('2x','4x'): factor = int(preset[0])
    else:
        longest = {'4K':3840, '8K':7680}.get(preset, custom)
        if longest < 1: raise ValueError('Escribe un lado mayor válido.')
        factor = longest / max(width, height)
    w, h = max(1, math.floor(width * factor + 0.5)), max(1, math.floor(height * factor + 0.5))
    if w * h > 80_000_000 or max(w,h) > 16384:
        raise ValueError('El límite de esta versión es 80 megapíxeles y 16.384 px por lado.')
    if max(w,h) <= max(width,height): raise ValueError('El tamaño de salida debe ser mayor que el original.')
    return w,h

def ai_plan(width, height, target_width, target_height):
    """No assembled intermediate exceeds the requested image size."""
    plan = []
    while (width, height) != (target_width, target_height):
        nw, nh = min(width * 4, target_width), min(height * 4, target_height)
        plan.append((width, height, nw, nh))
        width, height = nw, nh
    return plan


def enhance(deps, source, destination, progress):
    run([deps['engine'], '-i', source, '-o', destination, '-m', deps['models'],
         '-n', 'realesrgan-x4plus', '-s', '4', '-t', '128', '-j', '1:1:1', '-f', 'png'], progress)


def tiled_pass(m, deps, source, destination, width, height, tw, th, progress,
               core=512, overlap=32):
    """Upscale overlapping patches, discard context, assemble at target resolution.

    A global affine transform keeps resampling phase identical across patches,
    including non-integer requested scales and partial edge patches.
    """
    with tempfile.TemporaryDirectory(prefix='tiles-', dir=destination.parent) as folder:
        folder = pathlib.Path(folder)
        rows = []
        total = math.ceil(width/core) * math.ceil(height/core)
        done = 0
        def edge(value, target, original):
            return math.floor(value * target / original + .5)
        for y in range(0, height, core):
            tiles = []
            y1 = min(height, y+core)
            oy, oy1 = edge(y,th,height), edge(y1,th,height)
            for x in range(0, width, core):
                x1 = min(width, x+core)
                ox, ox1 = edge(x,tw,width), edge(x1,tw,width)
                ex, ey = max(0,x-overlap), max(0,y-overlap)
                ex1, ey1 = min(width,x1+overlap), min(height,y1+overlap)
                patch, enlarged = folder/'input.png', folder/'enlarged.png'
                run(m + [source, '-crop', f'{ex1-ex}x{ey1-ey}+{ex}+{ey}', '+repage', patch])
                enhance(deps, patch, enlarged, lambda p: progress((done+p/100)/total*100))
                tile = folder/f'piece-{x}.miff'
                transform = f'{tw/(width*4)},0,0,{th/(height*4)},{ex*tw/width-ox},{ey*th/height-oy}'
                run(m + [enlarged, '-virtual-pixel', 'edge', '-filter', 'Lanczos',
                         '-define', f'distort:viewport={ox1-ox}x{oy1-oy}+0+0',
                         '-distort', 'AffineProjection', transform, '+repage', tile])
                tiles.append(tile)
                patch.unlink(); enlarged.unlink()
                done += 1
                progress(done/total*100)
            row = folder/f'row-{y}.miff'
            run(m + tiles + ['+append', row])
            rows.append(row)
            for tile in tiles: tile.unlink()
        run(m + rows + ['-append', destination])


def process(args):
    deps = dependencies()
    if not deps['magick']: raise RuntimeError('No se encontró ImageMagick. Instálalo para utilizar Elephant.')
    if args.mode == 'ai' and not deps['ai']: raise RuntimeError('No se encontró Real-ESRGAN con sus modelos en ~/AI-UPSCALER.')
    source, destination = pathlib.Path(args.input).resolve(), pathlib.Path(args.output).resolve()
    if source == destination: raise ValueError('El original y la salida no pueden ser el mismo archivo.')
    if destination.exists(): raise ValueError('La salida ya existe. Elige un nombre nuevo.')
    if not source.is_file(): raise ValueError('No se encuentra la imagen original.')
    m = [deps['magick'], '-limit','memory','1GiB','-limit','map','2GiB','-limit','disk','8GiB','-limit','thread','4']
    emit(progress=0.01, message='Preparando la imagen…')
    with tempfile.TemporaryDirectory(prefix='elephant-') as directory:
        d = pathlib.Path(directory)
        normalized = d / 'original.png'
        # First frame only; normalize EXIF orientation before reading dimensions.
        run(m + [str(source)+'[0]', '-auto-orient', '-colorspace','sRGB', normalized])
        info = run([deps['magick'],'identify','-format','%w %h %[channels]', normalized]).split()
        w,h = int(info[0]),int(info[1])
        tw,th = dimensions(w,h,args.preset,args.custom)
        current = normalized
        if args.mode == 'ai':
            plan = ai_plan(w,h,tw,th)
            current = d / 'rgb.png'
            run(m + [normalized,'-alpha','off',current])
            for i, (iw, ih, ow, oh) in enumerate(plan):
                result = d / ('ai-%d.png' % i)
                tiled = iw*ih*16 > 16_000_000
                suffix = ' · por secciones' if tiled else ''
                emit(progress=.05+.85*i/len(plan), message='Mejorando con IA · pasada %d de %d%s…' % (i+1,len(plan),suffix))
                report = lambda p: emit(progress=.05+.85*(i+p/100)/len(plan))
                if tiled:
                    tiled_pass(m,deps,current,result,iw,ih,ow,oh,report)
                else:
                    enlarged = d / 'enlarged.png'
                    enhance(deps,current,enlarged,report)
                    run(m + [enlarged,'-filter','Lanczos','-resize',f'{ow}x{oh}!',result])
                    enlarged.unlink()
                current.unlink()
                current = result
        emit(progress=.92, message='Ajustando el tamaño final…')
        final = d / 'final.png'
        run(m + [current,'-filter','Lanczos','-resize',f'{tw}x{th}!',final])
        if args.mode == 'ai' and 'a' in info[2].lower():
            alpha = d / 'alpha.png'
            run(m + [normalized,'-alpha','extract','-filter','Lanczos','-resize',f'{tw}x{th}!',alpha])
            merged = d / 'merged.png'
            run(m + [final,alpha,'-alpha','off','-compose','CopyOpacity','-composite',merged])
            final = merged
        if cancelled: raise InterruptedError('Cancelado')
        # Exclusive creation protects existing images even when a destination races us.
        try:
            with destination.open('xb') as out, final.open('rb') as src: shutil.copyfileobj(src,out)
        except Exception:
            raise
        if cancelled:
            destination.unlink(missing_ok=True)
            raise InterruptedError('Cancelado')
        emit(progress=1, message='Tu imagen ya creció.', output=str(destination), width=tw, height=th)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--check',action='store_true')
    p.add_argument('--input'); p.add_argument('--output')
    p.add_argument('--mode',choices=['faithful','ai'],default='faithful')
    p.add_argument('--preset',choices=['2x','4x','4K','8K','custom'],default='2x')
    p.add_argument('--custom',type=int,default=10000)
    args=p.parse_args()
    if args.check: emit(**dependencies()); return
    if not args.input or not args.output: p.error('--input and --output required')
    try: process(args)
    except InterruptedError: emit(cancelled=True, message='Ampliación cancelada.'); sys.exit(130)
    except Exception as e: emit(error=str(e)); sys.exit(1)

if __name__=='__main__': main()
