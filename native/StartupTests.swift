import Foundation

func runStartupTests() throws -> Int {
    var count = 0
    func expect(_ condition: @autoclosure () throws -> Bool, _ name: String) throws {
        guard try condition() else { throw LogikError.message("Prueba de arranque fallida: \(name)") }
        count += 1; print("PASS \(name)")
    }
    func rejects(_ name: String, _ work: () throws -> Void) throws {
        do { try work() } catch { count += 1; print("PASS \(name)"); return }
        throw LogikError.message("No se rechazó: \(name)")
    }
    let fm = FileManager.default
    let temp = fm.temporaryDirectory.appendingPathComponent("logikapps-startup-tests-\(UUID().uuidString)", isDirectory: true)
    try fm.createDirectory(at: temp, withIntermediateDirectories: true)
    defer { try? fm.removeItem(at: temp) }
    let source = Bundle.main.resourceURL!.appendingPathComponent("web")
    let web = temp.appendingPathComponent("interfaz con espacios ñ")
    try fm.copyItem(at: source, to: web)
    let nonce = UUID().uuidString
    let html = try BundledPage.embeddedHTML(in: web, nonce: nonce)
    try expect(html.components(separatedBy: "<script nonce=\"\(nonce)\">").count == 7, "integrar los seis scripts sin acceso de archivos de WebKit")
    try expect(!html.contains("<script src="), "no solicitar scripts externos durante la carga alternativa")
    try expect(html.contains("<style nonce=\"\(nonce)\">"), "estilos integrados con nonce")
    try expect(html.contains("data:image/svg+xml;base64,") && !html.contains("\"assets/logo-symbol.svg\""), "logo disponible sin lectura externa")
    try expect(html.contains("default-src 'none'") && html.contains("connect-src 'none'") && !html.contains("unsafe-inline"), "mantener política de contenido restrictiva")
    try expect(html.range(of: "<script nonce=")!.lowerBound > html.range(of: "id=\"main-content\"")!.upperBound, "ejecutar scripts después del documento")
    try expect(!html.contains(web.path), "no incorporar rutas del equipo a la interfaz")
    try rejects("rechazar nonce con inyección") { _ = try BundledPage.embeddedHTML(in: web, nonce: "\"><script>") }
    let expected = web.appendingPathComponent("index.html")
    let alias = temp.appendingPathComponent("alias")
    try fm.createSymbolicLink(at: alias, withDestinationURL: web)
    try expect(BundledPage.sameDocument(alias.appendingPathComponent("index.html"), as: expected), "normalizar alias de ruta sin bloquear la página propia")
    try expect(BundledPage.sameDocument(URL(string: expected.absoluteString + "#apps"), as: expected), "permitir navegación interna por fragmento")
    for raw in ["https://example.com/index.html", "about:blank", "file://remote" + expected.path, expected.absoluteString + "?other=1", web.appendingPathComponent("app.js").absoluteString] {
        try expect(!BundledPage.sameDocument(URL(string: raw), as: expected), "rechazar documento ajeno al puente nativo")
    }
    try "</script>".write(to: web.appendingPathComponent("app.js"), atomically: true, encoding: .utf8)
    try rejects("rechazar cierre de script inesperado") { _ = try BundledPage.embeddedHTML(in: web, nonce: nonce) }
    try fm.removeItem(at: web.appendingPathComponent("app.js"))
    try rejects("informar recursos incompletos sin cargar una interfaz parcial") { _ = try BundledPage.embeddedHTML(in: web, nonce: nonce) }
    return count
}
