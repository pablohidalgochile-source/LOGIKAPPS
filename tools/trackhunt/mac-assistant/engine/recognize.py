"""One fragment in, bounded JSON out. Never plays audio or retries a denied request."""
import asyncio
import json
import logging
import ssl
import sys
import time
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
import certifi
from shazamio import Shazam
from shazamio.interfaces.client import HTTPClientInterface


class RecognitionError(Exception):
    pass


class RateLimitError(RecognitionError):
    def __init__(self, header):
        try:
            seconds = float(header)
        except (ValueError, TypeError):
            try:
                seconds = parsedate_to_datetime(header).timestamp() - time.time()
            except (ValueError, TypeError, AttributeError):
                seconds = 120
        self.retry_after = max(120, seconds) if 0 <= seconds < float('inf') else 120
        super().__init__('Shazam limitó las consultas. El barrido queda pausado; espera antes de reanudar.')


class FragmentClient(HTTPClientInterface):
    def __init__(self, session):
        self.session = session

    async def request(self, method, url, **kwargs):
        if urlparse(url).scheme != "https" or urlparse(url).hostname != "amp.shazam.com":
            raise RecognitionError("Destino de reconocimiento inesperado. Actualiza el asistente.")
        async with self.session.request(method, url, allow_redirects=False, **kwargs) as response:
            if response.status == 429:
                raise RateLimitError(response.headers.get('Retry-After'))
            if response.status in (401, 403):
                raise RecognitionError("Shazam rechazó el acceso no oficial. No se reintentará automáticamente.")
            if response.status != 200:
                raise RecognitionError(f"Shazam respondió HTTP {response.status}. Puedes reanudar más tarde.")
            raw = bytearray()
            async for chunk in response.content.iter_chunked(65_536):
                raw.extend(chunk)
                if len(raw) > 1_048_576:
                    raise RecognitionError("Respuesta de Shazam demasiado grande.")
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise RecognitionError("Shazam devolvió una respuesta incompleta o inválida. El fragmento queda pendiente para reanudar.") from error

    async def request_text(self, *args, **kwargs):
        raise RecognitionError("Operación no disponible en el reconocedor de fragmentos.")


def result_from_response(value):
    if not isinstance(value, dict) or not isinstance(value.get("matches"), list):
        raise RecognitionError("Respuesta de Shazam inválida. El fragmento queda pendiente.")
    if not value["matches"]:
        return {"ok": True, "match": None}
    track = value.get("track")
    if not isinstance(track, dict):
        raise RecognitionError("Shazam devolvió una coincidencia incompleta.")
    title, artist, identity = (track.get(k) for k in ("title", "subtitle", "key"))
    if not all(isinstance(v, str) and v.strip() for v in (title, artist, identity)):
        raise RecognitionError("Shazam devolvió una canción sin identidad completa.")
    return {"ok": True, "match": {"identity": identity[:600], "title": title[:500], "artist": artist[:500]}}


async def recognize(path):
    file = Path(path)
    if not file.is_file() or file.stat().st_size > 3_000_000:
        raise RecognitionError("El motor solo acepta un fragmento local de hasta 12 segundos.")
    context = ssl.create_default_context(cafile=certifi.where())
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=25),
                                    connector=aiohttp.TCPConnector(ssl=context)) as session:
        async with Shazam(http_client=FragmentClient(session), segment_duration_seconds=12) as recognizer:
            return result_from_response(await asyncio.wait_for(recognizer.recognize(str(file)), timeout=30))


def main():
    logging.disable(logging.CRITICAL)
    try:
        if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
            result = {"ok": True, "engine": "shazamio", "version": "0.9.0"}
        elif len(sys.argv) == 2:
            result = asyncio.run(recognize(sys.argv[1]))
        else:
            raise RecognitionError("Selecciona el archivo desde el asistente.")
    except RateLimitError as error:
        result = {"ok": False, "error": str(error), "retryAfter": error.retry_after}
    except RecognitionError as error:
        result = {"ok": False, "error": str(error)}
    except (TimeoutError, aiohttp.ClientError):
        result = {"ok": False, "error": "No se pudo consultar Shazam. Revisa internet y reanuda el barrido."}
    except Exception:
        result = {"ok": False, "error": "El motor ShazamIO no pudo procesar este fragmento. El punto queda pendiente; puedes reanudar."}
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
