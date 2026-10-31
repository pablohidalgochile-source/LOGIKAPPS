import { publicURL } from './network.mjs';
export function isYouTubeSource(input) {
  if (typeof input !== 'string') return false;
  if (/^ytsearch\d*:/.test(input)) return true;
  try { return ['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(new URL(input).hostname); }
  catch { return false; }
}
export function extractorArgs(url) {
  // These public web clients still expose downloadable formats when the current
  // TV/VisionOS defaults return LOGIN_REQUIRED. No account cookies are used.
  return isYouTubeSource(url) ? ['--extractor-args','youtube:player_client=web_embedded,web_safari',
    '--sleep-requests','1','--sleep-interval','5','--max-sleep-interval','10'] : [];
}
export function canStartDownload(job, active, concurrency) {
  return active.length < concurrency && (!isYouTubeSource(job.url) || !active.some(other => isYouTubeSource(other.url)));
}
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

export function mediaURL(input) {
  if(typeof input!=='string'||input.length>8192)throw new Error('Pega un enlace o el texto compartido de una publicación.');
  let raw=input.trim();
  if(!/^https?:\/\/\S+$/i.test(raw)||/[\[\]]\(/.test(raw)){
    const links=[...new Set((raw.match(/https?:\/\/[^\s<>"'\[\]()]+/gi)||[]).map(s=>s.replace(/[.,;!]+$/,'')))];
    if(links.length!==1)throw new Error(links.length?'Hay varios enlaces. Usa Lotes para descargarlos juntos.':'Pega el enlace completo de la publicación o video.');
    raw=links[0];
  }
  const url=publicURL(raw),host=new URL(url).hostname;
  if(['youtu.be','youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host))return youtubeURL(url);
  if(['instagram.com','www.instagram.com','m.instagram.com'].includes(host)){
    const u=new URL(url),match=u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/);
    if(match)return `https://www.instagram.com/${match[1]==='reels'?'reel':match[1]}/${match[2]}/`;
  }
  if(['tiktok.com','www.tiktok.com','m.tiktok.com'].includes(host)){
    const u=new URL(url);if(/^\/@[^/]+\/video\/\d+\/?$/.test(u.pathname))return `https://www.tiktok.com${u.pathname.replace(/\/$/,'')}`;
  }
  return url;
}
export function sourceName(url){
  const host=new URL(url).hostname.replace(/^www\./,'');
  for(const [domain,name]of [['youtube.com','YouTube'],['youtu.be','YouTube'],['instagram.com','Instagram'],['tiktok.com','TikTok'],['facebook.com','Facebook'],['fb.watch','Facebook'],['twitter.com','X / Twitter'],['x.com','X / Twitter'],['vimeo.com','Vimeo']])if(host===domain||host.endsWith('.'+domain))return name;
  return host;
}
export function safeFormat(format) {
  return format.replace(/\b(bv\*?|ba|b)(?=\[|[+/]|$)/g,'$1[protocol~="^(https?|m3u8_native|http_dash_segments)$"]');
}

export function selection(mode, quality) {
  if (!['original', 'mp4'].includes(mode)) throw new Error('Elige un formato válido.');
  if (quality !== 'best' && !/^(144|240|360|480|720|1080|1440|2160|4320)$/.test(String(quality))) throw new Error('Elige una calidad válida.');
  const limit = quality === 'best' ? '' : `[height<=${quality}]`;
  return mode === 'original'
    ? { format: `bv*${limit}+ba/b${limit}/bv*${limit}`, container: 'mkv' }
    : { format: `bv${limit}[vcodec~="^(avc1|h264)"]+ba[ext=m4a]/b${limit}[ext=mp4][vcodec~="^(avc1|h264)"]/bv${limit}[ext=mp4][vcodec~="^(avc1|h264)"]`, container: 'mp4' };
}

export function videoDownloadPlan(mode, quality, info = {}) {
  const direct = selection(mode, quality);
  const nativeMp4 = info.mp4Heights?.some(height => quality === 'best' || height <= Number(quality));
  const convertToMp4 = mode === 'mp4' && !nativeMp4;
  return { ...(convertToMp4 ? selection('original', quality) : direct), convertToMp4 };
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
  if (info.is_live || info.live_status === 'is_upcoming' || info.live_status === 'post_live') throw new Error('Espera a que termine la transmisión y se publique la grabación.');
  if(info._type==='playlist'||info.entries)throw new Error('Este enlace contiene varios archivos. Ábrelo en «Canal o colección».');
  const all=info.formats?.length?info.formats:info.url?[info]:[];
  if(info.has_drm||all.length&&all.every(f=>f.has_drm))throw new Error('El material tiene protección DRM y no se puede descargar con INGESTA.');
  const formats=all.filter(f=>!f.has_drm),videoExtensions=['mp4','mkv','webm','mov','m4v'];
  const videos=formats.filter(f=>(f.vcodec&&f.vcodec!=='none')||(!f.vcodec&&(f.height||videoExtensions.includes(f.ext))));
  const hasVideo=videos.length>0;
  if(!formats.length)throw new Error('Este enlace no tiene formatos de descarga disponibles.');
  const heights=mp4=>[...new Set(videos.filter(f=>f.height&&(!mp4||/^avc1|^h264/.test(f.vcodec||''))).map(f=>f.height))].sort((a,b)=>b-a);
  const isYouTube=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'].includes(new URL(url).hostname);
  const largest=[...videos].sort((a,b)=>(b.height||0)-(a.height||0))[0];
  return {
    url,videoId:String(info.id||'').slice(0,200),title:String(info.title||'Archivo audiovisual').slice(0,500),channel:String(info.channel||info.uploader||new URL(url).hostname).slice(0,200),
    source:new URL(url).hostname,platform:sourceName(url),extractor:String(info.extractor_key||info.extractor||'Web').slice(0,100),width:Number(largest?.width)||0,height:Number(largest?.height)||0,
    duration:Math.max(0,Number(info.duration)||0),thumbnail:isYouTube&&/^[A-Za-z0-9_-]{11}$/.test(info.id||'')?`https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`:'',
    hasVideo,hasAudio:formats.some(f=>f.acodec!=='none'),heights:heights(false),mp4Heights:heights(true),maxHeight:Math.max(0,...videos.map(f=>Number(f.height)||0)),
    audioFormats:[...new Set(formats.filter(f=>f.acodec&&f.acodec!=='none'&&f.vcodec==='none').map(f=>`${f.acodec}${f.abr?` · ${Math.round(f.abr)} kbps`:''}`))],
  };
}

export function friendlyError(raw = '') {
  if (/429|too many requests|rate.limit/i.test(raw)) return 'La plataforma limitó temporalmente las solicitudes. Espera unos minutos y vuelve a intentarlo.';
  if (/DRM|protected|protection/i.test(raw)) return 'El material tiene protección DRM y no se puede descargar con INGESTA.';
  if (/Unsupported URL|No video formats|no videos? found|not a valid URL/i.test(raw)) return 'No se encontró material descargable en este enlace. Puede que la web no sea compatible.';
  if (/dirección|enlace contiene|formatos de descarga|transmisión/.test(raw)) return raw;
  if (/sign in|confirm you.re not a bot|cookies|login required/i.test(raw)) return 'El sitio solicita iniciar sesión para este archivo. Prueba con otro video público.';
  if (/requested format.*not available/i.test(raw)) return 'Esta combinación no está disponible. Prueba «Calidad original» o analiza nuevamente el enlace.';
  if (/private video|members.only|premium|not available|unavailable|removed|copyright/i.test(raw)) return 'El video no está disponible públicamente o tiene restricciones de acceso.';
  if (/403|forbidden/i.test(raw)) return 'El sitio rechazó la conexión. Pulsa «Reintentar»; si continúa, abre «Actualizar motor.command» y vuelve a iniciar la app.';
  if (/ENOSPC|No space left/i.test(raw)) return 'No queda espacio suficiente en el disco. Libera espacio antes de reintentar.';
  if (/timed out|timeout/i.test(raw)) return 'El sitio tardó demasiado en responder. Inténtalo nuevamente.';
  if (/resolve|network|connection|ENOTFOUND/i.test(raw)) return 'No se pudo conectar con el sitio. Revisa tu conexión e inténtalo nuevamente.';
  if (/ENOENT|not found|ffmpeg/i.test(raw)) return 'Falta una herramienta de descarga. Revisa las instrucciones del archivo LEEME.';
  return 'No se pudo completar la descarga. Analiza nuevamente el enlace e inténtalo otra vez.';
}
