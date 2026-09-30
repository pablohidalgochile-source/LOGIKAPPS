#!/usr/bin/env python3
"""Surco: biblioteca y grabador de audio local. Python 3.10+, ffmpeg opcional."""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'static'
LIBRARY = Path(os.environ.get('SURCO_LIBRARY', str(ROOT / 'biblioteca'))).resolve()
MAX_BYTES = 512 * 1024 * 1024
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.RLock()
ITEMS: dict = {}
JOBS: dict = {}
FFMPEG = shutil.which('ffmpeg') or next((p for p in ('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg') if Path(p).is_file()), None)
PLATFORMS = ['Bandcamp', 'SoundCloud', 'hearthis.at', 'Jamendo']
try:
    import yt_dlp
    from yt_dlp.extractor.bandcamp import BandcampIE, BandcampAlbumIE
    from yt_dlp.extractor.soundcloud import SoundcloudIE, SoundcloudSetIE, SoundcloudPlaylistIE
    from yt_dlp.extractor.hearthisat import HearThisAtIE
    from yt_dlp.extractor.jamendo import JamendoIE, JamendoAlbumIE
    from yt_dlp.downloader.hls import HlsFD
    from yt_dlp.networking import Response as YDLResponse
    from yt_dlp.networking.exceptions import HTTPError as YDLHTTPError, TransportError
except ImportError:
    yt_dlp = None


if yt_dlp:
    class ProvenanceBandcampIE(BandcampIE):
        """Keep the source of each format rather than guessing from its bitrate."""
        @classmethod
        def ie_key(cls):
            return 'Bandcamp'

        def _extract_data_attr(self, webpage, video_id, attr='tralbum', fatal=True):
            data = super()._extract_data_attr(webpage, video_id, attr, fatal)
            if attr == 'tralbum' and data:
                self._stream_paths = {
                    urllib.parse.urlsplit(url).path
                    for track in (data.get('trackinfo') or [])
                    for url in (track.get('file') or {}).values()
                    if isinstance(url, str)
                }
            return data

        def _real_extract(self, url):
            self._stream_paths = set()
            info = super()._real_extract(url)
            for fmt in info.get('formats') or []:
                fmt['_surco_origin'] = 'stream' if urllib.parse.urlsplit(fmt['url']).path in self._stream_paths else 'official'
            return info

    class InventoryBandcampAlbumIE(BandcampAlbumIE):
        """Retain the full published track list, including unavailable tracks."""
        @classmethod
        def ie_key(cls):
            return 'BandcampAlbum'

        def _extract_data_attr(self, webpage, video_id, attr='tralbum', fatal=True):
            data = super()._extract_data_attr(webpage, video_id, attr, fatal)
            if attr == 'tralbum':
                self._album_data = data or {}
            return data

        def _real_extract(self, url):
            self._album_data = {}
            uploader_id, album_id = self._match_valid_url(url).groups()
            playlist_id = album_id or uploader_id
            webpage = self._download_webpage(url, playlist_id)
            data = self._extract_data_attr(webpage, playlist_id)
            tracks = data.get('trackinfo') or []
            if not tracks:
                raise ValueError('Este álbum no publica una lista de canciones.')
            current = data.get('current') or {}
            info = dict(_type='playlist', uploader_id=uploader_id, id=playlist_id,
                        title=current.get('title'), description=current.get('about'), entries=[
                            self.url_result(urllib.parse.urljoin(url, track['title_link']), 'Bandcamp',
                                            video_title=track.get('title'))
                            for track in tracks if track.get('title_link')])
            info['artist'] = data.get('artist') or (data.get('current') or {}).get('artist') or info.get('uploader_id')
            info['_surco_tracks'] = [
                dict(title=track.get('title') or f'Canción {index}', number=index,
                     url=urllib.parse.urljoin(url, track['title_link']) if track.get('title_link') else '',
                     duration=track.get('duration'))
                for index, track in enumerate(data.get('trackinfo') or [], 1)
            ]
            return info


