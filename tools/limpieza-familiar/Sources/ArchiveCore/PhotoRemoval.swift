import Foundation
import Darwin
import ImageIO

/// A photo admitted by the local backup check. Selecting one never sends a device command.
public struct VerifiedPhoto: Identifiable {
    public let remote: USBItem
    public let backup: URL
    public let sha256: String
    public var id: String { remote.path }
    public var name: String { backup.lastPathComponent }
}

public enum PhotoRemoval {
    public static let maxBytes: Int64 = 32 * 1024 * 1024
    static func isSinglePhotoType(_ item: USBItem) -> Bool {
        let url = URL(fileURLWithPath: item.path)
        return item.path.hasPrefix("DCIM/") && item.localPath == item.path &&
            ["heic", "heif", "jpg", "jpeg", "png"].contains(url.pathExtension.lowercased()) &&
            !url.lastPathComponent.lowercased().hasPrefix("img_e") &&
            item.bytes > 0 && item.bytes <= maxBytes
    }

    /// First release handles only individual stills. Keep edits, Live Photos and RAW pairs together.
    public static func candidates(manifest: USBManifest, catalogue: [USBItem], deviceID: String,
                                  search: String = "", cancel: Cancellation = Cancellation()) throws -> [USBRecord] {
        guard !deviceID.isEmpty, deviceID == manifest.deviceID else {
            throw ArchiveError.message("El iPhone conectado no corresponde a este respaldo.")
        }
        let currentGroups = Dictionary(grouping: catalogue) { CleanupPlanner.group($0.localPath) }
        let savedPaths = Set(manifest.catalog.map(\.localPath)).union(manifest.records.values.map { $0.remote.localPath })
        let savedGroups = Dictionary(grouping: savedPaths, by: CleanupPlanner.group)
        var results: [USBRecord] = []
        for item in catalogue {
            try cancel.check()
            let name = URL(fileURLWithPath: item.path).lastPathComponent
            guard isSinglePhotoType(item),
                  search.isEmpty || name.localizedCaseInsensitiveContains(search),
                  let record = manifest.records[item.path], record.evidence == "download",
                  record.remote.sameRemote(item) else { continue }
            let group = CleanupPlanner.group(item.localPath)
            guard currentGroups[group]?.count == 1, savedGroups[group]?.count == 1 else { continue }
            results.append(record)
        }
        return results.sorted { $0.remote.bytes == $1.remote.bytes ? $0.remote.path < $1.remote.path : $0.remote.bytes > $1.remote.bytes }
    }

    public static func verify(_ record: USBRecord, under root: URL, cancel: Cancellation = Cancellation()) throws -> VerifiedPhoto {
        guard record.evidence == "download", isSinglePhotoType(record.remote) else {
            throw ArchiveError.message("Se necesita una foto individual con registro de descarga.")
        }
        let url = try SafeFiles.relativeURL(record.remote.localPath, under: root)
        let group = CleanupPlanner.group(record.remote.localPath)
        let siblings = try FileManager.default.contentsOfDirectory(atPath: url.deletingLastPathComponent().path)
        let relativeFolder = (record.remote.localPath as NSString).deletingLastPathComponent
        guard siblings.filter({ CleanupPlanner.group(relativeFolder + "/" + $0) == group }).count == 1 else {
            throw ArchiveError.message("La foto tiene archivos asociados en la copia del Mac.")
        }
        let before = try stamp(url)
        guard before.size == record.remote.bytes, try SafeFiles.hash(url, cancel: cancel) == record.sha256 else {
            throw ArchiveError.message("La copia del Mac no coincide con su registro de integridad.")
        }
        guard let image = CGImageSourceCreateWithURL(url as CFURL, nil), CGImageSourceGetCount(image) == 1,
              CGImageSourceCreateThumbnailAtIndex(image, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 160
              ] as CFDictionary) != nil, try stamp(url) == before else {
            throw ArchiveError.message("No se pudo abrir la foto o su copia cambió durante la verificación.")
        }
        return VerifiedPhoto(remote: record.remote, backup: url, sha256: record.sha256)
    }

    public static func verifyCurrentCopy(_ downloaded: URL, photo: VerifiedPhoto,
                                         cancel: Cancellation = Cancellation()) throws -> FileStamp {
        let source = try stamp(downloaded)
        let backup = try stamp(photo.backup)
        guard source.size == photo.remote.bytes, backup.size == photo.remote.bytes,
              try SafeFiles.hash(downloaded, cancel: cancel) == photo.sha256,
              try SafeFiles.hash(photo.backup, cancel: cancel) == photo.sha256,
              try stamp(downloaded) == source, try stamp(photo.backup) == backup else {
            throw ArchiveError.message("El archivo del iPhone y la copia del Mac no coinciden byte por byte.")
        }
        return backup
    }

    public struct FileStamp: Equatable {
        public let volume: Int32
        let inode: UInt64
        let size: Int64
        let modifiedSeconds: Int
        let modifiedNanoseconds: Int
        let changedSeconds: Int
        let changedNanoseconds: Int
    }

    public static func stamp(_ url: URL) throws -> FileStamp {
        try SafeFiles.checkNoSymlinks(url)
        var data = stat()
        guard lstat(url.path, &data) == 0, data.st_mode & S_IFMT == S_IFREG else {
            throw ArchiveError.message("No se pudo comprobar un archivo de respaldo.")
        }
        return FileStamp(volume: data.st_dev, inode: data.st_ino, size: data.st_size,
                         modifiedSeconds: data.st_mtimespec.tv_sec, modifiedNanoseconds: data.st_mtimespec.tv_nsec,
                         changedSeconds: data.st_ctimespec.tv_sec, changedNanoseconds: data.st_ctimespec.tv_nsec)
    }

    public struct Permission {
        public let photo: VerifiedPhoto
        public let secondCopy: URL
        private let firstStamp: FileStamp
        private let secondStamp: FileStamp

        public init(photo: VerifiedPhoto, secondCopy: URL, cancel: Cancellation = Cancellation()) throws {
            let first = try stamp(photo.backup)
            let second = try stamp(secondCopy)
            let external = try secondCopy.resourceValues(forKeys: [.volumeIsInternalKey]).volumeIsInternal
            guard external == false, first.volume != second.volume, first.size == photo.remote.bytes,
                  second.size == first.size, try SafeFiles.hash(photo.backup, cancel: cancel) == photo.sha256,
                  try SafeFiles.hash(secondCopy, cancel: cancel) == photo.sha256,
                  try stamp(photo.backup) == first, try stamp(secondCopy) == second else {
                throw ArchiveError.message("La segunda copia debe estar en una unidad externa y coincidir exactamente con el respaldo.")
            }
            self.photo = photo; self.secondCopy = secondCopy
            self.firstStamp = first; self.secondStamp = second
        }

        public func stillIntact() -> Bool {
            (try? stamp(photo.backup)) == firstStamp && (try? stamp(secondCopy)) == secondStamp
        }
    }

    /// Called once per confirmation. Recheck eligibility after the modal closes.
    @discardableResult
    public static func submit(confirmed: Bool, stillAllowed: () -> Bool, request: () -> Void) -> Bool {
        guard confirmed, stillAllowed() else { return false }
        request()
        return true
    }
}
