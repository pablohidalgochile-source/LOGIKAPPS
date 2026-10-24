import Foundation

// The fallback contains only reviewed bundle resources. WebKit never needs to
// request scripts, styles or images from a translocated application's file URL.
enum BundledPage {
    static let scripts = ["catalog.js", "discover-catalog.js", "packs-catalog.js", "state.js", "interests-catalog.js", "app.js"]
    static func embeddedHTML(in directory: URL, nonce: String) throws -> String {
        guard nonce.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil else {
            throw LogikError.message("Identificador de carga inválido.")
        }
        func read(_ file: String) throws -> String { try String(contentsOf: directory.appendingPathComponent(file), encoding: .utf8) }
        var html = try read("index.html")
        let oldPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
        guard html.contains(oldPolicy) else { throw LogikError.message("La interfaz necesita una actualización completa.") }
        html = html.replacingOccurrences(of: oldPolicy, with: "default-src 'none'; script-src 'nonce-\(nonce)'; style-src 'nonce-\(nonce)'; img-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'")
        var code = ""
        for script in scripts {
            let tag = "<script src=\"\(script)\" defer></script>"
            guard html.contains(tag) else { throw LogikError.message("Falta un componente de la interfaz.") }
            html = html.replacingOccurrences(of: tag, with: "")
            let source = try read(script)
            // This is a fixed application bundle, not HTML supplied by a user.
            // Reject unexpected closing tags instead of altering JavaScript.
            guard source.range(of: "</script", options: .caseInsensitive) == nil else { throw LogikError.message("Script de interfaz incompatible.") }
            code += "<script nonce=\"\(nonce)\">\(source)</script>\n"
        }
        let css = try read("styles.css")
        guard css.range(of: "</style", options: .caseInsensitive) == nil else { throw LogikError.message("Estilos de interfaz incompatibles.") }
        html = html.replacingOccurrences(of: "<link rel=\"stylesheet\" href=\"styles.css\">", with: "<style nonce=\"\(nonce)\">\(css)</style>")
        let image = try Data(contentsOf: directory.appendingPathComponent("assets/logo-symbol.svg")).base64EncodedString()
        html = html.replacingOccurrences(of: "\"assets/logo-symbol.svg\"", with: "\"data:image/svg+xml;base64,\(image)\"")
        guard html.contains("</body>") else { throw LogikError.message("Documento de interfaz incompleto.") }
        return html.replacingOccurrences(of: "</body>", with: code + "</body>")
    }

    static func sameDocument(_ url: URL?, as expected: URL) -> Bool {
        guard let url = url, url.isFileURL, url.user == nil, url.password == nil,
              url.query == nil, url.host == nil || url.host == "" || url.host == "localhost" else { return false }
        return url.resolvingSymlinksInPath().standardizedFileURL.path == expected.resolvingSymlinksInPath().standardizedFileURL.path
    }
}
