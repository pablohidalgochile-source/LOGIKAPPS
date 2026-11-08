import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePatch, adjustFrequency, validateProgram } from '../src/patch.js';
import { buildLocalMeditation } from '../src/local-meditation.js';
import { validateBackup } from '../src/backup-format.js';

test('frecuencias independientes y enlaces conservan sus invariantes incluso en los límites', () => {
  const base = { left: 206, right: 214, carrier: 210, link: 'free' };
  assert.deepEqual(adjustFrequency(base, 'left', 201), { left: 201, right: 214, carrier: 210, beat: 13 });
  const delta = adjustFrequency({ ...base, link: 'delta' }, 'right', 1000);
  assert.equal(delta.right - delta.left, 8); assert.equal(delta.right, 1000);
  const center = adjustFrequency({ ...base, link: 'carrier' }, 'left', 999);
  assert.equal((center.left + center.right) / 2, 210); assert.ok(center.left <= 1000 && center.right >= 20);
  const crossed = adjustFrequency(base, 'left', 250);
  assert.equal(crossed.beat, 36);
});

test('el patch respeta frecuencias L/R directas, silencios y límites numéricos', () => {
  const p = normalizePatch({ leftHz: 173, rightHz: 251, carrierHz: 900, beatHz: 8, volume: 0, binauralGain: 0, leftGain: 0, modulation: 0, noiseAmount: 0, modSpeed: NaN });
  assert.equal(p.leftHz, 173); assert.equal(p.rightHz, 251); assert.equal(p.beatHz, 78);
  for (const key of ['volume','binauralGain','leftGain','modulation','noiseAmount']) assert.equal(p[key], 0);
  assert.ok(Number.isFinite(p.modSpeed)); assert.equal(normalizePatch({ volume: 10 }).volume, .7);
});

test('programas recalculan duración y rechazan etapas que romperían el temporizador', () => {
  const p = { name: 'Prueba', totalMin: 999, stages: [{ name: 'Entrada', durationMin: 5, beatHz: 8, solfeggioHz: 528, modulation: .2 }, { name: 'Cierre', durationMin: 3, beatHz: 6, solfeggioHz: 396, modulation: 0 }] };
  assert.equal(validateProgram(p).totalMin, 8);
  assert.throws(() => validateProgram({ ...p, stages: [{ ...p.stages[0], durationMin: NaN }] }));
  assert.throws(() => validateProgram({ ...p, stages: [] }));
});

test('Forja local aplica variables y genera pausas cercanas a la duración solicitada', () => {
  const m = buildLocalMeditation({ concept: 'Escribir', intention: 'claridad', durationMin: 10, archetype: 'SELENE', variables: [{ id: 'voz', label: 'Tono', kind: 'select', value: 'firme' }, { id: 'respiracion', label: 'Respiración', kind: 'select', value: 'libre' }] });
  assert.match(m.narration, /postura estable/); assert.match(m.narration, /lo que cambia/);
  assert.match(m.desc, /Tono: firme/); assert.equal(m._ai, false);
  const pauses = [...m.narration.matchAll(/\[pausa (\d+)s\]/g)].reduce((s, x) => s + +x[1], 0);
  assert.ok(pauses > 450 && pauses < 600);
});

test('respaldo valida origen, estructura, programas, claves peligrosas y presencia de audios', () => {
  assert.deepEqual(validateBackup({ app: 'binaural-system', version: 1, state: { binauralPresets: [] }, files: [] }).state, { binauralPresets: [] });
  assert.throws(() => validateBackup({ app: 'reset-detox', version: 1, state: {} }));
  assert.throws(() => validateBackup(JSON.parse('{"app":"binaural-system","version":1,"state":{"studioPatch":{"__proto__":{}}}}')));
  assert.throws(() => validateBackup({ app: 'binaural-system', version: 1, state: { binauralExtAudio: [{ id: 'ext_1', name: 'audio.wav' }] }, files: [] }));
  assert.throws(() => validateBackup({ app: 'binaural-system', version: 1, state: { userMeditations: [null] } }));
});
