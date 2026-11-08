import Foundation
import CoreImage
import ArchiveCore

var passed = 0
var failures: [String] = []
func expect(_ value: @autoclosure () throws -> Bool, _ message: String) throws {
    if try !value() { throw ArchiveError.message(message) }
}
func rejects(_ action: () throws -> Void) throws {
    do { try action() } catch { return }
    throw ArchiveError.message("Se esperaba un rechazo y la operación continuó.")
}
func test(_ name: String, _ body: (URL) throws -> Void) {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("limpieza-check-" + UUID().uuidString).resolvingSymlinksInPath()
    do {
        try SafeFiles.makeDirectory(root)
        defer { try? FileManager.default.removeItem(at: root) }
        try body(root); passed += 1; print("PASS \(name)")
    } catch { failures.append("\(name): \(error.localizedDescription)"); print("FAIL \(name): \(error.localizedDescription)") }
}
func write(_ root: URL, _ name: String, _ value: String = "contenido de prueba") throws -> URL {
    let url = root.appendingPathComponent(name); try SafeFiles.makeDirectory(url.deletingLastPathComponent()); try Data(value.utf8).write(to: url); return url
}
func setup(_ root: URL) throws -> ScanResult {
    let source = root.appendingPathComponent("origen"); _ = try write(source, "vacaciones/foto.txt"); _ = try write(source, "notas.txt", "otro contenido")
    return try ArchiveEngine.scan(source)
}
func archive(_ root: URL, _ scan: ScanResult) throws -> ArchiveResult {
    try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: root.appendingPathComponent("destino"), owner: "Ana", device: "iPhone")
}

test("Preferencias antiguas conservan perfiles sin sesiones USB") { root in
    var old = Preferences(); old.profiles = [FamilyProfile(owner: "Lina", device: "iPhone")]
    var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(old)) as! [String: Any]
    json.removeValue(forKey: "usbSessions")
    let url = root.appendingPathComponent("preferences.json")
    try JSONSerialization.data(withJSONObject: json).write(to: url)
    let loaded = try Persistence.load(url)
    try expect(loaded.profiles == old.profiles && loaded.usbSessions == nil, "Se perdieron las preferencias antiguas")
}
test("Sesión USB se recupera tras volver a cargar preferencias") { root in
    var state = Preferences()
    state.rememberUSB(USBSessionReference(deviceID: "phone-A", deviceName: "Lina", folder: root.appendingPathComponent("copia").path))
    let url = root.appendingPathComponent("preferences.json")
    try Persistence.save(state, to: url)
    let loaded = try Persistence.load(url)
    try expect(loaded.usbSessions?.first?.deviceID == "phone-A" && loaded.usbSessions?.first?.folder == root.appendingPathComponent("copia").path, "No se recuperó identidad/destino tras reinicio")
}
test("Reabrir sesión no duplica accesos ni confunde iPhones con el mismo nombre") { root in
    var state = Preferences()
    let first = USBSessionReference(deviceID: "phone-A", deviceName: "iPhone", folder: root.appendingPathComponent("A").path)
    state.rememberUSB(first)
    state.rememberUSB(USBSessionReference(deviceID: "phone-B", deviceName: "iPhone", folder: root.appendingPathComponent("B").path))
    state.rememberUSB(first)
    try expect(state.usbSessions?.count == 2 && state.usbSessions?.first?.deviceID == "phone-A" && state.usbSessions?.last?.deviceID == "phone-B", "Se mezclaron destinos o se duplicó la sesión")
}

