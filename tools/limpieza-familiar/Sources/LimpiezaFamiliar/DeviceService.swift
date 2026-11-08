import AppKit
import ImageCaptureCore
import ArchiveCore

final class DeviceService: NSObject, ObservableObject, ICDeviceBrowserDelegate, ICCameraDeviceDelegate {
    @Published var cameras: [ICCameraDevice] = []
    @Published var selected: ICCameraDevice?
    @Published var files: [ICCameraFile] = []
    @Published var status = "Pulsa Buscar dispositivos con tu iPhone conectado y desbloqueado."
    @Published var ready = false
    @Published var importing = false
    @Published var completed = 0
    @Published var total = 0
    @Published var scope: ImportScope = .sample
    @Published var catalog: [ImportItem] = []
    private(set) var catalogID = UUID()
    var plan: ImportPlan? { try? ImportPlan(catalog: catalog, scope: scope) }
    private let worker = DispatchQueue(label: "cl.logikapps.limpieza.import", qos: .userInitiated)
    private var validating = false
    private var validationCancel = Cancellation()
    private var accepted = 0
    private var activeScope = ImportScope.sample
    private var nextIndex = 0
    private let browser = ICDeviceBrowser()
    private var started = false
    private var stopRequested = false
    private var completion: ((URL, [String]) -> Void)?
    private var importRoot: URL?
    private var pending: [ICCameraFile] = []
    private var failures: [String] = []
    private var transferID = UUID()
    private var resumeManifest: USBManifest?
    private var pendingItems: [USBItem] = []
    private var reused = 0
    private var transferMonitor: Timer?
    private var activity: NSObjectProtocol?
    private var photoReadID: UUID?
    private var photoDeletionInProgress = false
    // Enable only after confirming recovery behavior with a disposable still on a test device.
    private static let validatedPhotoRemoval = false

    struct PhotoLink {
        let camera: ICCameraDevice
        let file: ICCameraFile
        let deviceID: String
        let catalogueID: UUID
    }

    func photoLink(_ item: USBItem, deviceID: String) -> PhotoLink? {
        guard ready, !importing, let camera = selected, deviceID == deviceIdentity else { return nil }
        let matches = files.filter { remotePath($0) == item.path }
        guard matches.count == 1, let file = matches.first else { return nil }
        let link = PhotoLink(camera: camera, file: file, deviceID: deviceID, catalogueID: catalogID)
        return isCurrent(link, item: item) ? link : nil
    }

    func isCurrent(_ link: PhotoLink, item: USBItem) -> Bool {
        isCurrentSession(link) &&
            !link.file.isLocked && (link.file.sidecarFiles?.isEmpty ?? true) &&
            (link.camera.mediaFiles?.contains { $0 === link.file } ?? false) &&
            remotePath(link.file) == item.path && link.file.fileSize == item.bytes && link.file.creationDate == item.created
    }

    private func isCurrentSession(_ link: PhotoLink) -> Bool {
        ready && !importing && selected === link.camera && link.deviceID == deviceIdentity &&
            link.catalogueID == catalogID && link.camera.hasOpenSession && !link.camera.isAccessRestrictedAppleDevice
    }

    /// A comparison reads exactly the named file. Item write protection and sidecars are relevant to
    /// deletion verification, so that stricter path continues to use photoLink and isCurrent.
    func comparisonLink(_ item: USBItem, deviceID: String) -> PhotoLink? {
        guard ready, !importing, let camera = selected, deviceID == deviceIdentity else { return nil }
        let matches = (camera.mediaFiles ?? []).compactMap { $0 as? ICCameraFile }.filter { remotePath($0) == item.path }
        guard matches.count == 1, let file = matches.first else { return nil }
        let link = PhotoLink(camera: camera, file: file, deviceID: deviceID, catalogueID: catalogID)
        return isCurrentComparison(link, item: item) ? link : nil
    }

