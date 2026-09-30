import Foundation

func runStoreTests() throws {
    let fm = FileManager.default
    let temp = fm.temporaryDirectory.appendingPathComponent("logikapps-tests-\(UUID().uuidString)", isDirectory: true)
    try fm.createDirectory(at: temp, withIntermediateDirectories: true)
    defer { try? fm.removeItem(at: temp) }
    let catalog = temp.appendingPathComponent("catalog.json")
    let app: [String: Any] = ["id": "seed", "name": "Música & <ideas>", "description": "Prueba ñ", "category": "music", "kind": "url", "target": "https://example.com", "status": "ready", "icon": "music", "favorite": false]
    try JSONSerialization.data(withJSONObject: [app]).write(to: catalog)
    let folder = temp.appendingPathComponent("data")
    let store = try StateStore(directory: folder, catalog: catalog)
    var count = 0
    func expect(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
        guard try condition() else { throw LogikError.message("Prueba fallida: \(message)") }
        count += 1; print("PASS \(message)")
    }
    func rejected(_ message: String, _ work: () throws -> Void) throws {
        do { try work() } catch { count += 1; print("PASS \(message)"); return }
        throw LogikError.message("No se rechazó: \(message)")
    }
    try expect((store.state["apps"] as? [[String: Any]])?.count == 1, "catálogo inicial")
    _ = try store.change("toggleFavorite", payload: ["id": "seed"])
    try expect(try store.app("seed")["favorite"] as? Bool == true, "favoritos persistentes")
    try Data("[]".utf8).write(to: catalog)
    let relaunched = try StateStore(directory: folder, catalog: catalog)
    try expect(try relaunched.app("seed")["favorite"] as? Bool == true, "actualizar con catálogo vacío conserva biblioteca v1")
    let clean = try StateStore(directory: temp.appendingPathComponent("clean"), catalog: catalog)
    try expect((clean.state["apps"] as? [[String: Any]])?.isEmpty == true, "primera instalación inicia vacía")
    // Version 0.2 stored the same schema. Discovery must never seed or replace it.
    let emptyBytes = try Data(contentsOf: clean.fileURL)
    try JSONSerialization.data(withJSONObject: [app]).write(to: catalog)
    let upgradedEmpty = try StateStore(directory: clean.directory, catalog: catalog)
    try expect((upgradedEmpty.state["apps"] as? [[String: Any]])?.isEmpty == true, "actualizar biblioteca vacía 0.2 no agrega catálogo compartido")
    try expect(try Data(contentsOf: upgradedEmpty.fileURL) == emptyBytes, "actualizar biblioteca vacía no reescribe sus datos")
    try Data("[]".utf8).write(to: catalog)
    let legacyDirectory = temp.appendingPathComponent("legacy-0.2")
    try fm.createDirectory(at: legacyDirectory, withIntermediateDirectories: true)
    var legacyApp = app
    legacyApp["favorite"] = true
    legacyApp["notes"] = "Una nota personal conservada"
    legacyApp["lastOpenedAt"] = "2026-09-28T12:00:00Z"
    let legacy: [String: Any] = ["schemaVersion": 1, "apps": [legacyApp], "ideas": [["id": "linked-legacy", "title": "Idea existente", "status": "development", "appId": "seed", "description": "Se conserva al actualizar"]], "settings": [:]]
    let legacyFile = legacyDirectory.appendingPathComponent("state.json")
    let legacyBytes = try JSONSerialization.data(withJSONObject: legacy, options: [.prettyPrinted, .sortedKeys])
    try legacyBytes.write(to: legacyFile)
    let upgraded = try StateStore(directory: legacyDirectory, catalog: catalog)
    try expect(try Data(contentsOf: legacyFile) == legacyBytes, "actualizar 0.2 a 0.3 conserva archivo de biblioteca existente")
    try expect(try upgraded.app("seed")["favorite"] as? Bool == true && upgraded.app("seed")["notes"] as? String == "Una nota personal conservada", "actualizar conserva favoritos y notas")
    try expect((upgraded.state["ideas"] as? [[String: Any]])?.first?["appId"] as? String == "seed", "actualizar conserva ideas vinculadas")
    try expect((upgraded.snapshot()["environment"] as? [String: Any])?["version"] as? String == "0.3.0" && upgraded.state["environment"] == nil, "versión 0.3 solo en entorno, schema 1 conservado")
    for schema: Any in [true, false, "1", 1.5, 2] {
        var invalid = store.state; invalid["schemaVersion"] = schema
        try rejected("rechazar esquema incompatible \(schema)") { _ = try store.validatedState(invalid) }
    }
    for value: Any in [true, 42, ["invalid"]] {
        var invalid = app; invalid["id"] = value
        try rejected("rechazar ID de app no textual") { _ = try store.change("saveApp", payload: ["app": invalid]) }
        let badIdea: [String: Any] = ["id": value, "title": "Idea", "status": "idea"]
        try rejected("rechazar ID de idea no textual") { _ = try store.change("saveIdea", payload: ["idea": badIdea]) }
    }
    var badFavorite = app; badFavorite["favorite"] = 1
    try rejected("rechazar favorito numérico") { _ = try store.validateApp(badFavorite) }
    var injectedApproval = app; injectedApproval["approved"] = true; injectedApproval["command"] = "echo prueba"
    let sanitized = try store.validateApp(injectedApproval)
    try expect(sanitized["approved"] == nil && sanitized["command"] == nil, "no importar permisos ni comandos adicionales")
    var another = app; another["id"] = "second"; another["name"] = "Otra"
    _ = try store.change("saveApp", payload: ["app": another])
    try expect((store.state["apps"] as? [[String: Any]])?.count == 2, "agregar app")
    another["name"] = "Editada"; _ = try store.change("saveApp", payload: ["app": another])
    try expect(try store.app("second")["name"] as? String == "Editada", "editar sin duplicar")
    for unsafe in ["javascript:alert(1)", "file:///etc/passwd", "https://user:secret@example.com", "https://", "https://exa mple.com", "https://example.com/\npath", "https://example.com/\\path"] {
        try rejected("rechazar enlace \(unsafe.components(separatedBy: ":")[0])") {
            var invalid = another; invalid["target"] = unsafe
            _ = try store.change("saveApp", payload: ["app": invalid])
        }
    }
    try rejected("no ejecutar integraciones arbitrarias") {
        var invalid = another; invalid["kind"] = "managed"; invalid["target"] = "rm"
        _ = try store.change("saveApp", payload: ["app": invalid])
    }
    try rejected("rechazar paths relativos") { _ = try StateStore.localURL("../../etc") }
    try rejected("rechazar comando que no es lanzador") {
        var invalid = another; invalid["kind"] = "command"; invalid["target"] = "/bin/sh"
        _ = try store.change("saveApp", payload: ["app": invalid])
    }
    let idea: [String: Any] = ["id": "idea", "title": "Mi nueva idea", "description": "Texto \"citado\" <script>", "status": "development", "appId": "second"]
    _ = try store.change("saveIdea", payload: ["idea": idea])
    try expect((store.state["ideas"] as? [[String: Any]])?.first?["title"] as? String == "Mi nueva idea", "crear idea vinculada")
    try rejected("no vincular idea a app inexistente") {
        var missing = idea; missing["appId"] = "missing"
        _ = try store.change("saveIdea", payload: ["idea": missing])
    }
    let export = temp.appendingPathComponent("export.json")
    try store.exportFile(export)
    _ = try store.change("deleteApp", payload: ["id": "second"])
    try expect((store.state["ideas"] as? [[String: Any]])?.first?["appId"] == nil, "quitar acceso conserva idea y desvincula")
    _ = try store.importFile(export)
    try expect(try store.app("second")["name"] as? String == "Editada", "restaurar copia")
    try expect(try fm.contentsOfDirectory(atPath: folder.appendingPathComponent("Copias de seguridad").path).count == 1, "copia automática antes de importar")
    let before = try Data(contentsOf: store.fileURL)
    let memoryBefore = try JSONSerialization.data(withJSONObject: store.state, options: .sortedKeys)
    try rejected("no exportar encima de biblioteca activa") { try store.exportFile(store.fileURL) }
    let alias = temp.appendingPathComponent("state-alias.json")
    try fm.createSymbolicLink(at: alias, withDestinationURL: store.fileURL)
    try rejected("no exportar encima de alias de biblioteca activa") { try store.exportFile(alias) }
    let rawLarge = temp.appendingPathComponent("oversized.json")
    try Data(repeating: 32, count: StateStore.maximumBytes + 1).write(to: rawLarge)
    try rejected("rechazar archivo mayor a 8 MB") { _ = try StateStore.readObject(rawLarge) }
    let storedPermissions = (try fm.attributesOfItem(atPath: store.fileURL.path))[.posixPermissions] as? NSNumber
    let exportedPermissions = (try fm.attributesOfItem(atPath: export.path))[.posixPermissions] as? NSNumber
    try expect(storedPermissions?.intValue == 0o600 && exportedPermissions?.intValue == 0o600, "estado y copia solo legibles por su usuario")
    let invalidURL = temp.appendingPathComponent("invalid.json")
    var duplicate = store.state; duplicate["apps"] = [app, app]
    try JSONSerialization.data(withJSONObject: duplicate).write(to: invalidURL)
    try rejected("rechazar importación con IDs repetidos") { _ = try store.importFile(invalidURL) }
    try expect(try Data(contentsOf: store.fileURL) == before, "importación inválida no reemplaza datos")
    var oversized = store.state
    oversized["ideas"] = (0..<510).map { i -> [String: Any] in ["id": "large-\(i)", "title": "Idea \(i)", "description": String(repeating: "x", count: 16000), "status": "idea"] }
    try rejected("no guardar una biblioteca que supere el límite de lectura") { try store.persist(store.validatedState(oversized)) }
    try expect(try Data(contentsOf: store.fileURL) == before, "límite de tamaño conserva el archivo anterior")
    oversized["ideas"] = (0..<260).map { i -> [String: Any] in ["id": "unicode-\(i)", "title": "Idea", "description": String(repeating: "🌱", count: 8000), "status": "idea"] }
    try rejected("límite de 8 MB cuenta bytes UTF-8") { try store.persist(store.validatedState(oversized)) }
    try expect(try JSONSerialization.data(withJSONObject: store.state, options: .sortedKeys) == memoryBefore, "errores de validación mantienen estado en memoria")
    let heldState = folder.appendingPathComponent("held-state.json")
    try fm.moveItem(at: store.fileURL, to: heldState)
    try fm.createDirectory(at: store.fileURL, withIntermediateDirectories: false)
    try rejected("fallo de escritura se comunica") { _ = try store.change("toggleFavorite", payload: ["id": "seed"]) }
    try expect(try JSONSerialization.data(withJSONObject: store.state, options: .sortedKeys) == memoryBefore, "fallo de escritura no confirma cambios en memoria")
    try expect(try Data(contentsOf: heldState) == before, "fallo de escritura conserva archivo anterior")
    try fm.removeItem(at: store.fileURL)
    try fm.moveItem(at: heldState, to: store.fileURL)
    let cli = temp.appendingPathComponent("project/node_modules/vinext/dist/cli.js")
    try fm.createDirectory(at: cli.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data("// fixture: never executed".utf8).write(to: cli)
    var managed = app; managed["kind"] = "managed"; managed["target"] = "trackhunt"; managed["sourcePath"] = temp.appendingPathComponent("project").path
    let managedRoot = try ManagedLauncher.projectRoot(for: store.validateApp(managed))
    try expect(managedRoot == temp.appendingPathComponent("project").resolvingSymlinksInPath(), "TRACKHUNT toma carpeta de entrada guardada")
    managed["target"] = "arbitrary"
    try rejected("TRACKHUNT no ejecuta otra integración") { _ = try ManagedLauncher.projectRoot(for: managed) }
    managed["target"] = "trackhunt"; managed.removeValue(forKey: "sourcePath")
    try rejected("TRACKHUNT sin carpeta pide configuración") { _ = try ManagedLauncher.projectRoot(for: managed) }
    try expect(StateStore.isTemporaryTestDirectory(temp), "test UI acepta subcarpeta temporal")
    try expect(!StateStore.isTemporaryTestDirectory(FileManager.default.homeDirectoryForCurrentUser), "test UI rechaza carpeta personal")
    try expect(!StateStore.isTemporaryTestDirectory(URL(fileURLWithPath: "/private/tmp-not-allowed")), "test UI exige límite de ruta temporal")
    _ = try store.change("deleteIdea", payload: ["id": "idea"])
    try expect((store.state["ideas"] as? [[String: Any]])?.isEmpty == true, "eliminar idea")
    _ = try store.recordLaunch("seed")
    try expect(try store.app("seed")["lastOpenedAt"] as? String != nil, "registrar apertura real")
    try expect(store.state["environment"] == nil, "metadatos del entorno no se exportan")
    let corrupt = Data("{broken".utf8); try corrupt.write(to: store.fileURL)
    try rejected("detectar archivo corrupto al iniciar") { _ = try StateStore(directory: folder, catalog: catalog) }
    try expect(try Data(contentsOf: store.fileURL) == corrupt, "conservar datos corruptos sin resetear")
    print("\(count) pruebas correctas; ninguna app externa fue lanzada.")
}