if yt_dlp:
    class SoundcloudInventory:
        def _extract_set(self, playlist, token=None):
            info = super()._extract_set(playlist, token)
            info['_surco_tracks'] = [dict(
                title=track.get('title') or f'Canción {i}',
                url=track.get('permalink_url') or (f"https://api-v2.soundcloud.com/tracks/{track['id']}" if track.get('id') else ''),
                duration=(track.get('duration') or 0) / 1000,
            ) for i, track in enumerate(playlist.get('tracks') or [], 1)]
            return info

    class InventorySoundcloudSetIE(SoundcloudInventory, SoundcloudSetIE):
        @classmethod
        def ie_key(cls):
            return 'SoundcloudSet'

    class InventorySoundcloudPlaylistIE(SoundcloudInventory, SoundcloudPlaylistIE):
        @classmethod
        def ie_key(cls):
            return 'SoundcloudPlaylist'

    class InventoryJamendoAlbumIE(JamendoAlbumIE):
        @classmethod
        def ie_key(cls):
            return 'JamendoAlbum'

        def _call_api(self, resource, resource_id, *args, **kwargs):
            data = super()._call_api(resource, resource_id, *args, **kwargs)
            if resource == 'album':
                self._surco_album = data
            return data

        def _real_extract(self, url):
            self._surco_album = {}
            info = super()._real_extract(url)
            if self._surco_album.get('artistId'):
                artist = self._call_api('artist', self._surco_album['artistId'], fatal=False) or {}
                info['artist'] = artist.get('name') or ''
            info['_surco_tracks'] = [dict(
                title=t.get('name') or f'Canción {i}',
                url=f"https://www.jamendo.com/track/{t['id']}" if t.get('id') else '',
                duration=t.get('duration'),
            ) for i, t in enumerate(self._surco_album.get('tracks') or [], 1)]
            return info

    class ProvenanceHearThisAtIE(HearThisAtIE):
        @classmethod
        def ie_key(cls):
            return 'HearThisAt'

        def _download_json(self, *args, **kwargs):
            data = super()._download_json(*args, **kwargs)
            if isinstance(data, dict) and data.get('user'):
                self._surco_data = data
            return data

        def _real_extract(self, url):
            self._surco_data = {}
            info = super()._real_extract(url)
            info['artist'] = (self._surco_data.get('user') or {}).get('username') or ''
            info['track'] = self._surco_data.get('title') or info.get('title')
            for fmt in info.get('formats') or []:
                fmt['_surco_origin'] = 'official' if fmt.get('url') == self._surco_data.get('download_url') and fmt.get('quality') == 2 else 'stream'
            return info

    class PublicYoutubeDL(yt_dlp.YoutubeDL):
        """Validate every request and redirect, including HLS fragments and API calls."""
        def urlopen(self, req):
            url = req if isinstance(req, str) else getattr(req, 'url', None) or req.full_url
            headers = dict(self.params.get('http_headers') or {})
            if not isinstance(req, str):
                headers.update(dict(req.headers))
            headers = {k: v for k, v in headers.items() if k.lower() not in ('accept-encoding', 'cookie', 'authorization')}
            headers['Accept-Encoding'] = 'identity'
            request = urllib.request.Request(public_host(url),
                data=getattr(req, 'data', None), headers=headers,
                method=getattr(req, 'method', None))
            try:
                response = urllib.request.build_opener(SafeRedirect()).open(request, timeout=self.params.get('socket_timeout') or 25)
                return YDLResponse(response, response.url, dict(response.headers), response.status)
            except urllib.error.HTTPError as exc:
                raise YDLHTTPError(YDLResponse(exc, exc.url, dict(exc.headers), exc.code)) from exc
            except (urllib.error.URLError, OSError) as exc:
                raise TransportError(str(exc)) from exc


def safe_name(value, default='Sin título'):
    value = unicodedata.normalize('NFC', str(value or default))
    return re.sub(r'[\x00-\x1f/\\:*?"<>|]', '_', value).strip(' .')[:120] or default


def web_url(value):
    """Parse HTTP URLs without credentials or alternative ports. No network access."""
    if not isinstance(value, str) or len(value) > 4096:
        raise ValueError('Pega un enlace completo que empiece por https://.')
    parts = urllib.parse.urlsplit(value.strip())
    host = (parts.hostname or '').lower()
    if not host or parts.scheme not in ('http', 'https') or parts.username or parts.password or parts.port not in (None, 80, 443) or any(ord(c) < 32 for c in value):
        raise ValueError('Utiliza una dirección web http o https sin contraseñas.')
    # IP literals are never media/page endpoints for these services.
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if '.' not in host or host.endswith(('.local', '.localhost', '.internal')):
            raise ValueError('Utiliza una dirección de una página pública.')
    else:
        raise ValueError('Utiliza una dirección de una página pública.')
    return urllib.parse.urlunsplit((parts.scheme, host, parts.path or '/', parts.query, ''))


def platform_for(url):
    host = urllib.parse.urlsplit(url).hostname or ''
    if host == 'bandcamp.com' or host.endswith('.bandcamp.com'):
        return 'Bandcamp'
    if host == 'soundcloud.com' or host.endswith('.soundcloud.com') or host == 'soundcloud.app.goo.gl':
        return 'SoundCloud'
    if host in ('hearthis.at', 'www.hearthis.at'):
        return 'hearthis.at'
    if host in ('jamendo.com', 'www.jamendo.com'):
        return 'Jamendo'
    return ''