    private func isCurrentComparison(_ link: PhotoLink, item: USBItem) -> Bool {
        guard isCurrentSession(link) else { return false }
        let matches = (link.camera.mediaFiles ?? []).compactMap { $0 as? ICCameraFile }.filter { remotePath($0) == item.path }
        return matches.count == 1 && matches[0].fileSize == item.bytes && matches[0].creationDate == item.created
    }

    func deletionDiagnostic(for item: USBItem, deviceID: String) -> String {
        guard let link = comparisonLink(item, deviceID: deviceID) else {
            return "No se pudo identificar la foto en la sesión USB actual."
        }
        guard link.camera.capabilities.contains(ICDeviceCapability.cameraDeviceCanDeleteOneFile.rawValue) else {
            return "El iPhone no ofrece borrado individual de fotos por USB en esta sesión."
        }
        guard !link.camera.isLocked else { return "El iPhone informa protección contra borrado por USB." }
        guard !link.file.isLocked else { return "El iPhone marca esta foto como protegida contra borrado por USB." }
        guard link.file.sidecarFiles?.isEmpty ?? true else { return "La foto tiene componentes asociados y queda fuera de la prueba individual." }
        return "El iPhone anuncia que permite borrar una foto por USB. Falta preparar y confirmar el borrado de esta única foto."
    }

    func canRemovePhoto(_ link: PhotoLink, item: USBItem) -> Bool {
        Self.validatedPhotoRemoval && !photoDeletionInProgress && photoReadID == nil && isCurrent(link, item: item) &&
            !link.camera.isLocked && !link.camera.iCloudPhotosEnabled &&
            link.camera.capabilities.contains(ICDeviceCapability.cameraDeviceCanDeleteOneFile.rawValue)
    }

