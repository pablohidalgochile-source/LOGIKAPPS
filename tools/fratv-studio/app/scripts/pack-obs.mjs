/* FRATV · generador de colección de escenas para OBS.
   Produce un .json que OBS importa de una vez, con las capas ya colocadas.

   Decide solo qué fuente usar para cada recurso:
     · texto que cambia por transmisión  -> browser_source (editable por URL)
     · contenido fijo                    -> ffmpeg_source (video con alfa)
     · estático                          -> image_source (PNG)

   Uso:
     node pack-obs.mjs                 fps 60, mezcla recomendada
     node pack-obs.mjs --fps=30
     node pack-obs.mjs --modo=vivo     todo como browser_source
     node pack-obs.mjs --modo=video    todo lo que se pueda, como video
     node pack-obs.mjs --puerto=8790   puerto del servidor local
     node pack-obs.mjs --aspecto=9:16  catálogo vertical

   OJO: el tamaño del lienzo en OBS es del PERFIL, no de la colección. Para la
   colección vertical hace falta un perfil a 1080×1920, o Aitum Vertical.
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
const MODO   = args.modo || 'mixto';
const PUERTO = Number(args.puerto || 8790);
const TEMA   = args.tema || 'fratv-oficial';

/* Texto que cambia entre transmisiones: tiene que seguir siendo editable.
   En video quedaría quemado el nombre del invitado. */
const EDITABLE = ['lower-third', 'program-title', 'schedule', 'sponsor', 'countdown', 'ticker'];
/* Depende del reloj real: no existe versión en video. */
const SOLO_VIVO = ['countdown'];

const ASPECTO = args.aspecto || '16:9';
const SUF     = ASPECTO.replace(':', 'x');
let CANVAS    = { w: 1920, h: 1080 };   // lo fija el manifiesto más abajo

/* Los archivos exportados llevan el formato en el nombre. Los de antes no lo
   llevaban, así que en 16:9 se acepta también el nombre viejo. */
function buscar(...rutas) { return rutas.find(r => r && existsSync(r)) || null; }

function fuenteBase(nombre, id, settings) {
  return {
    prev_ver: 520093699, name: nombre, uuid: randomUUID(), id, versioned_id: id,
    settings, mixers: 0, sync: 0, flags: 0, volume: 1.0, balance: 0.5,
    enabled: true, muted: false, 'push-to-mute': false, 'push-to-mute-delay': 0,
    'push-to-talk': false, 'push-to-talk-delay': 0, hotkeys: {},
    deinterlace_mode: 0, deinterlace_field_order: 0, monitoring_type: 0, private_settings: {}
  };
}

/* source_uuid es como OBS vincula el item con su fuente: sin eso la escena
   queda vacía al importar, aunque la fuente exista. */
function item(nombre, uuid, extra = {}) {
  return {
    name: nombre, source_uuid: uuid, visible: true, locked: false, rot: 0.0,
    align: 5, bounds_type: 0, bounds_align: 0, bounds_crop: false,
    crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0,
    id: 1, group_item_backup: false,
    pos: { x: 0.0, y: 0.0 }, scale: { x: 1.0, y: 1.0 }, bounds: { x: 0.0, y: 0.0 },
    scale_filter: 'disable', blend_method: 'default', blend_type: 'normal',
    show_transition: { duration: 0 }, hide_transition: { duration: 0 },
    private_settings: {}, ...extra
  };
}

function escena(nombre, items) {
  return fuenteBase(nombre, 'scene', {
    custom_size: false, id_counter: items.length,
    items: items.map((it, i) => ({ ...it, id: i + 1 }))
  });
}

function urlDe(rec) {
  const p = new URLSearchParams({ tema: TEMA, tipo: 'aprobado', aspecto: ASPECTO });
  for (const f of rec.fields || []) {
    if (f.default != null && typeof f.default === 'string') p.set(f.key, f.default);
  }
  return `http://localhost:${PUERTO}/${rec.file}?${p}`;
}

function decidir(rec) {
  if (SOLO_VIVO.includes(rec.id)) return 'vivo';
  if (MODO === 'vivo') return 'vivo';
  if (!rec.durationMs) return 'png';
  if (MODO === 'video') return 'video';
  return EDITABLE.includes(rec.id) ? 'vivo' : 'video';
}

