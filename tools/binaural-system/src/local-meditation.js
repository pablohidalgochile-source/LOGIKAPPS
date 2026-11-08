// Local authored templates, not a remote model or a claim of therapeutic efficacy.
export function buildLocalMeditation({ concept, intention = '', archetype = 'TIERRA', durationMin = 15, variables = [], rate = .82 }) {
  const values = Object.fromEntries(variables.map(v => [v.id, v.value]));
  const name = concept.trim();
  const symbol = archetype || 'TIERRA';
  if (!name) throw new Error('Escribe el concepto de tu meditación.');
  const duration = Math.max(5, Math.min(30, Number(durationMin) || 15));
  const openings = { firme: 'Encuentra una postura estable. Dedica este momento a escuchar.', 'poético': 'Haz espacio para una pausa. Observa el ritmo que ya está en ti.', susurrado: 'Tómate tu tiempo. Puedes cerrar los ojos o dejarlos abiertos.', maternal: 'Busca una postura cómoda. Puedes ajustar lo que necesites.' };
  const symbols = { TIERRA: 'Siente el contacto del cuerpo con la superficie que lo sostiene.', GEA: 'Observa el aire y los sonidos del espacio que te rodea.', SELENE: 'Observa lo que cambia y lo que permanece en este momento.', ZEUS: 'Recuerda el propósito que te trae a esta pausa.', MARTE: 'Nota la energía disponible sin necesidad de actuar.', VENUS: 'Encuentra una forma amable de acompañarte.' };
  const focus = { 'body scan': 'Recorre con tu atención los pies, las piernas, el abdomen, los hombros y el rostro.', visualización: 'Imagina un lugar sencillo donde puedas detenerte un momento.', mantra: 'Elige una palabra breve y repítela mentalmente a tu propio ritmo.', gratitud: 'Recuerda algo concreto que quieras agradecer hoy.', soltar: 'Observa una tensión y permite que tu postura cambie si lo necesitas.' };
  const breathing = values.respiracion === 'libre' || !values.respiracion
    ? 'Respira a tu propio ritmo, sin forzar la inhalación ni la exhalación.'
    : `Elegiste el patrón ${values.respiracion}. Acompáñalo solo mientras resulte cómodo; puedes volver a tu respiración natural.`;
  const segments = [
    openings[values.voz] || 'Encuentra una postura cómoda. Puedes cerrar los ojos o dejarlos abiertos.',
    symbols[symbol] || symbols.TIERRA,
    breathing,
    `El tema de esta pausa es ${name.toLowerCase()}.${intention ? ` Tu intención es ${intention.toLowerCase()}.` : ''} No hace falta encontrar una respuesta perfecta.`,
    focus[values.enfoque] || 'Observa una sensación, un sonido y una respiración. Vuelve a ellos cuando quieras.',
    'Toma un momento para reconocer lo que notas. Puedes quedarte con una palabra o una imagen.',
    'Empieza a volver. Siente el contacto con la superficie, mueve las manos si quieres y observa el espacio que te rodea.',
    'Continúa cuando te sientas listo, sin apuro.',
  ];
  const spokenSeconds = segments.join(' ').split(/\s+/).length / (2.2 * Math.max(.5, Number(rate) || .82));
  const pauseBudget = Math.max(segments.length, duration * 60 - spokenSeconds);
  const weights = values.pausas === 'guía continua' ? [1,1,1,1,1,1,1,1] : values.pausas === 'profundas / largas' ? [1,1,1,5,5,3,1,1] : [1,1,1,3,3,2,1,1];
  const sum = weights.reduce((a,b) => a+b, 0);
  const narration = segments.map((text,i) => `${text}\n[pausa ${Math.max(1,Math.round(pauseBudget * weights[i] / sum))}s]`).join('\n\n');
  const personalization = variables.filter(v => v.kind !== 'toggle' && v.value && !['auto','cualquiera'].includes(v.value)).map(v => `${v.label}: ${v.value}`).join(' · ');
  const desc = `Borrador local sobre ${name.toLowerCase()}. Duración orientativa: ${duration} minutos.${personalization ? ' '+personalization+'.' : ''}`;
  const target = String(values.estado || '').split(' ')[0];
  const recommendedProgram = { delta: 'sleep_wind', theta: 'night_quiet', alpha: 'creative_flow', beta: 'focus_deep', gamma: 'energy_clear' }[target] || 'breath_cycle';
  return { title: name, desc, objective: intention || 'Una pausa de escucha personal.', breathing, recommendations: 'Busca un espacio tranquilo y adapta la postura y el ritmo a tu comodidad.', durationMin: duration, archetype: symbol, recommendedProgram, tags: [intention,symbol,`${duration}min`].filter(Boolean), narration, script: desc, _ai: false };
}
