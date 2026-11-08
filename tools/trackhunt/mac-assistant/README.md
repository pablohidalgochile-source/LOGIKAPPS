# Track Hunt Assistant for Mac — ShazamIO 0.4.0

macOS 13+, Apple Silicon. The native assistant now includes ShazamIO 0.9.0 and its Python runtime. No Apple Developer membership, API key, Python installation, microphone or audio playback is required. Recognition requires internet and uses an **unofficial** Shazam client; availability, quotas and full musical coverage are not guaranteed.

## Use

1. Open the locally built **Track Hunt Assistant.app**, or download the complete ZIP from Track Hunt → Sets. Close the old app before opening 0.3.
2. Open `/sets` in Chrome and click **Conectar asistente**. Allow the site's request to access local apps/services when prompted, then reconnect if the prompt took longer than eight seconds. The integrated browser may block this connection.
3. Choose detailed (every 30 seconds) or balanced (every 60 seconds), then **Seleccionar set en el Mac**. Select your local MP3/WAV/M4A/AIFF audio or MP4/MOV video file in the native picker.
4. The app reads 12-second windows without playback, sends their fingerprints to Shazam, and adds a second pass around unknown points and identity changes. No ten-song cap.
5. Completed results automatically enter the existing Sets tracklist and Deezer matching/export workflow. Pause, resume, cancel and import partial results remain available.

Keep the app open, online and the Mac awake. Reloading the browser can reconnect; closing the app preserves the job on this Mac and restores interrupted work paused. Maximum file length is eight hours. Timestamps are first detections, not exact track boundaries. Short tracks, overlays, remixes and tempo/pitch changes can be missed or misidentified. A repeated song later in the set remains a separate occurrence. No-match responses and provider errors are distinct: errors pause at the pending sample. No retries on 429/401/403, no proxies or limit circumvention. Requests are sequential with ten seconds between samples. A 429 response enforces Retry-After (at least two minutes) before manual resume.

## Privacy and local bridge

The original file stays on the Mac. Only the native file picker selects it; HTTP requests cannot provide file paths. A random temporary WAV holds at most 12 seconds, is passed to the bundled recognizer as a process argument (no shell), and removed after each attempt. ShazamIO computes fingerprints locally and sends them over verified HTTPS to `amp.shazam.com`. The web receives titles, artists, approximate times and progress, not PCM or original file paths.

Loopback server: `127.0.0.1:43871`. Exact Host/Origin validation allows the Track Hunt production origin and development port 4318 only. Session tokens are random per process and kept in browser memory. Status/control require the token. Requests are size-bounded; duplicate headers, chunked framing and malformed lengths are rejected. The engine subprocess has a 40-second outer timeout; recognition/network attempts have shorter timeouts. No microphone, shell execution from HTTP, account enrollment or paid fallback.

## YouTube tab capture (0.3)

The Chrome extension in `../chrome-extension` captures bounded 12-second windows from a normally playable YouTube tab. It does not retrieve direct media URLs or download the complete set. The user starts capture from the extension popup; the native bridge accepts mono PCM only from its pinned extension origin and requires the session token. The assistant owns the sampling queue, refinement, deduplication, cooldown and results. Browser-provided audio is checked for canonical WAV structure, 3–12 second duration and 1.2 MB maximum. A single recognition runs at a time. Closing capture or losing its heartbeat pauses the job. Pause/cancel/partial import use the same web controls. Browser metadata is labeled separately from local-file input.

See `../chrome-extension/README.md` for installation, capture permission and interruption recovery. Chrome's internal extensions page cannot be automated in this environment; the user loads the unpacked extension and invokes capture.

## Build

```sh
cd mac-assistant
python3 -m venv build/python-env
build/python-env/bin/pip install -r engine/requirements.lock
bash build-app.sh
```

This bundles the engine using PyInstaller and builds the native UI with SwiftPM. Python and dependencies stay inside the app; users do not need them installed. The package includes third-party notices. Build dependencies are pinned in `engine/requirements.lock`.

The app has a local ad-hoc signature, **not Apple notarization**. The locally compiled app can run on this Mac. A downloaded copy on another Mac may be blocked by Gatekeeper; do not disable system protections. General signed/notarized distribution remains a separate concern, not a requirement of the ShazamIO recognition engine.

## Checks

```sh
build/python-env/bin/python Checks/test_engine.py
swift run --scratch-path build/swift ScanCoreChecks
node --test tests/shazam-assistant.test.mjs  # from repository root
```

The Python tests exercise denial/rate-limit handling without retry, response validation and endpoint restrictions. Swift checks cover 48 tracks, repeated occurrences, coverage/refinement and HTTP isolation. Web tests cover all-track import and malformed payload rejection. `Checks/AudioCheck.swift` remains a local ShazamKit custom-catalog regression check; the production recognition path uses ShazamIO, not SHSession.

Las pruebas anteriores del proyecto no certifican el reconocimiento de un set completo ni la instalación en otro Mac. Usa archivos propios o autorizados y verifica las coincidencias.

Sources: https://github.com/shazamio/ShazamIO · https://github.com/shazamio/shazamio-core


## Review and automatic checkpoints (0.4)

The Sets panel opens a dark timeline with every detected occurrence and unknown sample. Editable artist/title and pending/confirmed/rejected decisions are saved separately from Shazam originals. Rejected occurrences are excluded when applying the review to the tracklist. Changes are saved on the Mac immediately after pressing Save; Apply review updates catalogue searches explicitly instead of re-querying all songs on every edit. Other observations stay provisional.