async function main() {
  const man = JSON.parse(await readFile(join(HANDOFF, 'manifest.json'), 'utf8'));
  const medidas = man.aspects[ASPECTO];
  if (!medidas) { console.error(`Formato desconocido: ${ASPECTO}`); process.exit(1); }
  CANVAS = { w: medidas.w, h: medidas.h };

  const fuentes = [];
  const porId = {};
  const uuidDe = {};
  const informe = [];

  for (const rec of man.resources) {
    if (!rec.aspects.includes(ASPECTO)) {
      informe.push({ id: rec.id, estado: `no existe en ${ASPECTO}, omitido` });
      continue;
    }
    const modo = decidir(rec);
    const nombre = 'FRATV_' + rec.id.toUpperCase().replace(/-/g, '_');
    let fuente = null, nota = '';

    if (modo === 'vivo') {
      fuente = fuenteBase(nombre, 'browser_source', {
        url: urlDe(rec), width: CANVAS.w, height: CANVAS.h,
        restart_when_active: !rec.loop, reroute_audio: false,
        shutdown: true, fps_custom: false
      });
      nota = 'navegador · editable por URL';
    } else if (modo === 'png') {
      const f = buscar(join(PACK, 'png', `${rec.id}_${SUF}.png`),
                       ASPECTO === '16:9' ? join(PACK, 'png', `${rec.id}.png`) : null);
      if (!f) { informe.push({ id: rec.id, estado: `falta el PNG ${SUF}, omitido` }); continue; }
      fuente = fuenteBase(nombre, 'image_source', { file: f, unload: false });
      nota = 'PNG estático';
    } else {
      const f = buscar(join(PACK, 'video', `${rec.id}_${SUF}_${FPS}fps_alfa.mov`),
                       ASPECTO === '16:9' ? join(PACK, 'video', `${rec.id}_${FPS}fps_alfa.mov`) : null);
      const archivo = f || buscar(
        join(PACK, 'video', `${rec.id}_${SUF}_${FPS}fps.mp4`),
        ASPECTO === '16:9' ? join(PACK, 'video', `${rec.id}_${FPS}fps.mp4`) : null);
      if (!archivo) { informe.push({ id: rec.id, estado: `falta el video ${SUF}, omitido` }); continue; }
      fuente = fuenteBase(nombre, 'ffmpeg_source', {
        local_file: archivo, is_local_file: true,
        looping: rec.loop, restart_on_activate: !rec.loop,
        close_when_inactive: !rec.loop, hw_decode: true, clear_on_media_end: !rec.loop
      });
      nota = `video ${FPS}fps` + (rec.loop ? ' en bucle' : ' una pasada');
    }

    fuentes.push(fuente);
    porId[rec.id] = nombre;
    uuidDe[nombre] = fuente.uuid;
    informe.push({ id: rec.id, estado: nota });
  }

  /* Capas que acompañan a toda transmisión. El orden importa: en OBS el
     primer item de la lista queda arriba del todo. */
  const permanentes = ['flag', 'live-badge', 'ticker'].filter(id => porId[id]);
  const disparables = ['lower-third', 'program-title', 'schedule', 'sponsor'].filter(id => porId[id]);

  const capas = escena('FRATV_CAPAS', permanentes.map(id => item(porId[id], uuidDe[porId[id]])));
  fuentes.push(capas);
  uuidDe['FRATV_CAPAS'] = capas.uuid;

  /* Escenas de programa. Traen las capas como una sola fuente anidada:
     se corrige en un solo lugar y cambia en todas. */
  const programa = [
    ['FRATV 01 · PRE-SHOW',   ['bumper-in'],  false],
    ['FRATV 02 · EN VIVO',    [],             true],
    ['FRATV 03 · ENTREVISTA', [],             true],
    ['FRATV 04 · PAUSA',      ['bumper-in'],  false],
    ['FRATV 05 · CIERRE',     ['bumper-out'], false],
    ['FRATV 06 · CRÉDITOS',   ['end-credits'],false]
  ];
  const nombresEscenas = [];
  for (const [nombre, fondos, conCapas] of programa) {
    const items = [];
    if (conCapas) {
      for (const id of disparables) if (porId[id]) items.push(item(porId[id], uuidDe[porId[id]], { visible: false }));
      items.push(item('FRATV_CAPAS', uuidDe['FRATV_CAPAS']));
    }
    for (const id of fondos) if (porId[id]) items.push(item(porId[id], uuidDe[porId[id]]));
    fuentes.push(escena(nombre, items));
    nombresEscenas.push(nombre);
  }

  /* Escenas sueltas de marca, útiles como fuente de transición o intro. */
  for (const id of ['ident-long', 'stinger']) {
    if (!porId[id]) continue;
    const nombre = 'FRATV · ' + (id === 'stinger' ? 'STINGER' : 'IDENT');
    fuentes.push(escena(nombre, [item(porId[id], uuidDe[porId[id]])]));
    nombresEscenas.push(nombre);
  }

  /* Transición stinger preconfigurada. El punto va en 300 ms: ahí el barrido
     cubre el 100 % del cuadro. Medido: el barrido tapa entero entre los 200 y
     los 580 ms en todos los formatos, así que 400 cae al medio con ~180 ms de
     margen a cada lado. Tiene que ser el .mov con alfa — el .mp4 pintaría un
     fondo opaco sobre toda la mezcla. */
  const stingerMov = buscar(join(PACK, 'video', `stinger_${SUF}_${FPS}fps_alfa.mov`),
                            ASPECTO === '16:9' ? join(PACK, 'video', `stinger_${FPS}fps_alfa.mov`) : null);
  const transiciones = stingerMov ? [{
    name: 'FRATV Stinger',
    id: 'obs_stinger_transition',
    settings: { transition_point: 400, preload: true, path: stingerMov }
  }] : [];
  if (!transiciones.length) informe.push({ id: 'stinger', estado: 'sin .mov con alfa: no se configuró la transición' });

  const coleccion = {
    DisableSaving: false,
    version: 1,
    name: ASPECTO === '16:9' ? `FRATV_OVERLAYS_${FPS}FPS` : `FRATV_OVERLAYS_${SUF}_${FPS}FPS`,
    current_scene: nombresEscenas[1] || nombresEscenas[0],
    current_program_scene: nombresEscenas[1] || nombresEscenas[0],
    scene_order: nombresEscenas.map(name => ({ name })),
    sources: fuentes,
    groups: [],
    quick_transitions: [
      { name: 'Cortar',  duration: 300, hotkeys: {}, id: 1, fade_to_black: false },
      { name: 'Fundido', duration: 300, hotkeys: {}, id: 2, fade_to_black: false }
    ],
    transitions: transiciones,
    current_transition: transiciones.length ? 'FRATV Stinger' : 'Desvanecimiento',
    transition_duration: 300,
    preview_locked: false,
    scaling_enabled: false,
    scaling_level: 0,
    scaling_off_x: 0.0,
    scaling_off_y: 0.0,
    canvases: [],
    modules: { 'scripts-tool': [], 'output-timer': {}, 'auto-scene-switcher': { interval: 300, non_matching_scene: '', switch_if_not_matching: false, active: false, switches: [] } },
    saved_projectors: [],
    'virtual-camera': { type2: 3 },
    resolution: { x: CANVAS.w, y: CANVAS.h },
    fps: { numerator: FPS, denominator: 1 }
  };

  await mkdir(PACK, { recursive: true });
  const salida = join(PACK, `${coleccion.name}.json`);
  await writeFile(salida, JSON.stringify(coleccion, null, 2));

  console.log(`\n  FRATV · colección para OBS`);
  console.log(`  ${'─'.repeat(56)}`);
  for (const r of informe) console.log(`  ${r.id.padEnd(15)} ${r.estado}`);
  console.log(`  ${'─'.repeat(56)}`);
  console.log(`  ${nombresEscenas.length} escenas · ${fuentes.length} fuentes · ${FPS} fps`);
  console.log(`  → ${salida}\n`);
}

main().catch(e => { console.error('\n  Falló:', e.message, '\n'); process.exit(1); });
