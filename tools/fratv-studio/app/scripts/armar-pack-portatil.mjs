/* FRATV · arma el paquete portátil para llevar a otro computador.

   El paquete anterior se había armado a mano, así que no se podía regenerar
   cuando cambiaba algo. Esto lo reconstruye entero desde el estado actual.

   Qué resuelve:
   · Las colecciones de OBS llevan rutas absolutas. Aquí se escriben con el
     marcador __PACK__, y INSTALAR.command lo reemplaza por la ruta real del
     computador de destino.
   · Los recursos de evento piden '../assets/eventos/…', así que el servidor
     tiene que servir la RAÍZ del paquete, no la carpeta de recursos. Por eso
     la carpeta se llama 'resources/' y no 'overlays/': así la ruta que ya
     traen las colecciones (resources/loquesea.html) calza sin reescribir nada.

   Uso:  node armar-pack-portatil.mjs [--fps=60,30] [--aspectos=16:9,9:16] [--zip]
*/
import { readFile, writeFile, mkdir, rm, cp, readdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI    = dirname(fileURLToPath(import.meta.url));
const RAIZ    = resolve(AQUI, '..');
const HANDOFF = join(RAIZ, 'handoff');
const PACK    = join(RAIZ, 'pack');
const DESTINO = join(RAIZ, 'FRATV_OBS_PACK');
const PUERTO  = 8790;

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const FPS      = (args.fps || '60,30').split(',');
const ASPECTOS = (args.aspectos || '16:9,9:16').split(',');

const correr = (cmd, params, cwd) => new Promise((ok, falla) => {
  const p = spawn(cmd, params, { cwd, stdio: 'ignore' });
  p.on('close', c => c === 0 ? ok() : falla(new Error(`${cmd} salió con ${c}`)));
});

console.log('\n  FRATV · paquete portátil');
console.log(`  ${'─'.repeat(58)}`);

/* ── 1 · Generar las colecciones con las rutas de aquí ──────────────── */
for (const aspecto of ASPECTOS) {
  for (const fps of FPS) {
    for (const guion of ['pack-maestra.mjs', 'pack-obs.mjs']) {
      await correr('node', [guion, `--fps=${fps}`, `--aspecto=${aspecto}`, `--puerto=${PUERTO}`], AQUI);
    }
  }
}
const colecciones = (await readdir(PACK)).filter(f => f.startsWith('FRATV_') && f.endsWith('.json'));
console.log(`  ${colecciones.length} colecciones generadas`);

/* ── 2 · Armar el árbol ─────────────────────────────────────────────── */
await rm(DESTINO, { recursive: true, force: true });
await mkdir(join(DESTINO, 'plantillas'), { recursive: true });

await cp(join(HANDOFF, 'resources'), join(DESTINO, 'resources'), { recursive: true });
await cp(join(HANDOFF, 'assets'), join(DESTINO, 'assets'), { recursive: true });
for (const f of ['manifest.json', 'tokens.json', '_obs.html', '_contacto.html']) {
  if (existsSync(join(HANDOFF, f))) await cp(join(HANDOFF, f), join(DESTINO, f));
}
for (const carpeta of ['video', 'png']) {
  if (existsSync(join(PACK, carpeta))) {
    await cp(join(PACK, carpeta), join(DESTINO, carpeta), { recursive: true });
  }
}

/* ── 3 · Las rutas absolutas se vuelven el marcador __PACK__ ────────── */
for (const nombre of colecciones) {
  const texto = await readFile(join(PACK, nombre), 'utf8');
  await writeFile(join(DESTINO, 'plantillas', nombre),
    texto.split(PACK).join('__PACK__'));
}
console.log(`  rutas absolutas sustituidas por __PACK__`);

/* ── 4 · Los dos .command y el léeme ────────────────────────────────── */
await writeFile(join(DESTINO, 'ABRIR-SERVIDOR.command'), `#!/bin/bash
# FRATV · servidor de overlays en vivo.
# Necesario solo para los overlays de texto editable. Déjalo abierto.
# Sirve la RAÍZ del paquete: los recursos de evento piden ../assets/.
cd "$(dirname "$0")" || exit 1
PUERTO=${PUERTO}
echo ""
echo "  FRATV · servidor de overlays  ·  puerto $PUERTO"
echo "  ──────────────────────────────────────────────"
echo "  Panel para armar URLs:  http://localhost:$PUERTO/_obs.html"
echo ""
echo "  Deja esta ventana abierta mientras transmites."
echo "  Para apagar: Control + C"
echo ""
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PUERTO --bind 127.0.0.1
else
  echo "  Este Mac no tiene python3. Instálalo con:  xcode-select --install"
  read -r
fi
`);

await writeFile(join(DESTINO, 'INSTALAR.command'), `#!/bin/bash
# FRATV · instalador del paquete de overlays para OBS.
# Doble clic. Ajusta las rutas a esta máquina y deja las colecciones listas
# para importar. No instala nada ni toca tus colecciones actuales.

cd "$(dirname "$0")" || exit 1
AQUI="$(pwd)"
ESCENAS="$HOME/Library/Application Support/obs-studio/basic/scenes"

echo ""
echo "  FRATV · instalador de overlays"
echo "  ══════════════════════════════════════════════════"
echo "  Carpeta: $AQUI"
echo ""

if [ ! -d plantillas ]; then
  echo "  No encuentro la carpeta plantillas/. ¿Se copió el paquete completo?"
  echo ""; read -r -p "  Pulsa Intro para cerrar."; exit 1
fi

mkdir -p colecciones
N=0
for f in plantillas/*.json; do
  nombre="$(basename "$f")"
  # La ruta de esta máquina reemplaza al marcador __PACK__
  sed "s|__PACK__|$AQUI|g" "$f" > "colecciones/$nombre"
  echo "  ✓ $nombre"
  N=$((N+1))
done

echo ""
echo "  $N colecciones listas en:  $AQUI/colecciones"
echo ""

# Comprobación: que todos los archivos referenciados existan de verdad
FALTAN=0
for f in colecciones/*.json; do
  while IFS= read -r ruta; do
    [ -e "$ruta" ] || { echo "  ✗ falta: $ruta"; FALTAN=$((FALTAN+1)); }
  done < <(grep -oE '"(local_file|file|path)": "[^"]+"' "$f" | sed 's/.*": "//; s/"$//' | sort -u)
done
if [ "$FALTAN" -eq 0 ]; then
  echo "  Todos los videos e imágenes referenciados están en su sitio ✓"
else
  echo "  Faltan $FALTAN archivos. El paquete se copió incompleto."
fi

echo ""
echo "  ─────────────────────────────────────────────────"
echo "  AHORA, EN OBS:"
echo ""
echo "   1. Colección de escenas → Importar"
echo "   2. Navegar… y elige los .json de la carpeta colecciones/"
echo "      (puedes añadir varios y pulsar Importar una sola vez)"
echo "   3. Importar"
echo ""
echo "  OJO CON LAS COLECCIONES 9x16: el tamaño del lienzo en OBS"
echo "  es del PERFIL, no de la colección. Importar la vertical"
echo "  sobre un perfil de 1920x1080 deforma todo. Crea un perfil"
echo "  a 1080x1920, o usa Aitum Vertical."
echo ""
echo "  Para los overlays de texto editable (lower third, cuenta"
echo "  regresiva, programación, sponsor) deja encendido"
echo "  ABRIR-SERVIDOR.command mientras transmites."
echo ""
echo "  La primera vez hay que elegir los dispositivos de ATEM,"
echo "  VIDEO EXTRA, AUDIO 1 y AUDIO 2 en sus propiedades."
echo "  ─────────────────────────────────────────────────"
echo ""

if [ -d "$ESCENAS" ]; then
  read -r -p "  ¿Copio las colecciones directamente a OBS? Hay que reiniciar OBS. [s/N] " R
  if [ "$R" = "s" ] || [ "$R" = "S" ]; then
    cp colecciones/*.json "$ESCENAS/" && echo "  Copiadas. Cierra y vuelve a abrir OBS."
  else
    echo "  Perfecto, impórtalas desde OBS cuando quieras."
  fi
fi

echo ""
read -r -p "  Pulsa Intro para cerrar."
`);

for (const f of ['INSTALAR.command', 'ABRIR-SERVIDOR.command']) {
  await chmod(join(DESTINO, f), 0o755);
}

const horizontales = colecciones.filter(c => !c.includes('9x16'));
const verticales   = colecciones.filter(c =>  c.includes('9x16'));

await writeFile(join(DESTINO, 'LEEME.txt'), `FRATV · PAQUETE DE OVERLAYS PARA OBS
════════════════════════════════════════════════════════════

Para instalar en otro computador. No instala nada en el sistema
ni toca las colecciones que ya tengas.


1. COPIA LA CARPETA COMPLETA
   Donde quieras, pero a un sitio fijo: si después la mueves,
   OBS pierde los videos y hay que volver al paso 2.
   Recomendado:  ~/Documentos/FRATV_OBS_PACK


2. DOBLE CLIC EN  INSTALAR.command
   Ajusta las rutas a este computador y deja las colecciones
   listas en la carpeta  colecciones/
   Comprueba además que no falte ningún archivo.

   Si macOS lo bloquea la primera vez:
   clic derecho → Abrir → Abrir.


3. EN OBS:  Colección de escenas → Importar
   Pulsa Navegar… y elige los .json de  colecciones/


4. LA PRIMERA VEZ, ELIGE LOS DISPOSITIVOS
   Con la ATEM y el audio conectados, abre las propiedades de
   ATEM · PROGRAMA, VIDEO EXTRA, AUDIO 1 y AUDIO 2 y selecciona
   cada uno. Se dejan sin fijar a propósito, porque el nombre
   del dispositivo cambia de un computador a otro.


5. PARA EL TEXTO EDITABLE, DEJA ENCENDIDO EL SERVIDOR
   Doble clic en ABRIR-SERVIDOR.command y déjalo abierto
   mientras transmites. El lower third, la cuenta regresiva,
   la programación, el sponsor y el ticker se editan por URL
   sin re-exportar nada.
   Panel para armar las URLs:  http://localhost:${PUERTO}/_obs.html


════════════════════════════════════════════════════════════
VERTICAL (Instagram, TikTok, Reels)

El paquete trae colecciones horizontales y verticales:

  horizontal:  ${horizontales.join(', ') || '—'}
  vertical:    ${verticales.join(', ') || '—'}

El tamaño del lienzo en OBS es una propiedad del PERFIL, no de
la colección de escenas. Si importas una colección 9x16 estando
en un perfil de 1920x1080, se deforma todo.

Dos caminos:

  A) AITUM VERTICAL  (el recomendado)
     Mantienes un solo perfil horizontal y Aitum agrega un
     segundo lienzo vertical con su propia salida. Puedes
     transmitir 16:9 y 9:16 al mismo tiempo desde la misma ATEM.
     Las fuentes de overlay las sacas de la colección 9x16.

  B) PERFIL APARTE
     Creas un perfil a 1080x1920 (Perfil → Nuevo, y en
     Ajustes → Vídeo pones base y salida en 1080x1920) y recién
     ahí importas la colección vertical. Más simple, pero no
     puedes transmitir los dos formatos a la vez.


════════════════════════════════════════════════════════════
LA TRANSICIÓN STINGER

Ya viene configurada en las colecciones, con el punto de corte
en 400 ms. Ese número está medido, no estimado: el barrido tapa
el cuadro completo entre los 200 y los 580 ms, así que 400 cae
al medio y deja margen por si el reloj de OBS se desvía.

Es el mismo valor en horizontal y en vertical.
`);

/* ── 5 · Comprimir ──────────────────────────────────────────────────── */
if (args.zip) {
  const zip = join(RAIZ, 'FRATV_OBS_PACK.zip');
  await rm(zip, { force: true });
  await correr('zip', ['-rq', zip, basename(DESTINO)], RAIZ);
  console.log(`  comprimido → ${zip}`);
}

console.log(`  ${'─'.repeat(58)}`);
console.log(`  → ${DESTINO}\n`);