def valid_url(value, media=False):
    url = web_url(value)
    if media:
        # URLs originate only from registered extractors; public_host checks DNS
        # immediately before all requests and redirects, including CDN segments.
        return url
    parts = urllib.parse.urlsplit(url)
    platform = platform_for(url)
    path = parts.path
    allowed = False
    if platform == 'Bandcamp':
        allowed = re.fullmatch(r'/(track|album)/[^/]+/?', path)
    elif platform == 'SoundCloud':
        if parts.hostname in ('on.soundcloud.com', 'soundcloud.app.goo.gl'):
            allowed = re.fullmatch(r'/[\w-]+/?', path)
        elif parts.hostname in ('api.soundcloud.com', 'api-v2.soundcloud.com'):
            allowed = re.fullmatch(r'/(tracks|playlists)/(?:soundcloud%3A(?:tracks|playlists)%3A)?\d+/?', path)
        elif parts.hostname in ('soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'):
            allowed = re.fullmatch(r'/[\w-]+/(?:sets/)?[:\w-]+/?', path)
            if path.rstrip('/').rsplit('/', 1)[-1] in ('tracks', 'albums', 'sets', 'reposts', 'likes', 'spotlight', 'comments'):
                allowed = False
    elif platform == 'hearthis.at':
        allowed = re.fullmatch(r'/[^/?#]+/[\w.-]+/?', path)
    elif platform == 'Jamendo':
        allowed = re.fullmatch(r'/(track|album)/\d+(?:/[^/]+)?/?', path)
    if not platform:
        raise ValueError('Enlaces compatibles: Bandcamp, SoundCloud, hearthis.at y Jamendo. Para otra página, usa Grabar una pestaña.')
    if not allowed:
        raise ValueError(f'Pega el enlace de una canción, álbum o lista de {platform}, no el perfil del artista.')
    return urllib.parse.urlunsplit(('https', parts.hostname, path, '', ''))


def read_index():
    path = LIBRARY / 'index.json'
    if not path.exists():
        return []
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(value, list):
            raise ValueError()
        return value
    except (ValueError, OSError) as exc:
        raise RuntimeError('No se pudo leer la biblioteca. Conserva index.json y los archivos antes de repararla.') from exc


def library():
    with LOCK:
        return sorted(read_index(), key=lambda item: item['created_at'], reverse=True)


def record_path(record):
    path = (LIBRARY / record['filename']).resolve()
    if not path.is_relative_to(LIBRARY) or not path.is_file():
        raise FileNotFoundError('El archivo ya no está en la biblioteca.')
    return path


def find_record(record_id):
    if not re.fullmatch(r'[a-f0-9]{32}', record_id):
        raise FileNotFoundError('Archivo no encontrado.')
    with LOCK:
        record = next((r for r in read_index() if r['id'] == record_id), None)
    if record is None:
        raise FileNotFoundError('Archivo no encontrado.')
    return record


def save_file(temp, *, title, artist='', album='', ext, source, source_url='',
              album_artist='', track_number=None, album_url='', album_preference=''):
    record_id = uuid.uuid4().hex
    folder = LIBRARY / safe_name(album_artist or artist, 'Sin artista') / safe_name(album, 'Grabaciones' if source == 'recording' else 'Canciones')
    folder.mkdir(parents=True, exist_ok=True)
    prefix = f'{track_number:02d} - ' if track_number is not None else ''
    destination = folder / f'{prefix}{safe_name(title)} — {record_id[:8]}.{ext}'
    shutil.move(str(temp), str(destination))
    record = dict(id=record_id, title=str(title or 'Sin título')[:300], artist=str(artist)[:300], album=str(album)[:300],
                  filename=str(destination.relative_to(LIBRARY)), format=ext, bytes=destination.stat().st_size,
                  created_at=dt.datetime.now(dt.timezone.utc).isoformat(), source=source, source_url=source_url,
                  url=f'/files/{record_id}')
    if album_url:
        record.update(album_artist=album_artist, track_number=track_number,
                      album_url=album_url, album_preference=album_preference)
    try:
        with LOCK:
            records = read_index()
            records.append(record)
            # A single lock covers read, replace and rename for simultaneous saves.
            with tempfile.NamedTemporaryFile('w', dir=LIBRARY, suffix='.json', delete=False, encoding='utf-8') as tmp:
                json.dump(records, tmp, ensure_ascii=False, indent=2)
                tmp.flush()
                os.fsync(tmp.fileno())
            os.replace(tmp.name, LIBRARY / 'index.json')
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return record


class QuietLog:
    def debug(self, message):
        pass
    def warning(self, message):
        pass
    def error(self, message):
        pass