test("SHA-256 conocido y lectura sin modificación") { root in
    let url = try write(root, "abc.txt", "abc")
    try expect(try SafeFiles.hash(url) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "Hash incorrecto")
    try expect(try String(contentsOf: url) == "abc", "Original alterado")
}
test("Duplicados exactos; mismos nombres no implican igualdad") { root in
    _ = try write(root, "a/foto.txt", "igual"); _ = try write(root, "b/foto.txt", "diferente"); _ = try write(root, "c/copia.txt", "igual"); _ = try write(root, "vacio.txt", "")
    let scan = try ArchiveEngine.scan(root)
    try expect(scan.files.count == 4, "Faltan archivos"); try expect(scan.duplicateGroups.count == 1 && scan.duplicateBytes == 5, "Detección incorrecta")
}
test("Se omiten symlinks sin leer su destino") { root in
    let outside = try write(root, "fuera/secreto.txt", "NO LEER")
    let source = root.appendingPathComponent("origen"); try SafeFiles.makeDirectory(source)
    try FileManager.default.createSymbolicLink(at: source.appendingPathComponent("enlace.txt"), withDestinationURL: outside)
    let scan = try ArchiveEngine.scan(source); try expect(scan.files.isEmpty && scan.warnings.count == 1, "Se siguió el enlace")
}
test("Archivo completo, originales intactos y verificación") { root in
    let scan = try setup(root), result = try archive(root, scan)
    try expect(result.copied == 2 && result.errors.isEmpty, "No se archivó todo")
    try expect(try ArchiveEngine.verify(result.folder).isEmpty, "Integridad fallida")
    for file in scan.files { try expect(try SafeFiles.hash(URL(fileURLWithPath: file.sourcePath)) == file.sha256, "Original modificado") }
}
test("Segunda ejecución reutiliza copias verificadas") { root in
    let scan = try setup(root); _ = try archive(root, scan); let second = try archive(root, scan)
    try expect(second.reused == 2 && second.copied == 0 && second.errors.isEmpty, "La repetición duplica archivos")
    try expect(try ArchiveEngine.loadManifest(second.folder).records.count == 2, "El manifiesto duplica registros")
}
test("Cambio de origen tras analizar exige nuevo análisis") { root in
    let scan = try setup(root); try Data("cambió".utf8).write(to: URL(fileURLWithPath: scan.files[0].sourcePath))
    let result = try archive(root, scan); try expect(result.copied == 1 && result.errors.count == 1, "No se detectó cambio de origen")
}
test("Copia modificada no se sobrescribe") { root in
    let scan = try setup(root), result = try archive(root, scan), manifest = try ArchiveEngine.loadManifest(result.folder)
    let path = result.folder.appendingPathComponent(manifest.records[0].storedPath)
    try Data("cambio externo".utf8).write(to: path)
    try expect(try ArchiveEngine.verify(result.folder).count == 1, "No se detectó la corrupción")
    let retry = try archive(root, scan); try expect(retry.errors.count == 1, "Se sobrescribió un destino modificado")
    try expect(try String(contentsOf: path) == "cambio externo", "Destino alterado")
}
test("Copia ausente se detecta y se puede reponer desde el original") { root in
    let scan = try setup(root), result = try archive(root, scan), manifest = try ArchiveEngine.loadManifest(result.folder)
    try FileManager.default.removeItem(at: result.folder.appendingPathComponent(manifest.records[0].storedPath))
    try expect(try ArchiveEngine.verify(result.folder).count == 1, "No se detectó archivo faltante")
    let retry = try archive(root, scan); try expect(retry.copied == 1 && retry.reused == 1, "No se repuso la copia")
}
test("Destino dentro del origen se rechaza") { root in
    let scan = try setup(root)
    try rejects { _ = try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: scan.root.appendingPathComponent("destino"), owner: "A", device: "B") }
}
test("Importación y archivo pueden ser carpetas hermanas del mismo disco") { root in
    let scan = try setup(root)
    let result = try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: root, owner: "A", device: "B")
    try expect(result.copied == 2 && result.errors.isEmpty, "Se rechazó un destino seguro en la misma unidad")
}
test("Symlink en destino no redirige escrituras") { root in
    let scan = try setup(root), outside = root.appendingPathComponent("fuera"); try SafeFiles.makeDirectory(outside)
    try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("destino"), withDestinationURL: outside)
    try rejects { _ = try archive(root, scan) }
    try expect(try FileManager.default.contentsOfDirectory(atPath: outside.path).isEmpty, "Se escribió fuera del destino")
}
test("Symlink reemplazando un archivo impide su lectura") { root in
    let scan = try setup(root), original = URL(fileURLWithPath: scan.files[0].sourcePath), outside = try write(root, "fuera.txt")
    try FileManager.default.removeItem(at: original); try FileManager.default.createSymbolicLink(at: original, withDestinationURL: outside)
    let result = try archive(root, scan); try expect(result.errors.count == 1, "Se siguió un symlink sustituido")
}
test("Manifiesto con path traversal se rechaza") { root in
    let scan = try setup(root), result = try archive(root, scan), url = result.folder.appendingPathComponent("manifest.json")
    var json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    var records = json["records"] as! [[String: Any]]; records[0]["storedPath"] = "../../fuera.txt"; json["records"] = records
    try JSONSerialization.data(withJSONObject: json).write(to: url)
    try rejects { _ = try ArchiveEngine.loadManifest(result.folder) }
}
test("Manifiesto dañado se conserva sin sobrescribir") { root in
    let scan = try setup(root), result = try archive(root, scan), url = result.folder.appendingPathComponent("manifest.json")
    try Data("dañado".utf8).write(to: url); try rejects { _ = try archive(root, scan) }
    try expect(try String(contentsOf: url) == "dañado", "Se reemplazó el manifiesto dañado")
}
test("Cancelación previa no copia archivos") { root in
    let scan = try setup(root), token = Cancellation(); token.cancel()
    try rejects { _ = try ArchiveEngine.scan(scan.root, cancel: token) }
    try rejects { _ = try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: root.appendingPathComponent("destino"), owner: "A", device: "B", cancel: token) }
}
test("Reanudar tras cancelación conserva registros confirmados") { root in
    let scan = try setup(root), token = Cancellation()
    try rejects { _ = try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: root.appendingPathComponent("destino"), owner: "Ana", device: "iPhone", cancel: token, progress: { i, _, _ in if i == 1 { token.cancel() } }) }
    let retry = try archive(root, scan); try expect(retry.copied == 1 && retry.reused == 1, "La reanudación perdió progreso")
}
test("Personas con nombres sanitizados iguales quedan separadas") { root in
    let scan = try setup(root)
    let first = try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: root.appendingPathComponent("destino"), owner: "Ana/1", device: "iPhone")
    let second = try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: root.appendingPathComponent("destino"), owner: "Ana:1", device: "iPhone")
    try expect(first.folder != second.folder, "Se mezclaron identidades")
}
test("Mismo nombre y distinto contenido conserva ambas versiones") { root in
    let scan = try setup(root), first = try archive(root, scan)
    try Data("nueva versión".utf8).write(to: URL(fileURLWithPath: scan.files[0].sourcePath))
    let next = try ArchiveEngine.scan(scan.root), second = try archive(root, next)
    try expect(second.copied == 1 && second.reused == 1, "No se guardó una versión nueva")
    try expect(try ArchiveEngine.loadManifest(first.folder).records.count == 3, "Se perdió la versión anterior")
}
test("Componentes de Live Photo conservan nombre base y carpeta") { root in
    let source = root.appendingPathComponent("origen")
    _ = try write(source, "IMG_100.HEIC", "foto de prueba"); _ = try write(source, "IMG_100.MOV", "video de prueba"); _ = try write(source, "IMG_100.AAE", "edición")
    let scan = try ArchiveEngine.scan(source), result = try archive(root, scan), records = try ArchiveEngine.loadManifest(result.folder).records
    try expect(records.count == 3, "Faltan componentes")
    try expect(Set(records.map { URL(fileURLWithPath: $0.storedPath).deletingPathExtension().path }).count == 1, "Se separaron los componentes")
}
test("WhatsApp iPhone Unicode, sistema y multilínea") { _ in
    let chat = WhatsApp.parse("\u{200e}[10/10/26, 12:00:00] Mensajes cifrados\n[10/10/26, 12:01:00] Ana: Hola 👋\nSegunda línea\n[10/10/26, 12:02:00] Luis: Sí\n")
    try expect(chat.messages.count == 3 && chat.participants == ["Ana", "Luis"], "Participantes o mensajes incorrectos")
    try expect(chat.messages[1].text.contains("Segunda línea"), "Mensaje multilínea roto")
}
test("WhatsApp Android y fechas sin interpretación ambigua") { _ in
    let chat = WhatsApp.parse("10/12/26, 9:01 PM - Ana: archivo adjunto\n11/12/26, 9:02 PM - Luis: recibido")
    try expect(chat.messages.count == 2 && chat.messages[0].timestamp == "10/12/26, 9:01 PM", "Fecha alterada")
}
test("WhatsApp límite de vista explícito") { _ in
    let chat = WhatsApp.parse("[1/1/26, 1:00] Ana: uno\n[1/1/26, 1:01] Ana: dos", limit: 1)
    try expect(chat.limited && chat.messages.count == 1, "No se marcó el límite")
}
test("TXT ajeno a WhatsApp se rechaza") { root in
    let file = try write(root, "texto.txt", "No es una conversación")
    try rejects { _ = try WhatsApp.load(file) }
}
test("Preferencias corruptas no se reinician silenciosamente") { root in
    let url = try write(root, "preferences.json", "contenido inválido")
    try rejects { _ = try Persistence.load(url) }
    try expect(try String(contentsOf: url) == "contenido inválido", "Preferencias sobrescritas")
}
test("Preferencias e historial sobreviven una nueva lectura") { root in
    var state = Preferences(); state.profiles = [FamilyProfile(owner: "José", device: "iPhone 13")]
    state.history = [HistoryEntry(owner: "José", device: "iPhone 13", folder: "/Volumes/Familia", copied: 2, reused: 3)]
    let url = root.appendingPathComponent("data/preferences.json"); try Persistence.save(state, to: url)
    let read = try Persistence.load(url); try expect(read.profiles == state.profiles && read.history[0].reused == 3, "Persistencia incorrecta")
}
test("Respaldo: lectura de metadatos cifrado y finalizado") { root in
    for (name, object) in [("Info.plist", ["Device Name": "iPhone prueba", "Product Version": "18.0"] as [String: Any]), ("Manifest.plist", ["IsEncrypted": true]), ("Status.plist", ["SnapshotState": "finished", "Date": Date()])] {
        try PropertyListSerialization.data(fromPropertyList: object, format: .binary, options: 0).write(to: root.appendingPathComponent(name))
    }
    _ = try write(root, "Manifest.db", "fixture: solo metadatos")
    let info = try BackupInspector.inspect(root); try expect(info.encrypted && info.finished && info.name == "iPhone prueba", "Estado incorrecto")
    try rejects { _ = try ArchiveEngine.scan(root) }
}
test("Archivos fuera del origen nunca se archivan") { root in
    var scan = try setup(root); scan.files[0].sourcePath = try write(root, "fuera.txt").path
    let result = try archive(root, scan); try expect(result.errors.count == 1, "Se archivó un origen externo")
}

