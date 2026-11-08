import Foundation
import Darwin
import CoreImage

/// A single disposable photo must be new to the same phone and carry this trial's QR.
public struct DisposablePhotoTrial: Codable {
    public let id: UUID
    public let deviceID: String
    public let recordedAt: Date
    public let catalogue: [USBItem]
    public let volume: RecoveryVolume
    public var marker: String { "LIMPIEZA-FAMILIAR-PRUEBA-" + id.uuidString }

    public init(deviceID: String, catalogue: [USBItem], volume: RecoveryVolume, now: Date = Date()) throws {
        guard !deviceID.isEmpty, !catalogue.isEmpty, Set(catalogue.map(\.path)).count == catalogue.count else {
            throw ArchiveError.message("El catálogo inicial está vacío o tiene rutas repetidas.")
        }
        self.init(id: UUID(), deviceID: deviceID,
                  recordedAt: Date(timeIntervalSince1970: now.timeIntervalSince1970.rounded(.down)),
                  catalogue: catalogue, volume: volume)
    }

    private init(id: UUID, deviceID: String, recordedAt: Date, catalogue: [USBItem], volume: RecoveryVolume) {
        self.id = id; self.deviceID = deviceID; self.recordedAt = recordedAt
        self.catalogue = catalogue; self.volume = volume
    }

    /// A later, fuller USB listing may re-expose items that were already catalogued before this trial.
    /// Only a same-device, earlier catalogue that contains the entire original baseline may supply them.
    public func includingEarlierCatalogue(_ earlier: USBManifest) throws -> Self {
        guard earlier.deviceID == deviceID, earlier.checkedAt < recordedAt,
              earlier.catalog.count > catalogue.count,
              Set(earlier.catalog.map(\.path)).count == earlier.catalog.count else {
            throw ArchiveError.message("El catálogo anterior no sirve para ampliar el registro inicial.")
        }
        let byPath = Dictionary(uniqueKeysWithValues: earlier.catalog.map { ($0.path, $0) })
        guard catalogue.allSatisfy({ byPath[$0.path]?.sameRemote($0) == true }) else {
            throw ArchiveError.message("Hay diferencias entre el registro inicial y el catálogo anterior.")
        }
        return Self(id: id, deviceID: deviceID, recordedAt: recordedAt, catalogue: earlier.catalog, volume: volume)
    }

    public static func baselineURL(under root: URL) throws -> URL {
        try SafeFiles.relativeURL(".photo-test-baseline.json", under: root)
    }

    public static func load(under root: URL) throws -> Self {
        let path = try baselineURL(under: root)
        let data = try SafeFiles.readMetadata(path, limit: 8_000_000, sizeError: "El registro inicial es demasiado grande.")
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let baseline = try decoder.decode(Self.self, from: data)
        guard !baseline.catalogue.isEmpty, Set(baseline.catalogue.map(\.path)).count == baseline.catalogue.count else {
            throw ArchiveError.message("El registro inicial no es válido.")
        }
        return baseline
    }

    public func candidate(in current: [USBItem], deviceID: String, now: Date = Date()) throws -> USBItem {
        guard self.deviceID == deviceID, now >= recordedAt, now.timeIntervalSince(recordedAt) < 1_800 else {
            throw ArchiveError.message("La prueba venció o el iPhone conectado es otro. Prepara una nueva prueba.")
        }
        guard current.count == catalogue.count + 1, Set(current.map(\.path)).count == current.count else {
            throw ArchiveError.message("Se necesita exactamente una foto nueva. Actualiza el catálogo o prepara otra prueba.")
        }
        let currentByPath = Dictionary(uniqueKeysWithValues: current.map { ($0.path, $0) })
        guard catalogue.allSatisfy({ currentByPath[$0.path]?.sameRemote($0) == true }) else {
            throw ArchiveError.message("El catálogo anterior cambió. La app no puede aislar una sola foto de prueba.")
        }
        let previous = Set(catalogue.map(\.path))
        guard let item = current.first(where: { !previous.contains($0.path) }),
              PhotoRemoval.isSinglePhotoType(item), let date = item.created,
              date >= recordedAt, date <= now.addingTimeInterval(120),
              !catalogue.contains(where: { CleanupPlanner.group($0.localPath) == CleanupPlanner.group(item.localPath) }) else {
            throw ArchiveError.message("El único elemento nuevo no es una foto individual posterior al inicio de la prueba.")
        }
        return item
    }