def inspect_link(url):
    url = valid_url(url)
    platform = platform_for(url)
    if urllib.parse.urlsplit(url).hostname in ('on.soundcloud.com', 'soundcloud.app.goo.gl'):
        with urllib.request.build_opener(SafeRedirect()).open(urllib.request.Request(public_host(url), method='HEAD'), timeout=20) as response:
            url = valid_url(response.url)
        if platform_for(url) != 'SoundCloud':
            raise ValueError('El enlace corto no lleva a una canción o lista de SoundCloud.')
    if yt_dlp is None:
        raise ValueError('Falta el componente de descarga. Puedes seguir usando Grabar pestaña. Consulta LEEME para instalarlo.')
    options = dict(quiet=True, no_warnings=True, logger=QuietLog(), socket_timeout=20,
                   retries=1, extractor_retries=1, extract_flat='in_playlist',
                   skip_download=True, noplaylist=False, cachedir=False)
    try:
        with PublicYoutubeDL(options, auto_init=False) as ydl:
            for extractor in (ProvenanceBandcampIE, InventoryBandcampAlbumIE, SoundcloudIE,
                    InventorySoundcloudSetIE, InventorySoundcloudPlaylistIE, ProvenanceHearThisAtIE,
                    JamendoIE, InventoryJamendoAlbumIE):
                ydl.add_info_extractor(extractor())
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise ValueError(f'{platform} no entregó el audio o la información de este enlace. Ábrelo en Chrome; si puedes escucharlo, usa Grabar pestaña.') from exc
    if not info:
        raise ValueError('No se encontró información para este enlace.')
    item_id = uuid.uuid4().hex
    result = dict(item_id=item_id, title=info.get('track') or info.get('title') or 'Sin título',
                  artist=info.get('artist') or info.get('uploader') or info.get('uploader_id') or '',
                  album=info.get('album') or '', duration=info.get('duration'), source_url=url,
                  kind='album' if info.get('_type') == 'playlist' else 'track', platform=platform, formats=[], tracks=[])
    formats = {}
    if result['kind'] == 'album':
        result['collection_type'] = 'playlist' if platform == 'SoundCloud' and info.get('album_type') not in ('album', 'ep', 'single', 'compilation') else 'album'
        entries = info.get('_surco_tracks')
        if entries is None:
            entries = list(info.get('entries') or [])
        for index, entry in enumerate(entries, 1):
            entry = entry or {}
            try:
                track_url = valid_url(entry.get('webpage_url') or entry.get('url'))
            except ValueError:
                track_url = ''
            result['tracks'].append(dict(number=index, title=entry.get('title') or f'Canción {index}', url=track_url, duration=entry.get('duration')))
        result['album'] = result['title']
    else:
        for entry in info.get('formats') or []:
            if entry.get('has_drm') or info.get('is_live'):
                continue
            if platform == 'SoundCloud' and ('preview' in str(entry.get('format_id')) or (entry.get('preference') or 0) < 0):
                result['notice'] = 'Esta publicación ofrece una vista previa en alguno de sus formatos. Los fragmentos no se guardan como canciones completas.'
                continue
            protocol = entry.get('protocol') or 'https'
            if protocol not in ('http', 'https', 'm3u8_native') or entry.get('vcodec') not in (None, 'none'):
                continue
            try:
                media_url = valid_url(entry.get('url'), media=True)
            except ValueError:
                continue
            ext = entry.get('ext') or 'mp3'
            if ext not in ('mp3', 'flac', 'wav', 'm4a', 'aac', 'aiff', 'ogg', 'opus', 'alac'):
                continue
            origin = entry.get('_surco_origin', 'official' if platform == 'SoundCloud' and entry.get('format_id') == 'download' else 'available' if platform == 'Jamendo' else 'stream')
            format_id = str(entry.get('format_id') or ext)
            bitrate = entry.get('abr')
            quality = f' · {int(bitrate)} kbps' if bitrate else ''
            label = f'{ext.upper()}{quality} · ' + {'official': 'descarga oficial', 'available': 'archivo disponible', 'stream': 'audio de escucha'}[origin]
            result['formats'].append(dict(id=format_id, label=label, ext=ext, origin=origin))
            formats[format_id] = dict(url=media_url, ext=ext, origin=origin, abr=bitrate or 0,
                protocol=protocol, quality=entry.get('quality') or 0,
                http_headers=entry.get('http_headers') or info.get('http_headers') or {})
        result['formats'].sort(key=lambda f: (f['origin'] != 'official', f['ext'] != 'flac',
            -formats[f['id']]['quality'], formats[f['id']]['protocol'] == 'm3u8_native', f['id']))
    with LOCK:
        cutoff = time.time() - 3600
        for key in list(ITEMS):
            if ITEMS[key]['created'] < cutoff:
                del ITEMS[key]
        ITEMS[item_id] = dict(result=result, formats=formats, created=time.time())
    return result