test("Descarga incompleta queda oculta y fuera del análisis") { root in
    let stage = root.appendingPathComponent(".recibiendo-prueba")
    let main = try write(stage, "IMG_1.JPG", "parcial")
    try rejects { _ = try DeviceImport.accept(mainFile: main, staging: stage, expectedBytes: 500, destination: root.appendingPathComponent("DCIM"), date: nil) }
    try expect(try ArchiveEngine.scan(root).files.isEmpty, "Se analizó una descarga parcial")
    try expect(FileManager.default.fileExists(atPath: main.path), "Se perdió el archivo para diagnóstico")
}
test("Descarga completa y complemento se incorporan juntos") { root in
    let stage = root.appendingPathComponent(".recibiendo-prueba")
    let main = try write(stage, "IMG_1.JPG", "foto")
    _ = try write(stage, "IMG_1.AAE", "edición")
    let count = try DeviceImport.accept(mainFile: main, staging: stage, expectedBytes: 4, destination: root.appendingPathComponent("DCIM"), date: Date())
    try expect(count == 2 && ArchiveEngine.scan(root).files.count == 2, "Faltan archivos recibidos")
}
test("Registro interrumpido recupera líneas completas y omite cola incompleta") { root in
    let scan = try setup(root), token = Cancellation()
    try rejects { _ = try ArchiveEngine.archive(scan.files, sourceRoot: scan.root, destination: root.appendingPathComponent("destino"), owner: "Ana", device: "iPhone", cancel: token, progress: { i, _, _ in if i == 1 { token.cancel() } }) }
    let enumerator = FileManager.default.enumerator(at: root.appendingPathComponent("destino"), includingPropertiesForKeys: nil)!
    let journal = enumerator.compactMap { $0 as? URL }.first { $0.lastPathComponent == ".journal.jsonl" }!
    let handle = try FileHandle(forWritingTo: journal); try handle.seekToEnd(); try handle.write(contentsOf: Data("{incompleto".utf8)); try handle.close()
    let manifest = try ArchiveEngine.loadManifest(journal.deletingLastPathComponent())
    try expect(manifest.records.count == 1, "No se recuperó el registro completo")
    let retry = try archive(root, scan); try expect(retry.copied == 1 && retry.reused == 1, "La recuperación no retomó el progreso")
}
test("Lote de 300 archivos se archiva y vuelve a verificar") { root in
    let source = root.appendingPathComponent("origen")
    for index in 0..<300 { _ = try write(source, "carpeta/archivo-\(index).txt", "Contenido \(index)") }
    let scan = try ArchiveEngine.scan(source), result = try archive(root, scan)
    try expect(result.copied == 300 && result.errors.isEmpty, "Lote incompleto")
    try expect(try ArchiveEngine.verify(result.folder).isEmpty, "Lote sin integridad")
}

