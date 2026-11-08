import Foundation

public enum ArchiveError: LocalizedError {
    case message(String)
    public var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}

public final class Cancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    public init() {}
    public func cancel() { lock.lock(); value = true; lock.unlock() }
    public var cancelled: Bool { lock.lock(); defer { lock.unlock() }; return value }
    public func check() throws { if cancelled { throw ArchiveError.message("Operación detenida. Los originales se conservaron.") } }
}

public enum FileKind: String, Codable, CaseIterable {
    case photo = "Fotos", video = "Videos", audio = "Audios", document = "Documentos", companion = "Complementos", other = "Otros"
    public static func of(_ url: URL) -> FileKind {
        let ext = url.pathExtension.lowercased()
        if ["jpg", "jpeg", "heic", "heif", "png", "gif", "tiff", "tif", "dng", "webp", "bmp"].contains(ext) { return .photo }
        if ["mov", "mp4", "m4v", "avi", "3gp", "mkv"].contains(ext) { return .video }
        if ["mp3", "m4a", "aac", "wav", "aiff", "opus", "ogg", "caf", "flac"].contains(ext) { return .audio }
        if ["aae", "xmp"].contains(ext) { return .companion }
        if ["txt", "pdf", "docx", "doc", "xlsx", "csv", "rtf", "vcf"].contains(ext) { return .document }
        return .other
    }
}

public struct MediaFile: Codable, Identifiable, Hashable {
    public var id: String
    public var sourcePath: String
    public var relativePath: String
    public var bytes: Int64
    public var sha256: String
    public var date: Date
    public var dateSource: String
    public var kind: FileKind
    public var name: String { URL(fileURLWithPath: sourcePath).lastPathComponent }
    public init(sourcePath: String, relativePath: String, bytes: Int64, sha256: String, date: Date, dateSource: String, kind: FileKind) {
        self.id = UUID().uuidString; self.sourcePath = sourcePath; self.relativePath = relativePath
        self.bytes = bytes; self.sha256 = sha256; self.date = date; self.dateSource = dateSource; self.kind = kind
    }
}

public struct ScanResult {
    public var root: URL
    public var files: [MediaFile]
    public var warnings: [String]
    public var totalBytes: Int64 { files.reduce(0) { $0 + $1.bytes } }
    public var duplicateGroups: [[MediaFile]] {
        Dictionary(grouping: files.filter { $0.bytes > 0 }, by: { $0.sha256 }).values.filter { $0.count > 1 }
            .map { $0.sorted { $0.relativePath < $1.relativePath } }.sorted { $0[0].relativePath < $1[0].relativePath }
    }
    public var duplicateBytes: Int64 { duplicateGroups.reduce(0) { $0 + $1.dropFirst().reduce(0) { $0 + $1.bytes } } }
    public init(root: URL, files: [MediaFile], warnings: [String]) { self.root = root; self.files = files; self.warnings = warnings }
}

public struct ArchiveRecord: Codable, Identifiable {
    public var id: String
    public var source: MediaFile
    public var storedPath: String
    public var verifiedAt: Date
}

public struct ArchiveManifest: Codable {
    public var schema: Int = 1
    public var owner: String
    public var device: String
    public var createdAt: Date
    public var updatedAt: Date
    public var records: [ArchiveRecord]
    public var notes: String = "Archivo consultable. No es un respaldo restaurable del iPhone. No se han eliminado originales."
}

public struct ArchiveResult {
    public var folder: URL
    public var copied: Int
    public var reused: Int
    public var errors: [String]
}

public struct FamilyProfile: Codable, Identifiable, Hashable {
    public var id: String
    public var owner: String
    public var device: String
    public init(owner: String, device: String) { id = UUID().uuidString; self.owner = owner; self.device = device }
}

public struct HistoryEntry: Codable, Identifiable {
    public var id = UUID().uuidString
    public var date = Date()
    public var owner: String
    public var device: String
    public var folder: String
    public var copied: Int
    public var reused: Int
    public init(owner: String, device: String, folder: String, copied: Int, reused: Int) {
        self.owner = owner; self.device = device; self.folder = folder; self.copied = copied; self.reused = reused
    }
}

public struct USBSessionReference: Codable, Identifiable {
    public var deviceID: String
    public var deviceName: String
    public var folder: String
    public var lastOpened: Date
    public var ownerName: String?
    public var id: String { folder }
    public init(deviceID: String, deviceName: String, folder: String) {
        self.deviceID = deviceID; self.deviceName = deviceName
        self.folder = URL(fileURLWithPath: folder).standardizedFileURL.path; lastOpened = Date()
    }
}

public struct Preferences: Codable {
    public var schema = 1
    public var profiles: [FamilyProfile] = []
    public var history: [HistoryEntry] = []
    // Optional so preferences written before 0.3.3 still decode without losing profiles.
    public var usbSessions: [USBSessionReference]?
    public init() {}
    public mutating func rememberUSB(_ session: USBSessionReference) {
        var sessions = usbSessions ?? []
        var session = session
        if session.ownerName == nil { session.ownerName = sessions.first { $0.folder == session.folder }?.ownerName }
        sessions.removeAll { $0.folder == session.folder }
        sessions.insert(session, at: 0)
        usbSessions = sessions
    }
}

public enum Persistence {
    public static func load(_ url: URL) throws -> Preferences {
        guard FileManager.default.fileExists(atPath: url.path) else { return Preferences() }
        let data = try Data(contentsOf: url)
        guard data.count < 8_000_000 else { throw ArchiveError.message("El archivo de preferencias es demasiado grande. Se ha conservado intacto.") }
        let result = try JSONDecoder().decode(Preferences.self, from: data)
        guard result.schema == 1 else { throw ArchiveError.message("Versión de preferencias no compatible.") }
        return result
    }
    public static func save(_ value: Preferences, to url: URL) throws {
        try SafeFiles.makeDirectory(url.deletingLastPathComponent())
        try SafeFiles.checkNoSymlinks(url)
        try JSONEncoder().encode(value).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}
