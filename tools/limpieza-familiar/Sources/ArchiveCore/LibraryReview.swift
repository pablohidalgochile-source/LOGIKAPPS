import Foundation
import Darwin

/// A browsing index, never evidence that the current phone contents are backed up.
public struct LibraryIndex: Codable {
    public var date: Date
    public var files: [MediaFile]
    public static func save(_ scan: ScanResult) throws {
        let url = try SafeFiles.relativeURL(".gallery-index.json", under: scan.root)
        let data = try JSONEncoder().encode(LibraryIndex(date: Date(), files: scan.files))
        try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    public static func load(_ root: URL) throws -> LibraryIndex? {
        let url = try SafeFiles.relativeURL(".gallery-index.json", under: root)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let data = try SafeFiles.readMetadata(url, limit: 30_000_000, sizeError: "Índice demasiado grande; vuelve a verificar la biblioteca.")
        var index = try JSONDecoder().decode(Self.self, from: data)
        var paths = Set<String>()
        for i in index.files.indices {
            let relative = index.files[i].relativePath
            guard paths.insert(relative.lowercased()).inserted else { throw ArchiveError.message("Índice con rutas repetidas.") }
            index.files[i].sourcePath = try SafeFiles.relativeURL(relative, under: root).path
        }
        return index
    }
}

public struct CleanupReviewItem: Codable, Identifiable {
    public var file: MediaFile
    public var addedCompanion: Bool
    public var issues: [String]
    public var id: String { file.relativePath }
}
public struct CleanupReview: Encodable {
    public var schema = 1
    public var createdAt = Date()
    public var deviceID: String
    public var root: String
    public var currentPhoneCompared: Bool
    public var items: [CleanupReviewItem]
    public var notices: [String]
    // This is a review artifact. There is deliberately no deletion capability or approval token.
    public let operation = "review_only"
    public var bytes: Int64 { items.reduce(0) { $0 + $1.file.bytes } }
}

public enum CleanupPlanner {
    /// Conservative same-folder grouping includes original, edit, Live Photo and sidecar names.
    public static func group(_ path: String) -> String {
        let u = URL(fileURLWithPath: path)
        var stem = u.deletingPathExtension().lastPathComponent.lowercased()
        if stem.hasPrefix("img_e") { stem = "img_" + stem.dropFirst(5) }
        return u.deletingLastPathComponent().path.lowercased() + "/" + stem
    }
    public static func prepare(scan: ScanResult, selectedPaths: Set<String>, manifest: USBManifest,
                               currentCatalog: [USBItem]? = nil, currentDeviceID: String? = nil,
                               cancel: Cancellation = Cancellation()) throws -> CleanupReview {
        guard !selectedPaths.isEmpty else { throw ArchiveError.message("Selecciona fotos o vídeos para revisar.") }
        guard selectedPaths.isSubset(of: Set(scan.files.map(\.relativePath))) else { throw ArchiveError.message("La selección ya no corresponde a esta biblioteca.") }
        if let id = currentDeviceID, id != manifest.deviceID { throw ArchiveError.message("El iPhone conectado no es el de este respaldo.") }
        let groups = Set(selectedPaths.map(group))
        let candidates = scan.files.filter { groups.contains(group($0.relativePath)) }
        let catalog = currentCatalog ?? manifest.catalog
        let knownPaths = Set(scan.files.map(\.relativePath))
        let recordsByLocal = Dictionary(manifest.records.values.map { ($0.remote.localPath, $0) }, uniquingKeysWith: { first, _ in first })
        let remoteGroups = Dictionary(grouping: catalog, by: { group($0.localPath) })
        let currentByPath = Dictionary(catalog.map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
        var rows: [CleanupReviewItem] = []
        for source in candidates {
            try cancel.check()
            var file = source; var issues: [String] = []
            let path = try SafeFiles.relativeURL(file.relativePath, under: scan.root)
            do {
                let before = try SafeFiles.regular(path)
                let hash = try SafeFiles.hash(path, cancel: cancel)
                let after = try SafeFiles.regular(path)
                guard before[.size] as? NSNumber == after[.size] as? NSNumber,
                      before[.modificationDate] as? Date == after[.modificationDate] as? Date else { throw ArchiveError.message("El archivo cambió al comprobarlo.") }
                file.bytes = (after[.size] as? NSNumber)?.int64Value ?? 0; file.sha256 = hash; file.sourcePath = path.path
                if let record = recordsByLocal[file.relativePath] {
                    if record.sha256 != hash || record.remote.bytes != file.bytes { issues.append("La copia no coincide con la huella o tamaño registrados.") }
                    if record.evidence == "legacy_metadata" { issues.append("Copia antigua adoptada por ruta y tamaño; falta comprobar el contenido original del iPhone.") }
                    if !(currentByPath[record.remote.path]?.sameRemote(record.remote) ?? false) { issues.append("El archivo no coincide con el catálogo disponible del iPhone.") }
                } else { issues.append("Complemento o archivo sin registro individual del iPhone.") }
                if file.kind != .photo && file.kind != .video && file.kind != .companion { issues.append("Este tipo de archivo no se prepara para borrado multimedia.") }
            } catch { try cancel.check(); issues.append(error.localizedDescription) }
            for remote in remoteGroups[group(file.relativePath)] ?? [] {
                if !knownPaths.contains(remote.localPath) {
                    issues.append("Falta copiar un componente asociado: \(remote.path)")
                }
            }
            rows.append(CleanupReviewItem(file: file, addedCompanion: !selectedPaths.contains(file.relativePath), issues: issues))
        }
        let live = currentCatalog != nil && currentDeviceID == manifest.deviceID
        return CleanupReview(deviceID: manifest.deviceID, root: scan.root.path, currentPhoneCompared: live, items: rows,
            notices: [live ? "Catálogo del iPhone cotejado al preparar esta selección." : "Solo catálogo histórico: falta cotejar con el iPhone conectado.",
                      "Pendiente tu revisión y confirmación. Este documento no autoriza ni ejecuta eliminaciones.",
                      "Antes de borrar: comprobar una segunda copia, Fotos en iCloud, componentes asociados y compatibilidad de eliminación del teléfono.",
                      "El tamaño seleccionado no garantiza el espacio que se liberará en el iPhone."])
    }
}
