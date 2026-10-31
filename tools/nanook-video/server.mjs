import http from 'node:http';
import { startMediaProxy } from './network.mjs';
import { spawn } from 'node:child_process';
import { createDependencyCheck } from './dependencies.mjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename, extname, sep } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, statSync, statfsSync, readdirSync, rmSync, createReadStream, createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mediaURL, safeFormat, videoDownloadPlan, audioSelection, downloadChoices, summarize, friendlyError, isYouTubeSource, extractorArgs, canStartDownload } from './lib.mjs';
import { mediaExtensions, safeInput, activeStates, metadata, mediaType, enhancementOptions, audioFilters, videoFilters, audioEncoding, compatibleMp4Encoding, contentType, byteRange } from './media.mjs';
import { QUEUE_LIMIT, createBatchManager, discoveryInput, discoveryResults, downloadKey, queueConfig, titleMatch, words } from './bulk.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, '.data');
const DOWNLOADS = join(ROOT, 'downloads');
const PORT = Number(process.env.PORT || 4317);
const TOKEN = randomBytes(32).toString('hex');
const LOCAL_YTDLP = join(ROOT, '.runtime', 'venv', 'bin', 'yt-dlp');
const VENV_YTDLP = join(ROOT, '.runtime/venv/bin/yt-dlp');
const YTDLP = process.env.YTDLP_PATH || (existsSync(VENV_YTDLP) ? VENV_YTDLP : existsSync(LOCAL_YTDLP) ? LOCAL_YTDLP : 'yt-dlp');
const FFMPEG = process.env.FFMPEG_PATH || (process.env.PATH || '').split(':').map(dir => join(dir, 'ffmpeg')).find(path => existsSync(path)) || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || (FFMPEG.includes('/') ? join(dirname(FFMPEG), 'ffprobe') : 'ffprobe');
const ESRGAN = process.env.ESRGAN_PATH || join(ROOT, '.runtime/esrgan/realesrgan-ncnn-vulkan');
const PYTHON = process.env.PYTHON_PATH || (existsSync(join(ROOT, '.runtime/venv/bin/python3')) ? join(ROOT, '.runtime/venv/bin/python3') : 'python3');
const aiReady = existsSync(ESRGAN) && existsSync(join(dirname(ESRGAN), 'verified.json'));
let uploading = false;
const mediaProxy = await startMediaProxy();
const common = ['--proxy',mediaProxy.url,'--hls-prefer-native','--ignore-config', '--no-playlist', '--no-cache-dir', '--no-colors', '--js-runtimes', `node:${process.execPath}`, '--socket-timeout', '20', '--retries', '3', '--fragment-retries', '3'];
const children = new Set();
const analyses = new Map();
let analysisCount = 0;
const running = new Map();
let discoveryCount = 0;
let stopping = false;
mkdirSync(DATA, { recursive: true });
mkdirSync(DOWNLOADS, { recursive: true });
let queueSettings = { paused:false, concurrency:2 };
try { queueSettings = queueConfig(JSON.parse(readFileSync(join(DATA,'queue.json'),'utf8')),queueSettings); } catch {}
function saveQueue() { writeFileSync(join(DATA,'queue.tmp'),JSON.stringify(queueSettings));renameSync(join(DATA,'queue.tmp'),join(DATA,'queue.json')); }
let jobs = [];
try { jobs = JSON.parse(readFileSync(join(DATA, 'jobs.json'), 'utf8')); } catch {}
jobs = Array.isArray(jobs) ? jobs.filter(j => /^[a-f0-9-]{36}$/.test(j.id)) : [];
for (const job of jobs) {
  if (['downloading', 'processing'].includes(job.status)) {
    job.status = 'queued'; job.progress = 0; job.stage = 'Retomando trabajo interrumpido'; delete job.error;
  }
  if (job.status === 'done' && !existsSync(join(DOWNLOADS, job.id, basename(job.filename || 'missing')))) {
    job.status = 'error'; job.error = 'El archivo se movió o ya no existe. Puedes volver a descargarlo.';
  }
}
function persist() {
  writeFileSync(join(DATA, 'jobs.tmp'), JSON.stringify(jobs));
  renameSync(join(DATA, 'jobs.tmp'), join(DATA, 'jobs.json'));
}
persist();
const checkDependencies = createDependencyCheck({ ytdlp: YTDLP, ffmpeg: FFMPEG, onReady: () => {
  if (!stopping) { pump(); batches.pump(); }
} });

function kill(child) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 2000);
  timer.unref();
}