test("Prueba USB mantiene juntos los componentes y elige grupos pequeños") { _ in
    var catalog: [ImportItem] = []
    for index in 0..<21 {
        let bytes = Int64(index + 1)
        catalog.append(ImportItem(index: index * 2, path: "DCIM/IMG_\(index).HEIC", bytes: bytes * 10))
        catalog.append(ImportItem(index: index * 2 + 1, path: "DCIM/IMG_\(index).MOV", bytes: bytes * 100))
    }
    let plan = try ImportPlan(catalog: catalog, scope: .sample)
    try expect(plan.items.count == 40 && !plan.items.contains { $0.index >= 40 }, "Se separaron componentes o se eligió el grupo grande")
    try expect(plan.knownBytes == 23_100, "Tamaño del lote incorrecto")
}
test("Prueba USB distingue carpetas y prioriza tamaños conocidos") { _ in
    let catalog = (0..<21).map { ImportItem(index: $0, path: "carpeta-\($0)/IMG.JPG", bytes: $0 == 0 ? -1 : 100) }
    let plan = try ImportPlan(catalog: catalog, scope: .sample)
    try expect(plan.items.count == 20 && !plan.items.contains { $0.index == 0 }, "Nombres iguales de carpetas distintas se mezclaron")
    let all = try ImportPlan(catalog: catalog, scope: .all)
    try expect(all.items.count == 21 && all.unknownSizes == 1 && all.knownBytes == 2000, "Se ocultó el tamaño desconocido")
}
test("Previsión USB rechaza falta de espacio antes de copiar") { _ in
    let plan = try ImportPlan(catalog: [ImportItem(index: 0, path: "video.MOV", bytes: 10_000_000_000)], scope: .all)
    try expect(plan.requiredBytes == 11_000_000_000, "Margen incorrecto")
    try rejects { try plan.checkSpace(available: plan.requiredBytes - 1) }
    try plan.checkSpace(available: plan.requiredBytes)
}
test("Catálogo USB excesivo no desborda ni bloquea la aplicación") { _ in
    try rejects { _ = try ImportPlan(catalog: [ImportItem(index: 0, path: "a", bytes: Int64.max), ImportItem(index: 1, path: "b", bytes: 100)], scope: .all) }
    try rejects { _ = try ImportPlan(catalog: [ImportItem(index: 0, path: "a", bytes: Int64.max)], scope: .sample) }
}
test("Conflicto de complemento conserva toda la descarga apartada") { root in
    let stage = root.appendingPathComponent(".recibiendo-prueba"), target = root.appendingPathComponent("DCIM")
    let main = try write(stage, "IMG.JPG", "foto")
    _ = try write(stage, "IMG.AAE", "edición nueva")
    let existing = try write(target, "IMG.AAE", "edición anterior")
    try rejects { _ = try DeviceImport.accept(mainFile: main, staging: stage, expectedBytes: 4, destination: target, date: nil) }
    try expect(FileManager.default.fileExists(atPath: main.path), "Se movió la foto antes de validar el complemento")
    try expect(try String(contentsOf: existing) == "edición anterior", "Se sobrescribió contenido")
}
test("Detener validación USB conserva los archivos recibidos") { root in
    let stage = root.appendingPathComponent(".recibiendo-prueba"), target = root.appendingPathComponent("DCIM")
    let main = try write(stage, "IMG.JPG", "foto"), token = Cancellation(); token.cancel()
    try rejects { _ = try DeviceImport.accept(mainFile: main, staging: stage, expectedBytes: 4, destination: target, date: nil, cancel: token) }
    try expect(FileManager.default.fileExists(atPath: main.path) && !FileManager.default.fileExists(atPath: target.path), "La cancelación alteró archivos")
}
test("Descarga repetida idéntica se acepta sin sobrescribir destino") { root in
    let stage = root.appendingPathComponent(".recibiendo-prueba"), target = root.appendingPathComponent("DCIM")
    let main = try write(stage, "IMG.JPG", "foto"), existing = try write(target, "IMG.JPG", "foto")
    let before = try SafeFiles.regular(existing)[.modificationDate] as? Date
    try expect(try DeviceImport.accept(mainFile: main, staging: stage, expectedBytes: 4, destination: target, date: nil) == 1, "No se aceptó la coincidencia")
    try expect(try SafeFiles.regular(existing)[.modificationDate] as? Date == before, "Se reescribió el archivo")
}

