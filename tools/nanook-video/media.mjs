import { extname } from 'node:path';

export const mediaExtensions = new Set(['.mkv', '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.m4a', '.opus', '.ogg', '.wav', '.flac', '.aac']);
export const safeInput = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm,mp3,wav,flac,ogg,aac'];
export const activeStates = ['queued', 'downloading', 'processing'];
export function mediaType(filename) { return ['.mkv', '.mp4', '.webm', '.mov', '.m4v'].includes(extname(filename).toLowerCase()) ? 'video' : 'audio'; }
export function metadata(info) {
  const video = info.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = info.streams?.find(s => s.codec_type === 'audio');
  if (!video && !audio) throw new Error('El archivo no contiene audio ni video compatibles.');
  const [a, b] = String(video?.avg_frame_rate || '0/1').split('/').map(Number);
  const duration = Number(info.format?.duration || video?.duration || audio?.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 21600) throw new Error('Usa un archivo de hasta 6 horas con una duración válida.');
  const rotation = Math.abs(Number(video?.side_data_list?.find(s => s.rotation != null)?.rotation || video?.tags?.rotate || 0)) % 180;
  return { duration, type: video ? 'video' : 'audio', width: rotation === 90 ? video.height : video?.width || 0, height: rotation === 90 ? video.width : video?.height || 0, fps: a / b || 30, videoCodec: video?.codec_name || null, audioCodec: audio?.codec_name || null, sampleRate: Number(audio?.sample_rate) || null, audioBitrate: Math.round(Number(audio?.bit_rate || 0) / 1000) || null, channels: audio?.channels || 0 };
}
export function enhancementOptions(input, source, aiReady) {
  const target = input.target || source.type;
  if (!['audio', 'video'].includes(target)) throw new Error('Elige audio o video.');
  if (target === 'video' && source.type !== 'video') throw new Error('Selecciona un archivo con video.');
  if (target === 'audio' && !source.audioCodec) throw new Error('Este archivo no contiene audio.');
  const audioFormat = input.audioFormat || 'mp3', audioQuality = String(input.audioQuality || '320');
  if (!['mp3', 'm4a', 'wav', 'flac'].includes(audioFormat) || !['128', '192', '256', '320'].includes(audioQuality)) throw new Error('Formato o calidad de audio no válidos.');
  const profile = input.profile || 'preserve', resolution = String(input.resolution || 'source'), engine = input.engine || 'standard';
  if (!['preserve', 'music', 'voice'].includes(profile) || !['source', '1080', '2160'].includes(resolution) || !['standard', 'ai'].includes(engine)) throw new Error('Opciones de mejora no válidas.');
  for (const key of ['normalize', 'denoiseAudio', 'denoiseVideo', 'sharpen']) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error('Ajustes no válidos.');
  if (engine === 'ai' && (!aiReady || target !== 'video')) throw new Error('El motor de escalado con IA no está disponible para este archivo.');
  if (engine === 'ai' && (source.duration > 300 || source.width > 1920 || source.height > 1920 || source.width * source.height > 2073600)) throw new Error('Para IA, usa un clip de hasta 5 minutos y tamaño máximo equivalente a 1080p.');
  const previewSeconds = input.previewSeconds == null ? null : Number(input.previewSeconds);
  if (previewSeconds !== null && previewSeconds !== 5) throw new Error('La muestra debe durar 5 segundos.');
  return { target, audioFormat, audioQuality, profile, resolution, engine, normalize: !!input.normalize, denoiseAudio: !!input.denoiseAudio, denoiseVideo: !!input.denoiseVideo, sharpen: !!input.sharpen, previewSeconds };
}
export function audioFilters(o) {
  const filters = [];
  if (o.denoiseAudio) filters.push('afftdn=nf=-30:tn=1');
  if (o.profile === 'music') filters.push('highpass=f=25', 'equalizer=f=3000:t=q:w=0.7:g=1');
  if (o.profile === 'voice') filters.push('highpass=f=80', 'equalizer=f=2500:t=q:w=0.8:g=2');
  return filters;
}
export function videoFilters(o, meta) {
  const filters = [];
  if (o.denoiseVideo) filters.push('hqdn3d=1.5:1.5:3:3');
  if (o.resolution !== 'source') {
    const short = Number(o.resolution), long = Math.round(short * 16 / 9);
    const w = meta.width >= meta.height ? long : short, h = meta.width >= meta.height ? short : long;
    filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`);
  } else filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  if (o.sharpen) filters.push('unsharp=5:5:0.35:5:5:0');
  filters.push('setsar=1');
  return filters;
}
export function audioEncoding(format, quality) {
  if (format === 'wav') return ['-c:a', 'pcm_s24le'];
  if (format === 'flac') return ['-c:a', 'flac', '-compression_level', '8'];
  return ['-c:a', format === 'mp3' ? 'libmp3lame' : 'aac', '-b:a', `${quality}k`];
}
export function contentType(filename) {
  return ({'.mp4':'video/mp4','.mov':'video/quicktime','.m4v':'video/mp4','.mkv':'video/x-matroska','.webm':'video/webm','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.flac':'audio/flac','.opus':'audio/ogg','.ogg':'audio/ogg','.aac':'audio/aac'})[extname(filename).toLowerCase()] || 'application/octet-stream';
}
export function byteRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) return false;
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return false;
  return { start, end };
}
