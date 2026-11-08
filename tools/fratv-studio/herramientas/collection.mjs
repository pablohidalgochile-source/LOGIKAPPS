/* Solo se transportan campos conocidos; la configuración privada de OBS no viaja. */
import { basename } from 'node:path';
import { channels, media, marker, liveUrl } from './common.mjs';
const pick = (value, names) => Object.fromEntries(names.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
const sourceFields = ['prev_ver', 'name', 'uuid', 'id', 'versioned_id', 'mixers', 'sync', 'flags', 'volume', 'balance', 'enabled', 'muted', 'deinterlace_mode', 'deinterlace_field_order', 'monitoring_type', 'monitoring_enabled'];
const itemFields = ['name', 'source_uuid', 'visible', 'locked', 'rot', 'scale_ref', 'align', 'bounds_type', 'bounds_align', 'bounds_crop', 'crop_left', 'crop_top', 'crop_right', 'crop_bottom', 'id', 'group_item_backup', 'pos', 'pos_rel', 'scale', 'scale_rel', 'bounds', 'bounds_rel', 'scale_filter', 'blend_method', 'blend_type'];
function mediaPath(value) {
  const found = media.find(path => basename(path) === basename(value || ''));
  if (!found) throw Error('La colección solicita un medio no incluido en la lista permitida.');
  return `${marker}/${found}`;
}
function cleanBrowser(settings) {
  const output = pick(settings, ['width', 'height', 'fps', 'fps_custom', 'shutdown', 'restart_when_active', 'reroute_audio']);
  const url = new URL(settings.url || 'about:blank');
  const clock = channels.find(item => url.pathname === `/live/${item.resource}`);
  if (clock) return { ...output, url: liveUrl(clock) };
  if (url.href === 'about:blank') return { ...output, url: 'about:blank' };
  const allowed = ['lower-third', 'program-title', 'schedule', 'sponsor', 'ticker'];
  if (['localhost', '127.0.0.1'].includes(url.hostname) && allowed.some(id => url.pathname === `/resources/${id}.html`))
    return { ...output, url: `http://127.0.0.1:8790${url.pathname}` };
  throw Error('Hay una URL de navegador ajena al kit; no se copió.');
}
export function sanitizeCollection(original) {
  const sources = original.sources.map(source => {
    const result = { ...pick(source, sourceFields), hotkeys: {}, private_settings: {} };
    const settings = source.settings || {};
    switch (source.id) {
      case 'browser_source': result.settings = cleanBrowser(settings); break;
      case 'ffmpeg_source':
        result.settings = { ...pick(settings, ['close_when_inactive', 'hw_decode', 'is_local_file', 'looping', 'clear_on_media_end', 'restart_on_activate']), local_file: mediaPath(settings.local_file) }; break;
      case 'image_source': result.settings = { ...pick(settings, ['unload']), file: mediaPath(settings.file) }; break;
      case 'av_capture_input':
        result.settings = { ...pick(settings, ['buffering', 'frame_rate', 'resolution', 'use_preset']), device: '' }; break;
      case 'coreaudio_input_capture': result.settings = { device_id: '' }; result.muted = true; break;
      case 'scene':
        result.settings = { ...pick(settings, ['custom_size', 'id_counter']), items: (settings.items || []).map(item => ({ ...pick(item, itemFields), private_settings: {} })) }; break;
      default: throw Error(`Tipo de fuente no permitido: ${source.id}`);
    }
    return result;
  });
  const transitions = (original.transitions || []).map(item => {
    if (item.id !== 'obs_stinger_transition') throw Error('Hay una transición no prevista en el kit.');
    return { name: item.name, id: item.id, settings: { ...pick(item.settings, ['preload', 'transition_point']), path: mediaPath(item.settings.path) } };
  });
  const name = 'FRATV + FRATERNIDAD · plantilla de traslado';
  const full = {
    name, sources, groups: [], scene_order: original.scene_order.map(({ name }) => ({ name })),
    current_scene: 'FRATERNIDAD · 01 INICIO', current_program_scene: 'FRATERNIDAD · 01 INICIO',
    current_transition: original.current_transition, transition_duration: original.transition_duration,
    transitions, resolution: { x: 1920, y: 1080 }, migration_resolution: { x: 1920, y: 1080 }, version: 2,
  };
  const browserIds = new Set(sources.filter(source => source.id === 'browser_source' && channels.some(clock => source.settings.url.startsWith(`http://127.0.0.1:5178/live/${clock.resource}?`))).map(source => source.uuid));
  const scenes = sources.filter(source => source.id === 'scene' && source.settings.items.length === 1 && browserIds.has(source.settings.items[0].source_uuid));
  if (browserIds.size !== 4 || scenes.length !== 4) throw Error('La colección debe contener los cuatro relojes y sus escenas.');
  const clocks = { ...full, name: 'FRATERNIDAD · cuatro relojes · plantilla', sources: sources.filter(source => browserIds.has(source.uuid) || scenes.includes(source)), scene_order: scenes.map(({ name }) => ({ name })), transitions: [], current_transition: 'Fade', transition_duration: 300 };
  return { full, clocks };
}