test("Catálogo sin avances avisa y se recupera cuando llegan elementos") { _ in
    var state = CatalogProgress(now: 0)
    try expect(!state.update(percent: 0, count: 0, sessionOpen: true, restricted: false, now: 0), "Aviso prematuro")
    try expect(state.update(percent: 0, count: 0, sessionOpen: true, restricted: false, now: 61), "Espera sin límite")
    try expect(!state.update(percent: 0, count: 20, sessionOpen: true, restricted: false, now: 62), "No reconoce avance con porcentaje cero")
    try expect(!state.update(percent: 0, count: 21, sessionOpen: true, restricted: false, now: 120), "Penaliza catálogo grande que avanza")
}
test("Catálogo completo requiere sesión y acceso, no solo porcentaje") { _ in
    try expect(CatalogProgress.isReady(sessionOpen: true, restricted: false, percent: 0, completionReceived: true), "Ignora confirmación completa de Apple")
    try expect(!CatalogProgress.isReady(sessionOpen: false, restricted: false, percent: 100, completionReceived: true), "Permite sesión cerrada")
    try expect(!CatalogProgress.isReady(sessionOpen: true, restricted: true, percent: 100, completionReceived: true), "Permite acceso restringido")
    try expect(!CatalogProgress.isReady(sessionOpen: true, restricted: false, percent: 30, completionReceived: false), "Permite catálogo parcial")
}

test("Reanudar USB conserva existentes y calcula solo pendientes") { root in
    let existing = try write(root, "DCIM/2026/IMG.JPG", "foto")
    let catalog = [USBItem(index: 0, path: "DCIM/2026/IMG.JPG", bytes: 4), USBItem(index: 1, path: "DCIM/2026/NEW.MOV", bytes: 10)]
    let before = try SafeFiles.regular(existing)[.modificationDate] as? Date
    let result = try USBResume.prepare(root: root, deviceID: "lina", deviceName: "Lina", catalog: catalog)
    try expect(result.reused == 1 && result.pending.count == 1 && result.pending[0].index == 1, "Vuelve a copiar lo existente: \(result.reused) / \(result.scan.files.map(\.relativePath)) / \(result.conflicts)")
    try expect(result.manifest.records[catalog[0].path]?.evidence == "legacy_metadata", "Presenta metadatos como verificación remota")
    try expect(try SafeFiles.regular(existing)[.modificationDate] as? Date == before, "Alteró un original local")
    try USBResume.save(result.manifest, root: root)
    try expect(try USBResume.load(root)?.deviceID == "lina", "No conserva la identidad")
}
test("Reanudar USB detecta corrupción del mismo tamaño y conserva evidencia") { root in
    let file = try write(root, "DCIM/A.JPG", "foto")
    let catalog = [USBItem(index: 0, path: "DCIM/A.JPG", bytes: 4)]
    let first = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: catalog)
    try USBResume.save(first.manifest, root: root)
    try Data("otra".utf8).write(to: file)
    let second = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: catalog)
    try expect(second.reused == 0 && second.pending.isEmpty && second.conflicts.count == 1, "Acepta o sobrescribe contenido cambiado")
    try USBResume.save(second.manifest, root: root)
    let third = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: catalog)
    try expect(third.conflicts.count == 1, "Perdió evidencia del conflicto y aceptó el archivo cambiado")
}
test("Reanudar USB rechaza otro teléfono y rutas que colisionan") { root in
    try USBResume.save(USBManifest(deviceID: "1", deviceName: "Lina", catalog: []), root: root)
    try rejects { _ = try USBResume.prepare(root: root, deviceID: "2", deviceName: "Lina", catalog: []) }
    try rejects { _ = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: [USBItem(index: 0, path: "DCIM/A.JPG", bytes: 4), USBItem(index: 1, path: "DCIM/a.jpg", bytes: 4)]) }
}
test("Reanudar USB aparta incompletos y pospone el archivo atascado") { root in
    _ = try write(root, ".recibiendo-test/A.MOV", "parcial")
    let catalog = [USBItem(index: 0, path: "DCIM/A.MOV", bytes: 400), USBItem(index: 1, path: "DCIM/B.JPG", bytes: 4)]
    let result = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: catalog)
    try expect(result.scan.files.isEmpty && result.reused == 0 && result.pending.map(\.index) == [1,0], "Incluye descarga incompleta o la intenta primero")
}
test("Registro USB recupera entrega antes de una interrupción") { root in
    let file = try write(root, "DCIM/A.JPG", "foto")
    let item = USBItem(index: 0, path: "DCIM/A.JPG", bytes: 4)
    try USBResume.save(USBManifest(deviceID: "1", deviceName: "Lina", catalog: [item]), root: root)
    try USBResume.append(USBRecord(remote: item, sha256: SafeFiles.hash(file), evidence: "download"), root: root)
    let journal = root.appendingPathComponent(".usb-received.jsonl")
    let handle = try FileHandle(forWritingTo: journal); try handle.seekToEnd(); try handle.write(contentsOf: Data("{incompleto".utf8)); try handle.close()
    let result = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: [item])
    try expect(result.reused == 1 && result.manifest.records[item.path]?.evidence == "download", "Perdió entrega confirmada")
}
test("Reanudar USB conserva conflictos de tamaño y no cuenta ausencia como borrado") { root in
    _ = try write(root, "DCIM/A.JPG", "foto")
    let result = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: [USBItem(index: 0, path: "DCIM/A.JPG", bytes: 9)])
    try expect(result.reused == 0 && result.pending.isEmpty && result.conflicts.count == 1, "Ignora diferencia de tamaño")
    let absent = try USBResume.prepare(root: root, deviceID: "1", deviceName: "Lina", catalog: [])
    try expect(absent.statuses["DCIM/A.JPG"] == "Solo local / no expuesto en este catálogo", "Afirma que se borró del teléfono")
}
test("Vigilancia de transferencia distingue archivo grande de bloqueo") { _ in
    var watch = TransferWatchdog(now: 0)
    try expect(!watch.stalled(bytes: 0, now: 0), "Bloqueo prematuro")
    try expect(!watch.stalled(bytes: 100, now: 170), "Interrumpe archivo que avanza")
    try expect(!watch.stalled(bytes: 100, now: 300), "No renueva espera tras avance")
    try expect(watch.stalled(bytes: 100, now: 351), "Espera indefinidamente")
}

