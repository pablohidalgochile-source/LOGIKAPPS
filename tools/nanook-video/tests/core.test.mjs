import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeURL, selection, summarize, friendlyError } from '../lib.mjs';

test('normaliza videos, Shorts y enlaces compartidos, descartando playlists y seguimiento', () => {
  const expected = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  for (const url of ['https://www.youtube.com/watch?v=jNQXAC9IVRw&list=123', 'https://youtu.be/jNQXAC9IVRw?si=123', 'https://m.youtube.com/shorts/jNQXAC9IVRw', 'https://youtube.com/live/jNQXAC9IVRw']) assert.equal(youtubeURL(url), expected);
});
test('rechaza URLs externas, puertos, credenciales e intentos de inyección', () => {
  for (const url of ['http://127.0.0.1:8000', 'file:///etc/passwd', 'https://youtube.com.evil.test/watch?v=jNQXAC9IVRw', 'https://evil.test@youtube.com/watch?v=jNQXAC9IVRw', 'https://youtube.com:123/watch?v=jNQXAC9IVRw', 'https://youtube.com/playlist?list=123', '--exec=touch /tmp/file', null]) assert.throws(() => youtubeURL(url));
});
test('original conserva la mejor selección; MP4 exige H.264 y AAC', () => {
  assert.deepEqual(selection('original', 'best'), { format: 'bv*+ba/b', container: 'mkv' });
  assert.equal(selection('original', '2160').format, 'bv*[height<=2160]+ba/b[height<=2160]');
  assert.equal(selection('mp4', '1080').format, 'bv[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[height<=1080][ext=mp4][vcodec^=avc1]');
  assert.throws(() => selection('original', '1080];whoami'));
  assert.throws(() => selection('mp3', 'best'));
});
test('calidades reales y compatibilidad se distinguen sin inventar resoluciones', () => {
  const info = summarize({ id: 'jNQXAC9IVRw', title: '<script>title</script>', formats: [
    { height: 2160, vcodec: 'vp9' }, { height: 1080, vcodec: 'avc1.640028' },
    { height: 1080, vcodec: 'vp9' }, { height: 4320, vcodec: 'vp9', has_drm: true }, { vcodec: 'none' },
  ] }, 'url');
  assert.deepEqual(info.heights, [2160, 1080]); assert.deepEqual(info.mp4Heights, [1080]); assert.equal(info.maxHeight, 2160);
  assert.throws(() => summarize({ is_live: true }, 'url'), /transmisión/);
  assert.throws(() => summarize({ formats: [] }, 'url'), /formatos/);
});
test('los errores de YouTube se convierten en acciones comprensibles', () => {
  assert.match(friendlyError('ERROR: Sign in to confirm you’re not a bot'), /iniciar sesión/);
  assert.match(friendlyError('HTTP Error 403: Forbidden'), /rechazó/);
  assert.match(friendlyError('ERROR: Requested format is not available'), /combinación/);
  assert.match(friendlyError('No space left on device'), /espacio/);
});