    public struct RecoveryVolume: Codable, Equatable {
        public let path: String
        public let identifier: String?
        public let mount: Int32

        public init(url: URL) throws {
            try SafeFiles.checkNoSymlinks(url)
            let values = try url.resourceValues(forKeys: [.volumeUUIDStringKey, .volumeIsInternalKey])
            var data = stat()
            var filesystem = statfs()
            guard statfs(url.path, &filesystem) == 0, filesystem.f_flags & UInt32(MNT_RDONLY) == 0,
                  values.volumeIsInternal == false,
                  FileManager.default.isWritableFile(atPath: url.path),
                  lstat(url.path, &data) == 0, data.st_mode & S_IFMT == S_IFDIR else {
                throw ArchiveError.message("El volumen de recuperación debe ser un disco externo montado y escribible.")
            }
            let mountPath = withUnsafeBytes(of: &filesystem.f_mntonname) {
                String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self)
            }
            guard mountPath == url.standardizedFileURL.path else {
                throw ArchiveError.message("DISCO-PRUEBA debe estar montado en su ubicación habitual.")
            }
            path = url.path; identifier = values.volumeUUIDString; mount = data.st_dev
        }

        public func isCurrent() -> Bool {
            (try? Self(url: URL(fileURLWithPath: path, isDirectory: true))) == self
        }
    }

    public struct Verified {
        public let trial: DisposablePhotoTrial
        public let permission: PhotoRemoval.Permission
    }

    /// AirDrop copies are a comparison source only. They never create a deletion permit.
    public struct AirDropCopies {
        public let filename: String
        public let bytes: Int64
        private let mac: URL
        private let disk: URL
        private let sha256: String
        private let macStamp: PhotoRemoval.FileStamp
        private let diskStamp: PhotoRemoval.FileStamp

        fileprivate init(mac: URL, disk: URL, bytes: Int64, sha256: String,
                         macStamp: PhotoRemoval.FileStamp, diskStamp: PhotoRemoval.FileStamp) {
            filename = mac.lastPathComponent
            self.mac = mac; self.disk = disk; self.bytes = bytes; self.sha256 = sha256
            self.macStamp = macStamp; self.diskStamp = diskStamp
        }

        public func matches(_ usb: URL, cancel: Cancellation = Cancellation()) throws -> Bool {
            guard try PhotoRemoval.stamp(mac) == macStamp, try PhotoRemoval.stamp(disk) == diskStamp,
                  try SafeFiles.hash(mac, cancel: cancel) == sha256, try SafeFiles.hash(disk, cancel: cancel) == sha256 else {
                throw ArchiveError.message("Cambió una de las dos copias durante el cotejo.")
            }
            let before = try PhotoRemoval.stamp(usb)
            let hash = try SafeFiles.hash(usb, cancel: cancel)
            guard try PhotoRemoval.stamp(usb) == before else {
                throw ArchiveError.message("La lectura USB cambió mientras se comparaba.")
            }
            return hash == sha256
        }
    }

    public func airDropCopies(under library: URL, cancel: Cancellation = Cancellation()) throws -> AirDropCopies {
        guard volume.path == "/Volumes/DISCO-PRUEBA", volume.isCurrent() else {
            throw ArchiveError.message("Conecta el mismo disco DISCO-PRUEBA de la prueba.")
        }
        let relative = id.uuidString + "/Recibido por AirDrop"
        let macRoot = library.deletingLastPathComponent().appendingPathComponent("Pruebas de borrado")
        let diskRoot = URL(fileURLWithPath: volume.path, isDirectory: true).appendingPathComponent("Prueba de borrado Usuario de prueba")
        let macFolder = try SafeFiles.relativeURL(relative, under: macRoot)
        let files = try FileManager.default.contentsOfDirectory(at: macFolder, includingPropertiesForKeys: nil, options: .skipsHiddenFiles)
        guard files.count == 1, let mac = files.first, FileKind.of(mac) == .photo else {
            throw ArchiveError.message("No hay una única foto recibida por AirDrop en esta prueba.")
        }
        let disk = try SafeFiles.relativeURL(relative + "/" + mac.lastPathComponent, under: diskRoot)
        let first = try PhotoRemoval.stamp(mac)
        let second = try PhotoRemoval.stamp(disk)
        let attrs = try SafeFiles.regular(mac)
        guard let bytes = (attrs[.size] as? NSNumber)?.int64Value, bytes > 0, bytes <= PhotoRemoval.maxBytes,
              first.volume != second.volume else { throw ArchiveError.message("Las copias no están en dos unidades válidas.") }
        let digest = try SafeFiles.hash(mac, cancel: cancel)
        try verifyMarker(in: mac)
        guard try SafeFiles.hash(disk, cancel: cancel) == digest, try PhotoRemoval.stamp(mac) == first,
              try PhotoRemoval.stamp(disk) == second, volume.isCurrent() else {
            throw ArchiveError.message("No se pudo comprobar que las dos copias son idénticas.")
        }
        return AirDropCopies(mac: mac, disk: disk, bytes: bytes, sha256: digest, macStamp: first, diskStamp: second)
    }

    public func verifyMarker(in read: URL) throws {
        let context = CIContext(options: [.useSoftwareRenderer: true])
        guard let image = CIImage(contentsOf: read, options: [.applyOrientationProperty: true]),
              let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: context,
                                        options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]) else {
            throw ArchiveError.message("No se pudo leer el código de prueba de la foto.")
        }
        let features = detector.features(in: image)
        guard features.count == 1, (features.first as? CIQRCodeFeature)?.messageString == marker else {
            throw ArchiveError.message("La foto no contiene el código único de esta prueba. No se preparó para borrar.")
        }
    }

    public func verifyAndBackUp(_ read: URL, item: USBItem, current: [USBItem], localRoot: URL,
                                cancel: Cancellation = Cancellation()) throws -> Verified {
        guard try candidate(in: current, deviceID: deviceID).sameRemote(item),
              volume.isCurrent(), localRoot.lastPathComponent == id.uuidString else {
            throw ArchiveError.message("Cambió el iPhone, el disco o la carpeta de la prueba.")
        }
        let attrs = try SafeFiles.regular(read)
        guard (attrs[.size] as? NSNumber)?.int64Value == item.bytes else {
            throw ArchiveError.message("La lectura del iPhone no tiene el tamaño anunciado.")
        }
        let digest = try SafeFiles.hash(read, cancel: cancel)
        try verifyMarker(in: read)
        try cancel.check()
        let local = try SafeFiles.relativeURL(item.localPath, under: localRoot)
        let externalRoot = URL(fileURLWithPath: volume.path, isDirectory: true)
            .appendingPathComponent("Prueba de borrado Usuario de prueba", isDirectory: true)
            .appendingPathComponent(id.uuidString, isDirectory: true)
        let external = try SafeFiles.relativeURL(item.localPath, under: externalRoot)
        try SafeFiles.makeDirectory(local.deletingLastPathComponent())
        guard volume.isCurrent() else { throw ArchiveError.message("Se desconectó DISCO-PRUEBA.") }
        try FileManager.default.createDirectory(at: external.deletingLastPathComponent(), withIntermediateDirectories: true)
        try SafeFiles.checkNoSymlinks(external)
        try cancel.check()
        // No overwrite: a previous attempt's copies remain available.
        if !FileManager.default.fileExists(atPath: local.path) { try FileManager.default.copyItem(at: read, to: local) }
        guard volume.isCurrent() else { throw ArchiveError.message("Se desconectó DISCO-PRUEBA.") }
        if !FileManager.default.fileExists(atPath: external.path) { try FileManager.default.copyItem(at: read, to: external) }
        let record = USBRecord(remote: item, sha256: digest, evidence: "download")
        let photo = try PhotoRemoval.verify(record, under: localRoot, cancel: cancel)
        _ = try PhotoRemoval.verifyCurrentCopy(read, photo: photo, cancel: cancel)
        let permission = try PhotoRemoval.Permission(photo: photo, secondCopy: external, cancel: cancel)
        guard volume.isCurrent() else { throw ArchiveError.message("Cambió el volumen de recuperación.") }
        return Verified(trial: self, permission: permission)
    }
}
