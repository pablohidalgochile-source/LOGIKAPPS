import Foundation
import CryptoKit
import ImageIO
import Darwin

public enum SafeFiles {
    public static func component(_ name: String) -> String {
        let cleaned = name.precomposedStringWithCanonicalMapping.unicodeScalars.map {
            CharacterSet.alphanumerics.contains($0) || " -_.".unicodeScalars.contains($0) ? String($0) : "_"
        }.joined().trimmingCharacters(in: CharacterSet(charactersIn: " ."))
        return String((cleaned.isEmpty ? "Sin nombre" : cleaned).prefix(100))
    }
    public static func checkNoSymlinks(_ url: URL) throws {
        var path = url.standardizedFileURL
        // /tmp and /var are system aliases. Resolve those at the entry point, not a selected child.
        while path.path != "/" {
            var info = stat()
            let result = lstat(path.path, &info)
            if result != 0 && errno != ENOENT && errno != ENOTDIR { throw ArchiveError.message("No se pudo comprobar la ruta: \(path.lastPathComponent)") }
            if result == 0 && (info.st_mode & S_IFMT) == S_IFLNK {
                let systemAlias = ["/var": "/private/var", "/tmp": "/private/tmp"][path.path]
                let linkTarget = try? FileManager.default.destinationOfSymbolicLink(atPath: path.path)
                let absoluteTarget = linkTarget.map { $0.hasPrefix("/") ? $0 : "/" + $0 }
                if systemAlias == nil || absoluteTarget != systemAlias {
                    throw ArchiveError.message("No se permiten enlaces simbólicos en esta operación: \(path.lastPathComponent)")
                }
            }
            path.deleteLastPathComponent()
        }
    }
    public static func makeDirectory(_ url: URL) throws {
        try checkNoSymlinks(url)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try checkNoSymlinks(url)
    }
    public static func isInside(_ child: URL, _ parent: URL) -> Bool {
        func normalized(_ url: URL) -> String {
            let path = url.standardizedFileURL.path
            for alias in ["/var", "/tmp"] where path == alias || path.hasPrefix(alias + "/") { return "/private" + path }
            return path
        }
        let a = normalized(child), b = normalized(parent)
        return a == b || a.hasPrefix(b == "/" ? "/" : b + "/")
    }
    public static func relativeURL(_ path: String, under root: URL) throws -> URL {
        guard !path.isEmpty, !path.hasPrefix("/"), !path.split(separator: "/").contains(".."), !path.contains("\0") else {
            throw ArchiveError.message("Ruta de archivo no válida en el manifiesto.")
        }
        let result = root.appendingPathComponent(path).standardizedFileURL
        guard isInside(result, root) else { throw ArchiveError.message("La ruta sale de la carpeta del archivo.") }
        try checkNoSymlinks(result)
        return result
    }
    public static func regular(_ url: URL) throws -> [FileAttributeKey: Any] {
        try checkNoSymlinks(url)
        // Only the needed POSIX metadata: Foundation's full attributes can block on getxattr.
        var info = stat()
        guard lstat(url.path, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG else { throw ArchiveError.message("No es un archivo regular legible: \(url.lastPathComponent)") }
        func date(_ time: timespec) -> Date { Date(timeIntervalSince1970: Double(time.tv_sec) + Double(time.tv_nsec) / 1_000_000_000) }
        return [.type: FileAttributeType.typeRegular, .size: NSNumber(value: info.st_size),
                .creationDate: date(info.st_birthtimespec), .modificationDate: date(info.st_mtimespec),
                .posixPermissions: NSNumber(value: info.st_mode & 0o777)]
    }
    static func readMetadata(_ url: URL, limit: Int, sizeError: String) throws -> Data {
        let attrs = try regular(url)
        guard let size = attrs[.size] as? NSNumber, size.int64Value < Int64(limit) else {
            throw ArchiveError.message(sizeError)
        }
        // Open the descriptor directly to avoid Foundation's extended-attribute read path.
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw ArchiveError.message("No se pudo leer \(url.lastPathComponent)") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        var data = Data()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
            guard chunk.count < limit - data.count else { throw ArchiveError.message(sizeError) }
            data.append(chunk)
        }
        return data
    }
    public static func hash(_ url: URL, cancel: Cancellation = Cancellation()) throws -> String {
        _ = try regular(url)
        let descriptor = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw ArchiveError.message("No se pudo leer \(url.lastPathComponent)") }
        let file = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? file.close() }
        var hash = SHA256()
        while true {
            try cancel.check()
            // NSFileHandle bridges autoreleased NSData. Drain each chunk on long-lived worker queues.
            let count = try autoreleasepool { () throws -> Int in
                let data = try file.read(upToCount: 1_048_576) ?? Data()
                if !data.isEmpty { hash.update(data: data) }
                return data.count
            }
            if count == 0 { break }
        }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

