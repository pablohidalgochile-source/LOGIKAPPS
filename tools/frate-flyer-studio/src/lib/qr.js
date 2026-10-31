// QR local (offline) con qrcode-generator — módulos oscuros sobre panel
// claro = escaneable. Devuelve el markup SVG como string.
import qrcode from 'qrcode-generator'

export function qrSvg(url) {
  try {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const n = qr.getModuleCount()
    const s = 100 / n
    let rects = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          rects += `<rect x="${(c * s).toFixed(2)}" y="${(r * s).toFixed(2)}" width="${s.toFixed(2)}" height="${s.toFixed(2)}"/>`
        }
      }
    }
    return `<svg viewBox="0 0 100 100" shape-rendering="crispEdges"><g fill="#0a0a0a">${rects}</g></svg>`
  } catch (e) {
    return ''
  }
}
