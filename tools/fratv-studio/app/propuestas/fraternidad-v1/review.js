'use strict';

const frames = [...document.querySelectorAll('iframe[data-piece]')];
const readyFrames = new Map();
const initializingFrames = new WeakSet();
const backgroundControl = document.querySelector('#background');
const safeControl = document.querySelector('#safe');
const durationControl = document.querySelector('#duration');
const startButton = document.querySelector('#clock-start');
const pauseButton = document.querySelector('#clock-pause');
const clockStatus = document.querySelector('#clock-status');
const fieldInputs = {
  name: document.querySelector('#sample-name'),
  role: document.querySelector('#sample-role'),
  title: document.querySelector('#sample-title'),
  subtitle: document.querySelector('#sample-subtitle'),
};
let clockRunning = false;
let clockRemaining = Number(durationControl.value) * 1000;
let clockStartedAt = null;
let clockWasStarted = false;

function currentFields() {
  return Object.fromEntries(Object.entries(fieldInputs).map(([key, input]) => [key, input.value]));
}

function invokeAll(method, value, piece) {
  for (const [frame, api] of readyFrames) {
    if (piece && frame.dataset.piece !== piece) continue;
    if (typeof api[method] === 'function') api[method](value);
  }
}

function fitFrame(viewport) {
  const frame = viewport.querySelector('iframe');
  const width = Number(viewport.dataset.width);
  const height = Number(viewport.dataset.height);
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.transform = `scale(${viewport.clientWidth / width})`;
}

const resizeObserver = new ResizeObserver(entries => {
  for (const { target } of entries) fitFrame(target);
});

function remainingTime() {
  return Math.max(0, clockRemaining - (clockRunning ? performance.now() - clockStartedAt : 0));
}

function formatTime(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function updateClockStatus() {
  const remaining = remainingTime();
  if (clockRunning && remaining === 0) {
    clockRunning = false;
    clockRemaining = 0;
    clockStartedAt = null;
    invokeAll('setClock', { durationMs: 0, running: false }, 'inicio');
  }
  startButton.disabled = clockRunning || remaining === 0;
  pauseButton.disabled = !clockRunning;
  startButton.textContent = clockWasStarted ? 'Continuar' : 'Iniciar';
  clockStatus.textContent = `${remaining === 0 ? 'Cuenta terminada' : clockRunning ? 'Reloj en marcha' : clockWasStarted ? 'Reloj en pausa' : 'Reloj detenido'} · ${formatTime(remaining)}`;
}

async function initializeFrame(frame) {
  const viewport = frame.parentElement;
  const api = frame.contentWindow?.PILOT;
  if (!api || readyFrames.get(frame) === api || initializingFrames.has(api)) return;
  initializingFrames.add(api);
  try {
    await api.ready;
    if (frame.contentWindow?.PILOT !== api) return;
    api.pause();
    api.setFields(currentFields());
    api.setBackground(backgroundControl.value);
    api.setSafe(safeControl.checked);
    if (frame.dataset.piece === 'inicio') {
      api.setClock({ durationMs: remainingTime(), running: clockRunning });
    }
    api.seek(1600);
    readyFrames.set(frame, api);
    viewport.classList.remove('failed');
    viewport.classList.add('loaded');
  } catch (error) {
    viewport.classList.add('failed');
    viewport.querySelector('.loading').textContent = 'No se pudo cargar esta vista. Recarga la página para volver a intentarlo.';
    console.error('No se pudo preparar la vista del piloto.', error);
  }
}

for (const frame of frames) {
  const viewport = frame.parentElement;
  fitFrame(viewport);
  resizeObserver.observe(viewport);
  frame.addEventListener('load', () => initializeFrame(frame));
  frame.src = frame.dataset.src;
}

// Espera también la API: el documento puede cargar antes de que esté lista.
const initializationPoll = setInterval(() => {
  for (const frame of frames) {
    if (!readyFrames.has(frame)) initializeFrame(frame);
  }
  if (readyFrames.size === frames.length) clearInterval(initializationPoll);
}, 150);
setTimeout(() => {
  clearInterval(initializationPoll);
  for (const frame of frames) {
    if (readyFrames.has(frame)) continue;
    frame.parentElement.classList.add('failed');
    frame.parentElement.querySelector('.loading').textContent = 'Esta vista está tardando en cargar. Recarga la página para volver a intentarlo.';
  }
}, 30000);

backgroundControl.addEventListener('change', () => invokeAll('setBackground', backgroundControl.value));
safeControl.addEventListener('change', () => invokeAll('setSafe', safeControl.checked));
for (const input of Object.values(fieldInputs)) {
  input.addEventListener('input', () => invokeAll('setFields', currentFields()));
}
for (const button of document.querySelectorAll('[data-replay]')) {
  button.addEventListener('click', () => {
    invokeAll('seek', 0, button.dataset.replay);
    invokeAll('play', undefined, button.dataset.replay);
  });
}

function resetClock() {
  clockRunning = false;
  clockWasStarted = false;
  clockRemaining = Number(durationControl.value) * 1000;
  clockStartedAt = null;
  invokeAll('setClock', { durationMs: clockRemaining, running: false }, 'inicio');
  updateClockStatus();
}

startButton.addEventListener('click', () => {
  if (clockRunning || clockRemaining <= 0) return;
  clockRunning = true;
  clockWasStarted = true;
  clockStartedAt = performance.now();
  invokeAll('setClock', { durationMs: clockRemaining, running: true }, 'inicio');
  updateClockStatus();
});
pauseButton.addEventListener('click', () => {
  clockRemaining = remainingTime();
  clockRunning = false;
  clockStartedAt = null;
  invokeAll('setClock', { durationMs: clockRemaining, running: false }, 'inicio');
  updateClockStatus();
});
document.querySelector('#clock-reset').addEventListener('click', resetClock);
durationControl.addEventListener('change', resetClock);
setInterval(updateClockStatus, 250);
updateClockStatus();
