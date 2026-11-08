import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const port = Number(process.env.VITRINA_PORT || 4394);
const root = fileURLToPath(new URL('.', import.meta.url));
const storage = resolve(process.env.VITRINA_DATA_DIR || join(root, '.data'));
const tracksDir = join(storage, 'tracks');
const profileFile = join(storage, 'profile.json');
const maxAudioSize = 80 * 1024 * 1024;
const defaultProfile = { name: 'Mi proyecto musical', genre: '', bio: '' };
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/artista', ['index.html', 'text/html; charset=utf-8']],
  ['/panel', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function loadJson(path, missing = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return missing;
    throw error;
  }
}

async function saveJson(path, data) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function trackPath(id, extension) {
  return join(tracksDir, id + extension);
}

async function getTracks() {
  const entries = await readdir(tracksDir);
  const files = entries.filter(name => name.endsWith('.json'));
  const tracks = await Promise.all(files.map(name => loadJson(join(tracksDir, name))));
  return tracks.filter(Boolean).sort((a, b) => a.added.localeCompare(b.added) || a.id.localeCompare(b.id));
}

function cleanText(value, label, max, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if ((required && !text) || text.length > max) {
    throw new HttpError(400, label + (required ? ' debe tener entre 1 y ' : ' admite hasta ') + max + ' caracteres.');
  }
  return text;
}

async function readJsonBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new HttpError(415, 'Se esperaba un formulario válido.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 8192) throw new HttpError(413, 'El formulario es demasiado grande.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // Report invalid JSON with the same message as invalid field structure.
  }
  throw new HttpError(400, 'El formulario no es válido.');
}

function hasMp3Header(bytes, size) {
  if (size < 4) return false;
  if (size >= 10 && bytes.toString('ascii', 0, 3) === 'ID3') {
    return bytes[3] >= 2 && bytes[3] <= 4 && bytes.subarray(6, 10).every(byte => byte < 128);
  }
  const validSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  const layer3 = (bytes[1] & 0x06) === 0x02 && (bytes[1] & 0x18) !== 0x08;
  return validSync && layer3 && (bytes[2] & 0xf0) !== 0xf0 && (bytes[2] & 0x0c) !== 0x0c;
}

async function addTrack(req, url) {
  if (req.headers['content-type'] !== 'audio/mpeg') throw new HttpError(415, 'Selecciona un archivo MP3.');
  const length = Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length) || length < 4) throw new HttpError(400, 'El archivo MP3 está vacío o incompleto.');
  if (length > maxAudioSize) throw new HttpError(413, 'El límite es de 80 MB por canción.');
  const track = {
    id: randomUUID(),
    title: cleanText(url.searchParams.get('title'), 'El título', 100, true),
    credits: cleanText(url.searchParams.get('credits'), 'Los créditos', 150),
    visible: true,
    added: new Date().toISOString(),
  };
  const temporary = trackPath(track.id, '.upload');
  const audio = trackPath(track.id, '.mp3');
  let audioMoved = false;
  let written = 0;
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      written += chunk.length;
      if (written > length) callback(new HttpError(413, 'El archivo excede el tamaño declarado.'));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(req, limit, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    const file = await open(temporary, 'r');
    try {
      const header = Buffer.alloc(10);
      await file.read(header, 0, header.length, 0);
      if (!hasMp3Header(header, written)) throw new HttpError(415, 'El archivo no parece un MP3 válido.');
    } finally {
      await file.close();
    }
    await rename(temporary, audio);
    audioMoved = true;
    await saveJson(trackPath(track.id, '.json'), track);
    return track;
  } catch (error) {
    if (audioMoved) await rm(audio, { force: true });
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

async function streamTrack(req, res, track) {
  if (!track?.visible) throw new HttpError(404, 'Canción no disponible.');
  const audio = trackPath(track.id, '.mp3');
  const { size } = await stat(audio);
  const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const requested = req.headers.range;
  const range = requested ? byteRange(requested, size) : null;
  if (requested && !range) {
    res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + size });
    res.end();
    return;
  }
  if (range) {
    headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + size;
    headers['Content-Length'] = range.end - range.start + 1;
  } else {
    headers['Content-Length'] = size;
  }
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') res.end();
  else await pipeline(createReadStream(audio, range || undefined), res);
}

await mkdir(tracksDir, { recursive: true, mode: 0o700 });
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try {
    const authority = req.headers.host;
    if (![host + ':' + port, 'localhost:' + port].includes(authority)) {
      throw new HttpError(403, 'Abre VITRINA en localhost.');
    }
    const origin = 'http://' + authority;
    const readOnly = req.method === 'GET' || req.method === 'HEAD';
    if (!readOnly && req.headers.origin && req.headers.origin !== origin) {
      throw new HttpError(403, 'La solicitud debe venir de VITRINA.');
    }
    const url = new URL(req.url, origin);
    const path = url.pathname;
    if (readOnly && assets.has(path)) {
      const [name, type] = assets.get(path);
      const contents = await readFile(join(root, 'public', name));
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': contents.length, 'Cache-Control': 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : contents);
    }
    if (req.method === 'GET' && (path === '/api/artist' || path === '/api/panel')) {
      const [profile, tracks] = await Promise.all([loadJson(profileFile, defaultProfile), getTracks()]);
      return json(res, { profile, tracks: path === '/api/panel' ? tracks : tracks.filter(track => track.visible) });
    }
    if (req.method === 'PUT' && path === '/api/profile') {
      const body = await readJsonBody(req);
      const profile = {
        name: cleanText(body.name, 'El nombre', 70, true),
        genre: cleanText(body.genre, 'El género', 65),
        bio: cleanText(body.bio, 'La biografía', 300),
      };
      await saveJson(profileFile, profile);
      return json(res, profile);
    }
    if (req.method === 'POST' && path === '/api/tracks') {
      return json(res, await addTrack(req, url), 201);
    }
    const match = /^\/(audio|api\/tracks)\/([0-9a-f-]{36})$/.exec(path);
    if (match && ((readOnly && match[1] === 'audio') || (req.method === 'PATCH' && match[1] === 'api/tracks'))) {
      const track = await loadJson(trackPath(match[2], '.json'));
      if (readOnly) return await streamTrack(req, res, track);
      if (!track) throw new HttpError(404, 'Canción no encontrada.');
      const body = await readJsonBody(req);
      if (typeof body.visible !== 'boolean') throw new HttpError(400, 'Elige un estado de visibilidad válido.');
      track.visible = body.visible;
      await saveJson(trackPath(track.id, '.json'), track);
      return json(res, track);
    }
    throw new HttpError(404, 'Página no encontrada.');
  } catch (error) {
    if (res.destroyed) return;
    if (res.headersSent) return res.destroy();
    if (!error.status) console.error(error);
    json(res, { error: error.status ? error.message : 'VITRINA no pudo completar la operación.' }, error.status || 500);
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'El puerto ' + port + ' ya está en uso.' : error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log('VITRINA · http://' + host + ':' + port + '/panel'));