public enum ArchiveEngine {
    public static func scan(_ inputRoot: URL, cancel: Cancellation = Cancellation(), progress: (Int, String) -> Void = { _, _ in }) throws -> ScanResult {
        try SafeFiles.checkNoSymlinks(inputRoot)
        // Foundation's enumerator resolves /var to /private/var; use the same root for relative paths.
        let standardized = inputRoot.standardizedFileURL
        let root: URL
        if let physical = Darwin.realpath(standardized.path, nil) {
            root = URL(fileURLWithPath: String(cString: physical)); free(physical)
        } else { root = standardized }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: root.path, isDirectory: &isDirectory), isDirectory.boolValue else { throw ArchiveError.message("Selecciona una carpeta existente.") }
        guard !FileManager.default.fileExists(atPath: root.appendingPathComponent("Manifest.db").path) else {
            throw ArchiveError.message("Esto parece un respaldo del iPhone. Usa la sección Respaldo; sus archivos internos no se deben reorganizar.")
        }
        var warnings: [String] = []
        let keys: [URLResourceKey] = [.isRegularFileKey, .isSymbolicLinkKey, .isDirectoryKey, .isPackageKey]
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants], errorHandler: { url, error in
            warnings.append("No se leyó \(url.lastPathComponent): \(error.localizedDescription)"); return true
        }) else { throw ArchiveError.message("No se pudo abrir la carpeta.") }
        var files: [MediaFile] = []
        for case let url as URL in enumerator {
            try cancel.check()
            do {
                let values = try url.resourceValues(forKeys: Set(keys))
                if values.isSymbolicLink == true { enumerator.skipDescendants(); warnings.append("Enlace omitido: \(url.lastPathComponent)"); continue }
                if values.isPackage == true { warnings.append("Biblioteca o paquete omitido: \(url.lastPathComponent)"); continue }
                if values.isDirectory == true {
                    if FileManager.default.fileExists(atPath: url.appendingPathComponent("manifest.json").path) || FileManager.default.fileExists(atPath: url.appendingPathComponent("Manifest.db").path) {
                        enumerator.skipDescendants(); warnings.append("Archivo o respaldo existente omitido: \(url.lastPathComponent)")
                    }
                    continue
                }
                guard values.isRegularFile == true else { continue }
                let before = try SafeFiles.regular(url)
                let bytes = (before[.size] as? NSNumber)?.int64Value ?? 0
                progress(files.count, url.lastPathComponent)
                let hash = try SafeFiles.hash(url, cancel: cancel)
                let after = try SafeFiles.regular(url)
                guard (after[.size] as? NSNumber)?.int64Value == bytes, before[.modificationDate] as? Date == after[.modificationDate] as? Date else { throw ArchiveError.message("El archivo cambió durante el análisis; vuelve a analizarlo.") }
                let (date, source) = mediaDate(url, fallback: before[.creationDate] as? Date ?? before[.modificationDate] as? Date ?? Date())
                guard url.path.hasPrefix(root.path + "/") else { throw ArchiveError.message("Ruta enumerada fuera de la carpeta: \(url.path) / raíz \(root.path)") }
                let relative = String(url.path.dropFirst(root.path.count + 1))
                files.append(MediaFile(sourcePath: url.path, relativePath: relative, bytes: bytes, sha256: hash, date: date, dateSource: source, kind: FileKind.of(url)))
            } catch {
                try cancel.check()
                warnings.append("\(url.lastPathComponent): \(error.localizedDescription)")
            }
        }
        return ScanResult(root: root, files: files.sorted { $0.relativePath < $1.relativePath }, warnings: warnings)
    }

    static func mediaDate(_ url: URL, fallback: Date) -> (Date, String) {
        if FileKind.of(url) == .photo, let image = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
           let props = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [String: Any],
           let exif = props[kCGImagePropertyExifDictionary as String] as? [String: Any],
           let raw = exif[kCGImagePropertyExifDateTimeOriginal as String] as? String {
            let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
            if let date = formatter.date(from: raw) { return (date, "EXIF (hora original sin conversión)") }
        }
        return (fallback, "Fecha del archivo; puede diferir de la captura")
    }

    public static func loadManifest(_ folder: URL) throws -> ArchiveManifest {
        let url = folder.appendingPathComponent("manifest.json")
        let attrs = try SafeFiles.regular(url)
        guard (attrs[.size] as? NSNumber)?.intValue ?? 0 < 100_000_000 else { throw ArchiveError.message("El manifiesto excede el límite de lectura.") }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        var result = try decoder.decode(ArchiveManifest.self, from: Data(contentsOf: url))
        guard result.schema == 1 else { throw ArchiveError.message("Versión de archivo no compatible.") }
        let journal = folder.appendingPathComponent(".journal.jsonl")
        if FileManager.default.fileExists(atPath: journal.path) {
            let journalAttrs = try SafeFiles.regular(journal)
            guard (journalAttrs[.size] as? NSNumber)?.intValue ?? 0 < 100_000_000 else { throw ArchiveError.message("El registro de transferencia es demasiado grande.") }
            let data = try Data(contentsOf: journal)
            var records = Dictionary(result.records.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
            let lines = data.split(separator: 10, omittingEmptySubsequences: false)
            for (i, line) in lines.enumerated() where !line.isEmpty {
                // An interrupted final write has no newline. The unregistered copied file is safely rediscovered on retry.
                if i == lines.count - 1 && data.last != 10 { continue }
                let record = try decoder.decode(ArchiveRecord.self, from: Data(line)); records[record.id] = record
            }
            result.records = records.values.sorted { $0.source.relativePath < $1.source.relativePath }
        }
        for record in result.records {
            _ = try SafeFiles.relativeURL(record.storedPath, under: folder)
            guard record.source.sha256.count == 64, record.source.sha256.allSatisfy({ $0.isHexDigit }), record.source.bytes >= 0 else { throw ArchiveError.message("Registro de integridad no válido.") }
        }
        return result
    }

    static func saveManifest(_ manifest: ArchiveManifest, folder: URL) throws {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; encoder.dateEncodingStrategy = .iso8601
        let url = folder.appendingPathComponent("manifest.json")
        try SafeFiles.checkNoSymlinks(url)
        try encoder.encode(manifest).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    static func checkpoint(_ manifest: ArchiveManifest, folder: URL) throws {
        try saveManifest(manifest, folder: folder)
        let journal = folder.appendingPathComponent(".journal.jsonl")
        try SafeFiles.checkNoSymlinks(journal)
        try Data().write(to: journal, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: journal.path)
    }

    static func append(_ record: ArchiveRecord, folder: URL) throws {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        var data = try encoder.encode(record); data.append(10)
        let url = folder.appendingPathComponent(".journal.jsonl")
        try SafeFiles.checkNoSymlinks(url)
        let fd = Darwin.open(url.path, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw ArchiveError.message("No se pudo guardar el registro de transferencia.") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        try handle.write(contentsOf: data); try handle.synchronize()
    }

    public static func archive(_ files: [MediaFile], sourceRoot: URL, destination: URL, owner: String, device: String, cancel: Cancellation = Cancellation(), progress: (Int, Int, String) -> Void = { _, _, _ in }) throws -> ArchiveResult {
        guard !files.isEmpty else { throw ArchiveError.message("Selecciona al menos un archivo.") }
        try cancel.check()
        guard !owner.trimmingCharacters(in: .whitespaces).isEmpty, !device.trimmingCharacters(in: .whitespaces).isEmpty else { throw ArchiveError.message("Indica la persona y el dispositivo.") }
        try SafeFiles.checkNoSymlinks(destination)
        let identity = SHA256.hash(data: Data((owner + "\0" + device).utf8)).prefix(6).map { String(format: "%02x", $0) }.joined()
        let folder = destination.appendingPathComponent("Archivo familiar").appendingPathComponent(SafeFiles.component(owner)).appendingPathComponent(SafeFiles.component(device) + "-" + identity)
        guard !SafeFiles.isInside(folder, sourceRoot), !SafeFiles.isInside(sourceRoot, folder) else { throw ArchiveError.message("La carpeta del archivo organizado debe estar separada del origen, sin contenerlo ni estar dentro de él.") }
        try SafeFiles.makeDirectory(folder)
        // The lock is released by the OS even if the app exits mid-transfer.
        let lockURL = folder.appendingPathComponent(".archive.lock")
        let fd = Darwin.open(lockURL.path, O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw ArchiveError.message("No se pudo bloquear el archivo de destino.") }
        defer { _ = flock(fd, LOCK_UN); Darwin.close(fd) }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw ArchiveError.message("Otra operación está escribiendo en este archivo. Espera a que termine.") }
        var manifest = FileManager.default.fileExists(atPath: folder.appendingPathComponent("manifest.json").path) ? try loadManifest(folder) : ArchiveManifest(owner: owner, device: device, createdAt: Date(), updatedAt: Date(), records: [])
        guard manifest.owner == owner, manifest.device == device else { throw ArchiveError.message("La identidad del archivo no coincide.") }
        // Compact any recovered journal before appending. This removes only an incomplete trailing log record.
        try checkpoint(manifest, folder: folder)
        var recordsByID = Dictionary(manifest.records.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        func sourceKey(_ file: MediaFile) -> String { file.relativePath + "\0" + file.sha256 }
        var bySource = Dictionary(manifest.records.map { (sourceKey($0.source), $0) }, uniquingKeysWith: { _, last in last })
        var copied = 0, reused = 0
        var errors: [String] = []
        var journalFailure: Error?
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy/MM"
        let related = Dictionary(grouping: files, by: { URL(fileURLWithPath: $0.sourcePath).deletingPathExtension().path.lowercased() })
        for (index, file) in files.enumerated() {
            try cancel.check()
            progress(index, files.count, file.name)
            do {
                let source = URL(fileURLWithPath: file.sourcePath)
                guard SafeFiles.isInside(source, sourceRoot), source.path != sourceRoot.path else { throw ArchiveError.message("Origen fuera de la carpeta analizada.") }
                // Never rely on the earlier scan alone: sources may have changed.
                guard try SafeFiles.hash(source, cancel: cancel) == file.sha256 else { throw ArchiveError.message("Cambió desde el análisis. Vuelve a analizarlo.") }
                let ext = source.pathExtension.lowercased()
                let stem = SafeFiles.component(source.deletingPathExtension().lastPathComponent)
                // Keep same-stem photos, video components and edit sidecars together with their original base name.
                let group = related[source.deletingPathExtension().path.lowercased()] ?? [file]
                let groupDate = group.first(where: { $0.kind == .photo })?.date ?? file.date
                let parentPath = (file.relativePath as NSString).deletingLastPathComponent
                let pathDigest = SHA256.hash(data: Data(parentPath.utf8)).prefix(6).map { String(format: "%02x", $0) }.joined()
                let label = parentPath.isEmpty ? "General" : SafeFiles.component((parentPath as NSString).lastPathComponent)
                let relativeFolder = formatter.string(from: groupDate) + "/" + label + "-" + pathDigest + "/"
                var relative = relativeFolder + stem + (ext.isEmpty ? "" : "." + SafeFiles.component(ext))
                let sameSource = bySource[sourceKey(file)]
                var target = try SafeFiles.relativeURL(sameSource?.storedPath ?? relative, under: folder)
                if sameSource == nil, FileManager.default.fileExists(atPath: target.path), try SafeFiles.hash(target, cancel: cancel) != file.sha256 {
                    relative = relativeFolder + stem + "-" + file.sha256 + (ext.isEmpty ? "" : "." + SafeFiles.component(ext))
                    target = try SafeFiles.relativeURL(relative, under: folder)
                }
                try SafeFiles.makeDirectory(target.deletingLastPathComponent())
                let existed = FileManager.default.fileExists(atPath: target.path)
                if existed {
                    guard try SafeFiles.hash(target, cancel: cancel) == file.sha256 else { throw ArchiveError.message("La copia de destino fue modificada. Se conservó sin sobrescribir.") }
                } else {
                    let capacity = try folder.resourceValues(forKeys: [.volumeAvailableCapacityKey]).volumeAvailableCapacity
                    if let capacity = capacity, Int64(capacity) < file.bytes + 16_777_216 { throw ArchiveError.message("Espacio insuficiente en el destino.") }
                    let temp = target.deletingLastPathComponent().appendingPathComponent(".partial-" + UUID().uuidString)
                    defer { try? FileManager.default.removeItem(at: temp) }
                    try copy(source, to: temp, cancel: cancel)
                    guard try SafeFiles.hash(temp, cancel: cancel) == file.sha256 else { throw ArchiveError.message("La comprobación de integridad falló. No se confirmó la copia.") }
                    try FileManager.default.setAttributes([.posixPermissions: 0o600, .creationDate: file.date], ofItemAtPath: temp.path)
                    // moveItem refuses an existing destination, including races with another process.
                    try FileManager.default.moveItem(at: temp, to: target)
                }
                let record = ArchiveRecord(id: sameSource?.id ?? UUID().uuidString, source: file, storedPath: sameSource?.storedPath ?? relative, verifiedAt: Date())
                do { try append(record, folder: folder) } catch { journalFailure = error; throw error }
                recordsByID[record.id] = record; bySource[sourceKey(file)] = record
                if existed { reused += 1 } else { copied += 1 }
            } catch {
                try cancel.check()
                if let journalFailure = journalFailure { throw ArchiveError.message("La transferencia se detuvo porque no se pudo registrar una copia: \(journalFailure.localizedDescription). Conserva el destino y vuelve a ejecutar para recuperar el progreso confirmado.") }
                errors.append("\(file.relativePath): \(error.localizedDescription)")
            }
        }
        manifest.records = recordsByID.values.sorted { $0.source.relativePath < $1.source.relativePath }; manifest.updatedAt = Date()
        try checkpoint(manifest, folder: folder)
        progress(files.count, files.count, "Comprobación terminada")
        return ArchiveResult(folder: folder, copied: copied, reused: reused, errors: errors)
    }

    private static func copy(_ source: URL, to target: URL, cancel: Cancellation) throws {
        _ = try SafeFiles.regular(source)
        let inputFD = Darwin.open(source.path, O_RDONLY | O_NOFOLLOW)
        guard inputFD >= 0 else { throw ArchiveError.message("No se pudo abrir el original.") }
        let input = FileHandle(fileDescriptor: inputFD, closeOnDealloc: true); defer { try? input.close() }
        let outputFD = Darwin.open(target.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard outputFD >= 0 else { throw ArchiveError.message("No se pudo crear la copia temporal.") }
        let output = FileHandle(fileDescriptor: outputFD, closeOnDealloc: true); defer { try? output.close() }
        while true { try cancel.check(); let data = try input.read(upToCount: 1_048_576) ?? Data(); if data.isEmpty { break }; try output.write(contentsOf: data) }
        try output.synchronize()
    }

    public static func verify(_ folder: URL, cancel: Cancellation = Cancellation(), progress: (Int, Int, String) -> Void = { _, _, _ in }) throws -> [String] {
        let manifest = try loadManifest(folder)
        var failures: [String] = []
        for (i, record) in manifest.records.enumerated() {
            try cancel.check(); progress(i, manifest.records.count, record.source.name)
            do {
                let url = try SafeFiles.relativeURL(record.storedPath, under: folder)
                guard try SafeFiles.hash(url, cancel: cancel) == record.source.sha256 else { throw ArchiveError.message("Contenido diferente al original registrado") }
            } catch { try cancel.check(); failures.append("\(record.storedPath): \(error.localizedDescription)") }
        }
        return failures
    }
}