    /// Downloads one disposable verification copy. The phone operation is read-only.
    func readPhoto(_ link: PhotoLink, item: USBItem, into staging: URL, comparisonOnly: Bool = false,
                   completion: @escaping (Result<URL, Error>) -> Void) {
        let current = comparisonOnly ? isCurrentComparison(link, item: item) : isCurrent(link, item: item)
        guard photoReadID == nil, !photoDeletionInProgress, current else {
            completion(.failure(ArchiveError.message("La foto o el catálogo del iPhone cambiaron.")))
            return
        }
        let request = UUID()
        photoReadID = request
        let filename = item.localPath.components(separatedBy: "/").last ?? "Foto"
        let options: [ICDownloadOption: Any] = [
            .downloadsDirectoryURL: staging, .saveAsFilename: filename, .overwrite: false,
            .deleteAfterSuccessfulDownload: false, .sidecarFiles: !comparisonOnly
        ]
        link.file.requestDownload(options: options) { [weak self] name, error in
            DispatchQueue.main.async {
                guard let self = self, self.photoReadID == request else { return }
                self.photoReadID = nil
                if let error = error { completion(.failure(error)); return }
                let current = comparisonOnly ? self.isCurrentComparison(link, item: item) : self.isCurrent(link, item: item)
                guard current, let name = name,
                      let files = try? FileManager.default.contentsOfDirectory(atPath: staging.path),
                      files == [URL(fileURLWithPath: name).lastPathComponent] else {
                    completion(.failure(ArchiveError.message("El iPhone devolvió archivos asociados o cambió la sesión.")))
                    return
                }
                completion(.success(staging.appendingPathComponent(files[0])))
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) { [weak self] in
            guard let self = self, self.photoReadID == request else { return }
            self.photoReadID = nil
            link.camera.cancelDownload()
            completion(.failure(ArchiveError.message("El iPhone no entregó la foto a tiempo. La selección se conserva para revisar.")))
        }
    }

    func removePhoto(_ permission: PhotoRemoval.Permission, link: PhotoLink, confirmed: Bool,
                     completion: @escaping (Bool) -> Void) -> Bool {
        requestPhotoRemoval(permission, link: link, confirmed: confirmed,
                            allowed: { self.canRemovePhoto(link, item: permission.photo.remote) }, completion: completion)
    }

    var disposablePhotoCatalogue: [USBItem]? {
        guard currentICloudPhotos == true, let items = selected?.mediaFiles else { return nil }
        return items.compactMap { $0 as? ICCameraFile }.enumerated().map {
            USBItem(index: $0.offset, path: remotePath($0.element), bytes: $0.element.fileSize, created: $0.element.creationDate)
        }
    }

    func canRemoveDisposablePhoto(_ verified: DisposablePhotoTrial.Verified, link: PhotoLink) -> Bool {
        let photo = verified.permission.photo
        guard !photoDeletionInProgress, photoReadID == nil, isCurrent(link, item: photo.remote),
              !link.camera.isLocked, link.camera.capabilities.contains(ICDeviceCapability.cameraDeviceCanDeleteOneFile.rawValue),
              let live = disposablePhotoCatalogue,
              let new = try? verified.trial.candidate(in: live, deviceID: deviceIdentity),
              new.sameRemote(photo.remote), verified.trial.volume.isCurrent() else { return false }
        return true
    }

    func removeDisposablePhoto(_ verified: DisposablePhotoTrial.Verified, link: PhotoLink, confirmed: Bool,
                               completion: @escaping (Bool) -> Void) -> Bool {
        requestPhotoRemoval(verified.permission, link: link, confirmed: confirmed,
                            allowed: { self.canRemoveDisposablePhoto(verified, link: link) }, completion: completion)
    }

    private func requestPhotoRemoval(_ permission: PhotoRemoval.Permission, link: PhotoLink, confirmed: Bool,
                                     allowed: () -> Bool, completion: @escaping (Bool) -> Void) -> Bool {
        PhotoRemoval.submit(confirmed: confirmed, stillAllowed: {
            allowed() && permission.stillIntact()
        }, request: {
            self.photoDeletionInProgress = true
            let file = link.file
            _ = link.camera.requestDeleteFiles([file], deleteFailed: { _ in }, completion: { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.photoDeletionInProgress = false
                    self.catalogID = UUID()
                    let succeeded = error == nil && (result[.successful]?.contains { $0 === file } ?? false)
                    self.refresh(link.camera)
                    completion(succeeded)
                }
            })
        })
    }
    var deviceIdentity: String { selected?.uuidString ?? selected?.serialNumberString ?? "" }
    var currentICloudPhotos: Bool? {
        guard ready, let camera = selected, camera.hasOpenSession, !camera.isAccessRestrictedAppleDevice else { return nil }
        return camera.iCloudPhotosEnabled
    }
    var resumeCatalog: [USBItem] { files.enumerated().map { USBItem(index: $0.offset, path: remotePath($0.element), bytes: $0.element.fileSize, created: $0.element.creationDate) } }
    private func stopTransferMonitor() { transferMonitor?.invalidate(); transferMonitor = nil }
    private func watchTransfer(staging: URL, item: USBItem) {
        stopTransferMonitor()
        var watchdog = TransferWatchdog(now: ProcessInfo.processInfo.systemUptime)
        transferMonitor = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self = self, self.importing, !self.validating else { return }
            let bytes = ((try? FileManager.default.contentsOfDirectory(at: staging, includingPropertiesForKeys: [.fileSizeKey])) ?? []).reduce(Int64(0)) { sum, file in
                sum + Int64((try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
            }
            if self.selected?.hasOpenSession != true || self.selected?.isAccessRestrictedAppleDevice == true || watchdog.stalled(bytes: bytes, now: ProcessInfo.processInfo.systemUptime) {
                if self.resumeManifest?.deferredPaths.contains(item.path) == false { self.resumeManifest?.deferredPaths.append(item.path) }
                self.interrupt("La transferencia de \(item.path) no responde o perdió acceso. Lo recibido se conserva. Reconecta y usa Reanudar copia existente.")
                self.selected?.requestCloseSession()
            }
        }
    }
    private var monitor: Timer?
    private var progress = CatalogProgress(now: ProcessInfo.processInfo.systemUptime)
    private var completeCatalog = false
    private var reopening = false
    @Published var connectionDetails = ""

    deinit { monitor?.invalidate(); transferMonitor?.invalidate(); if let activity = activity { ProcessInfo.processInfo.endActivity(activity) } }
    private func watchConnection() {
        monitor?.invalidate()
        progress = CatalogProgress(now: ProcessInfo.processInfo.systemUptime)
        monitor = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            guard let self = self, let camera = self.selected, !self.importing else { return }
            self.refresh(camera)
        }
    }
    func reconnect() {
        guard !importing, !reopening, let camera = selected else { return }
        ready = false; completeCatalog = false; files = []; catalog = []; catalogID = UUID()
        reopening = true; watchConnection()
        status = "Cerrando la sesión anterior antes de volver a leer…"
        camera.requestCloseSession()
    }

