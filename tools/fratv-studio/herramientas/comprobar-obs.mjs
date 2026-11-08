/* Prueba explícita dentro de OBS. Nunca cambia puertos, credenciales o colecciones. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { channels, stamp, sha } from './common.mjs';
import { verify } from './verificar.mjs';
const args = process.argv.slice(2);
const mode = args.find(arg => arg.startsWith('--'));
const root = resolve(args.find(arg => !arg.startsWith('--')) || resolve(import.meta.dirname, '..'));
if (!['--comprobar', '--ejecutar'].includes(mode) || args.filter(arg => arg.startsWith('--')).length !== 1) {
  console.log('Uso: node herramientas/comprobar-obs.mjs [carpeta-kit] --comprobar|--ejecutar');
  console.log('--comprobar solo lee. --ejecutar prueba los cuatro relojes y la vista previa, con salidas inactivas y relojes pausados en su punto de reinicio.');
  process.exit(2);
}
const functional = mode === '--ejecutar';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const base = 'http://127.0.0.1:5178';
let socket, eventUnsafe = false, original = null, output = null, touched = false;
const requests = new Map();
const report = { schema: 'fratv-obs-native/1', createdAt: new Date().toISOString(), context: 'equipo-local-de-esta-ejecucion', readOnly: !functional, checks: [], automatedNativePass: false, productionReady: false, manualReviewRequired: true };
const originalClocks = new Map();
const logical = state => Object.fromEntries(['mode', 'durationMs', 'valueMs', 'running', 'visible'].map(key => [key, state[key]]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function rpc(type, data = {}) {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => { requests.delete(requestId); reject(Error(`OBS no respondió a ${type}.`)); }, 7000);
    requests.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ op: 6, d: { requestType: type, requestId, requestData: data } }));
  });
}
async function connect() {
  const file = join(homedir(), 'Library/Application Support/obs-studio/plugin_config/obs-websocket/config.json');
  let config;
  try { config = JSON.parse(await readFile(file, 'utf8')); } catch { throw Error('No se pudo leer la configuración existente de OBS WebSocket. No se cambió nada.'); }
  if (!config.server_enabled || !config.auth_required || !config.server_password || !Number.isInteger(config.server_port))
    throw Error('Se requiere el servidor WebSocket existente habilitado con autenticación. Configúralo manualmente en OBS si decides usar esta prueba.');
  const password = config.server_password;
  const port = config.server_port;
  config = null;
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('OBS no respondió a la autenticación local.')), 7000);
    socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('No se pudo conectar a OBS local.')); });
    socket.addEventListener('close', () => {
      clearTimeout(timer); reject(Error('OBS cerró la conexión local.'));
      for (const request of requests.values()) { clearTimeout(request.timer); request.reject(Error('Se perdió la conexión con OBS.')); }
      requests.clear();
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.op === 0) {
        if (!message.d.authentication) { clearTimeout(timer); reject(Error('OBS no solicitó autenticación; no se ejecutará la prueba.')); socket.close(); return; }
        const digest = text => createHash('sha256').update(text).digest('base64');
        const authentication = digest(digest(password + message.d.authentication.salt) + message.d.authentication.challenge);
        socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication, eventSubscriptions: 64 } }));
      } else if (message.op === 2) { clearTimeout(timer); resolve(); }
      else if (message.op === 5 && message.d.eventData?.outputActive === true) eventUnsafe = true;
      else if (message.op === 7) {
        const request = requests.get(message.d.requestId);
        if (!request) return;
        clearTimeout(request.timer); requests.delete(message.d.requestId);
        if (message.d.requestStatus.result) request.resolve(message.d.responseData || {});
        else {
          const error = Error(`OBS rechazó ${message.d.requestType} (código ${message.d.requestStatus.code}).`);
          error.statusCode = message.d.requestStatus.code;
          error.statusComment = message.d.requestStatus.comment;
          request.reject(error);
        }
      }
    });
  });
}
async function outputsInactive() {
  const states = {};
  // OBS devuelve 604 cuando estas dos salidas opcionales no están disponibles:
  // https://github.com/obsproject/obs-websocket/blob/master/src/requesthandler/RequestHandler_Outputs.cpp
  const unavailable = { GetVirtualCamStatus: 'VirtualCam is not available.', GetReplayBufferStatus: 'Replay buffer is not available.' };
  for (const request of ['GetStreamStatus', 'GetRecordStatus', 'GetVirtualCamStatus', 'GetReplayBufferStatus']) {
    try {
      const state = await rpc(request);
      if (typeof state.outputActive !== 'boolean') throw Error(`OBS no informó el estado de ${request}.`);
      states[request] = state.outputActive;
      if (state.outputActive) throw Error('Hay una salida activa. No se controlarán relojes ni vistas durante emisión, grabación, cámara virtual o replay.');
    } catch (error) {
      if (unavailable[request] && error.statusCode === 604 && error.statusComment === unavailable[request]) states[request] = 'no-disponible';
      else throw error;
    }
  }
  // Revisa también salidas de plugins, sin imprimir sus nombres ni configuraciones.
  const list = await rpc('GetOutputList');
  if (!Array.isArray(list.outputs) || list.outputs.some(output => output.outputActive !== false))
    throw Error('Existe una salida activa o de estado desconocido. No se realizará la prueba.');
  states.allOutputsChecked = list.outputs.length;
  return states;
}
async function guard() {
  if (eventUnsafe) throw Error('OBS notificó una salida activa. La prueba se detuvo.');
  await outputsInactive();
  if (original) {
    const collection = await rpc('GetSceneCollectionList');
    const program = await rpc('GetCurrentProgramScene');
    if (collection.currentSceneCollectionName !== original.collection || program.currentProgramSceneName !== original.program)
      throw Error('La colección o escena de programa cambió durante la prueba. Se detuvo para evitar actuar sobre otra operación.');
  }
}
async function api(clock, action) {
  if (action) await guard();
  const response = await fetch(`${base}/api/live/${clock.channel}`, action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }), signal: AbortSignal.timeout(5000) } : { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error(`El servicio local rechazó el control de ${clock.label}.`);
  return response.json();
}
async function mutate(type, data) { await guard(); return rpc(type, data); }
async function picture(clock, suffix, expectedVisible) {
  await guard();
  const capture = await rpc('GetSourceScreenshot', { sourceName: clock.input, imageFormat: 'png', imageWidth: 960, imageHeight: 540 });
  if (!/^data:image\/png;base64,/.test(capture.imageData || '')) throw Error(`OBS no entregó PNG de ${clock.label}.`);
  const bytes = Buffer.from(capture.imageData.split(',')[1], 'base64');
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('La captura no es un PNG válido.');
  const file = `${clock.key}-${suffix}.png`;
  await writeFile(join(output, file), bytes);
  const metric = flags => Number(execFileSync('magick', [join(output, file), ...flags, 'info:'], { encoding: 'utf8' }).trim());
  const alpha = metric(['-alpha', 'extract', '-format', '%[fx:mean]']);
  const variation = metric(['-background', 'black', '-alpha', 'remove', '-format', '%[fx:standard_deviation]']);
  if (expectedVisible && !(alpha > 0.0001 && variation > 0.003)) throw Error(`${clock.label}: la captura parece vacía o negra.`);
  if (!expectedVisible && alpha > 0.00001) throw Error(`${clock.label}: la gráfica sigue dibujada después de ocultarla.`);
  return { file, sha256: sha(bytes), alpha, variation };
}
async function restore() {
  if (!touched || report.restored) return;
  await guard();
  for (const clock of channels) {
    const before = originalClocks.get(clock.channel);
    await api(clock, 'reset');
    await api(clock, before.visible ? 'show' : 'hide');
    if (!equal(logical(await api(clock)), before)) throw Error(`No se pudo restaurar exactamente el estado lógico de ${clock.label}.`);
  }
  if (original.studio) await mutate('SetCurrentPreviewScene', { sceneName: original.preview });
  else {
    await mutate('SetCurrentPreviewScene', { sceneName: original.program });
    await mutate('SetStudioModeEnabled', { studioModeEnabled: false });
  }
  report.restored = { clockStates: true, programScene: true, preview: true, studioMode: true };
}
try {
  await verify(root);
  if (process.platform !== 'darwin') throw Error('Esta prueba está preparada para OBS en macOS.');
  await connect();
  report.outputs = await outputsInactive();
  const version = await rpc('GetVersion'); report.obsVersion = version.obsVersion;
  const collection = await rpc('GetSceneCollectionList');
  const scenes = await rpc('GetSceneList');
  const studio = await rpc('GetStudioModeEnabled');
  const program = await rpc('GetCurrentProgramScene');
  original = { collection: collection.currentSceneCollectionName, program: program.currentProgramSceneName, studio: studio.studioModeEnabled, preview: studio.studioModeEnabled ? (await rpc('GetCurrentPreviewScene')).currentPreviewSceneName : null };
  report.collection = original.collection;
  const inputs = (await rpc('GetInputList', { inputKind: 'browser_source' })).inputs.filter(input => input.inputName.startsWith('FRATERNIDAD FUENTE · '));
  const resolved = [];
  for (const clock of channels) {
    const matches = [];
    for (const input of inputs) {
      const settings = (await rpc('GetInputSettings', { inputName: input.inputName })).inputSettings;
      let url; try { url = new URL(settings.url); } catch { continue; }
      if (url.origin === base && url.pathname === `/live/${clock.resource}` && url.searchParams.get('channel') === clock.channel) matches.push(input.inputName);
    }
    if (matches.length !== 1) throw Error(`Falta una fuente única de ${clock.label} con el canal y URL del kit.`);
    const matchingScenes = [];
    for (const scene of scenes.scenes.filter(scene => scene.sceneName.startsWith('FRATERNIDAD · '))) {
      const items = (await rpc('GetSceneItemList', { sceneName: scene.sceneName })).sceneItems;
      if (items.some(item => item.sourceName === matches[0] && item.sceneItemEnabled)) matchingScenes.push(scene.sceneName);
    }
    if (matchingScenes.length !== 1) throw Error(`No se encontró una escena habilitada única para ${clock.label}.`);
    const state = await api(clock);
    if (state.running || state.mode !== clock.mode || state.valueMs !== (state.mode === 'elapsed' ? 0 : state.durationMs) || state.durationMs < 10000)
      throw Error(`${clock.label} no está pausado en su punto de reinicio con el modo esperado. No se cambió ningún reloj; revísalo manualmente antes de ejecutar.`);
    originalClocks.set(clock.channel, logical(state));
    resolved.push({ ...clock, input: matches[0], scene: matchingScenes[0] });
  }
  report.before = Object.fromEntries(originalClocks);
  const dockResponse = await fetch(`${base}/live-control?grupo=fraternidad`, { signal: AbortSignal.timeout(5000) });
  const dock = await dockResponse.text();
  if (!dockResponse.ok || channels.some(clock => !dock.includes(clock.channel))) throw Error('El dock servido no contiene los cuatro canales.');
  const userSettings = await readFile(join(homedir(), 'Library/Application Support/obs-studio/user.ini'), 'utf8');
  const docksLine = userSettings.split(/\r?\n/).find(line => /^ExtraBrowserDocks=/i.test(line));
  let docks = []; try { docks = JSON.parse((docksLine || '').slice((docksLine || '').indexOf('=') + 1)); } catch {}
  report.dock = { served: true, registeredInSavedConfig: docks.some(item => { try { const url = new URL(item.url); return url.origin === base && url.pathname === '/live-control' && url.searchParams.get('grupo') === 'fraternidad'; } catch { return false; } }) };
  if (!report.dock.registeredInSavedConfig) throw Error('El dock no figura en la configuración guardada. Agrégalo y guarda OBS normalmente antes de repetir.');
  report.preconditionsPassed = true;
  if (!functional) {
    console.log(JSON.stringify(report, null, 2));
    console.log('Solo lectura: no se enviaron acciones, no se cambió la vista previa y no se generaron capturas. Esto todavía no acredita la prueba funcional.');
  } else {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    output = join(root, 'resultados-equipo-local', `${stamp()}-${randomUUID().slice(0, 6)}`);
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'estado-previo.json'), JSON.stringify({ scenes: original, clocks: report.before }, null, 2));
    await guard(); touched = true;
    if (!original.studio) await mutate('SetStudioModeEnabled', { studioModeEnabled: true });
    for (const clock of resolved) {
      await mutate('SetCurrentPreviewScene', { sceneName: clock.scene });
      await api(clock, 'show');
      await sleep(2200);
      const initial = await picture(clock, 'reinicio', true);
      const otherClocks = new Map(await Promise.all(channels.filter(item => item.channel !== clock.channel).map(async item => [item.channel, logical(await api(item))])));
      await api(clock, 'start');
      await sleep(2300);
      const paused = await api(clock, 'pause');
      if (paused.running || (clock.mode === 'elapsed' ? paused.valueMs < 1500 : paused.valueMs >= paused.durationMs - 1500)) throw Error(`${clock.label}: el reloj no avanzó y pausó como corresponde.`);
      await sleep(900);
      const frozen = await api(clock);
      if (frozen.valueMs !== paused.valueMs) throw Error(`${clock.label}: el reloj cambió mientras estaba pausado.`);
      const capture = await picture(clock, 'pausado', true);
      if (capture.sha256 === initial.sha256) throw Error(`${clock.label}: la imagen no cambió después de avanzar el reloj.`);
      await api(clock, 'hide'); await sleep(900);
      const hidden = await picture(clock, 'oculto', false);
      await api(clock, 'show'); await sleep(900);
      const shown = await picture(clock, 'visible', true);
      await api(clock, 'reset');
      const reset = await api(clock);
      if (reset.running || reset.valueMs !== originalClocks.get(clock.channel).valueMs) throw Error(`${clock.label}: no volvió a su punto de reinicio.`);
      for (const other of channels.filter(item => item.channel !== clock.channel)) if (!equal(logical(await api(other)), otherClocks.get(other.channel))) throw Error('Otro canal cambió durante la prueba.');
      report.checks.push({ clock: clock.key, source: clock.input, scene: clock.scene, startValueMs: originalClocks.get(clock.channel).valueMs, pausedValueMs: paused.valueMs, resetValueMs: reset.valueMs, captures: { initial, paused: capture, hidden, shown }, isolated: true, passed: true });
      await api(clock, originalClocks.get(clock.channel).visible ? 'show' : 'hide');
    }
    await restore();
    report.automatedNativePass = report.checks.length === 4;
    report.pending = ['Revisión visual de las cifras en las cuatro capturas pausadas', 'Operar los controles desde el dock nativo; el script verifica su API y registro, no simula clics en su interfaz', 'Ensayo local prolongado y rendimiento del hardware', 'Dos ciclos de cierre/apertura normal de OBS en este equipo'];
    await writeFile(join(output, 'comprobacion-obs.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ automatedNativePass: report.automatedNativePass, productionReady: false, report: join(output, 'comprobacion-obs.json'), restored: report.restored, pending: report.pending }, null, 2));
  }
} catch (error) {
  report.error = error.message;
  if (touched) {
    try { await restore(); } catch (restoreError) { report.restorationError = restoreError.message; report.manualRecoveryRequired = true; }
  }
  if (output) await writeFile(join(output, 'comprobacion-obs.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ ok: false, error: report.error, restored: report.restored || false, manualRecoveryRequired: Boolean(report.manualRecoveryRequired), report: output ? join(output, 'comprobacion-obs.json') : null }, null, 2));
  process.exitCode = 1;
} finally { if (socket) socket.close(); }
