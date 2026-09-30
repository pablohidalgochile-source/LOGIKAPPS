export function youtubeURL(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Pega un enlace válido de YouTube.');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Pega el enlace completo de YouTube.'); }
  const host = url.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Pega un enlace válido de YouTube.');
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1];
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('Usa el enlace de un video de YouTube, también puede ser un Short.');
  return `https://www.youtube.com/watch?v=${id}`;
}

export function selection(mode, quality) {
  if (!['original', 'mp4'].includes(mode)) throw new Error('Elige un formato válido.');
  if (quality !== 'best' && !/^(144|240|360|480|720|1080|1440|2160|4320)$/.test(String(quality))) throw new Error('Elige una calidad válida.');
  const limit = quality === 'best' ? '' : `[height<=${quality}]`;
  return mode === 'original'
    ? { format: `bv*${limit}+ba/b${limit}`, container: 'mkv' }
    : { format: `bv${limit}[vcodec^=avc1]+ba[ext=m4a]/b${limit}[ext=mp4][vcodec^=avc1]`, container: 'mp4' };
}

export function audioSelection(format = 'original', quality = '320') {
  if (!['original', 'mp3', 'm4a', 'wav', 'flac'].includes(format)) throw new Error('Elige un formato de audio válido.');
  if (!['128', '192', '256', '320'].includes(String(quality))) throw new Error('Elige una calidad de audio válida.');
  return { format: 'ba/b', args: ['-x', '--audio-format', format === 'original' ? 'best' : format, ...(format === 'mp3' || format === 'm4a' ? ['--audio-quality', `${quality}K`] : [])] };
}

export function downloadChoices(input) {
  const target = input.target || (input.mode === 'audio' ? 'audio' : 'video');
  if (!['video', 'audio', 'both'].includes(target)) throw new Error('Elige video, audio o ambos.');
  const items = [];
  if (target !== 'audio') { selection(input.mode, input.quality); items.push({ mode: input.mode, quality: String(input.quality), mediaType: 'video' }); }
  if (target !== 'video') { audioSelection(input.audioFormat, input.audioQuality); items.push({ mode: 'audio', quality: 'best', audioFormat: input.audioFormat || 'original', audioQuality: String(input.audioQuality || '320'), mediaType: 'audio' }); }
  return items;
}

export function summarize(info, url) {
  if (info.is_live || info.live_status === 'is_upcoming' || info.live_status === 'post_live') throw new Error('Espera a que termine la transmisión y YouTube publique el video.');
  const videos = (info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height && !f.has_drm);
  const heights = mode => [...new Set(videos.filter(f => mode !== 'mp4' || f.vcodec.startsWith('avc1')).map(f => f.height))].sort((a, b) => b - a);
  if (!videos.length) throw new Error('Este video no tiene formatos de descarga disponibles.');
  return {
    url, videoId: info.id, title: info.title || 'Video de YouTube', channel: info.channel || info.uploader || 'YouTube',
    duration: info.duration || 0, thumbnail: `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
    heights: heights('original'), mp4Heights: heights('mp4'),
    maxHeight: Math.max(...videos.map(f => f.height)),
    audioFormats: [...new Set((info.formats || []).filter(f => f.acodec && f.acodec !== 'none' && f.vcodec === 'none' && !f.has_drm).map(f => `${f.acodec}${f.abr ? ` · ${Math.round(f.abr)} kbps` : ''}`))],
  };
}

export function friendlyError(raw = '') {
  if (/sign in|confirm you.re not a bot|cookies|login required/i.test(raw)) return 'YouTube solicita iniciar sesión para este video. Prueba con otro video público.';
  if (/requested format.*not available/i.test(raw)) return 'Esta combinación no está disponible. Prueba «Calidad original» o analiza nuevamente el enlace.';
  if (/private video|members.only|premium|not available|unavailable|removed|copyright/i.test(raw)) return 'El video no está disponible públicamente o tiene restricciones de acceso.';
  if (/403|forbidden/i.test(raw)) return 'YouTube rechazó la conexión. Pulsa «Reintentar»; si continúa, abre «Actualizar motor.command» y vuelve a iniciar la app.';
  if (/ENOSPC|No space left/i.test(raw)) return 'No queda espacio suficiente en el disco. Libera espacio antes de reintentar.';
  if (/timed out|timeout/i.test(raw)) return 'YouTube tardó demasiado en responder. Inténtalo nuevamente.';
  if (/resolve|network|connection|ENOTFOUND/i.test(raw)) return 'No se pudo conectar con YouTube. Revisa tu conexión e inténtalo nuevamente.';
  if (/ENOENT|not found|ffmpeg/i.test(raw)) return 'Falta una herramienta de descarga. Revisa las instrucciones del archivo LEEME.';
  return 'No se pudo completar la descarga. Analiza nuevamente el enlace e inténtalo otra vez.';
}
