/* Respaldo privado del DESTINO. No se incluye en el paquete ni se comparte. */
import { cp, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { stamp } from './common.mjs';
try {
  if (process.platform !== 'darwin') throw Error('Este respaldo está preparado para macOS.');
  const running = spawnSync('/usr/bin/pgrep', ['-x', 'OBS'], { stdio: 'ignore' });
  if (running.status !== 1) throw Error('Cierra OBS normalmente antes de respaldar. Si no se pudo comprobar el proceso, revisa manualmente.');
  const source = join(homedir(), 'Library/Application Support/obs-studio');
  if (!existsSync(source)) throw Error('No se encontró configuración de OBS para este usuario.');
  const parent = join(homedir(), 'Documents/FRATV_RESPALDOS_PRIVADOS');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  const destination = join(parent, `OBS-${stamp()}`);
  await mkdir(destination, { mode: 0o700 });
  await cp(source, join(destination, 'configuracion'), { recursive: true, errorOnExist: true, force: false });
  console.log(`Respaldo privado: ${destination}`);
  console.log('Contiene la configuración y credenciales propias de este computador. No lo compartas ni lo agregues al kit. OBS no fue modificado.');
} catch (error) { console.error(`Respaldo no realizado: ${error.message}`); process.exitCode = 1; }
