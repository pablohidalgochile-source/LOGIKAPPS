import Foundation

/// Validates files received from ImageCaptureCore before exposing them to the folder scanner.
/// The hidden staging folder is owned by this import; original phone files are never modified.
public enum DeviceImport {
    public static func accept(mainFile: URL, staging: URL, expectedBytes: Int64, destination: URL, date: Date?, cancel: Cancellation = Cancellation()) throws -> Int {
        try cancel.check()
        guard SafeFiles.isInside(mainFile, staging), mainFile.deletingLastPathComponent().standardizedFileURL == staging.standardizedFileURL else { throw ArchiveError.message("El dispositivo devolvió una ruta inesperada.") }
        let attrs = try SafeFiles.regular(mainFile)
        let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
        guard size > 0 else { throw ArchiveError.message("El archivo recibido está vacío y no se incluirá en el archivo.") }
        guard expectedBytes <= 0 || size == expectedBytes else { throw ArchiveError.message("El tamaño recibido no coincide con el anunciado. Se conserva aparte para revisión; no se considerará una copia confirmada.") }
        try SafeFiles.makeDirectory(destination)
        let received = try FileManager.default.contentsOfDirectory(at: staging, includingPropertiesForKeys: nil)
        // Validate the whole received set before moving any companion out of staging.
        // Hashing can be lengthy; callers run this method off the main thread.
        var transfers: [(URL, URL, Bool)] = []
        for file in received {
            try cancel.check()
            _ = try SafeFiles.regular(file)
            let target = try SafeFiles.relativeURL(file.lastPathComponent, under: destination)
            let exists = FileManager.default.fileExists(atPath: target.path)
            if exists {
                guard try SafeFiles.hash(file, cancel: cancel) == SafeFiles.hash(target, cancel: cancel) else { throw ArchiveError.message("Hay otro archivo diferente con el mismo nombre. Se conserva la descarga aparte: \(file.lastPathComponent)") }
            }
            transfers.append((file, target, exists))
        }
        try cancel.check()
        // Once promotion starts, finish this set before honoring cancellation.
        for (file, target, exists) in transfers {
            if !exists {
                if let date = date { try FileManager.default.setAttributes([.creationDate: date], ofItemAtPath: file.path) }
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
                try FileManager.default.moveItem(at: file, to: target)
            }
        }
        return transfers.count
    }
}