def public_host(url):
    url = valid_url(url, media=True)
    host = urllib.parse.urlsplit(url).hostname
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise ValueError('La dirección de descarga no es pública.')
    return url


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = public_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_hls(folder, item, selected, progress):
    if not FFMPEG:
        raise ValueError('Este audio necesita ffmpeg para unir sus fragmentos. Instálalo o usa Grabar pestaña.')
    output = folder / ('audio.' + selected['ext'])
    options = dict(quiet=True, no_warnings=True, logger=QuietLog(), socket_timeout=25,
        retries=1, fragment_retries=1, skip_unavailable_fragments=False,
        continuedl=False, concurrent_fragment_downloads=1, cachedir=False,
        nopart=True, noprogress=True)
    with PublicYoutubeDL(options, auto_init=False) as ydl:
        from yt_dlp.networking import Request
        with ydl.urlopen(Request(selected['url'], headers=selected.get('http_headers') or {})) as response:
            manifest = response.read(2 * 1024 * 1024 + 1)
            manifest_url = response.url
        if len(manifest) > 2 * 1024 * 1024:
            raise ValueError('La lista de fragmentos supera el tamaño permitido.')
        manifest = manifest.decode('utf-8-sig')
        if not manifest.startswith('#EXTM3U') or '#EXT-X-ENDLIST' not in manifest or '#EXT-X-STREAM-INF' in manifest:
            raise ValueError('No se encontró una secuencia de audio completa. Prueba otro formato o Grabar pestaña.')
        if re.search(r'#EXT-X-(?:SESSION-)?KEY:.*METHOD=(?!NONE)', manifest):
            raise ValueError('Este formato utiliza audio protegido. Prueba otro formato disponible o Grabar pestaña.')
        info = dict(id='surco', title=item['title'], url=manifest_url, ext=selected['ext'],
            protocol='m3u8_native', http_headers=selected.get('http_headers') or {},
            hls_media_playlist_data=manifest)
        if not HlsFD.can_download(manifest, info):
            raise ValueError('Este formato de audio no se puede unir en Surco.')
        def update(data):
            received = data.get('downloaded_bytes') or 0
            total = data.get('total_bytes') or data.get('total_bytes_estimate') or 0
            if received > MAX_BYTES or (data.get('total_bytes') or 0) > MAX_BYTES:
                raise ValueError('El archivo supera el límite de 512 MB por canción.')
            progress(min(98, round(received / total * 98)) if total else 0)
        downloader = HlsFD(ydl, options)
        downloader.add_progress_hook(update)
        ok, _ = downloader.download(str(output), info)
        if not ok or not output.is_file() or not output.stat().st_size:
            raise ValueError('Faltan fragmentos del audio. Vuelve a analizar el enlace y reintenta.')
    progress(98)
    # HLS may contain MPEG-TS or fMP4 regardless of the advertised audio suffix.
    # Remux locally, without re-encoding or letting ffmpeg access the network.
    remuxed = folder / ('saved.' + selected['ext'])
    command = [FFMPEG, '-v', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe',
        '-i', str(output), '-map', '0:a:0', '-vn', '-c:a', 'copy', str(remuxed)]
    result = subprocess.run(command, capture_output=True, timeout=180)
    if result.returncode or not remuxed.is_file() or remuxed.stat().st_size > MAX_BYTES:
        raise ValueError('No se pudo unir el audio en su formato original. Prueba otro formato.')
    return remuxed


def download_audio(item, selected, progress):
    temp_path = None
    hls_folder = None
    try:
        progress(0)
        if selected.get('protocol') == 'm3u8_native':
            hls_folder = tempfile.TemporaryDirectory(dir=LIBRARY, prefix='.hls-')
            temp_path = download_hls(Path(hls_folder.name), item, selected, progress)
        else:
            temp_path = download_direct(item, selected, progress)
        if FFMPEG:
            validate_audio(temp_path)
        progress(99)
        record = save_file(temp_path, title=item['title'], artist=item['artist'], album=item['album'],
                           ext=selected['ext'], source=selected['origin'], source_url=item['source_url'],
                           album_artist=item.get('album_artist', ''), track_number=item.get('track_number'),
                           album_url=item.get('album_url', ''), album_preference=item.get('album_preference', ''))
        return record
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)
        if hls_folder:
            hls_folder.cleanup()


def download_direct(item, selected, progress):
    temp_path = None
    try:
        opener = urllib.request.build_opener(SafeRedirect())
        headers = {'User-Agent': 'Mozilla/5.0', 'Referer': item['source_url']}
        headers.update({k: v for k, v in selected.get('http_headers', {}).items() if k.lower() not in ('cookie', 'authorization')})
        headers['Accept-Encoding'] = 'identity'
        request = urllib.request.Request(public_host(selected['url']), headers=headers)
        with opener.open(request, timeout=30) as response:
            content_type = response.headers.get('Content-Type', '').lower()
            if 'text/' in content_type or 'json' in content_type:
                raise ValueError('La plataforma devolvió una página en vez del audio. Prueba Grabar pestaña.')
            total = int(response.headers.get('Content-Length') or 0)
            if total > MAX_BYTES:
                raise ValueError('El archivo supera el límite de 512 MB por canción.')
            with tempfile.NamedTemporaryFile(dir=LIBRARY, prefix='.download-', delete=False) as tmp:
                temp_path = Path(tmp.name)
                received = 0
                while chunk := response.read(256 * 1024):
                    received += len(chunk)
                    if received > MAX_BYTES:
                        raise ValueError('El archivo supera el límite de 512 MB.')
                    tmp.write(chunk)
                    progress(min(99, round(received / total * 100)) if total else 0)
            if received == 0 or (total and received != total):
                raise ValueError('La descarga quedó incompleta. Vuelve a analizar el enlace.')
        return temp_path
    except BaseException:
        if temp_path:
            temp_path.unlink(missing_ok=True)
        raise


