"""One isolated analysis. The web server imports no ML frameworks."""
import argparse
import json
import os
from pathlib import Path
import signal
import sys
import threading

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'vendor/contrapista'))


def emit(**values):
    print(json.dumps(values, ensure_ascii=False), flush=True)


def run(args):
    parent = os.getppid()
    finished = threading.Event()

    def watch_parent():
        while not finished.wait(2):
            if os.getppid() != parent:
                # The entire process group belongs to this job, including ML
                # subprocesses. Do not leave inference running after a crash.
                if os.getpgrp() == os.getpid():
                    os.killpg(os.getpgrp(), signal.SIGTERM)
                return

    threading.Thread(target=watch_parent, daemon=True).start()
    try:
        from engine import reconstruct
        from ableton import finish
        args.output.mkdir(parents=True, exist_ok=True)
        report = reconstruct(args.audio, args.output, args.source, args.bpm,
                             lambda stage, percent: emit(stage=stage, percent=percent), args.quality)
        report['input_name'] = args.name[:250]
        emit(stage='Preparando reconstrucción y sesión de Ableton', percent=92)
        finish(args.output, report)
        emit(stage='Análisis terminado', percent=100, result=True)
        return 0
    except Exception as error:
        emit(error=str(error) if isinstance(error, ValueError) else 'El motor local no pudo completar el análisis. Puedes reintentarlo.')
        print(repr(error), file=sys.stderr, flush=True)
        return 1
    finally:
        finished.set()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('audio', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--source', choices=['mix', 'bass', 'drums', 'melody', 'voice', 'stem'], default='mix')
    parser.add_argument('--quality', choices=['fast', 'ai'], default='fast')
    parser.add_argument('--bpm', type=float)
    parser.add_argument('--name', default='Audio')
    sys.exit(run(parser.parse_args()))