test("Lectura de huellas de 128 MiB libera cada bloque") { root in
    let url = root.appendingPathComponent("grande.bin")
    _ = FileManager.default.createFile(atPath: url.path, contents: nil)
    let writer = try FileHandle(forWritingTo: url)
    try writer.truncate(atOffset: 128 * 1024 * 1024); try writer.close()
    let hash = try SafeFiles.hash(url)
    try expect(hash == "254bcc3fc4f27172636df4bf32de9f107f620d559b20d760197e452b97453917", "Huella incorrecta al procesar bloques grandes")
}

test("Índice de galería sigue funcionando al mover la biblioteca") { root in
    let source = root.appendingPathComponent("antigua"); _ = try write(source, "DCIM/IMG_1.JPG", "foto")
    try LibraryIndex.save(ArchiveEngine.scan(source))
    let target = root.appendingPathComponent("simple"); try FileManager.default.moveItem(at: source, to: target)
    let loaded = try LibraryIndex.load(target)!
    try expect(loaded.files.first?.sourcePath == target.appendingPathComponent("DCIM/IMG_1.JPG").path, "Índice apunta a la ubicación antigua")
}
test("Índice de galería rechaza rutas fuera de biblioteca") { root in
    _ = try write(root, "IMG.JPG"); try LibraryIndex.save(ArchiveEngine.scan(root))
    let url = root.appendingPathComponent(".gallery-index.json")
    var j = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    var files = j["files"] as! [[String: Any]]; files[0]["relativePath"] = "../fuera.jpg"; j["files"] = files
    try JSONSerialization.data(withJSONObject: j).write(to: url)
    try rejects { _ = try LibraryIndex.load(root) }
}
test("Revisión incluye Live Photo y edición sin ejecutar borrado") { root in
    _ = try write(root, "DCIM/IMG_100.JPG", "foto"); _ = try write(root, "DCIM/IMG_100.MOV", "video"); _ = try write(root, "DCIM/IMG_E100.AAE", "edit")
    let scan = try ArchiveEngine.scan(root)
    let catalog = scan.files.enumerated().map { USBItem(index: $0.offset, path: $0.element.relativePath, bytes: $0.element.bytes) }
    var m = USBManifest(deviceID: "A", deviceName: "iPhone", catalog: catalog)
    for (i,file) in scan.files.enumerated() { m.records[file.relativePath] = USBRecord(remote: catalog[i], sha256: file.sha256, evidence: "downloaded") }
    let review = try CleanupPlanner.prepare(scan: scan, selectedPaths: ["DCIM/IMG_100.JPG"], manifest: m)
    try expect(review.items.count == 3 && review.items.filter { $0.addedCompanion }.count == 2, "Se separaron componentes asociados")
    try expect(!review.currentPhoneCompared && review.operation == "review_only", "Catálogo histórico presentado como actual")
    try expect(try ArchiveEngine.scan(root).files.count == 3, "Se alteraron los originales")
}
test("Revisión vuelve a calcular hash y detecta corrupción de igual tamaño") { root in
    let path = try write(root, "DCIM/IMG_1.JPG", "aaaa")
    let scan = try ArchiveEngine.scan(root), file = scan.files[0]
    let remote = USBItem(index: 0, path: file.relativePath, bytes: file.bytes)
    var m = USBManifest(deviceID: "A", deviceName: "iPhone", catalog: [remote])
    m.records[file.relativePath] = USBRecord(remote: remote, sha256: file.sha256, evidence: "downloaded")
    try Data("bbbb".utf8).write(to: path)
    let result = try CleanupPlanner.prepare(scan: scan, selectedPaths: [file.relativePath], manifest: m)
    try expect(!result.items[0].issues.isEmpty, "Aceptó una copia modificada")
    try rejects { _ = try CleanupPlanner.prepare(scan: scan, selectedPaths: [file.relativePath], manifest: m, currentCatalog: [remote], currentDeviceID: "B") }
}
test("Revisión bloquea evidencia antigua y componente pendiente") { root in
    _ = try write(root, "DCIM/IMG_1.JPG", "foto")
    let scan = try ArchiveEngine.scan(root), f = scan.files[0]
    let r = USBItem(index: 0, path: f.relativePath, bytes: f.bytes)
    let missing = USBItem(index: 1, path: "DCIM/IMG_E1.MOV", bytes: 50)
    var m = USBManifest(deviceID: "A", deviceName: "iPhone", catalog: [r, missing])
    m.records[f.relativePath] = USBRecord(remote: r, sha256: f.sha256, evidence: "legacy_metadata")
    let review = try CleanupPlanner.prepare(scan: scan, selectedPaths: [f.relativePath], manifest: m, currentCatalog: [r, missing], currentDeviceID: "A")
    try expect(review.currentPhoneCompared && review.items[0].issues.count == 2, "No advierte evidencia antigua o componente ausente")
    try rejects { _ = try CleanupPlanner.prepare(scan: scan, selectedPaths: ["DCIM/noexiste.JPG"], manifest: m) }
}

