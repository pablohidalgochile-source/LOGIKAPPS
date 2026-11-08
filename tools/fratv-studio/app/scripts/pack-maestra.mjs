/* FRATV · colección maestra para OBS.
   Una sola colección de producción: las entradas reales del estudio más los
   15 recursos de marca, con la transición stinger ya configurada.

   El switcheo de cámaras se hace en la ATEM Mini Extreme ISO, así que OBS
   recibe UNA señal de programa por USB-C, no cinco cámaras sueltas.

   Uso:  node pack-maestra.mjs [--fps=60] [--puerto=8790] [--aspecto=16:9]

   El formato cambia el lienzo, los archivos de video que se enlazan y el
   nombre de la colección. OJO: el tamaño del lienzo en OBS es una propiedad
   del PERFIL, no de la colección de escenas. Importar la colección vertical
   sobre un perfil de 1920×1080 deja todo deformado: hay que crear un perfil
   aparte a 1080×1920, o usar Aitum Vertical, que mantiene un solo perfil
   horizontal y saca el vertical por su propio lienzo.
*/
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const AQUI    = dirname(fileURLToPath(import.meta.url));
const RAIZ    = resolve(AQUI, '..');
const HANDOFF = join(RAIZ, 'handoff');
const PACK    = join(RAIZ, 'pack');

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const FPS    = Number(args.fps || 60);
const PUERTO = Number(args.puerto || 8790);
const TEMA    = args.tema || 'fratv-oficial';
const ASPECTO = args.aspecto || '16:9';
const SUF     = ASPECTO.replace(':', 'x');

/* Texto que cambia entre transmisiones: va por navegador para poder editarlo
   sin re-exportar. El resto va como video. */
const EDITABLE  = ['lower-third', 'program-title', 'schedule', 'sponsor', 'countdown', 'ticker'];
const SOLO_VIVO = ['countdown'];

const uuids = {};

function fuente(nombre, id, settings, extra = {}) {
  const uuid = randomUUID();
  uuids[nombre] = uuid;
  return {
    prev_ver: 520093699, name: nombre, uuid, id, versioned_id: id, settings,
    mixers: extra.mixers ?? 0, sync: 0, flags: 0, volume: 1.0, balance: 0.5,
    enabled: true, muted: false, 'push-to-mute': false, 'push-to-mute-delay': 0,
    'push-to-talk': false, 'push-to-talk-delay': 0, hotkeys: {},
    deinterlace_mode: 0, deinterlace_field_order: 0, monitoring_type: 0, private_settings: {}
  };
}

function item(nombre, extra = {}) {
  return {
    name: nombre, source_uuid: uuids[nombre], visible: true, locked: false, rot: 0.0,
    align: 5, bounds_type: 0, bounds_align: 0, bounds_crop: false,
    crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0,
    id: 1, group_item_backup: false,
    pos: { x: 0.0, y: 0.0 }, scale: { x: 1.0, y: 1.0 }, bounds: { x: 0.0, y: 0.0 },
    scale_filter: 'disable', blend_method: 'default', blend_type: 'normal',
    show_transition: { duration: 0 }, hide_transition: { duration: 0 },
    private_settings: {}, ...extra
  };
}

const escena = (nombre, items) => fuente(nombre, 'scene', {
  custom_size: false, id_counter: items.length + 1,
  items: items.map((it, i) => ({ ...it, id: i + 1 }))
});

function urlDe(rec) {
  const p = new URLSearchParams({ tema: TEMA, tipo: 'aprobado', aspecto: ASPECTO });
  for (const f of rec.fields || []) {
    if (typeof f.default === 'string') p.set(f.key, f.default);
  }
  return `http://localhost:${PUERTO}/${rec.file}?${p}`;
}

const man = JSON.parse(await readFile(join(HANDOFF, 'manifest.json'), 'utf8'));
const medidas = man.aspects[ASPECTO];
if (!medidas) { console.error(`Formato desconocido: ${ASPECTO}`); process.exit(1); }
const W = medidas.w, H = medidas.h;

/* Los archivos exportados llevan el formato en el nombre desde que el
   exportador es multiformato. Los anteriores no lo llevaban, así que para
   16:9 se acepta también el nombre viejo y no se rompe un pack ya generado. */
function buscar(...rutas) { return rutas.find(r => r && existsSync(r)) || null; }
const fuentes = [];
const nombreDe = {};
const informe = [];

/* ── 1 · Entradas del estudio ─────────────────────────────────────────────
   El dispositivo se deja sin fijar a propósito: se elige una vez en OBS con
   todo conectado, igual que ya se hacía. */
