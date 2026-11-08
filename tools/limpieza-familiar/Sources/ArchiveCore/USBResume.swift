import Foundation

public struct USBItem: Codable, Equatable {
    public var index: Int
    public var path: String
    public var bytes: Int64
    public var created: Date?
    public init(index: Int, path: String, bytes: Int64, created: Date? = nil) {
        self.index = index; self.path = path; self.bytes = bytes; self.created = created
    }
    public var localPath: String { path.split(separator: "/").map { SafeFiles.component(String($0)) }.joined(separator: "/") }
    public func sameRemote(_ other: USBItem) -> Bool { path == other.path && bytes == other.bytes && created == other.created }
}
public struct USBRecord: Codable {
    public var remote: USBItem
    public var sha256: String
    public var evidence: String
    public init(remote: USBItem, sha256: String, evidence: String) { self.remote = remote; self.sha256 = sha256; self.evidence = evidence }
}
public struct USBManifest: Codable {
    public var schema = 1
    public var deviceID: String
    public var deviceName: String
    public var checkedAt: Date
    public var catalog: [USBItem]
    public var records: [String: USBRecord]
    public var deferredPaths: [String]
    public init(deviceID: String, deviceName: String, catalog: [USBItem]) {
        self.deviceID = deviceID; self.deviceName = deviceName; self.catalog = catalog
        checkedAt = Date(); records = [:]; deferredPaths = []
    }
}
public struct USBResumePlan {
    public var manifest: USBManifest
    public var pending: [USBItem]
    public var reused: Int
    public var conflicts: [String]
    public var scan: ScanResult
    public var statuses: [String: String]
}
/// Only local files are read/written here. Metadata correspondence is never a remote content hash.
public enum USBResume {
    public static let filename = ".usb-resume.json"
    private static let journalName = ".usb-received.jsonl"
    public static func load(_ root: URL) throws -> USBManifest? {
        let url = try SafeFiles.relativeURL(filename, under: root)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let data = try SafeFiles.readMetadata(url, limit: 100_000_000, sizeError: "Registro USB demasiado grande.")
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        var result = try decoder.decode(USBManifest.self, from: data)
        guard result.schema == 1 else { throw ArchiveError.message("Versión de registro USB no compatible.") }
        let journal = try SafeFiles.relativeURL(journalName, under: root)
        if FileManager.default.fileExists(atPath: journal.path) {
            let data = try SafeFiles.readMetadata(journal, limit: 100_000_000, sizeError: "Historial USB demasiado grande.")
            let lines = data.split(separator: 10, omittingEmptySubsequences: false)
            for (i,line) in lines.enumerated() where !line.isEmpty {
                if i == lines.count - 1 && data.last != 10 { continue }
                let record = try decoder.decode(USBRecord.self, from: Data(line))
                result.records[record.remote.path] = record
            }
        }
        for record in result.records.values {
            _ = try SafeFiles.relativeURL(record.remote.localPath, under: root)
            guard record.sha256.count == 64 && record.sha256.allSatisfy(\.isHexDigit) else { throw ArchiveError.message("Huella USB inválida.") }
        }
        return result
    }
    public static func save(_ manifest: USBManifest, root: URL) throws {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601; encoder.outputFormatting = [.sortedKeys]
        let url = try SafeFiles.relativeURL(filename, under: root)
        try encoder.encode(manifest).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        // Commit the full manifest before retiring the journal, including any interrupted tail.
        let journal = try SafeFiles.relativeURL(journalName, under: root)
        try Data().write(to: journal, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: journal.path)
    }
    public static func append(_ record: USBRecord, root: URL) throws {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        var data = try encoder.encode(record); data.append(10)
        let url = try SafeFiles.relativeURL(journalName, under: root)
        let fd = Darwin.open(url.path, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw ArchiveError.message("No se pudo guardar el avance USB.") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        try handle.write(contentsOf: data); try handle.synchronize()
    }
    public static func prepare(root: URL, deviceID: String, deviceName: String, catalog: [USBItem], cancel: Cancellation = Cancellation(), progress: (Int, String) -> Void = {_,_ in}) throws -> USBResumePlan {
        guard !deviceID.isEmpty else { throw ArchiveError.message("El iPhone no proporciona un identificador para reanudar con seguridad.") }
        let previous = try load(root)
        if let previous = previous, previous.deviceID != deviceID { throw ArchiveError.message("Esta carpeta pertenece a otro dispositivo. No se mezclará su respaldo.") }
        var paths = Set<String>()
        for item in catalog {
            let local = item.localPath
            _ = try SafeFiles.relativeURL(local, under: root)
            guard paths.insert(local.lowercased()).inserted else { throw ArchiveError.message("Dos elementos del catálogo tienen la misma ruta de destino. No se iniciará la copia.") }
        }
        let scan = try ArchiveEngine.scan(root, cancel: cancel, progress: progress)
        let local = Dictionary(uniqueKeysWithValues: scan.files.map { ($0.relativePath, $0) })
        var manifest = USBManifest(deviceID: deviceID, deviceName: deviceName, catalog: catalog)
        manifest.deferredPaths = previous?.deferredPaths ?? []
        manifest.records = previous?.records ?? [:]
        var pending: [USBItem] = [], conflicts = scan.warnings, reused = 0, statuses: [String:String] = [:]
        for item in catalog {
            try cancel.check()
            guard let file = local[item.localPath] else {
                // An unsafe/unreadable existing entry must not be treated as missing.
                let target = try SafeFiles.relativeURL(item.localPath, under: root)
                if FileManager.default.fileExists(atPath: target.path) { conflicts.append("\(item.path): archivo local no legible; se conserva sin sobrescribir.") }
                else { pending.append(item) }
                continue
            }
            guard item.bytes > 0, file.bytes == item.bytes else {
                conflicts.append("\(item.path): tamaño local diferente o tamaño remoto desconocido. No se sobrescribe.")
                statuses[item.localPath] = "Revisar: tamaño diferente"; continue
            }
            let old = previous?.records[item.path]
            if let old = old, (!old.remote.sameRemote(item) || old.sha256 != file.sha256) {
                conflicts.append("\(item.path): cambió el archivo o el catálogo respecto a la huella guardada.")
                statuses[item.localPath] = "Revisar: cambió desde la copia"; continue
            }
            let evidence = old?.evidence ?? "legacy_metadata"
            manifest.records[item.path] = USBRecord(remote: item, sha256: file.sha256, evidence: evidence)
            statuses[item.localPath] = evidence == "legacy_metadata" ? "En iPhone · coincide ruta y tamaño" : "En iPhone · copia local íntegra"
            reused += 1
        }
        for file in scan.files where statuses[file.relativePath] == nil {
            statuses[file.relativePath] = "Solo local / no expuesto en este catálogo"
        }
        // A former interrupted file is attempted last, so it cannot block other missing files first.
        let incompleteNames = Set((try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil))?.filter { $0.lastPathComponent.hasPrefix(".recibiendo-") }.flatMap { (try? FileManager.default.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil)) ?? [] }.map(\.lastPathComponent) ?? [])
        pending.sort { a,b in
            let da = manifest.deferredPaths.contains(a.path) || incompleteNames.contains((a.path as NSString).lastPathComponent)
            let db = manifest.deferredPaths.contains(b.path) || incompleteNames.contains((b.path as NSString).lastPathComponent)
            return da == db ? a.index < b.index : !da
        }
        return USBResumePlan(manifest: manifest, pending: pending, reused: reused, conflicts: conflicts, scan: scan, statuses: statuses)
    }
}

public struct TransferWatchdog {
    private var lastBytes: Int64 = -1
    private var lastProgress: TimeInterval
    public init(now: TimeInterval) { lastProgress = now }
    public mutating func stalled(bytes: Int64, now: TimeInterval, timeout: TimeInterval = 180) -> Bool {
        if bytes != lastBytes { lastBytes = bytes; lastProgress = now }
        return now - lastProgress >= timeout
    }
}