test("Diagnóstico separa tamaños USB de coincidencias y detecta el vídeo pendiente") { _ in
    let photo = USBItem(index: 0, path: "DCIM/IMG_1.HEIC", bytes: 20)
    let video = USBItem(index: 1, path: "DCIM/IMG_2.MOV", bytes: 400)
    let unknownSize = USBItem(index: 2, path: "DCIM/IMG_3.MOV", bytes: -1)
    var saved = USBManifest(deviceID: "A", deviceName: "iPhone", catalog: [photo, video, unknownSize])
    saved.records[photo.path] = USBRecord(remote: photo, sha256: String(repeating: "a", count: 64), evidence: "download")
    let advice = StorageAdvice.make(saved: saved, live: nil, observation: nil)
    try expect(advice.catalogueDate == saved.checkedAt && advice.registeredCount == 1, "El informe confundió el catálogo con lo copiado")
    try expect(advice.videoBytes == 400 && advice.photoBytes == 20 && advice.unregisteredExamples == ["IMG_2.MOV", "IMG_3.MOV"], "Sumó bytes desconocidos o perdió los pendientes")
    try expect(advice.suggestions.allSatisfy { !$0.title.contains("Spotify") }, "Recomendó una app específica sin evidencia")
    let changed = USBItem(index: 0, path: photo.path, bytes: 23)
    let live = StorageAdvice.make(saved: saved, live: [changed], observation: nil)
    try expect(live.photoBytes == 23 && live.registeredCount == 0, "Trató un elemento cambiado como copiado")
}

test("Diagnóstico solo usa observaciones del dispositivo correspondiente") { root in
    _ = try write(root, ".storage-observation.json", """
        {"deviceID":"A","observedAt":"2026-11-04T20:00:00Z","availableBytes":475300000,"visibleApps":["Spotify"]}
        """)
    let observation = try StorageObservation.load(root, deviceID: "A")
    let advice = StorageAdvice.make(saved: nil, live: nil, observation: observation)
    try expect(advice.suggestions.first?.title.hasPrefix("Spotify") == true && advice.catalogueDate == nil, "No separó la observación de la medición USB")
    try expect(try StorageObservation.load(root, deviceID: "B") == nil, "Mezcló observaciones de dos iPhone")
}

test("Revisión de fotos aparta archivos ajenos, ediciones, Live Photos y evidencia antigua") { _ in
    let paths = ["DCIM/IMG_1.JPG", "DCIM/IMG_2.HEIC", "DCIM/IMG_2.MOV", "DCIM/IMG_E3.JPG",
                 "DCIM/IMG_4.JPG", "WhatsApp/IMG_5.JPG", "DCIM/IMG_6.JPG"]
    let catalogue = paths.enumerated().map { USBItem(index: $0.offset, path: $0.element, bytes: 100) }
    var saved = USBManifest(deviceID: "iPhone A", deviceName: "iPhone", catalog: catalogue)
    for item in catalogue.dropLast() {
        saved.records[item.path] = USBRecord(remote: item, sha256: String(repeating: "b", count: 64),
                                             evidence: item.path == "DCIM/IMG_4.JPG" ? "legacy_metadata" : "download")
    }
    let options = try PhotoRemoval.candidates(manifest: saved, catalogue: catalogue, deviceID: "iPhone A")
    try expect(options.map(\.remote.path) == ["DCIM/IMG_1.JPG"], "Admitió un elemento protegido o sin respaldo")
    try rejects { _ = try PhotoRemoval.candidates(manifest: saved, catalogue: catalogue, deviceID: "iPhone B") }
}

test("Cotejo de foto verifica el contenido y bloquea cambios o complementos") { root in
    let backup = try write(root, "DCIM/IMG_1.PNG")
    let sample = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ipx4AAAAASUVORK5CYII=")!
    try sample.write(to: backup)
    let item = USBItem(index: 0, path: "DCIM/IMG_1.PNG", bytes: Int64(sample.count))
    let record = USBRecord(remote: item, sha256: try SafeFiles.hash(backup), evidence: "download")
    let photo = try PhotoRemoval.verify(record, under: root)
    let remote = root.appendingPathComponent("temporal.PNG")
    try sample.write(to: remote)
    _ = try PhotoRemoval.verifyCurrentCopy(remote, photo: photo)
    try rejects { _ = try PhotoRemoval.Permission(photo: photo, secondCopy: remote) }
    var changed = sample; changed[20] ^= 1
    try changed.write(to: remote)
    try rejects { _ = try PhotoRemoval.verifyCurrentCopy(remote, photo: photo) }
    _ = try write(root, "DCIM/IMG_1.AAE")
    try rejects { _ = try PhotoRemoval.verify(record, under: root) }
    try expect(try Data(contentsOf: backup) == sample, "Modificó el archivo del respaldo")
}

