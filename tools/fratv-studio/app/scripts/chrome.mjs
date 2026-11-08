/* FRATV — ubica el Chrome que usan los scripts para capturar.

   Los scripts traían escrita la ruta de Chrome en macOS, así que en otra
   máquina no corrían. Orden de búsqueda:
     1. la variable de entorno CHROME_PATH, si está puesta;
     2. las rutas habituales en macOS, Linux y Windows;
     3. los ejecutables conocidos en el PATH.
   Si no encuentra ninguno, falla diciendo qué hacer, en vez de dejar que
   Puppeteer reviente con un error críptico. */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RUTAS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const EN_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

export function buscarChrome() {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH apunta a ${process.env.CHROME_PATH}, pero ahí no hay nada.`);
  }
  for (const r of RUTAS) if (existsSync(r)) return r;
  for (const n of EN_PATH) {
    try { return execFileSync('which', [n]).toString().trim(); } catch {}
  }
  throw new Error('No encontré Chrome ni Chromium. Instálalo, o indica la ruta con CHROME_PATH=/ruta/al/chrome.');
}

export const CHROME = buscarChrome();
