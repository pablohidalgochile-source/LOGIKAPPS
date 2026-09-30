import Foundation
import CoreFoundation
import Darwin

enum LogikError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

final class StateStore {
    let directory: URL
    let fileURL: URL
    private(set) var state: [String: Any]
    let allowedManaged = Set(["trackhunt"])
    static let version = "0.3.0"
    static let maximumBytes = 8_000_000

    init(directory: URL, catalog: URL) throws {
        self.directory = directory
        fileURL = directory.appendingPathComponent("state.json")
        let fm = FileManager.default
        try fm.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        if fm.fileExists(atPath: fileURL.path) {
            do {
                state = try Self.readObject(fileURL)
            } catch {
                throw LogikError.message("No pudimos leer tus datos guardados. Se conservaron sin cambios en \(fileURL.path). \(error.localizedDescription)")
            }
        } else {
            let data = try Data(contentsOf: catalog)
            guard let apps = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                throw LogikError.message("El catálogo inicial no es válido.")
            }
            state = ["schemaVersion": 1, "apps": apps, "ideas": [], "settings": [:]]
        }
        state = try validatedState(state)
        if !fm.fileExists(atPath: fileURL.path) { try persist(state) }
    }

    static func readObject(_ url: URL) throws -> [String: Any] {
        let size = (try url.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
        guard size <= Self.maximumBytes else { throw LogikError.message("El archivo es demasiado grande (máximo 8 MB).") }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: Self.maximumBytes + 1) ?? Data()
        guard data.count <= Self.maximumBytes else { throw LogikError.message("El archivo es demasiado grande (máximo 8 MB).") }
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw LogikError.message("El archivo no contiene una copia de LOGIKAPPS.")
        }
        return result
    }

    static func text(_ input: Any?, max: Int = 2000, required: Bool = false) throws -> String {
        guard input == nil || input is String else { throw LogikError.message("Hay un campo con formato incorrecto.") }
        let value = (input as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.utf16.count <= max, !value.contains("\0"), !required || !value.isEmpty else {
            throw LogikError.message(required ? "Completa los campos obligatorios con un texto válido." : "Uno de los textos es demasiado largo.")
        }
        return value
    }

    static func safeURL(_ target: String) throws -> URL {
        guard !target.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) }),
              !target.contains("\\"),
              let u = URL(string: target), ["http", "https"].contains(u.scheme?.lowercased() ?? ""),
              u.host?.isEmpty == false, u.user == nil, u.password == nil else {
            throw LogikError.message("Usa un enlace completo que empiece con https:// o http://, sin contraseñas en la dirección.")
        }
        return u
    }

    static func localURL(_ target: String) throws -> URL {
        let expanded = (target as NSString).expandingTildeInPath
        guard expanded.hasPrefix("/"), !expanded.contains("\0"), !expanded.contains("\n") else {
            throw LogikError.message("Elige una ruta completa de tu Mac.")
        }
        return URL(fileURLWithPath: expanded).standardizedFileURL
    }

    func validateApp(_ source: [String: Any]) throws -> [String: Any] {
        var app: [String: Any] = [:]
        app["id"] = try Self.text(source["id"], max: 100, required: true)
        app["name"] = try Self.text(source["name"], max: 100, required: true)
        app["description"] = try Self.text(source["description"], max: 2000)
        let category = try Self.text(source["category"], max: 30, required: true)
        guard ["music", "business", "personal", "creative"].contains(category) else { throw LogikError.message("Elige una colección válida.") }
        app["category"] = category
        let kind = try Self.text(source["kind"], max: 30, required: true)
        let target = try Self.text(source["target"], max: 4096, required: true)
        switch kind {
        case "url": _ = try Self.safeURL(target); app["target"] = target
        case "app", "command", "folder":
            let url = try Self.localURL(target)
            if kind == "app" && url.pathExtension.lowercased() != "app" { throw LogikError.message("Selecciona una aplicación .app.") }
            if kind == "command" && url.pathExtension.lowercased() != "command" { throw LogikError.message("Selecciona un lanzador .command existente.") }
            app["target"] = url.path
        case "managed":
            guard allowedManaged.contains(target) else { throw LogikError.message("Este lanzador todavía no está integrado.") }
            app["target"] = target
        default: throw LogikError.message("El tipo de acceso no es válido.")
        }
        app["kind"] = kind
        let status = try Self.text(source["status"], max: 30)
        guard ["ready", "prototype", "setup"].contains(status) else { throw LogikError.message("El estado de la app no es válido.") }
        app["status"] = status
        app["icon"] = try Self.text(source["icon"] ?? "app", max: 40)
        if let favorite = source["favorite"] {
            guard let number = favorite as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else {
                throw LogikError.message("El favorito debe ser verdadero o falso.")
            }
            app["favorite"] = number.boolValue
        } else { app["favorite"] = false }
        for key in ["notes", "sourcePath", "lastOpenedAt"] {
            if source[key] != nil { app[key] = try Self.text(source[key], max: key == "lastOpenedAt" ? 60 : 4096) }
        }
        if let path = app["sourcePath"] as? String, !path.isEmpty { _ = try Self.localURL(path) }
        return app
    }

    func validateIdea(_ source: [String: Any]) throws -> [String: Any] {
        var idea: [String: Any] = [:]
        idea["id"] = try Self.text(source["id"], max: 100, required: true)
        idea["title"] = try Self.text(source["title"], max: 160, required: true)
        idea["description"] = try Self.text(source["description"], max: 16000)
        let status = try Self.text(source["status"], max: 30, required: true)
        guard ["idea", "development", "ready"].contains(status) else { throw LogikError.message("El estado de la idea no es válido.") }
        idea["status"] = status
        for key in ["appId", "createdAt", "updatedAt"] {
            if source[key] != nil { idea[key] = try Self.text(source[key], max: 100) }
        }
        return idea
    }

    func validatedState(_ raw: [String: Any]) throws -> [String: Any] {
        guard let schema = raw["schemaVersion"] as? NSNumber, CFGetTypeID(schema) != CFBooleanGetTypeID(), schema.doubleValue == 1,
              let inputApps = raw["apps"] as? [[String: Any]], let inputIdeas = raw["ideas"] as? [[String: Any]],
              inputApps.count <= 250, inputIdeas.count <= 2000 else {
            throw LogikError.message("La copia no tiene el formato compatible de LOGIKAPPS (versión 1).")
        }
        let apps = try inputApps.map(validateApp)
        let ideas = try inputIdeas.map(validateIdea)
        guard Set(apps.compactMap { $0["id"] as? String }).count == apps.count,
              Set(ideas.compactMap { $0["id"] as? String }).count == ideas.count else {
            throw LogikError.message("La copia contiene identificadores repetidos.")
        }
        let ids = Set(apps.compactMap { $0["id"] as? String })
        for idea in ideas {
            if let linked = idea["appId"] as? String, !linked.isEmpty, !ids.contains(linked) { throw LogikError.message("Hay una idea vinculada a una app que no existe en esta copia.") }
        }
        return ["schemaVersion": 1, "apps": apps, "ideas": ideas, "settings": [:]]
    }

    func persist(_ newState: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: newState, options: [.prettyPrinted, .sortedKeys])
        guard data.count <= Self.maximumBytes else { throw LogikError.message("Tu biblioteca alcanzó el límite de 8 MB. Exporta una copia y reduce los textos antes de guardar más información.") }
        try Self.writePrivate(data, to: fileURL)
        state = newState
    }

    func snapshot() -> [String: Any] {
        var result = state
        result["environment"] = ["native": true, "dataPath": directory.path, "version": Self.version]
        return result
    }

    func app(_ id: String) throws -> [String: Any] {
        guard let result = (state["apps"] as? [[String: Any]])?.first(where: { $0["id"] as? String == id }) else { throw LogikError.message("No encontramos esa app en tu biblioteca.") }
        return result
    }

    func change(_ action: String, payload: [String: Any]) throws -> [String: Any] {
        var next = state
        var apps = state["apps"] as! [[String: Any]]
        var ideas = state["ideas"] as! [[String: Any]]
        let now = ISO8601DateFormatter().string(from: Date())
        switch action {
        case "saveApp":
            guard var source = payload["app"] as? [String: Any] else { throw LogikError.message("Completa los datos de la app.") }
            let suppliedID = try Self.text(source["id"], max: 100)
            source["id"] = suppliedID.isEmpty ? UUID().uuidString : suppliedID
            let value = try validateApp(source)
            if let index = apps.firstIndex(where: { $0["id"] as? String == value["id"] as? String }) { apps[index] = value }
            else { apps.append(value) }
        case "deleteApp":
            let id = try Self.text(payload["id"], max: 100, required: true)
            _ = try app(id)
            apps.removeAll { $0["id"] as? String == id }
            ideas = ideas.map { item in var copy = item; if copy["appId"] as? String == id { copy.removeValue(forKey: "appId") }; return copy }
        case "toggleFavorite":
            let id = try Self.text(payload["id"], max: 100, required: true)
            guard let index = apps.firstIndex(where: { $0["id"] as? String == id }) else { throw LogikError.message("No encontramos esa app.") }
            apps[index]["favorite"] = !(apps[index]["favorite"] as? Bool ?? false)
        case "saveIdea":
            guard var source = payload["idea"] as? [String: Any] else { throw LogikError.message("Escribe tu idea.") }
            let suppliedID = try Self.text(source["id"], max: 100)
            source["id"] = suppliedID.isEmpty ? UUID().uuidString : suppliedID
            source["updatedAt"] = now
            if let old = ideas.first(where: { $0["id"] as? String == source["id"] as? String }) { source["createdAt"] = old["createdAt"] ?? now }
            else { source["createdAt"] = now }
            let value = try validateIdea(source)
            if let index = ideas.firstIndex(where: { $0["id"] as? String == value["id"] as? String }) { ideas[index] = value }
            else { ideas.insert(value, at: 0) }
        case "deleteIdea":
            let id = try Self.text(payload["id"], max: 100, required: true)
            guard ideas.contains(where: { $0["id"] as? String == id }) else { throw LogikError.message("No encontramos esa idea.") }
            ideas.removeAll { $0["id"] as? String == id }
        default: throw LogikError.message("Acción desconocida.")
        }
        next["apps"] = apps; next["ideas"] = ideas
        try persist(validatedState(next))
        return snapshot()
    }

    func recordLaunch(_ id: String) throws -> String {
        var next = state
        var apps = state["apps"] as! [[String: Any]]
        guard let index = apps.firstIndex(where: { $0["id"] as? String == id }) else { throw LogikError.message("La app ya no está en la biblioteca.") }
        let now = ISO8601DateFormatter().string(from: Date())
        apps[index]["lastOpenedAt"] = now
        next["apps"] = apps
        try persist(next)
        return now
    }

    func importFile(_ url: URL) throws -> [String: Any] {
        let imported = try validatedState(Self.readObject(url))
        let backups = directory.appendingPathComponent("Copias de seguridad", isDirectory: true)
        try FileManager.default.createDirectory(at: backups, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let filename = "Antes-de-importar-\(Int(Date().timeIntervalSince1970))-\(UUID().uuidString.prefix(6)).json"
        try FileManager.default.copyItem(at: fileURL, to: backups.appendingPathComponent(filename))
        try persist(imported)
        return snapshot()
    }

    func exportFile(_ url: URL) throws {
        guard url.standardizedFileURL.resolvingSymlinksInPath() != fileURL.standardizedFileURL.resolvingSymlinksInPath() else {
            throw LogikError.message("Elige otro nombre o carpeta para la copia; state.json contiene tu biblioteca activa.")
        }
        let data = try JSONSerialization.data(withJSONObject: state, options: [.prettyPrinted, .sortedKeys])
        try Self.writePrivate(data, to: url)
    }

    // Set permissions before the atomic rename, so a permission failure cannot leave
    // memory holding the old state while the file has already changed.
    private static func writePrivate(_ data: Data, to url: URL) throws {
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".logikapps-\(UUID().uuidString).tmp")
        defer { try? FileManager.default.removeItem(at: temporary) }
        let descriptor = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
        guard descriptor >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        try handle.write(contentsOf: data)
        try handle.synchronize()
        try handle.close()
        guard rename(temporary.path, url.path) == 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }
    }

    static func isTemporaryTestDirectory(_ url: URL) -> Bool {
        let path = url.standardizedFileURL.resolvingSymlinksInPath().path
        return [FileManager.default.temporaryDirectory.path, "/tmp", "/private/tmp"].contains {
            let root = URL(fileURLWithPath: $0, isDirectory: true).standardizedFileURL.resolvingSymlinksInPath().path
            return path.hasPrefix(root + "/")
        }
    }
}
