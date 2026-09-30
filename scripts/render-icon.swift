import AppKit
import WebKit

// Render the supplied, unchanged SVG with WebKit, then export macOS icon sizes.
// This helper is used only while building. LOGIKAPPS does not depend on it.
final class IconRenderer: NSObject, WKNavigationDelegate {
    private let source: URL
    private let destination: URL
    private var window: NSWindow!
    private var webView: WKWebView!
    private var finished = false

    init(source: URL, destination: URL) {
        self.source = source
        self.destination = destination
    }

    func start() {
        do {
            let data = try Data(contentsOf: source)
            guard let svg = String(data: data, encoding: .utf8), svg.contains("<svg") else {
                fail("El archivo de origen no contiene un SVG válido.")
                return
            }
            try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
            webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1024, height: 1024))
            webView.navigationDelegate = self
            webView.setValue(false, forKey: "drawsBackground")
            window = NSWindow(contentRect: webView.frame, styleMask: [.borderless], backing: .buffered, defer: false)
            window.isOpaque = false
            window.backgroundColor = .clear
            window.contentView = webView
            window.setFrameOrigin(NSPoint(x: -10000, y: -10000))
            window.orderFrontRegardless()
            let encoded = data.base64EncodedString()
            webView.loadHTMLString("""
            <!doctype html><html><head><meta charset="utf-8"><style>
            html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}
            body{display:flex;align-items:center;justify-content:center}
            img{display:block;width:800px;height:800px;object-fit:contain}
            </style></head><body><img id="mark" src="data:image/svg+xml;base64,\(encoded)"></body></html>
            """, baseURL: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
                self?.fail("El renderizado del icono superó los 30 segundos.")
            }
        } catch {
            fail(error.localizedDescription)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.callAsyncJavaScript("await document.getElementById('mark').decode(); return true;", arguments: [:], in: nil, in: .page) { [weak self] result in
            switch result {
            case .success:
                self?.snapshot()
            case .failure(let error):
                self?.fail("No se pudo cargar el SVG: \(error.localizedDescription)")
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(error.localizedDescription)
    }

    private func snapshot() {
        let configuration = WKSnapshotConfiguration()
        configuration.rect = NSRect(x: 0, y: 0, width: 1024, height: 1024)
        configuration.snapshotWidth = 1024
        configuration.afterScreenUpdates = true
        webView.takeSnapshot(with: configuration) { [weak self] image, error in
            guard let self = self, !self.finished else { return }
            guard let image = image else {
                self.fail(error?.localizedDescription ?? "WebKit no devolvió una imagen.")
                return
            }
            do {
                let sizes: [(String, Int)] = [
                    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
                    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
                    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
                    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
                    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024)
                ]
                for (name, pixels) in sizes {
                    try self.write(image: image, pixels: pixels, to: self.destination.appendingPathComponent(name))
                }
                self.finished = true
                self.window.close()
                print("Icono generado desde \(self.source.lastPathComponent)")
                exit(0)
            } catch {
                self.fail(error.localizedDescription)
            }
        }
    }

    private func write(image: NSImage, pixels: Int, to url: URL) throws {
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
              let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
            throw NSError(domain: "LOGIKAPPS.Icon", code: 1, userInfo: [NSLocalizedDescriptionKey: "No se pudo preparar el icono."])
        }
        let side = CGFloat(pixels)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        context.imageInterpolation = .high
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: side, height: side).fill(using: .copy)
        NSColor(calibratedRed: 17.0 / 255.0, green: 19.0 / 255.0, blue: 17.0 / 255.0, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: side, height: side), xRadius: side * 0.22, yRadius: side * 0.22).fill()
        image.draw(in: NSRect(x: 0, y: 0, width: side, height: side), from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: false, hints: [.interpolation: NSImageInterpolation.high])
        NSGraphicsContext.restoreGraphicsState()
        guard let data = bitmap.representation(using: .png, properties: [:]) else {
            throw NSError(domain: "LOGIKAPPS.Icon", code: 2, userInfo: [NSLocalizedDescriptionKey: "No se pudo exportar el PNG."])
        }
        try data.write(to: url, options: .atomic)
    }

    private func fail(_ message: String) {
        guard !finished else { return }
        finished = true
        FileHandle.standardError.write(Data("Error al generar el icono: \(message)\n".utf8))
        exit(1)
    }
}

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(Data("Uso: render-icon archivo.svg carpeta.iconset\n".utf8))
    exit(2)
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let renderer = IconRenderer(source: URL(fileURLWithPath: CommandLine.arguments[1]), destination: URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true))
renderer.start()
app.run()