fuentes.push(fuente('ATEM · PROGRAMA', 'av_capture_input', {
  device: '', use_preset: false, buffering: false,
  resolution: JSON.stringify({ width: W, height: H }), frame_rate: { numerator: FPS, denominator: 1 }
}));
fuentes.push(fuente('VIDEO EXTRA', 'av_capture_input', {
  device: '', use_preset: false, buffering: false
}));
fuentes.push(fuente('AUDIO 1', 'coreaudio_input_capture', { device_id: 'default' }, { mixers: 255 }));
fuentes.push(fuente('AUDIO 2', 'coreaudio_input_capture', { device_id: 'default' }, { mixers: 255 }));

/* Dos navegadores libres, para lo que haga falta en el momento. */
for (const n of ['NAVEGADOR 1', 'NAVEGADOR 2']) {
  fuentes.push(fuente(n, 'browser_source', {
    url: 'about:blank', width: W, height: H,
    restart_when_active: true, reroute_audio: false, shutdown: true
  }));
}

/* ── 2 · Los 15 recursos de marca ─────────────────────────────────────── */
for (const rec of man.resources) {
  if (!rec.aspects.includes(ASPECTO)) { informe.push([rec.id, `no existe en ${ASPECTO}, omitido`]); continue; }
  const nombre = 'FRATV_' + rec.id.toUpperCase().replace(/-/g, '_');
  const porNavegador = SOLO_VIVO.includes(rec.id) || EDITABLE.includes(rec.id);
  let nota;

  if (porNavegador) {
    fuentes.push(fuente(nombre, 'browser_source', {
      url: urlDe(rec), width: W, height: H,
      restart_when_active: !rec.loop, reroute_audio: false, shutdown: true
    }));
    nota = 'navegador · editable por URL';
  } else if (!rec.durationMs) {
    const f = buscar(join(PACK, 'png', `${rec.id}_${SUF}.png`),
                     ASPECTO === '16:9' ? join(PACK, 'png', `${rec.id}.png`) : null);
    if (!f) { informe.push([rec.id, `falta el PNG ${SUF}, omitido`]); continue; }
    fuentes.push(fuente(nombre, 'image_source', { file: f, unload: false }));
    nota = 'PNG estático';
  } else {
    const archivo = buscar(
      join(PACK, 'video', `${rec.id}_${SUF}_${FPS}fps_alfa.mov`),
      join(PACK, 'video', `${rec.id}_${SUF}_${FPS}fps.mp4`),
      ASPECTO === '16:9' ? join(PACK, 'video', `${rec.id}_${FPS}fps_alfa.mov`) : null,
      ASPECTO === '16:9' ? join(PACK, 'video', `${rec.id}_${FPS}fps.mp4`) : null);
    if (!archivo) { informe.push([rec.id, `falta el video ${SUF}, omitido`]); continue; }
    fuentes.push(fuente(nombre, 'ffmpeg_source', {
      local_file: archivo, is_local_file: true, looping: rec.loop,
      restart_on_activate: !rec.loop, close_when_inactive: !rec.loop,
      clear_on_media_end: !rec.loop, hw_decode: true
    }));
    nota = `video ${FPS}fps` + (rec.loop ? ' en bucle' : ' una pasada');
  }
  nombreDe[rec.id] = nombre;
  informe.push([rec.id, nota]);
}

/* ── 3 · Capas permanentes, en una escena reutilizable ────────────────── */
const capas = ['flag', 'live-badge', 'ticker'].filter(id => nombreDe[id]);
fuentes.push(escena('FRATV_CAPAS', capas.map(id => item(nombreDe[id]))));

/* ── 4 · Escenas de programa ──────────────────────────────────────────── */
const AUDIOS = ['AUDIO 1', 'AUDIO 2'];
const DISPARABLES = ['lower-third', 'program-title', 'schedule', 'sponsor'].filter(id => nombreDe[id]);

function enVivo(nombre, fondo) {
  const items = [];
  /* Primero lo que va arriba: los disparables ocultos, listos para mostrar. */
  for (const id of DISPARABLES) items.push(item(nombreDe[id], { visible: false }));
  items.push(item('NAVEGADOR 1', { visible: false }));
  items.push(item('NAVEGADOR 2', { visible: false }));
  items.push(item('FRATV_CAPAS'));
  items.push(item(fondo));                      // la imagen, al fondo
  for (const a of AUDIOS) items.push(item(a));
  return escena(nombre, items);
}