def run_download(job_id, item, selected):
    def update_progress(value):
        with LOCK:
            JOBS[job_id].update(status='downloading', progress=value)
    try:
        record = download_audio(item, selected, update_progress)
        with LOCK:
            JOBS[job_id].update(status='complete', progress=100, recording=record)
    except Exception as exc:
        message = str(exc) if isinstance(exc, ValueError) else 'No se pudo descargar el archivo. Vuelve a analizar el enlace o usa Grabar pestaña.'
        with LOCK:
            JOBS[job_id].update(status='error', error=message)


class DownloadCancelled(Exception):
    pass


def choose_album_format(formats, preference):
    if not formats:
        raise ValueError('La plataforma no entrega audio completo para esta pista.')
    choices = list(formats.values())
    if preference == 'mp3':
        mp3 = [f for f in choices if f['ext'] == 'mp3']
        choices = mp3 or choices
    lossless = {'flac', 'wav', 'aiff', 'alac'}
    return min(choices, key=lambda f: (f['origin'] != 'official', f['ext'] not in lossless,
        -(f.get('quality') or 0), -(f.get('abr') or 0), f.get('protocol') == 'm3u8_native'))


def start_album(item_id, preference):
    if preference not in ('mp3', 'best'):
        raise ValueError('Elige MP3 o la mejor calidad disponible.')
    with LOCK:
        item = ITEMS.get(str(item_id))
        album = item['result'] if item else next((j['album'] for j in JOBS.values()
            if j.get('kind') == 'album' and j['album']['item_id'] == item_id), None)
        if not album or album.get('kind') != 'album' or not album.get('tracks'):
            raise ValueError('Explora un álbum o una lista con canciones antes de descargarlo completo.')
        for job_id, job in JOBS.items():
            if job.get('kind') == 'album' and job['album']['source_url'] == album['source_url'] and job['status'] in ('queued', 'downloading'):
                return job_id
        if sum(j['status'] in ('queued', 'downloading') for j in JOBS.values()) >= 3:
            raise ValueError('Espera a que terminen las descargas en curso.')
        job_id = uuid.uuid4().hex
        JOBS[job_id] = dict(kind='album', status='queued', progress=0, total=len(album['tracks']),
            completed=0, failed=0, existing=0, current_track=0, cancel_requested=False,
            preference=preference, album=copy.deepcopy(album),
            tracks=[dict(number=i, title=t['title'], url=t['url'], status='queued', progress=0)
                    for i, t in enumerate(album['tracks'], 1)])
    threading.Thread(target=run_album, args=(job_id,), daemon=True).start()
    return job_id


def run_album(job_id):
    job = JOBS[job_id]
    album, preference = job['album'], job['preference']
    try:
        with LOCK:
            job['status'] = 'downloading'
        for position, row in enumerate(job['tracks']):
            def progress(value):
                with LOCK:
                    if job['cancel_requested']:
                        raise DownloadCancelled()
                    row['progress'] = value
                    job['progress'] = round((position + value / 100) / job['total'] * 100, 1)
            try:
                progress(0)
                with LOCK:
                    row['status'] = 'downloading'
                    job['current_track'] = row['number']
                    previous = next((r for r in read_index() if r.get('album_url') == album['source_url']
                        and r.get('source_url') == row['url'] and r.get('track_number') == row['number']
                        and r.get('album_preference') == preference and (LIBRARY / r['filename']).is_file()), None)
                if previous:
                    with LOCK:
                        row.update(status='existing', progress=100, recording=previous)
                        job['completed'] += 1
                        job['existing'] += 1
                    continue
                if not row['url']:
                    raise ValueError('Esta pista no tiene un enlace de reproducción disponible.')
                track = inspect_link(row['url'])
                with LOCK:
                    row['title'] = track['title']
                with LOCK:
                    formats = ITEMS[track['item_id']]['formats']
                if track['kind'] != 'track':
                    raise ValueError('El enlace de esta pista no corresponde a una canción.')
                selected = choose_album_format(formats, preference)
                track = dict(track, album=album['title'], album_artist=album['artist'] or 'Sin artista',
                             track_number=row['number'], album_url=album['source_url'], album_preference=preference)
                record = download_audio(track, selected, progress)
                with LOCK:
                    row.update(status='complete', progress=100, recording=record)
                    job['completed'] += 1
            except DownloadCancelled:
                with LOCK:
                    row.update(status='cancelled', progress=0)
                break
            except Exception as exc:
                message = str(exc) if isinstance(exc, ValueError) else 'No se pudo guardar esta pista. Puedes reintentar las pendientes.'
                with LOCK:
                    row.update(status='error', error=message, progress=0)
                    job['failed'] += 1
            finally:
                with LOCK:
                    job['progress'] = round((job['completed'] + job['failed']) / job['total'] * 100, 1)
        with LOCK:
            if job['completed'] == job['total']:
                job.update(status='complete', progress=100)
            elif job['cancel_requested']:
                job['status'] = 'cancelled'
                for row in job['tracks']:
                    if row['status'] == 'queued':
                        row['status'] = 'cancelled'
            else:
                job['status'] = 'partial' if job['completed'] else 'error'
    except Exception:
        with LOCK:
            job.update(status='error', error='La descarga se interrumpió. Las pistas guardadas se conservan.')