A selected time range (up to five minutes) adds only previously unqueried sample starts at six-second spacing. Original observations are retained. YouTube requires the existing extension's Retomar captura interrumpida gesture; local audio/video uses Resume. Both use the same queue, provider cooldown, review and persistence. Time markers are sample positions, not estimated song durations or a waveform.

Atomic checkpoints under ~/Library/Application Support/TrackHunt/Scans contain full observations, exact pending queue, reviews, cooldown deadlines and a security-scoped bookmark for a file selected in the native picker. They contain no audio or session tokens. Restart restores the latest job paused; completed jobs remain complete. Saved jobs can be reopened from the web. If a local file cannot be resolved, relink it through the native picker; its size and modification time must match. These checks are not a cryptographic content identity. No cloud sync.

Validation: 121 Node tests; bounded WAV/MP4 decode and seeking with synthetic two-tone fixtures; restart tests for WAV/MP4 bookmarks, original preservation, reviews, exact targeted queue and provider cooldown. Real KYBBA 149/149, 68 occurrences were migrated without re-recognizing. A temporary title correction was tested and reverted. Catalogue matches do not verify acoustic correctness.

## 0.4.2 — repaso de canciones individuales

Desde la línea de tiempo, pausa el barrido, elige un tramo de hasta cinco minutos y pulsa **Preparar repaso individual**. El repaso añade puntos nuevos cada seis segundos y consulta solo los primeros seis segundos de cada muestra. En YouTube, pulsa **Retomar captura interrumpida** en la extensión; con un archivo local, pulsa **Reanudar**. Si queda un barrido anterior pendiente, se pausa al terminar el repaso y conserva su cola para retomarlo después.

El checkpoint conserva las observaciones y revisiones anteriores, la fase del barrido, los puntos pendientes y las esperas del proveedor. Los puntos de repaso corto se guardan como `shortPoints`; cada observación nueva registra `windowSeconds`. Los checkpoints anteriores siguen siendo compatibles. No se repiten puntos ya consultados y no se descargan ni reproducen sets completos.

Los títulos que parecen mixes/medleys y las identidades repetidas durante diez minutos se señalan como **posibles compilaciones**. Siguen visibles en la revisión, pero se excluyen de la lista exportable hasta que el usuario los confirma. Esta heurística no identifica todas las atribuciones erróneas y puede señalar canciones largas legítimas. «Remix», «Original Mix» y «Extended Mix» por sí solos no activan el aviso.

Las ventanas cortas pueden recuperar otra identidad o no devolver ninguna. No garantizan reconocer la canción original: una compilación registrada en Shazam puede seguir predominando. No hay reintentos automáticos de errores ni cambios en las esperas ante límites del proveedor.

### Repaso de audio acelerado (0.4.2)

El ajuste experimental −5,5 % se aplica solo a nuevas muestras de seis segundos de un tramo elegido, tanto en YouTube como en archivos locales. No modifica la fuente ni sus tiempos. Las observaciones guardan `speedMultiplier: 0.945`; la cola mantiene los puntos ajustados al reiniciar. Cada punto hace una consulta a Shazam y conserva la pausa entre consultas. No se aplican correcciones ni confirmaciones automáticas. En KYBBA Mix #7 recuperó un candidato «Ba Ba Bad» donde la muestra sin ajuste devolvía una compilación; no resuelve todos los fragmentos.

### Criterios permanentes de la lista final (noviembre de 2026)

Estas reglas forman parte del producto y sus pruebas de regresión; no dependen de recordar una conversación:

- La línea de tiempo conserva todas las apariciones. La lista y las consultas de Deezer agrupan artista + título/versión efectivos y muestran sus tiempos. Originales, remixes e instrumentales distintos no se fusionan.
- Las correcciones se aplican antes de agrupar; rechazar una aparición no borra las demás. El checkpoint original nunca se modifica para limpiar una exportación.
- Una única muestra reconocida, sin confirmación explícita, se separa como candidata por revisar. Dos muestras coincidentes son evidencia repetida, no una confirmación de identidad ni de versión.
- La similitud de catálogo en Deezer se presenta separada de la evidencia acústica. Un título igual con artista poco compatible queda en revisión aunque el puntaje combinado sea alto; compartir «DJ» no basta. El TXT contiene únicamente IDs de Deezer válidos, únicos y sin revisión pendiente. No contiene archivos de música.
- Las selecciones y versiones de Deezer aprobadas se conservan al actualizar el mismo trabajo en ese navegador. El historial previo se conserva; no hay sincronización de estas decisiones entre dispositivos.
- Sets intenta conectar al asistente local al abrirse; esto solo consulta el trabajo existente y nunca inicia una captura. El repaso sugerido prepara hasta 16 puntos cortos de huecos/candidatas con límites, y el asistente vuelve a filtrar los puntos ya consultados. YouTube conserva el gesto de captura requerido por Chrome.
- No se activa un proveedor de pago, no se reinicia el trabajo para recuperar un error y no se marca un candidato como confirmado por el usuario automáticamente.

`tests/shazam-assistant.test.mjs` comprueba agrupación sin mutación, conservación de tiempos, separación de versiones, correcciones por aparición, revisión por evidencia y exportación de enlaces únicos. Los casos reales de KYBBA son evidencia de funcionamiento parcial, no una garantía de reconocer todos los sets.