function pantallaCompleta(nombre, recurso) {
  const items = [];
  if (nombreDe[recurso]) items.push(item(nombreDe[recurso]));
  for (const a of AUDIOS) items.push(item(a));
  return escena(nombre, items);
}

const orden = [];
const añadir = (f) => { fuentes.push(f); orden.push(f.name); };

añadir(pantallaCompleta('FRATV 01 · PRE-SHOW', 'bumper-in'));
añadir(enVivo('FRATV 02 · EN VIVO', 'ATEM · PROGRAMA'));
añadir(enVivo('FRATV 03 · ENTREVISTA', 'ATEM · PROGRAMA'));
añadir(enVivo('FRATV 04 · VIDEO EXTRA', 'VIDEO EXTRA'));
añadir(pantallaCompleta('FRATV 05 · PAUSA', 'bumper-in'));
añadir(pantallaCompleta('FRATV 06 · CIERRE', 'bumper-out'));
añadir(pantallaCompleta('FRATV 07 · CRÉDITOS', 'end-credits'));
if (nombreDe['ident-long']) añadir(escena('FRATV · IDENT', [item(nombreDe['ident-long'])]));
if (nombreDe['engagement']) añadir(enVivo('FRATV · INTERACCIÓN', 'ATEM · PROGRAMA'));

/* ── 5 · Transición stinger ───────────────────────────────────────────── */
/* Punto de corte: 400 ms. Medido, no estimado. El barrido tapa el cuadro
   entero entre los 200 y los 580 ms en todos los formatos (la retención de
   los fotogramas 40 %–60 % es justamente para eso), así que 400 cae al medio
   y deja ~180 ms de margen a cada lado por si el reloj de OBS se desvía. */
const stingerMov = buscar(
  join(PACK, 'video', `stinger_${SUF}_${FPS}fps_alfa.mov`),
  ASPECTO === '16:9' ? join(PACK, 'video', `stinger_${FPS}fps_alfa.mov`) : null);
const transiciones = stingerMov ? [{
  name: 'FRATV Stinger', id: 'obs_stinger_transition',
  settings: { transition_point: 400, preload: true, path: stingerMov }
}] : [];

const coleccion = {
  DisableSaving: false,
  version: 1,
  name: ASPECTO === '16:9' ? `FRATV_MAESTRA_${FPS}FPS` : `FRATV_MAESTRA_${SUF}_${FPS}FPS`,
  current_scene: orden[1],
  current_program_scene: orden[1],
  scene_order: orden.map(name => ({ name })),
  sources: fuentes,
  groups: [],
  quick_transitions: [
    { name: 'Cortar',  duration: 300, hotkeys: {}, id: 1, fade_to_black: false },
    { name: 'Fundido', duration: 300, hotkeys: {}, id: 2, fade_to_black: false }
  ],
  transitions: transiciones,
  current_transition: transiciones.length ? 'FRATV Stinger' : 'Desvanecimiento',
  transition_duration: 300,
  preview_locked: false, scaling_enabled: false, scaling_level: 0,
  scaling_off_x: 0.0, scaling_off_y: 0.0, canvases: [],
  modules: { 'scripts-tool': [], 'output-timer': {},
             'auto-scene-switcher': { interval: 300, non_matching_scene: '', switch_if_not_matching: false, active: false, switches: [] } },
  saved_projectors: [], 'virtual-camera': { type2: 3 },
  resolution: { x: W, y: H }, fps: { numerator: FPS, denominator: 1 }
};

await mkdir(PACK, { recursive: true });
const salida = join(PACK, `${coleccion.name}.json`);
await writeFile(salida, JSON.stringify(coleccion, null, 2));

console.log(`\n  FRATV · colección maestra`);
console.log(`  ${'─'.repeat(58)}`);
console.log(`  Entradas: ATEM · PROGRAMA · VIDEO EXTRA · AUDIO 1 · AUDIO 2 · 2 navegadores\n`);
for (const [id, nota] of informe) console.log(`  ${id.padEnd(15)} ${nota}`);
console.log(`  ${'─'.repeat(58)}`);
console.log(`  ${orden.length} escenas · ${fuentes.length} fuentes · ${FPS} fps`);
console.log(`  transición: ${coleccion.current_transition}`);
console.log(`  → ${salida}`);
if (ASPECTO !== '16:9') {
  console.log(`\n  ⚠  El lienzo en OBS es del PERFIL, no de la colección.`);
  console.log(`     Crea un perfil a ${W}×${H} antes de importar esta colección,`);
  console.log(`     o usa Aitum Vertical y toma de aquí solo las fuentes.\n`);
} else { console.log(''); }
