import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const failure = result => result.status === 'fulfilled' ? null
  : result.reason?.code === 'ENOENT' ? 'missing'
  : result.reason?.killed || result.reason?.code === 'ETIMEDOUT' ? 'timeout' : 'unavailable';

// Share concurrent checks, but never cache a failed startup check indefinitely.
export function createDependencyCheck({ ytdlp, ffmpeg, run = execute, now = Date.now, retryMs = 5000, ttlMs = 60000, onReady = () => {} }) {
  let cached, expires = 0, pending;
  return function checkDependencies() {
    if (pending) return pending;
    if (cached && now() < expires) return Promise.resolve(cached);
    pending = Promise.allSettled([
      Promise.resolve().then(() => run(ytdlp, ['--version'], { timeout: 10000 })),
      Promise.resolve().then(() => run(ffmpeg, ['-version'], { timeout: 10000 }))
    ]).then(([yt, ff]) => {
      const wasReady = cached?.ready;
      const errors = { ytDlp: failure(yt), ffmpeg: failure(ff) };
      const names = [errors.ytDlp && 'el motor de descarga', errors.ffmpeg && 'el procesador de audio y video'].filter(Boolean);
      cached = {
        ready: !errors.ytDlp && !errors.ffmpeg,
        ytDlp: yt.status === 'fulfilled' ? yt.value.stdout.trim() : null,
        ffmpeg: ff.status === 'fulfilled',
        dependencyErrors: errors,
        dependencyMessage: names.length ? `No se pudo iniciar ${names.join(' y ')}. Ingesta volverá a comprobarlo automáticamente en unos segundos.` : null
      };
      expires = now() + (cached.ready ? ttlMs : retryMs);
      if (cached.ready && !wasReady) onReady();
      return cached;
    }).finally(() => { pending = null; });
    return pending;
  };
}