function run(args, { timeout = 120000, onLine, binary = YTDLP, returnStderr = false } = {}) {
  const child = spawn(binary, args, { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  let stdout = '', stderr = '', partial = '', exceeded = false, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; kill(child); }, timeout);
  const done = new Promise((res, rej) => {
    child.stdout.on('data', chunk => {
      if (!onLine) {
        stdout += chunk;
        if (stdout.length > 20000000) { exceeded = true; kill(child); }
      } else {
        partial += chunk;
        const lines = partial.split(/\r?\n/); partial = lines.pop();
        for (const line of lines) onLine(line);
      }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    child.once('error', err => { clearTimeout(timer); children.delete(child); rej(err); });
    child.once('close', code => {
      clearTimeout(timer); children.delete(child);
      if (partial && onLine) onLine(partial);
      if (code === 0 && !exceeded && !timedOut) res(returnStderr ? stderr : stdout);
      else rej(new Error(timedOut ? 'timeout' : stderr || 'No se pudo completar la descarga.'));
    });
  });
  return { child, done };
}

function publicJob(job) {
  return { ...job, mediaType: job.mediaType || (job.filename ? mediaType(job.filename) : 'video'), fileUrl: job.status === 'done' ? `/api/files/${job.id}` : null, mediaUrl: job.status === 'done' ? `/api/media/${job.id}` : null };
}

function storedPath(job) { return join(DOWNLOADS, job.id, basename(job.filename || 'missing')); }
async function probe(path) { const { done } = run(['-v', 'error', ...safeInput, '-show_format', '-show_streams', '-of', 'json', path], { binary: FFPROBE, timeout: 20000 }); return metadata(JSON.parse(await done)); }
function spaceNeeded(bytes) { const disk = statfsSync(DOWNLOADS); if (disk.bavail * disk.bsize < bytes + 1024 ** 3) throw new Error('No queda espacio suficiente para esta operación. Libera espacio en el disco.'); }
function room(count = 1) { if (jobs.filter(j => activeStates.includes(j.status)).length + count > QUEUE_LIMIT) throw Object.assign(new Error(`La cola admite ${QUEUE_LIMIT} trabajos pendientes o activos. Espera a que se libere espacio.`), { status: 429 }); }
function queueState() {
  const count = status => jobs.filter(j=>j.status===status).length;
  return { ...queueSettings, limit:QUEUE_LIMIT, waiting:count('queued'), running:running.size, downloading:[...running.values()].filter(r=>isDownload(r.job)).length, done:count('done'), failed:count('error'), cancelled:count('cancelled'), available:Math.max(0,QUEUE_LIMIT-jobs.filter(j=>activeStates.includes(j.status)).length) };
}
function resetJob(job) { for (const key of ['error','filename','bytes','media','completedAt','speed','eta','stage']) delete job[key];job.status='queued';job.progress=0;job.retriedAt=new Date().toISOString(); }
const isDownload = job => !['enhance','preview','upload'].includes(job.kind);
function setChild(job, child) { const task=running.get(job.id);if(task)task.child=child; }
function addJob(job) { jobs.push(job); /* Keep references and source files available for comparisons. */ persist(); return publicJob(job); }
function requireSource(id) { const source = jobs.find(j => j.id === id && j.status === 'done'); if (!source || !existsSync(storedPath(source))) throw new Error('Selecciona un archivo terminado que siga guardado en la app.'); return source; }
async function enqueueEnhancement(input, kind = 'enhance') {
  room(); const source = requireSource(input.sourceId);
  const meta = source.media || await probe(storedPath(source)); source.media = meta;
  const options = enhancementOptions(input, meta, aiReady);
  if (options.engine === 'ai' && options.resolution === 'source') throw new Error('Elige 1080p o 4K para el escalado con IA.');
  room();
  const job = { id: randomUUID(), kind, sourceId: source.id, title: source.title, thumbnail: source.thumbnail || '', duration: Math.min(meta.duration, options.previewSeconds || meta.duration), mediaType: options.target, mode: options.target === 'audio' ? 'audio' : 'mp4', quality: options.resolution, audioFormat: options.audioFormat, audioQuality: options.audioQuality, options, status: 'queued', progress: 0, createdAt: new Date().toISOString() };
  addJob(job); void pump(); return publicJob(job);
}
async function processFile(job, directory) {
  const source = requireSource(job.sourceId), input = storedPath(source), meta = source.media || await probe(input), o = job.options;
  const duration = job.duration, trim = o.previewSeconds ? ['-t', String(o.previewSeconds)] : [];
  const ext = o.target === 'audio' ? o.audioFormat : 'mp4';
  const output = join(directory, `${basename(source.filename, extname(source.filename)).slice(0, 90)} [${job.kind === 'preview' ? 'comparacion' : o.previewSeconds ? 'muestra' : 'mejora'}].${ext}`);
  spaceNeeded(Math.max(source.bytes || 0, duration * (o.target === 'audio' ? 600000 : 4000000)));
  const filters = audioFilters(o);
  if (o.normalize && meta.audioCodec) {
    job.stage = 'Midiendo volumen del original'; job.progress = null;
    const measure = run(['-hide_banner', '-nostdin', ...safeInput, '-i', input, ...trim, '-vn', '-af', [...filters, 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json'].join(','), '-f', 'null', '-'], { binary: FFMPEG, timeout: 3600000, returnStderr: true });
    setChild(job,measure.child); const log = await measure.done;
    if (job.status === 'cancelled') throw new Error('Cancelado');
    const match = log.match(/\{\s*"input_i"[\s\S]*?\}/);
    const measured = match ? JSON.parse(match[0]) : null;
    if (measured && ['input_i','input_tp','input_lra','input_thresh','target_offset'].every(k => Number.isFinite(Number(measured[k])))) {
      filters.push(`loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${Number(measured.input_i)}:measured_TP=${Number(measured.input_tp)}:measured_LRA=${Number(measured.input_lra)}:measured_thresh=${Number(measured.input_thresh)}:offset=${Number(measured.target_offset)}:linear=true`);
    } else job.note = 'No se ajustó el volumen: la pista está en silencio o no se pudo medir.';
  }
  if (job.status === 'cancelled') throw new Error('Cancelado');
  job.stage = o.engine === 'ai' ? 'Escalando con IA local' : 'Creando tu copia'; job.progress = 0;
  const onLine = line => { if (job.status === 'cancelled') return; const m = line.match(/^(?:out_time_us=|AI_TIME )([\d.]+)/); if (m) job.progress = Math.min(99, Math.round(Number(m[1]) / (line.startsWith('AI_TIME') ? 1 : 1000000) / duration * 100)); };
  let args, binary = FFMPEG;
  if (o.engine === 'ai') {
    const config = join(directory, 'ai-config.json');
    writeFileSync(config, JSON.stringify({ input, output, ffmpeg: FFMPEG, engine: ESRGAN, duration, fps: Math.min(60, meta.fps), width: meta.width, height: meta.height, videoFilters: videoFilters(o, meta), audioFilters: filters, hasAudio: !!meta.audioCodec, sampleRate: meta.sampleRate || 48000 }));
    binary = PYTHON; args = [join(ROOT, 'ai-upscale.py'), config];
  } else {
    args = ['-hide_banner', '-nostdin', '-y', ...safeInput, '-i', input, ...trim, '-map_metadata', '0'];
    if (o.target === 'audio') args.push('-map', '0:a:0', '-vn', ...audioEncoding(o.audioFormat, o.audioQuality));
    else args.push('-map', '0:v:0', '-map', '0:a:0?', '-vf', videoFilters(o, meta).join(','), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart');
    if (filters.length && meta.audioCodec) args.push('-af', filters.join(','), '-ar', String(meta.sampleRate || 48000));
    args.push('-progress', 'pipe:1', '-nostats', output);
  }
  const task = run(args, { binary, timeout: 24 * 3600000, onLine }); setChild(job,task.child);
  try { await task.done; } finally { rmSync(join(directory, 'ai-config.json'), { force: true }); rmSync(join(directory, '.frames'), { recursive: true, force: true }); }
  return output;
}

function pump() {
  if (stopping || queueSettings.paused) return;
  for (const job of jobs) {
    if (job.status !== 'queued' || running.has(job.id)) continue;
    const tasks = [...running.values()];
    if (isDownload(job) ? !canStartDownload(job,tasks.filter(r=>isDownload(r.job)).map(r=>r.job),queueSettings.concurrency) : tasks.some(r=>!isDownload(r.job))) continue;
    void performJob(job);
  }
}
async function performJob(job) {
  const directory = join(DOWNLOADS, job.id);
  running.set(job.id,{job,child:null});
  try {
    spaceNeeded(100 * 1024 ** 2);
    mkdirSync(directory, { recursive: true });
    job.status = job.kind === 'enhance' || job.kind === 'preview' ? 'processing' : 'downloading'; job.progress = 0; persist();
    let finalPath, convertToMp4 = false;
    if (job.kind === 'enhance' || job.kind === 'preview') finalPath = await processFile(job, directory);
    else {
    const audio = job.mode === 'audio';
    const plan = audio ? audioSelection(job.audioFormat, job.audioQuality) : videoDownloadPlan(job.mode, job.quality, job);
    const { format, container, args: audioArgs } = plan;
    convertToMp4 = !!plan.convertToMp4;
    const args = [...common, ...extractorArgs(job.url), '--ffmpeg-location', FFMPEG, '--newline', '--progress', '--no-simulate',
      '--concurrent-fragments', isYouTubeSource(job.url) ? '1' : '4', '--windows-filenames', '--trim-filenames', '180',
      '-f', safeFormat(format), ...(audio ? audioArgs : ['--merge-output-format', container, '--remux-video', container]),
      '--embed-metadata', '--no-mtime', '--paths', directory, '-o', '%(title).140B [%(id)s].%(ext)s',
      '--progress-template', 'download:PROGRESS %(progress)j',
      '--progress-template', 'postprocess:PROCESSING',
      '--print', 'after_move:FILE %(filepath)j', '--', job.url];
    const task = run(args, { timeout: 6 * 60 * 60 * 1000, onLine(line) {
      if (job.status === 'cancelled') return;
      if (line.startsWith('PROGRESS ')) {
        try {
          const p = JSON.parse(line.slice(9));
          const total = p.total_bytes || p.total_bytes_estimate;
          job.progress = total ? Math.min(100, Math.round((p.downloaded_bytes || 0) / total * 100)) : null;
          job.speed = p.speed || 0; job.eta = p.eta ?? null;
          job.status = 'downloading';
          if (p.filename) job.stage = audio ? 'Descargando audio' : /\.f\d+\./.test(p.filename) ? 'Descargando pista de video o audio' : 'Descargando video';
        } catch {}
      } else if (line.startsWith('PROCESSING') || /^\[(Merger|VideoRemuxer|Metadata)\]/.test(line)) {
        job.status = 'processing'; job.progress = null; job.stage = audio ? 'Preparando el archivo de audio' : 'Uniendo video y audio';
      } else if (line.startsWith('FILE ')) {
        try { finalPath = JSON.parse(line.slice(5)); } catch {}
      }
    }});
    setChild(job,task.child);
    await task.done;
    }
    if (job.status !== 'cancelled' && !stopping) {
      const candidate = finalPath || readdirSync(directory).find(f => mediaExtensions.has(extname(f)));
      if (!candidate) throw new Error('No output file');
      let path = resolve(directory, candidate);
      if (!path.startsWith(directory + sep) || !statSync(path).isFile()) throw new Error('Invalid output file');
      if (convertToMp4) {
        const source = path, meta = await probe(source);
        if (job.status === 'cancelled' || stopping) return;
        spaceNeeded(Math.max(statSync(source).size * 3, meta.duration * 4000000));
        const output = join(directory, `${basename(source, extname(source))} [compatible].mp4`);
        job.status = 'processing'; job.stage = 'Creando MP4 compatible'; job.progress = 0; persist();
        const conversion = run(['-hide_banner','-nostdin','-y',...safeInput,'-i',source,
          '-map_metadata','0',...compatibleMp4Encoding(meta),'-progress','pipe:1','-nostats',output], {
          binary: FFMPEG, timeout: 6 * 60 * 60 * 1000, onLine(line) {
            const match = line.match(/^out_time_us=(\d+)/);
            if (match && job.status !== 'cancelled') job.progress = Math.min(99, Math.round(Number(match[1]) / 1000000 / meta.duration * 100));
          }
        });
        setChild(job, conversion.child); await conversion.done;
        if (job.status === 'cancelled' || stopping) return;
        const result = await probe(output);
        if (result.videoCodec !== 'h264' || (meta.audioCodec && result.audioCodec !== 'aac')) throw new Error('No se pudo crear el MP4 compatible.');
        // Only remove this job's intermediate file after verifying the MP4.
        // Originals already present in the collection belong to other jobs.
        rmSync(source); path = output; job.mp4Converted = true;
      }
      job.filename = basename(path); job.bytes = statSync(path).size;
      job.media = await probe(path); job.mediaType = job.media.type;
      if (job.status === 'cancelled') return;
      job.status = 'done'; job.progress = 100; job.completedAt = new Date().toISOString();
    }
  } catch (err) {
    if (job.status !== 'cancelled' && !stopping) { job.status = 'error'; job.error = job.kind === 'enhance' || job.kind === 'preview' ? (/espacio|Selecciona|hasta/.test(err.message) ? err.message : 'No se pudo procesar esta copia. El original se conserva. Prueba sin IA o con otros ajustes.') : friendlyError(err.message); console.error('Job failed', job.id, err.message.replace(/https?:\/\/[^\s]+/g,'[enlace]').slice(-1500)); }
  } finally {
    if (stopping && job.status !== 'done' && job.status !== 'cancelled') { job.status='queued';job.progress=0; }
    if (job.status !== 'done' && !(stopping && isDownload(job) && job.status === 'queued')) rmSync(directory, { recursive: true, force: true });
    persist(); running.delete(job.id); queueMicrotask(pump);
  }
}

async function discover(request) {
  const {done}=run([...common.filter(a=>a!=='--no-playlist'),...extractorArgs(request.url),'--yes-playlist','--flat-playlist','--dump-single-json','--skip-download','--ignore-errors','--no-warnings',...request.args,'--',request.url]);
  return discoveryResults(JSON.parse(await done),request);
}
async function analyzeURL(url,item={}) {
  analysisCount++;
  try {
    let matchNote='';
    if(!url&&item.query){
      const result=await discover(discoveryInput({kind:'search',query:item.query,page:1}));
      const ranked=result.entries.map(e=>({...e,match:titleMatch(item.requestedTitle||item.query,e.title,item.requestedYear)})).sort((a,b)=>b.match.ratio-a.match.ratio||Number(a.match.conflictingYear)-Number(b.match.conflictingYear));
      if(!ranked.length||ranked[0].match.ratio<.35)throw new Error('No se encontró una coincidencia clara. Busca el título en Descubrir o añade su enlace.');
      url=ranked[0].url;matchNote='Encontrado por coincidencia de título. Revisa la fuente antes de descargar.';
    }
    url=mediaURL(url);
    const {done} = run([...common,...extractorArgs(url),'--skip-download','--dump-single-json','--',url]);
    const info=summarize(JSON.parse(await done),url);
    if(item.requestedTitle){const match=titleMatch(item.requestedTitle,info.title,item.requestedYear);info.needsReview=match.review||!!item.query;info.matchNote=match.review?'El título o año no coincide claramente con tu lista. Revisa este resultado.':matchNote||'Coincide por título; comprueba versión e idioma.';}
    else if(item.query){info.needsReview=true;info.matchNote=matchNote;}
    return info;
  } catch(err) { throw new Error(/transmisión|formatos de descarga|enlace contiene|coincidencia|DRM/.test(err.message) ? err.message : friendlyError(err.message)); }
  finally { analysisCount--; }
}
const batches=createBatchManager({data:DATA,slots:()=>2-analysisCount,analyze:analyzeURL,stopping:()=>stopping});
function enqueueBatch(batch,input) {
  if (!Array.isArray(input.itemIds) || !input.itemIds.length || input.itemIds.length>200 || input.itemIds.some(id=>typeof id!=='string')) throw new Error('Selecciona entre 1 y 200 videos listos.');
  if (typeof input.requestId!=='string' || !/^[a-f0-9-]{36}$/.test(input.requestId)) throw new Error('Recarga el lote antes de añadirlo.');
  if (input.skipDuplicates !== undefined && typeof input.skipDuplicates !== 'boolean') throw new Error('Opción de duplicados no válida.');
  batch.receipts ||= {};
  if (batch.receipts[input.requestId]) return batch.receipts[input.requestId];
  const choices=downloadChoices(input), added=[],duplicates=[],errors=[], candidates=[];
  const known=new Set(jobs.filter(j=>isDownload(j)&&(activeStates.includes(j.status)||(j.status==='done'&&existsSync(storedPath(j))))).map(downloadKey));
  for (const id of new Set(input.itemIds)) {
    const item=batch.items.find(i=>i.id===id);
    if (!item || item.status!=='ready') throw new Error('Hay videos seleccionados cuyo análisis todavía no está listo.');
    if (choices.some(c=>c.mode!=='audio')&&item.info.hasVideo===false) { errors.push({id,title:item.info.title,error:'Este enlace contiene solo audio. Elige Solo audio.'});continue; }
    if (choices.some(c=>c.mode==='audio')&&item.info.hasAudio===false) { errors.push({id,title:item.info.title,error:'Esta publicación no incluye sonido. Elige solo video.'});continue; }
    let count=0;
    for (const choice of choices) {
      const candidate={...item.info,...choice}; const key=downloadKey(candidate);
      if (input.skipDuplicates !== false && known.has(key)) continue;
      known.add(key);count++;
      candidates.push({ id:randomUUID(),kind:'download',groupId:batch.id,batchName:batch.name,...candidate,status:'queued',progress:0,createdAt:new Date().toISOString() });
    }
    if(count) added.push({id,count});else duplicates.push({id,title:item.info.title});
  }
  room(candidates.length);spaceNeeded(100*1024**2);
  const receipt={added,duplicates,errors,jobIds:candidates.map(j=>j.id),count:candidates.length};
  jobs.push(...candidates);persist();batch.receipts[input.requestId]=receipt;batches.save();pump();return receipt;
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readJSON(req, limit = 8192) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Formato de solicitud inválido.'), { status: 415 });
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > limit) throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
  }
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('Solicitud inválida.'), { status: 400 }); }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.ytimg.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (![`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(req.headers.host)) return json(res, 403, { error: 'Acceso local únicamente.' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Abre la app directamente en tu navegador.' });
  const pathname = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.origin;
      if (req.headers['x-nanook-token'] !== TOKEN || (origin && ![`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`].includes(origin))) return json(res, 403, { error: 'Recarga la app antes de continuar.' });
    }
    if (req.method === 'GET' && pathname === '/api/health') {
      const dependencies = await checkDependencies();
      return json(res, 200, { ...dependencies, token: TOKEN, app: 'nanook-video', displayName:'INGESTA', version: '3.0.4', discovery:{aiReady:false,mode:'keyword',sources:'multisite'}, queue:queueState(), downloadFolder: DOWNLOADS, enhancement: { ready: dependencies.ffmpeg, aiReady, aiEngine: aiReady ? 'Real-ESRGAN x4plus · local' : null, maxUploadBytes: 2 * 1024 ** 3, aiMaxSeconds: 300 } });
    }
    if (req.method === 'GET' && pathname === '/api/jobs') return json(res, 200, jobs.map(publicJob).reverse());
    if (req.method === 'GET' && pathname === '/api/queue') return json(res,200,queueState());
    if (req.method === 'POST' && pathname === '/api/queue/config') { queueSettings=queueConfig(await readJSON(req),queueSettings);saveQueue();pump();return json(res,200,queueState()); }
    if (req.method === 'POST' && pathname === '/api/queue/cancel-waiting') {
      await readJSON(req);let count=0;
      for(const job of jobs)if(job.status==='queued'&&!running.has(job.id)){job.status='cancelled';rmSync(join(DOWNLOADS,job.id),{recursive:true,force:true});count++;}
      persist();return json(res,200,{count,queue:queueState()});
    }
    if (req.method === 'POST' && pathname === '/api/queue/retry-errors') {
      await readJSON(req);let count=0;const available=queueState().available;
      for(const job of jobs)if(count<available&&job.status==='error'&&isDownload(job)&&!running.has(job.id)){
        try{mediaURL(job.url);if(job.mode==='audio')audioSelection(job.audioFormat,job.audioQuality);else selection(job.mode,job.quality);}catch{continue;}
        resetJob(job);count++;
      }
      persist();pump();return json(res,200,{count,queue:queueState()});
    }
    if (req.method === 'POST' && ['/api/discover','/api/related'].includes(pathname)) {
      const input=await readJSON(req,64000);
      const validatedRequest=pathname==='/api/discover'?discoveryInput(input):null;
      if(discoveryCount>=2)return json(res,429,{error:'Ya hay dos búsquedas en curso. Espera un momento.'});
      discoveryCount++;
      try{
        let request,exclusions=new Set(),explanation='';
        if(pathname==='/api/related'){
          let references=[];
          if(input.batchId){const b=batches.find(input.batchId);references=b.items.filter(i=>i.info&&(!input.itemId||input.itemId===i.id)).map(i=>i.info).slice(0,8);exclusions=new Set(b.items.map(i=>i.url));}
          else if(input.jobId){const job=jobs.find(j=>j.id===input.jobId);if(job)references=[job];}
          else if(input.url){if(analysisCount>=2)throw new Error('Espera a que termine un análisis.');references=[await analyzeURL(mediaURL(input.url))];}
          if(!references.length)throw new Error('Elige un material analizado como referencia.');
          for(const ref of references)exclusions.add(ref.url);
          const generic=new Set(['official','trailer','teaser','hd','4k','1080p','720p','el','la','de','the','and','of','in','en','a','movie','video','subtitulado','espanol','english','latino']);
          const counts=new Map();for(const ref of references)for(const w of new Set(words(ref.title).filter(w=>w.length>2&&!generic.has(w)&&!/^\d+$/.test(w))))counts.set(w,(counts.get(w)||0)+1);
          const terms=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,references.length>1?5:7).map(([w])=>w).join(' ');
          const query=(input.query||terms+(references.some(r=>/trailer|tráiler/i.test(r.title))?' trailer':'')).slice(0,300);
          request=discoveryInput({kind:'search',query,page:input.page||1});explanation='Relacionados por palabras del título. La recomendación semántica con IA sigue pendiente.';
        }else request=validatedRequest;
        if(input.excludeDownloaded)for(const j of jobs)if(j.url&&(activeStates.includes(j.status)||j.status==='done'&&existsSync(storedPath(j))))exclusions.add(j.url);
        const result=await discover(request);result.entries=result.entries.filter(e=>!exclusions.has(e.url));
        if(explanation){result.explanation=explanation;result.query=request.url.replace(/^ytsearch\d+:/,'');for(const e of result.entries)e.reason='Coincidencia con las palabras de la referencia';}
        return json(res,200,result);
      }catch(e){return json(res,422,{error:/Elige|Espera|coincidencia/.test(e.message)?e.message:friendlyError(e.message)});}finally{discoveryCount--;batches.pump();}
    }
    if (req.method === 'GET' && pathname === '/api/batches') return json(res,200,batches.list());
    if (req.method === 'POST' && pathname === '/api/batches') {
      const dependencies = await checkDependencies();
      if (!dependencies.ready) return json(res,503,{error:dependencies.dependencyMessage});
      const input=await readJSON(req,256000);return json(res,201,batches.public(batches.create(input.text,input.name)));
    }
    const batchMatch=pathname.match(/^\/api\/batches\/([a-f0-9-]{36})(?:\/(enqueue|stop|resume|append|edit|replace))?$/);
    if(batchMatch){
      const batch=batches.find(batchMatch[1]);
      if(req.method==='GET'&&!batchMatch[2])return json(res,200,batches.public(batch));
      if(req.method==='POST'){
        const input=await readJSON(req,256000);
        if(batchMatch[2]==='replace')return json(res,200,batches.public(batches.replace(batch.id,input.itemId,input.text)));
        if(batchMatch[2]==='append')return json(res,200,batches.public(batches.append(batch.id,input.text)));
        if(batchMatch[2]==='edit')return json(res,200,batches.public(batches.edit(batch.id,input)));
        if(batchMatch[2]==='enqueue')return json(res,201,enqueueBatch(batch,input));
        if(['stop','resume'].includes(batchMatch[2]))return json(res,200,batches.public(batches.control(batch.id,batchMatch[2])));
      }
    }
    if (req.method === 'POST' && pathname === '/api/enhance') return json(res, 201, await enqueueEnhancement(await readJSON(req)));
    if (req.method === 'POST' && pathname === '/api/comparison') {
      const input = await readJSON(req), result = requireSource(input.jobId);
      if (result.kind !== 'enhance') throw new Error('Selecciona una mejora terminada para compararla.');
      const original = requireSource(result.sourceId);
      const pair = [];
      room(2);
      for (const source of [original, result]) {
        const cached = jobs.find(j => j.kind === 'preview' && j.sourceId === source.id && j.mediaType === result.mediaType && ['done','queued','processing'].includes(j.status));
        pair.push(cached ? publicJob(cached) : await enqueueEnhancement({ sourceId: source.id, target: result.mediaType, previewSeconds: 5, audioFormat: 'mp3', audioQuality: '320', profile: 'preserve' }, 'preview'));
      }
      return json(res, 200, { original: pair[0].id, improved: pair[1].id });
    }
    if (req.method === 'POST' && pathname === '/api/upload') {
      if (uploading) return json(res, 429, { error: 'Espera a que termine la importación actual.' });
      const name = basename(new URL(req.url, 'http://localhost').searchParams.get('name') || '');
      const ext = extname(name).toLowerCase();
      if (!mediaExtensions.has(ext)) throw new Error('Usa MP4, MKV, MOV, WebM, MP3, M4A, WAV, FLAC, Ogg u Opus.');
      const limit = 2 * 1024 ** 3, length = Number(req.headers['content-length']);
      if (!Number.isSafeInteger(length) || length <= 0 || length > limit) return json(res, 413, { error: 'El archivo debe pesar entre 1 byte y 2 GB.' });
      spaceNeeded(length); uploading = true;
      const id = randomUUID(), directory = join(DOWNLOADS, id), filename = `original${ext}`;
      try {
        mkdirSync(directory); let received = 0;
        const guard = new Transform({ transform(chunk, encoding, callback) { received += chunk.length; callback(received > limit || received > length ? new Error('Archivo demasiado grande.') : null, chunk); } });
        await pipeline(req, guard, createWriteStream(join(directory, filename), { flags: 'wx', mode: 0o600 }));
        if (received !== length) throw new Error('La importación quedó incompleta.');
        const media = await probe(join(directory, filename));
        const job = { id, kind: 'upload', title: name.slice(0, 180), filename, media, mediaType: media.type, mode: media.type === 'audio' ? 'audio' : 'original', quality: 'best', bytes: received, duration: media.duration, status: 'done', progress: 100, createdAt: new Date().toISOString(), completedAt: new Date().toISOString() };
        return json(res, 201, addJob(job));
      } catch (err) { rmSync(directory, { recursive: true, force: true }); throw err; }
      finally { uploading = false; }
    }
    if (req.method === 'POST' && pathname === '/api/analyze') {
      const dependencies = await checkDependencies();
      if (!dependencies.ready) return json(res, 503, { error: dependencies.dependencyMessage });
      const url = mediaURL((await readJSON(req)).url);
      if (analysisCount >= 2) return json(res, 429, { error: 'Ya hay videos en análisis. Espera un momento.' });
      try {
        const info = await analyzeURL(url);
        const id = randomUUID();
        for (const [key, entry] of analyses) if (entry.expires < Date.now()) analyses.delete(key);
        if (analyses.size >= 500) analyses.delete(analyses.keys().next().value);
        analyses.set(id, { info, expires: Date.now() + 30 * 60 * 1000 });
        return json(res, 200, { ...info, analysisId: id });
      } catch (err) { return json(res, 422, { error: err.message }); }
      finally { batches.pump(); }
    }
    if (req.method === 'POST' && pathname === '/api/jobs') {
      const input = await readJSON(req);
      const cached = analyses.get(input.analysisId);
      if (!cached || cached.expires < Date.now()) return json(res, 400, { error: 'Analiza nuevamente el enlace antes de descargar.' });
      const choices = downloadChoices(input);
      if(choices.some(c=>c.mode!=='audio')&&cached.info.hasVideo===false)throw new Error('Este enlace contiene solo audio. Elige Solo audio.');
      if(choices.some(c=>c.mode==='audio')&&cached.info.hasAudio===false)throw new Error('Esta publicación no incluye sonido. Elige solo video.');
      room(choices.length); spaceNeeded(100 * 1024 ** 2);
      const groupId = randomUUID();
      const result = choices.map(choice => addJob({ id: randomUUID(), kind: 'download', groupId, ...cached.info, ...choice, status: 'queued', progress: 0, createdAt: new Date().toISOString() }));
      json(res, 201, result.length === 1 ? result[0] : { jobs: result }); void pump(); return;
    }
    const cancelId = pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})\/cancel$/)?.[1];
    if (req.method === 'POST' && cancelId) {
      const job = jobs.find(j => j.id === cancelId);
      if (!job) return json(res, 404, { error: 'Descarga no encontrada.' });
      if (['queued', 'downloading', 'processing'].includes(job.status)) {
        job.status = 'cancelled';
        if (running.has(job.id)) kill(running.get(job.id).child);
        else rmSync(join(DOWNLOADS,job.id),{recursive:true,force:true});
        persist();
      }
      return json(res, 200, publicJob(job));
    }
    const retryId = pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})\/retry$/)?.[1];
    if (req.method === 'POST' && retryId) {
      const job = jobs.find(j => j.id === retryId);
      if (!job) return json(res, 404, { error: 'Descarga no encontrada.' });
      if (!['error', 'cancelled'].includes(job.status)) return json(res, 409, { error: 'Esta descarga ya está en curso o terminó.' });
      if (running.has(job.id)) return json(res, 409, { error: 'Espera un momento mientras termina la cancelación.' });
      const dependencies = await checkDependencies();
      if (!dependencies.ready) return json(res, 503, { error: dependencies.dependencyMessage });
      room();
      if (job.kind === 'enhance' || job.kind === 'preview') { const source = requireSource(job.sourceId); enhancementOptions(job.options, source.media || await probe(storedPath(source)), aiReady); }
      else { job.url = mediaURL(job.url); if (job.mode === 'audio') audioSelection(job.audioFormat, job.audioQuality); else selection(job.mode, job.quality); }
      room();resetJob(job);
      persist(); json(res, 200, publicJob(job)); void pump(); return;
    }
    const fileId = pathname.match(/^\/api\/(?:files|media)\/([a-f0-9-]{36})$/)?.[1];
    if (['GET', 'HEAD'].includes(req.method) && fileId) {
      const job = jobs.find(j => j.id === fileId && j.status === 'done');
      if (!job) return json(res, 404, { error: 'El archivo todavía no está listo.' });
      const path = join(DOWNLOADS, job.id, basename(job.filename));
      if (!existsSync(path)) return json(res, 404, { error: 'El archivo se movió o se eliminó.' });
      const size = statSync(path).size, range = byteRange(req.headers.range, size);
      if (range === false) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
      const inline = pathname.startsWith('/api/media/');
      res.writeHead(range ? 206 : 200, {
        'Content-Type': inline ? contentType(path) : 'application/octet-stream', 'Content-Length': range ? range.end - range.start + 1 : size,
        'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="archivo${extname(path)}"; filename*=UTF-8''${encodeURIComponent(job.filename).replace(/'/g, '%27')}`,
      });
      if (req.method === 'HEAD') res.end(); else await pipeline(createReadStream(path, range || {}), res); return;
    }
    const staticFiles = { '/': 'index.html', '/app.js': 'app.js', '/studio.js': 'studio.js', '/bulk.js':'bulk.js', '/style.css': 'style.css', '/favicon.svg': 'favicon.svg', '/identidad':'identity.html', '/identity.css':'identity.css', '/brand-a.svg':'brand-a.svg', '/brand-b.svg':'brand-b.svg', '/brand-c.svg':'brand-c.svg', '/trailer-example.json':'trailer-example.json' };
    if (['GET', 'HEAD'].includes(req.method) && staticFiles[pathname]) {
      const file = staticFiles[pathname];
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json':'application/json' };
      res.writeHead(200, { 'Content-Type': `${types[extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(join(ROOT, 'public', file))); return;
    }
    json(res, 404, { error: 'No encontrado.' });
  } catch (err) {
    if (!res.headersSent) json(res, err.status || 400, { error: err.code ? 'No se pudo completar la operación.' : err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => { console.log(`INGESTA · http://localhost:${PORT}\nDescargas: ${DOWNLOADS}`);void checkDependencies(); });
server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `El puerto ${PORT} ya está en uso.` : err.message); process.exit(1); });
function shutdown() { stopping = true;mediaProxy.close(); for (const child of children) kill(child); server.close(); setTimeout(() => process.exit(0), 2200).unref(); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
