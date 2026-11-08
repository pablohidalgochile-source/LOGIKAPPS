# Track Hunt · YouTube 0.3.1

Extensión local Chrome 116+ Manifest V3 para el asistente Mac 0.3. No publicada en Chrome Web Store. No usa micrófono, descargas, cookies, credenciales ni servicios de extracción de YouTube.

## Instalar y usar

1. Abre el asistente Mac 0.3 y Track Hunt → Sets → Conectar asistente.
2. En Chrome abre `chrome://extensions/`, activa **Modo de desarrollador**, pulsa **Cargar descomprimida** y elige esta carpeta (contiene manifest.json).
3. Abre el video en `https://www.youtube.com/watch?v=...`. Debe poder reproducirse normalmente en YouTube.
4. Pulsa el icono de extensiones de Chrome → **Track Hunt · Reconocer YouTube** → **Identificar este set**. Ese clic concede captura de audio exclusivamente para la pestaña elegida.
5. Mantén el Mac despierto, el asistente y la pestaña abiertos. Puedes cerrar el popup. La captura reproduce 12 segundos por punto a velocidad normal y salta cada 60 o 30 segundos; el audio capturado no llega a los altavoces. En Track Hunt se ven progreso, pausa, reanudación y cancelación.
6. Al terminar, Track Hunt importa los resultados automáticamente y busca Deezer. También puedes importar resultados parciales tras pausar.

**Si modificas los archivos de la extensión**, pulsa su botón Recargar en chrome://extensions/ antes de la siguiente prueba. Para actualizar el asistente ciérralo primero. No recargues durante un barrido.

## Interrupciones

- Anuncios: pausa y muestra un aviso. Atiende el anuncio en YouTube; después pulsa Reanudar. No omite ni bloquea anuncios.
- Si cerraste la captura o reiniciaste la extensión, abre el mismo video y pulsa **Retomar captura interrumpida**. Si la captura sigue viva usa **Reanudar**.
- Cambio de video, carga detenida, falta de sonido o error de Shazam: conserva el punto pendiente y pausa; no inventa una detección.
- HTTP 429: respeta el plazo que indica Shazam, con mínimo dos minutos; no hay reintento automático ni evasión de cuotas.
- Cancelar detiene nuevos fragmentos; un fragmento de hasta 12 segundos en curso puede terminar de capturarse pero no se consulta después de cancelar. La pestaña queda pausada al liberar captura.

## Privacidad y alcance

Solo permiso temporal `activeTab` para controlar el reproductor que eliges; `tabCapture` para su audio; `scripting` para saltar y pausar; `offscreen` para mantener captura al cerrar el popup. Único host permanente: `http://127.0.0.1:43871/`, el asistente del mismo Mac. No acceso general a YouTube ni a otras webs. El token de sesión permanece en memoria.

El AudioWorklet produce siempre ceros hacia la salida; mezcla el audio capturado a mono y retiene máximo 12 segundos. Un WAV acotado viaja al asistente por loopback. El asistente valida formato/duración, crea un temporal, calcula la huella, consulta Shazam y elimina el temporal. No existe operación de descargar/guardar el set completo. YouTube puede precargar sus propios segmentos al reproducir; la extensión no controla ese caché.

ID fijo: `necoajnfjeigpkepmelbgglbmogaeldj`. La clave de manifest.json es **pública**, fija la identidad; no es una credencial. El asistente permite solo ese origen de extensión además de la web Track Hunt y su preview local. Se limita a un trabajo y una consulta simultáneos. ShazamIO es no oficial, sin garantía de disponibilidad, precisión, catálogo o reconocimiento de todas las canciones. Tiempo mostrado = primera muestra reconocida, no inicio exacto del tema.

Documentación: https://developer.chrome.com/docs/extensions/reference/api/tabCapture · https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture

0.3.1 añade plazos de espera al controlar el reproductor y permite reemplazar una captura interrumpida conservando la cola nativa. La web distingue detecciones actuales, resultados importados y coincidencias Deezer; actualiza la lista al pausar o fallar además de al terminar.
