#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// export-flyer.mjs — Export PNG del flyer con Puppeteer/Chromium.
// Conserva blend/glow/grain/mask (por eso NO Satori — ver README §6).
//
// Uso:
//   npm run build                       (una vez, o tras cambios)
//   node scripts/export-flyer.mjs                          → REC demo
//   node scripts/export-flyer.mjs --template=scanner       → otra plantilla
//     (rec | scanner | scanner2 | times | revista | album)
//   node scripts/export-flyer.mjs --format=story           → 9:16 (solo rec/scanner)
//   node scripts/export-flyer.mjs --data=./evento.json     → EVENT+TWEAKS reales
//   node scripts/export-flyer.mjs --doc=./frate-flyer.json → diseño del EDITOR
//     (el JSON que descarga el botón Exportar: incluye layout_overrides+extras)
//   node scripts/export-flyer.mjs --out=./flyer.png --scale=2
//
// El JSON de --data es { "event": {...}, "tweaks": {...} } (contrato del
// README §4 / MAPEO-DATOS.md). Se pasa como ?data=<base64> a la app.
// ═══════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { preview } from 'vite'
import puppeteer from 'puppeteer'

const FORMATS = { story: [1080, 1920], carousel: [1080, 1350], poster: [1080, 1620] }

// ── CLI args ─────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    return m ? [m[1], m[2] ?? true] : [a, true]
  })
)

// ── Modo EDITOR DOC: --doc=frate-flyer.json (con overrides + extras) ─
let editorDoc = null
if (args.doc) {
  editorDoc = JSON.parse(readFileSync(resolve(args.doc), 'utf8'))
}

let payload = { event: {}, tweaks: {} }
if (args.data) {
  payload = JSON.parse(readFileSync(resolve(args.data), 'utf8'))
}
if (args.format) {
  payload.tweaks = { ...payload.tweaks, format: args.format }
  if (editorDoc) editorDoc.format = args.format
}

// Plantilla: rec/scanner tienen formato variable; el resto es 1080×1620 fijo
const template = editorDoc?.templateId || args.template || payload.template || 'rec'
const HAS_FORMAT = ['rec', 'scanner'].includes(template)
const format = editorDoc?.format || payload.tweaks.format || 'story'
const [W, H] = (editorDoc || HAS_FORMAT) ? (FORMATS[format] || FORMATS.story) : [1080, 1620]
const scale = Number(args.scale) || 1
const out = args.out || `flyer-${template}-${editorDoc ? 'doc' : (HAS_FORMAT ? format : 'poster')}-${Date.now()}.png`

// ── Servidor: vite preview programático sobre dist/ ─────────────────
const server = await preview({ preview: { port: 4199, open: false } })
const base = server.resolvedUrls.local[0]

let url
if (editorDoc) {
  const b64 = Buffer.from(JSON.stringify(editorDoc), 'utf8').toString('base64')
  url = `${base}?export=1&edoc=${encodeURIComponent(b64)}`
} else {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
  url = `${base}?export=1&template=${template}&data=${encodeURIComponent(b64)}`
}

console.log(`→ ${editorDoc ? 'Doc del editor' : 'Plantilla'} ${template} · ${W}×${H}${scale > 1 ? ` @${scale}x = ${W * scale}×${H * scale}` : ''}`)

// ── Puppeteer ────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ headless: 'shell' })
try {
  const page = await browser.newPage()
  // Ancho = W → escala 1:1 (la app escala al ancho de la ventana)
  await page.setViewport({ width: W, height: H, deviceScaleFactor: scale })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 })
  // Fuentes web y último layout
  await page.evaluate(() => document.fonts.ready)
  await new Promise(r => setTimeout(r, 400))

  const canvas = (await page.$('#canvas')) || (await page.$('#ed-canvas'))
  if (!canvas) throw new Error('No se encontró #canvas/#ed-canvas — ¿corriste npm run build?')
  await canvas.screenshot({ path: out })
  console.log(`✓ Exportado: ${out}`)
} finally {
  await browser.close()
  await server.close()
}
