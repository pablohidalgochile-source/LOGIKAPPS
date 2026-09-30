"""Bounded-memory video pipeline using the official local Real-ESRGAN NCNN engine.

Frames are processed in small batches; no full-video frame dump is retained.
All subprocesses inherit the parent's process group for cancellation.
"""
import json, os, pathlib, shutil, struct, subprocess, sys, zlib

def png(path, data, width, height):
    def chunk(tag, body):
        return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', zlib.crc32(tag + body) & 0xffffffff)
    stride = width * 3
    pixels = b''.join(b'\0' + data[i:i + stride] for i in range(0, len(data), stride))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels, 1)) + chunk(b'IEND', b''))

def read_frame(pipe, size):
    data = bytearray()
    while len(data) < size:
        block = pipe.read(size - len(data))
        if not block:
            break
        data.extend(block)
    if data and len(data) != size:
        raise RuntimeError('Incomplete decoded frame')
    return data

def main():
    c = json.loads(pathlib.Path(sys.argv[1]).read_text())
    work = pathlib.Path(c['output']).parent / '.frames'
    incoming, outgoing = work / 'in', work / 'out'
    incoming.mkdir(parents=True, exist_ok=True)
    outgoing.mkdir(parents=True, exist_ok=True)
    # The general x4 model supplies an intermediate image for the final resize.
    # The server limits native input to 1080p; only four frames are held on disk.
    w, h = c['width'], c['height']
    fps = c['fps']
    safe = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,mp3,wav,flac,ogg,aac']
    decode = [c['ffmpeg'], '-v', 'error', '-nostdin', *safe, '-i', c['input'], '-t', str(c['duration']), '-an', '-vf', f'fps={fps},scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']
    encode = [c['ffmpeg'], '-v', 'error', '-nostdin', '-y', '-f', 'image2pipe', '-framerate', str(fps), '-i', 'pipe:0', *safe, '-i', c['input'], '-map', '0:v:0', '-map', '1:a:0?', '-t', str(c['duration']), '-vf', ','.join(c['videoFilters']), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart']
    if c['audioFilters'] and c['hasAudio']:
        encode += ['-af', ','.join(c['audioFilters']), '-ar', str(c['sampleRate'])]
    encode += [c['output']]
    decoder = encoder = None
    try:
        decoder = subprocess.Popen(decode, stdout=subprocess.PIPE)
        encoder = subprocess.Popen(encode, stdin=subprocess.PIPE)
        count = 0
        while True:
            batch = []
            for i in range(4):
                frame = read_frame(decoder.stdout, w * h * 3)
                if not frame:
                    break
                name = f'{i:04d}.png'
                png(incoming / name, frame, w, h)
                batch.append(name)
            if not batch:
                break
            cmd = [c['engine'], '-i', str(incoming), '-o', str(outgoing), '-m', str(pathlib.Path(c['engine']).parent / 'models'), '-n', 'realesrgan-x4plus', '-s', '4', '-t', '256', '-j', '1:1:1', '-f', 'png']
            result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if result.returncode:
                raise RuntimeError('Real-ESRGAN: ' + result.stderr.decode(errors='replace')[-1500:])
            for name in batch:
                with (outgoing / name).open('rb') as f:
                    shutil.copyfileobj(f, encoder.stdin, 1024 * 1024)
                encoder.stdin.flush()
                (incoming / name).unlink()
                (outgoing / name).unlink()
                count += 1
                print(f'AI_TIME {count / fps}', flush=True)
        decoder.stdout.close()
        if decoder.wait() != 0:
            raise RuntimeError('Video decoder failed')
        encoder.stdin.close()
        if encoder.wait() != 0 or not count:
            raise RuntimeError('Video encoder failed')
    finally:
        for child in [decoder, encoder]:
            if child and child.poll() is None:
                child.terminate()
        shutil.rmtree(work, ignore_errors=True)

if __name__ == '__main__':
    main()