test("Simulación: cancelar o perder la sesión impide enviar un borrado") { _ in
    var requests = 0
    let fakeRequest = { requests += 1 }
    try expect(!PhotoRemoval.submit(confirmed: false, stillAllowed: { true }, request: fakeRequest), "Envió sin confirmación")
    try expect(!PhotoRemoval.submit(confirmed: true, stillAllowed: { false }, request: fakeRequest), "Envió con contexto vencido")
    try expect(requests == 0, "La operación simulada cambió tras un rechazo")
    try expect(PhotoRemoval.submit(confirmed: true, stillAllowed: { true }, request: fakeRequest) && requests == 1, "No envió una única foto confirmada")
}

test("Prueba desechable acepta solo una foto posterior sin alterar el catálogo anterior") { _ in
    let volume = try JSONDecoder().decode(DisposablePhotoTrial.RecoveryVolume.self,
        from: Data(#"{"path":"/Volumes/Prueba","mount":5}"#.utf8))
    let start = Date(timeIntervalSince1970: 1_800_000_000)
    let existing = USBItem(index: 0, path: "DCIM/IMG_1.HEIC", bytes: 300, created: start.addingTimeInterval(-10))
    let new = USBItem(index: 1, path: "DCIM/IMG_2.HEIC", bytes: 300, created: start.addingTimeInterval(5))
    let trial = try DisposablePhotoTrial(deviceID: "A", catalogue: [existing], volume: volume, now: start)
    let now = start.addingTimeInterval(20)
    try expect(try trial.candidate(in: [existing, new], deviceID: "A", now: now) == new, "No admitió la única foto nueva")
    try rejects { _ = try trial.candidate(in: [existing, new], deviceID: "B", now: now) }
    try rejects { _ = try trial.candidate(in: [existing], deviceID: "A", now: now) }
    let extra = USBItem(index: 2, path: "DCIM/IMG_3.HEIC", bytes: 300, created: now)
    try rejects { _ = try trial.candidate(in: [existing, new, extra], deviceID: "A", now: now) }
    var changed = existing; changed.bytes += 1
    try rejects { _ = try trial.candidate(in: [changed, new], deviceID: "A", now: now) }
    var oldNew = new; oldNew.created = start.addingTimeInterval(-1)
    try rejects { _ = try trial.candidate(in: [existing, oldNew], deviceID: "A", now: now) }
    try rejects { _ = try trial.candidate(in: [existing, new], deviceID: "A", now: start.addingTimeInterval(1_801)) }
}

test("Prueba desechable reconoce solo el QR exclusivo de su sesión") { root in
    let volume = try JSONDecoder().decode(DisposablePhotoTrial.RecoveryVolume.self,
        from: Data(#"{"path":"/Volumes/Prueba","mount":5}"#.utf8))
    let item = USBItem(index: 0, path: "DCIM/IMG_1.JPG", bytes: 100)
    let trial = try DisposablePhotoTrial(deviceID: "A", catalogue: [item], volume: volume)
    let other = try DisposablePhotoTrial(deviceID: "A", catalogue: [item], volume: volume)
    let qr = CIFilter(name: "CIQRCodeGenerator", parameters: ["inputMessage": Data(trial.marker.utf8)])!.outputImage!
        .transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        .transformed(by: CGAffineTransform(translationX: 40, y: 40))
    let white = CIImage(color: .white).cropped(to: CGRect(x: 0, y: 0, width: 400, height: 400))
    let file = root.appendingPathComponent("marca.png")
    try CIContext().writePNGRepresentation(of: qr.composited(over: white), to: file, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
    try trial.verifyMarker(in: file)
    try rejects { try other.verifyMarker(in: file) }
}

test("El catálogo completo puede reexponer solo archivos que constaban antes de la prueba") { _ in
    let volume = try JSONDecoder().decode(DisposablePhotoTrial.RecoveryVolume.self,
        from: Data(#"{"path":"/Volumes/Prueba","mount":5}"#.utf8))
    let start = Date(timeIntervalSince1970: 1_800_000_000)
    let existing = USBItem(index: 0, path: "DCIM/IMG_1.HEIC", bytes: 300)
    let reappeared = USBItem(index: 1, path: "DCIM/IMG_2.HEIC", bytes: 300)
    let new = USBItem(index: 2, path: "DCIM/IMG_3.HEIC", bytes: 300, created: start.addingTimeInterval(5))
    let trial = try DisposablePhotoTrial(deviceID: "A", catalogue: [existing], volume: volume, now: start)
    var earlier = USBManifest(deviceID: "A", deviceName: "iPhone", catalog: [existing, reappeared])
    earlier.checkedAt = start.addingTimeInterval(-10)
    let expanded = try trial.includingEarlierCatalogue(earlier)
    try expect(expanded.marker == trial.marker, "Cambió el QR al recuperar la prueba")
    try expect(try expanded.candidate(in: [existing, reappeared, new], deviceID: "A", now: start.addingTimeInterval(10)) == new,
               "No reconoció los elementos ya existentes")
    var changed = reappeared; changed.bytes += 1
    try rejects { _ = try expanded.candidate(in: [existing, changed, new], deviceID: "A", now: start.addingTimeInterval(10)) }
    earlier.checkedAt = start.addingTimeInterval(10)
    try rejects { _ = try trial.includingEarlierCatalogue(earlier) }
}

print("\n\(passed) comprobaciones aprobadas; \(failures.count) fallidas.")
if !failures.isEmpty { failures.forEach { print($0) }; exit(1) }