    func start() {
        guard !started else { status = cameras.isEmpty ? "Buscando. Desbloquea el iPhone y acepta Confiar en este ordenador." : "Selecciona un dispositivo para leer su catálogo multimedia."; return }
        started = true; browser.delegate = self
        browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: ICDeviceTypeMask.camera.rawValue | ICDeviceLocationTypeMask.local.rawValue)!
        browser.start(); status = "Buscando dispositivos locales. Desbloquea el iPhone y acepta Confiar."
    }
    func connect(_ camera: ICCameraDevice) {
        guard !importing, !reopening else { return }
        if selected !== camera { selected?.requestCloseSession() }
        selected = camera; ready = false; files = []; catalog = []; camera.delegate = self
        completeCatalog = false
        if camera.capabilities.contains(ICDeviceCapability.cameraDeviceSupportsHEIF.rawValue) { camera.mediaPresentation = .originalAssets }
        watchConnection()
        status = "Leyendo el catálogo de \(camera.name ?? "iPhone")… Mantén el teléfono desbloqueado."
        if camera.hasOpenSession { refresh(camera) } else { camera.requestOpenSession() }
    }
    private func refresh(_ camera: ICCameraDevice) {
        guard selected === camera, !importing else { return }
        let count = camera.mediaFiles?.count ?? 0
        let percent = camera.contentCatalogPercentCompleted
        let restricted = camera.isAccessRestrictedAppleDevice
        let stalled = progress.update(percent: percent, count: count, sessionOpen: camera.hasOpenSession,
                                      restricted: restricted, now: ProcessInfo.processInfo.systemUptime)
        connectionDetails = "Sesión: \(camera.hasOpenSession ? "abierta" : "sin abrir") · Acceso: \(restricted ? "restringido" : "sin restricción informada") · Catálogo: \(percent) % · \(count) elementos recibidos"
        if reopening {
            status = stalled ? "El cierre de sesión no responde. Desconecta el cable y vuelve a conectarlo." : "Cerrando la sesión anterior antes de volver a leer…"
            return
        }
        let canRead = CatalogProgress.isReady(sessionOpen: camera.hasOpenSession, restricted: restricted,
                                             percent: percent, completionReceived: completeCatalog)
        if canRead && (!ready || files.count != count) {
            files = (camera.mediaFiles ?? []).compactMap { $0 as? ICCameraFile }
            catalogID = UUID()
            catalog = files.enumerated().map { ImportItem(index: $0.offset, path: remotePath($0.element), bytes: $0.element.fileSize) }
        }
        ready = canRead
        if restricted {
            status = "El iPhone informa acceso restringido. Revisa si pide Confiar en este ordenador, aunque esté desbloqueado."
        } else if ready {
            status = "\(files.count) archivos multimedia accesibles. Esto no incluye el interior de WhatsApp ni garantiza todos los originales de iCloud."
        } else if stalled {
            status = "Sin avances durante al menos 60 segundos. No se ha importado nada. Pulsa Reconectar; si persiste, comprueba si Captura de Imagen de macOS puede leer este iPhone."
        } else if !camera.hasOpenSession {
            status = "Esperando que macOS abra la sesión del iPhone…"
        } else {
            status = "Leyendo catálogo: \(percent) % · \(count) elementos recibidos. Las bibliotecas grandes pueden tardar."
        }
    }
    private func remotePath(_ file: ICCameraFile) -> String {
        var parents: [String] = []
        var parent = file.parentFolder
        while let folder = parent { parents.insert(folder.name ?? "DCIM", at: 0); parent = folder.parentFolder }
        return (parents + [file.name ?? "Archivo"]).joined(separator: "/")
    }
    func availableSpace(at folder: URL) throws -> Int64 {
        let attributes = try FileManager.default.attributesOfFileSystem(forPath: folder.path)
        guard let value = attributes[.systemFreeSize] as? NSNumber else {
            throw ArchiveError.message("No se pudo comprobar el espacio libre del destino. Selecciona un disco disponible.")
        }
        return value.int64Value
    }
    func beginImport(to root: URL, resume: USBResumePlan? = nil, completion: @escaping (URL, [String]) -> Void) throws {
        guard ready, !files.isEmpty, !importing else { throw ArchiveError.message("Primero espera a que termine la lectura del dispositivo.") }
        let plan = try ImportPlan(catalog: catalog, scope: scope)
        guard !plan.items.isEmpty else { throw ArchiveError.message("El lote está vacío.") }
        try SafeFiles.makeDirectory(root)
        let items = resume?.pending ?? plan.items.map { i in resumeCatalog[i.index] }
        if let resume = resume {
            guard resume.manifest.deviceID == deviceIdentity, resume.manifest.catalog == resumeCatalog else { throw ArchiveError.message("Cambió el iPhone o su catálogo. Compara de nuevo antes de reanudar.") }
        }
        try ImportPlan(catalog: items.map { ImportItem(index: $0.index, path: $0.path, bytes: $0.bytes) }, scope: .all).checkSpace(available: availableSpace(at: root))
        self.completion = completion; importRoot = root; pendingItems = items; pending = items.map { files[$0.index] }
        failures = resume?.conflicts ?? []; reused = resume?.reused ?? 0
        completed = (resume?.manifest.catalog.count ?? plan.items.count) - items.count
        accepted = reused; nextIndex = 0; total = resume?.manifest.catalog.count ?? plan.items.count
        resumeManifest = resume?.manifest ?? USBManifest(deviceID: deviceIdentity, deviceName: selected?.name ?? "iPhone", catalog: plan.items.map { resumeCatalog[$0.index] })
        if let manifest = resumeManifest { try USBResume.save(manifest, root: root) }
        if resume != nil { scope = .all }
        activeScope = scope; stopRequested = false; validating = false
        validationCancel = Cancellation(); importing = true; transferID = UUID()
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .idleSystemSleepDisabled], reason: "Respaldar el iPhone conectado sin interrumpir la copia")
        downloadNext()
    }
    func stop() {
        interrupt("Respaldo pausado por ti. El avance está guardado; puedes reanudarlo. Las descargas incompletas quedan apartadas.")
        selected?.requestCloseSession()
    }
    private func interrupt(_ reason: String) {
        guard importing else { return }
        if !stopRequested { failures.append(reason) }
        stopTransferMonitor(); stopRequested = true; ready = false; validationCancel.cancel()
        status = validating ? "Deteniendo: terminando la comprobación local…" : "Respaldo pausado. Vuelve a leer el catálogo y elige Reanudar respaldo."
        if !validating {
            transferID = UUID(); selected?.cancelDownload(); finish()
        }
    }
    private func finish() {
        guard importing, !validating else { return }
        stopTransferMonitor(); importing = false
        if let activity = activity { ProcessInfo.processInfo.endActivity(activity); self.activity = nil }
        if stopRequested { status = "Importación detenida: \(accepted) de \(total) elementos aceptados. Vuelve a leer el catálogo para importar otra vez." }
        let done = completion; completion = nil
        if let root = importRoot {
            if let manifest = resumeManifest {
                do { try USBResume.save(manifest, root: root) } catch { failures.append("No se guardó el estado de reanudación: \(error.localizedDescription)") }
            }
            let report: [String: Any] = ["date": ISO8601DateFormatter().string(from: Date()), "announcedFiles": total, "processedFiles": completed, "acceptedCatalogItems": accepted, "reusedCatalogItems": reused, "scope": activeScope.rawValue, "stopped": stopRequested, "issues": failures, "coverage": "Solo multimedia expuesta por el dispositivo. No acredita fototeca completa, contenido de iCloud ni respaldo restaurable."]
            do { let reportURL = root.appendingPathComponent(".import-report.json")
                if FileManager.default.fileExists(atPath: reportURL.path) { try FileManager.default.copyItem(at: reportURL, to: root.appendingPathComponent(".import-report-" + UUID().uuidString + ".json")) }
                try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: reportURL, options: .atomic) }
            catch { failures.append("No se pudo guardar el informe de importación: \(error.localizedDescription)") }
            done?(root, failures)
        }
    }
    private func downloadNext() {
        guard importing, let root = importRoot else { return }
        if stopRequested { finish(); return }
        guard nextIndex < pending.count else { status = "Importación terminada: \(accepted) de \(total) elementos aceptados; \(failures.count) incidencias."; finish(); return }
        let file = pending[nextIndex], item = pendingItems[nextIndex]; nextIndex += 1
        let token = transferID
        do {
            guard try availableSpace(at: root) > max(0, file.fileSize) + 512 * 1024 * 1024 else {
                interrupt("Espacio insuficiente para continuar; lo recibido se conserva."); return
            }
            var parents: [String] = []
            var parent = file.parentFolder
            while let folder = parent { parents.insert(SafeFiles.component(folder.name ?? "DCIM"), at: 0); parent = folder.parentFolder }
            let relative = parents.isEmpty ? "DCIM" : parents.joined(separator: "/")
            let directory = try SafeFiles.relativeURL(relative, under: root)
            try SafeFiles.makeDirectory(directory)
            let name = SafeFiles.component(file.name ?? "Archivo")
            let staging = root.appendingPathComponent(".recibiendo-" + UUID().uuidString)
            try SafeFiles.makeDirectory(staging)
            status = "Importando \(completed + 1) de \(total): \(name)"
            let options: [ICDownloadOption: Any] = [.downloadsDirectoryURL: staging, .saveAsFilename: name, .overwrite: false, .deleteAfterSuccessfulDownload: false, .sidecarFiles: true]
            watchTransfer(staging: staging, item: item)
            file.requestDownload(options: options) { [weak self] filename, error in
                DispatchQueue.main.async {
                    guard let self = self, self.importing, self.transferID == token else { return }
                    self.stopTransferMonitor()
                    if let error = error { self.failures.append("\(name): \(error.localizedDescription)") }
                    else if let filename = filename {
                        let result = URL(fileURLWithPath: filename).lastPathComponent
                        let local = staging.appendingPathComponent(result)
                        let expectedBytes = file.fileSize, date = file.creationDate
                        self.validating = true
                        self.status = "Comprobando \(self.completed + 1) de \(self.total): \(name)"
                        let cancellation = self.validationCancel
                        self.worker.async {
                            let result = Result { () -> USBRecord in
                                _ = try DeviceImport.accept(mainFile: local, staging: staging, expectedBytes: expectedBytes, destination: directory, date: date, cancel: cancellation)
                                let target = try SafeFiles.relativeURL(item.localPath, under: root)
                                let record = USBRecord(remote: item, sha256: try SafeFiles.hash(target, cancel: cancellation), evidence: "download")
                                try USBResume.append(record, root: root)
                                try? FileManager.default.removeItem(at: staging)
                                return record
                            }
                            DispatchQueue.main.async {
                                guard self.importing, self.transferID == token else { return }
                                self.validating = false
                                switch result {
                                case .success(let record): self.accepted += 1; self.resumeManifest?.records[item.path] = record; self.resumeManifest?.deferredPaths.removeAll { $0 == item.path }
                                case .failure(let error): self.failures.append("\(name): \(error.localizedDescription)")
                                }
                                self.completed += 1; self.downloadNext()
                            }
                        }
                        return
                    } else { self.failures.append("\(name): el dispositivo no confirmó el archivo recibido.") }
                    self.completed += 1; self.downloadNext()
                }
            }
        } catch {
            failures.append(error.localizedDescription); completed += 1
            DispatchQueue.main.async { [weak self] in
                guard let self = self, self.transferID == token else { return }; self.downloadNext()
            }
        }
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        if let camera = device as? ICCameraDevice { cameras.append(camera); status = "Dispositivo detectado. Selecciónalo para leer sus fotos y videos." }
    }
    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) { didRemove(device) }
    func didRemove(_ device: ICDevice) {
        cameras.removeAll { $0 === device }
        if selected === device {
            interrupt("El dispositivo se desconectó. La importación está incompleta.")
            monitor?.invalidate(); reopening = false; completeCatalog = false; connectionDetails = ""
            ready = false; files = []; catalog = []; selected = nil
            if !importing { status = "Dispositivo desconectado. Puedes volver a conectarlo." }
        }
    }
    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        guard selected === device else { return }
        if let error = error { monitor?.invalidate(); ready = false; status = "No se pudo acceder: \(error.localizedDescription)" }
        else if let camera = device as? ICCameraDevice { refresh(camera) }
    }
    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {
        guard selected === device else { return }
        ready = false; completeCatalog = false
        if reopening, let camera = device as? ICCameraDevice {
            reopening = false
            if let error = error { monitor?.invalidate(); status = "No se pudo cerrar la sesión: \(error.localizedDescription). Desconecta y vuelve a conectar el cable."; return }
            watchConnection(); status = "Abriendo una nueva sesión del iPhone…"; camera.requestOpenSession()
        } else {
            monitor?.invalidate()
            interrupt("La sesión del dispositivo se cerró antes de terminar.")
            if !importing { status = "Sesión cerrada. Pulsa Leer catálogo para volver a conectar." }
        }
    }
    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
        if selected === camera, ready, !importing { ready = false }
        refresh(camera)
    }
    func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {
        if selected === camera, ready, !importing { ready = false }
        refresh(camera)
    }
    func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {
        if selected === camera, ready, !importing { ready = false }
        refresh(camera)
    }
    func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) { refresh(camera) }
    func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {}
    func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: Error?) {}
    func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
        guard selected === device, !reopening else { return }
        completeCatalog = true; refresh(device)
    }
    func deviceDidBecomeReady(_ device: ICDevice) { if let camera = device as? ICCameraDevice { refresh(camera) } }
    func device(_ device: ICDevice, didEncounterError error: Error?) {
        guard selected === device, let error = error else { return }
        ready = false; monitor?.invalidate()
        interrupt("Error del dispositivo: \(error.localizedDescription)")
        if !importing { status = "Error del dispositivo: \(error.localizedDescription). Puedes volver a conectar." }
    }
    func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) { if let camera = device as? ICCameraDevice { refresh(camera) } }
    func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) { if selected === device { ready = false; status = "Desbloquea el teléfono para continuar." } }
}