def validate_audio(path):
    command = [FFMPEG, '-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', str(path), '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-']
    result = subprocess.run(command, capture_output=True, timeout=30)
    if result.returncode:
        raise ValueError('El archivo recibido no contiene audio válido.')


def convert_recording(path, fmt, title, artist, album):
    if fmt == 'webm':
        if FFMPEG:
            validate_audio(path)
        return path
    if not FFMPEG:
        raise ValueError('Para MP3 o FLAC se necesita ffmpeg. Guarda el original WebM.')
    output = path.with_suffix('.' + fmt)
    codec = ['-c:a', 'libmp3lame', '-q:a', '2'] if fmt == 'mp3' else ['-c:a', 'flac']
    command = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-i', str(path),
               '-map', '0:a:0', '-vn', *codec, '-metadata', f'title={title}', '-metadata', f'artist={artist}',
               '-metadata', f'album={album}', str(output)]
    try:
        result = subprocess.run(command, capture_output=True, timeout=240)
        if result.returncode or not output.is_file() or output.stat().st_size == 0:
            raise ValueError('No se pudo convertir el audio. Puedes conservar el original WebM y reintentarlo.')
        return output
    except Exception:
        output.unlink(missing_ok=True)
        raise


class Handler(BaseHTTPRequestHandler):
    server_version = 'Surco/0.1.0-beta'

    def log_message(self, format, *args):
        pass

    def permitted(self, mutate=False):
        host = self.headers.get('Host', '')
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if host not in allowed:
            self.json_response({'error': 'Esta herramienta solo acepta conexiones locales.'}, 403)
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://{h}' for h in allowed}:
            self.json_response({'error': 'Origen no permitido.'}, 403)
            return False
        if mutate and not secrets.compare_digest(self.headers.get('X-Local-Token', '').encode('utf-8'), TOKEN.encode('ascii')):
            self.json_response({'error': 'Recarga la página para continuar.'}, 403)
            return False
        return True

    def common_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

    def json_response(self, value, status=200):
        content = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.common_headers()
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        if not self.permitted():
            return
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        try:
            if path == '/api/status':
                self.json_response(dict(token=TOKEN, ffmpeg=bool(FFMPEG), yt_dlp=bool(yt_dlp), platforms=PLATFORMS, directory=str(LIBRARY), recordings=library()))
            elif path == '/api/library':
                self.json_response({'recordings': library()})
            elif path.startswith('/api/jobs/'):
                with LOCK:
                    job = copy.deepcopy(JOBS.get(path.rsplit('/', 1)[-1]) or {})
                self.json_response(job or {'error': 'Trabajo no encontrado.'}, 200 if job else 404)
            elif path.startswith('/files/'):
                record = find_record(path.split('/')[-1])
                self.send_file(record_path(record), download='download=1' in parsed.query)
            elif path in ('/', '/index.html', '/style.css', '/app.js', '/static/style.css', '/static/app.js'):
                self.send_file(STATIC / ('index.html' if path == '/' else path.rsplit('/', 1)[-1]))
            elif path == '/favicon.ico':
                self.send_response(204)
                self.end_headers()
            else:
                self.json_response({'error': 'No encontrado.'}, 404)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except FileNotFoundError as exc:
            self.json_response({'error': str(exc)}, 404)
        except Exception:
            self.json_response({'error': 'No se pudo leer la biblioteca o el archivo.'}, 500)

    def send_file(self, path, download=False):
        if not path.is_file():
            raise FileNotFoundError('Archivo no encontrado.')
        size = path.stat().st_size
        start, end = 0, size - 1
        range_header = self.headers.get('Range')
        partial = bool(range_header)
        if range_header:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header)
            if not match or not any(match.groups()):
                return self.range_error(size)
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                start = max(0, size - int(last))
            if start > end or start >= size:
                return self.range_error(size)
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1))
        if partial:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        if download:
            self.send_header('Content-Disposition', "attachment; filename*=UTF-8''" + urllib.parse.quote(path.name))
        self.common_headers()
        self.end_headers()
        with path.open('rb') as source:
            source.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = source.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def range_error(self, size):
        self.send_response(416)
        self.send_header('Content-Range', f'bytes */{size}')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def body_size(self, maximum):
        if self.headers.get('Transfer-Encoding'):
            raise ValueError('Formato de envío no compatible.')
        try:
            size = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            size = -1
        if size < 1 or size > maximum:
            raise ValueError(f'El envío está vacío o supera el límite de {maximum // 1024 // 1024 or 1} MB.')
        return size

    def read_json(self):
        size = self.body_size(16384)
        body = self.rfile.read(size)
        if len(body) != size:
            raise ValueError('El envío quedó incompleto.')
        value = json.loads(body)
        if not isinstance(value, dict):
            raise ValueError('Solicitud inválida.')
        return value

    def do_POST(self):
        if not self.permitted(mutate=True):
            return
        parsed = urllib.parse.urlsplit(self.path)
        try:
            if parsed.path == '/api/recordings':
                return self.receive_recording(parsed.query)
            body = self.read_json()
            if parsed.path == '/api/inspect':
                self.json_response(inspect_link(body.get('url')))
            elif parsed.path == '/api/download-album':
                self.json_response({'job_id': start_album(body.get('item_id'), body.get('preference', 'mp3'))}, 202)
            elif re.fullmatch(r'/api/jobs/[a-f0-9]{32}/cancel', parsed.path):
                with LOCK:
                    job = JOBS.get(parsed.path.split('/')[3])
                    if not job or job.get('kind') != 'album':
                        raise ValueError('Descarga de álbum o lista no encontrada.')
                    if job['status'] in ('queued', 'downloading'):
                        job['cancel_requested'] = True
                self.json_response({'ok': True})
            elif parsed.path == '/api/download':
                with LOCK:
                    item = ITEMS.get(str(body.get('item_id')))
                    selected = item and item['formats'].get(str(body.get('format_id')))
                    if not item or not selected or item['created'] < time.time() - 3600:
                        raise ValueError('Vuelve a analizar el enlace para actualizar la descarga.')
                    if sum(j['status'] in ('queued', 'downloading') for j in JOBS.values()) >= 3:
                        raise ValueError('Espera a que terminen las descargas en curso.')
                    job_id = uuid.uuid4().hex
                    JOBS[job_id] = dict(status='queued', progress=0)
                threading.Thread(target=run_download, args=(job_id, item['result'], selected), daemon=True).start()
                self.json_response({'job_id': job_id}, 202)
            elif parsed.path == '/api/reveal':
                record_id = body.get('id')
                if record_id:
                    target = record_path(find_record(str(record_id)))
                    command = ['open', '-R', str(target)]
                else:
                    command = ['open', str(LIBRARY)]
                subprocess.run(command, check=True, timeout=10, capture_output=True)
                self.json_response({'ok': True})
            else:
                self.json_response({'error': 'No encontrado.'}, 404)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except (ValueError, FileNotFoundError) as exc:
            self.json_response({'error': str(exc)}, 400)
        except subprocess.TimeoutExpired:
            self.json_response({'error': 'El proceso tardó demasiado. Conserva el audio original y vuelve a intentarlo.'}, 504)
        except Exception:
            self.json_response({'error': 'No se pudo completar la operación. Conserva el audio original y vuelve a intentarlo.'}, 500)

    def receive_recording(self, query):
        size = self.body_size(MAX_BYTES)
        meta = {k: v[0][:500] for k, v in urllib.parse.parse_qs(query).items() if v}
        fmt = meta.get('format', 'mp3')
        if fmt not in ('mp3', 'flac', 'webm'):
            raise ValueError('Elige MP3, FLAC o WebM.')
        content_type = self.headers.get('Content-Type', '').split(';')[0]
        if content_type not in ('audio/webm', 'video/webm', 'application/octet-stream'):
            raise ValueError('La grabación debe estar en formato WebM. Utiliza Chrome o Edge.')
        source_url = meta.get('source_url', '')
        if source_url:
            # Only saved as metadata: the recorder can capture any playable tab.
            source_url = web_url(source_url)
        title, artist, album = meta.get('title', 'Grabación'), meta.get('artist', ''), meta.get('album', '')
        temp_path = output = None
        self.connection.settimeout(90)
        try:
            with tempfile.NamedTemporaryFile(dir=LIBRARY, prefix='.recording-', suffix='.webm', delete=False) as tmp:
                temp_path = Path(tmp.name)
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(256 * 1024, remaining))
                    if not chunk:
                        raise ValueError('La grabación no llegó completa. Conserva el original y vuelve a intentarlo.')
                    tmp.write(chunk)
                    remaining -= len(chunk)
            with temp_path.open('rb') as original:
                signature = original.read(4)
            if signature != b'\x1aE\xdf\xa3':
                raise ValueError('La grabación no contiene un archivo WebM válido.')
            output = convert_recording(temp_path, fmt, title, artist, album)
            record = save_file(output, title=title, artist=artist, album=album, ext=fmt, source='recording', source_url=source_url)
            self.json_response({'recording': record}, 201)
        finally:
            if temp_path:
                temp_path.unlink(missing_ok=True)
            if output:
                output.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description='Surco · audio en tu computador')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    LIBRARY.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.daemon_threads = True
    print(f'Surco listo: http://127.0.0.1:{server.server_port}', flush=True)
    print(f'Tu música: {LIBRARY}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
