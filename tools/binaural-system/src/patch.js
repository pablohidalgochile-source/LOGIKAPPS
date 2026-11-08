export const clamp = (value, min, max, fallback = min) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function normalizePatch(input = {}) {
  const carrierHz = clamp(input.carrierHz ?? 210, 20, 1000, 210);
  const beatHz = clamp(input.beatHz ?? 8, 0, 100, 8);
  const leftHz = clamp(input.leftHz ?? carrierHz - beatHz / 2, 20, 1000, 206);
  const rightHz = clamp(input.rightHz ?? carrierHz + beatHz / 2, 20, 1000, 214);
  return {
    ...input,
    carrierHz, leftHz, rightHz, beatHz: Math.abs(rightHz - leftHz),
    solfeggioHz: clamp(input.solfeggioHz ?? 528, 20, 1200, 528),
    volume: clamp(input.volume ?? .22, 0, .7, .22),
    binauralGain: clamp(input.binauralGain ?? .55, 0, .9, .55),
    solfeggioGain: clamp(input.solfeggioGain ?? .32, 0, .8, .32),
    leftGain: clamp(input.leftGain ?? 1, 0, 1, 1),
    rightGain: clamp(input.rightGain ?? 1, 0, 1, 1),
    noiseAmount: clamp(input.noiseAmount ?? .1, 0, .5, .1),
    noiseType: ['white', 'pink', 'brown'].includes(input.noiseType) ? input.noiseType : 'pink',
    modulation: clamp(input.modulation ?? .2, 0, .8, .2),
    modSpeed: clamp(input.modSpeed ?? .08, .01, .4, .08),
    beatDrift: clamp(input.beatDrift ?? 0, 0, 3, 0),
    beatDriftSpeed: clamp(input.beatDriftSpeed ?? .05, .005, .4, .05),
    fadeSeconds: clamp(input.fadeSeconds ?? 4, .05, 12, 4),
    sessionMinutes: clamp(input.sessionMinutes ?? 20, 0, 120, 20),
  };
}

export function validateProgram(program) {
  if (!program || typeof program.name !== 'string' || !program.name.trim()) {
    throw new Error('El programa necesita un nombre.');
  }
  if (!Array.isArray(program.stages) || !program.stages.length || program.stages.length > 60) {
    throw new Error('Agrega entre 1 y 60 etapas.');
  }
  const stages = program.stages.map(stage => {
    if (!stage.name?.trim() || !Number.isFinite(+stage.durationMin) || +stage.durationMin <= 0 || +stage.durationMin > 120) {
      throw new Error('Cada etapa necesita nombre y duración entre 0 y 120 minutos.');
    }
    for (const [key, min, max] of [['beatHz', 0, 100], ['solfeggioHz', 20, 1200], ['modulation', 0, .8]]) {
      if (!Number.isFinite(+stage[key]) || +stage[key] < min || +stage[key] > max) {
        throw new Error(`Valor inválido de ${key} en ${stage.name}.`);
      }
    }
    return { ...stage, durationMin: +stage.durationMin, beatHz: +stage.beatHz, solfeggioHz: +stage.solfeggioHz };
  });
  const totalMin = stages.reduce((sum, s) => sum + s.durationMin, 0);
  if (totalMin > 240) throw new Error('El programa completo puede durar hasta 240 minutos.');
  return { ...program, name: program.name.trim(), stages, totalMin };
}

export function adjustFrequency(state, key, value) {
  let { left, right, carrier, link } = state;
  const v = clamp(value, key === 'beat' ? 0 : 20, key === 'beat' ? 100 : 1000, key === 'beat' ? 8 : 210);
  if (key === 'beat') {
    const center = (left + right) / 2;
    const width = Math.min(v, 2 * (center - 20), 2 * (1000 - center));
    left = center - width / 2; right = center + width / 2;
  } else if (key === 'carrier') {
    carrier = v;
    if (link !== 'free') {
      const diff = right - left;
      carrier = clamp(v, 20 + Math.abs(diff) / 2, 1000 - Math.abs(diff) / 2);
      left = carrier - diff / 2; right = carrier + diff / 2;
    }
  } else if (link === 'delta') {
    const shift = clamp(v - (key === 'left' ? left : right), 20 - Math.min(left, right), 1000 - Math.max(left, right));
    left += shift; right += shift; carrier = (left + right) / 2;
  } else if (link === 'carrier') {
    const radius = Math.min(carrier - 20, 1000 - carrier);
    const offset = clamp(v - carrier, -radius, radius);
    if (key === 'left') { left = carrier + offset; right = carrier - offset; }
    else { right = carrier + offset; left = carrier - offset; }
  } else if (key === 'left') left = v;
  else right = v;
  const round = n => +n.toFixed(2);
  return { left: round(left), right: round(right), carrier: round(carrier), beat: round(Math.abs(right - left)) };
}
