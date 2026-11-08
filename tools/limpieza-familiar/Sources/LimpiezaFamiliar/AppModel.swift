import AppKit
import SwiftUI
import UniformTypeIdentifiers
import ArchiveCore

enum Section: String, CaseIterable {
    case home = "Mi familia", device = "Conectar iPhone", storage = "Qué puedo limpiar", safeCleanup = "Limpieza sin fotos", photoRemoval = "Fotos respaldadas", library = "Biblioteca", whatsapp = "WhatsApp", backup = "Respaldo", history = "Historial", guide = "Revisar selección"
    var symbol: String {
        switch self { case .home: return "house"; case .device: return "iphone"; case .storage, .safeCleanup: return "sparkle.magnifyingglass"; case .photoRemoval: return "photo.badge.checkmark"; case .library: return "photo.on.rectangle.angled"; case .whatsapp: return "bubble.left.and.bubble.right"; case .backup: return "externaldrive.badge.checkmark"; case .history: return "clock.arrow.circlepath"; case .guide: return "checklist" }
    }
}

final class AppModel: ObservableObject {
    @Published var section = Section.home
    @Published var preferences = Preferences()
    @Published var profileID = ""
    @Published var scan: ScanResult?
    @Published var selected: Set<String> = []
    @Published var busy = false
    @Published var progress: Double = 0
    @Published var progressText = ""
    @Published var notice = ""
    @Published var error: String?
    @Published var issues: [String] = []
    @Published var destination: URL?
    @Published var archiveFolder: URL?
    @Published var viewingArchive = false
    @Published var chat: ChatExport?
    @Published var chatURL: URL?
    @Published var backupInfo: BackupInfo?
    @Published var backupPath: URL?
    @Published var ownerDraft = ""
    @Published var deviceDraft = ""
    @Published var filter = "Todos"
    @Published var query = ""
    @Published var page = 0
    @Published var chatQuery = ""
    @Published var gallery = true
    @Published var comparison: [String:String] = [:]
    @Published var comparisonSummary = "Sin comparación actual con el iPhone"
    @Published var preview: MediaFile?
    @Published var resumeFolder: URL?
    @Published var cleanupReview: CleanupReview?
    @Published var reviewPage = 0
    @Published var libraryTitle = "Tu biblioteca"
    @Published var onlyReviewSelection = false
    @Published var month = "Todos los meses"
    @Published private(set) var storageAdvice: StorageAdvice?
    @Published private(set) var storageLoading = false
    @Published private(set) var storageNote = ""
    private var storageRequest = UUID()
    @Published var photoSearch = ""
    @Published private(set) var photoOptions: [VerifiedPhoto] = []
    @Published private(set) var photoReviewed: VerifiedPhoto?
    @Published private(set) var photoHandoff = false
    private var photoOptionCatalogue: UUID?
    private var photoOptionProfile: String?
    private var photoProof: (link: DeviceService.PhotoLink, stamp: PhotoRemoval.FileStamp)?
    @Published private(set) var disposableTrial: DisposablePhotoTrial?
    @Published private(set) var disposableVerified: DisposablePhotoTrial.Verified?
    @Published private(set) var disposableCancelChecked = false
    private var disposableLink: DeviceService.PhotoLink?
    private struct AirDropComparison {
        let item: USBItem
        let deviceID: String
        let generation: UUID
        let filename: String
    }
    @Published private var airDropComparison: AirDropComparison?
    private var preparedResume: USBResumePlan?
    private var preparedCatalogID: UUID?
    let devices = DeviceService()
    let stateURL: URL
    var cancel = Cancellation()
    var loadFailed = false
    let demo: Bool
    private let worker = DispatchQueue(label: "cl.logikapps.limpieza.worker", qos: .userInitiated)

    init(stateRoot: URL? = nil, demo: Bool = false) {
        self.demo = demo
        stateURL = (stateRoot ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/LOGIKAPPS/Limpieza Familiar")).appendingPathComponent("preferences.json")
        do { preferences = try Persistence.load(stateURL); profileID = preferences.profiles.first?.id ?? "" }
        catch { self.error = "No pudimos leer las preferencias. Se conservaron intactas: \(error.localizedDescription)"; loadFailed = true }
    }
    var profile: FamilyProfile? { preferences.profiles.first { $0.id == profileID } }
    var selectedFiles: [MediaFile] { (scan?.files ?? []).filter { selected.contains($0.id) } }
    var duplicates: Set<String> { Set(scan?.duplicateGroups.flatMap { $0.map(\.id) } ?? []) }
    func monthKey(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }
    var months: [String] { Array(Set((scan?.files ?? []).map { monthKey($0.date) })).sorted(by: >) }
    var visibleFiles: [MediaFile] {
        let ids = filter == "Duplicados" ? duplicates : []
        return (scan?.files ?? []).filter {
            (query.isEmpty || $0.relativePath.localizedCaseInsensitiveContains(query)) && (!onlyReviewSelection || selected.contains($0.id)) && (month == "Todos los meses" || monthKey($0.date) == month) &&
            (filter == "Fotos y videos" && ($0.kind == .photo || $0.kind == .video) || filter == "Todos" || filter == $0.kind.rawValue || (filter == "Grandes" && $0.bytes >= 100_000_000) || (filter == "Duplicados" && ids.contains($0.id)))
        }.sorted { if filter == "Grandes" { return $0.bytes > $1.bytes }; if gallery && $0.date != $1.date { return $0.date > $1.date }; return $0.relativePath < $1.relativePath }
    }
    func save() {
        guard !loadFailed else { error = "Las preferencias no se sobrescribirán mientras exista un error de lectura."; return }
        do { try Persistence.save(preferences, to: stateURL) } catch { self.error = "No se guardaron las preferencias: \(error.localizedDescription)" }
    }
    func addProfile() {
        let owner = ownerDraft.trimmingCharacters(in: .whitespacesAndNewlines), device = deviceDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !owner.isEmpty, !device.isEmpty, owner.count <= 80, device.count <= 80 else { error = "Completa persona y dispositivo (máximo 80 caracteres cada uno)."; return }
        guard !preferences.profiles.contains(where: { $0.owner == owner && $0.device == device }) else { error = "Esta persona y dispositivo ya están registrados."; return }
        let item = FamilyProfile(owner: owner, device: device); preferences.profiles.append(item); profileID = item.id; save()
        ownerDraft = ""; deviceDraft = ""
    }
    func folderPanel(_ title: String, completion: @escaping (URL) -> Void) {
        guard !busy, !devices.importing else { return }
        let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = false
        panel.message = title; panel.prompt = "Elegir carpeta"
        if panel.runModal() == .OK, let url = panel.url { completion(url.standardizedFileURL.resolvingSymlinksInPath()) }
    }
    func chooseSource() {
        folderPanel("Selecciona fotos, archivos o una carpeta de WhatsApp ya exportada y descomprimida. Solo se leerá esta carpeta.") { self.analyze($0) }
    }
    func chooseDestination() {
        folderPanel("Elige un disco o carpeta para el archivo organizado, separado de la carpeta de origen.") { self.destination = $0 }
    }
    func begin(_ text: String) { busy = true; cancel = Cancellation(); progress = 0; progressText = text; notice = ""; issues = [] }
    func finish(_ error: Error? = nil) { busy = false; progress = 1; if let error = error { self.error = error.localizedDescription } }
    func stop() { cancel.cancel(); progressText = "Deteniendo al llegar a un punto seguro…" }
    func analyze(_ root: URL, priorIssues: [String] = []) {
        guard !busy else { return }
        begin("Analizando contenido…"); comparison = [:]; comparisonSummary = "Sin comparación actual con el iPhone"; section = .library
        let token = cancel
        worker.async {
            do {
                let result = try ArchiveEngine.scan(root, cancel: token) { count, name in
                    if count % 10 == 0 { DispatchQueue.main.async { self.progressText = "\(count) archivos analizados · \(name)" } }
                }
                DispatchQueue.main.async {
                    self.scan = result; self.selected = []; self.archiveFolder = nil; self.viewingArchive = false; self.filter = "Todos"; self.query = ""; self.page = 0; self.month = "Todos los meses"; self.onlyReviewSelection = false
                    self.issues = priorIssues + result.warnings; self.notice = "Análisis terminado. Se han leído \(result.files.count) archivos; no se ha eliminado ninguno."; self.finish()
                }
            } catch { DispatchQueue.main.async { self.finish(error) } }
        }
    }
    func archiveSelection() {
        guard !busy, !viewingArchive, let scan = scan, let destination = destination, let profile = profile else { error = "Elige una persona, una carpeta de origen y un destino."; return }
        guard !selectedFiles.isEmpty else { error = "Selecciona los archivos que quieres archivar."; return }
        // Include all same-stem companions in the source directory to avoid splitting Live Photos / edit sidecars.
        let stems = Set(selectedFiles.map { URL(fileURLWithPath: $0.sourcePath).deletingPathExtension().path.lowercased() })
        let files = scan.files.filter { selected.contains($0.id) || stems.contains(URL(fileURLWithPath: $0.sourcePath).deletingPathExtension().path.lowercased()) }
        let alert = NSAlert(); alert.messageText = "Archivar \(files.count) archivos de \(profile.owner)"
        alert.informativeText = "Se copiarán al destino elegido y se comprobará su contenido. Se incluyen archivos asociados con el mismo nombre base. Los originales permanecerán intactos.\n\nDestino: \(destination.path)"
        alert.addButton(withTitle: "Copiar y verificar"); alert.addButton(withTitle: "Cancelar")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        begin("Preparando archivo…"); let token = cancel
        worker.async {
            do {
                let result = try ArchiveEngine.archive(files, sourceRoot: scan.root, destination: destination, owner: profile.owner, device: profile.device, cancel: token) { current, total, name in
                    DispatchQueue.main.async { self.progress = Double(current) / Double(max(total, 1)); self.progressText = "\(current)/\(total) · \(name)" }
                }
                DispatchQueue.main.async {
                    self.archiveFolder = result.folder; self.issues = result.errors
                    self.preferences.history.insert(HistoryEntry(owner: profile.owner, device: profile.device, folder: result.folder.path, copied: result.copied, reused: result.reused), at: 0)
                    self.save(); self.notice = "\(result.copied) copias nuevas · \(result.reused) ya archivadas · \(result.errors.count) incidencias. Los originales siguen en su lugar."; self.finish()
                }
            } catch { DispatchQueue.main.async { self.finish(error) } }
        }
    }
    func openArchive(_ folder: URL? = nil) {
        guard !busy, !devices.importing else { return }
        guard let folder = folder else { folderPanel("Elige la carpeta del dispositivo que contiene manifest.json.") { self.openArchive($0) }; return }
        do {
            let manifest = try ArchiveEngine.loadManifest(folder)
            let files = try manifest.records.map { record -> MediaFile in
                var file = record.source; file.id = record.id; file.sourcePath = try SafeFiles.relativeURL(record.storedPath, under: folder).path; file.relativePath = record.storedPath; return file
            }
            scan = ScanResult(root: folder, files: files, warnings: []); selected = []; archiveFolder = folder; viewingArchive = true
            filter = "Todos"; query = ""; page = 0; section = .library; issues = []
            notice = "Archivo de \(manifest.owner) · \(manifest.device). Registros guardados: \(files.count). Usa Verificar para comprobar su estado actual."
        } catch { self.error = error.localizedDescription }
    }
    func verifyArchive() {
        guard let folder = archiveFolder, !busy else { return }
        begin("Comprobando archivo…"); let token = cancel
        worker.async {
            do {
                let errors = try ArchiveEngine.verify(folder, cancel: token) { i, total, name in DispatchQueue.main.async { self.progress = Double(i) / Double(max(1, total)); self.progressText = "Verificando \(i)/\(total) · \(name)" } }
                DispatchQueue.main.async { self.issues = errors; self.notice = errors.isEmpty ? "Los archivos registrados coinciden con sus huellas guardadas. Esto no acredita un respaldo completo del iPhone." : "Se encontraron \(errors.count) archivos ausentes o modificados. Revisa las incidencias antes de limpiar."; self.finish() }
            } catch { DispatchQueue.main.async { self.finish(error) } }
        }
    }
    func openChat(_ file: URL? = nil) {
        guard !busy, !devices.importing else { return }
        if let file = file {
            begin("Leyendo exportación de WhatsApp…")
            worker.async {
                do { let chat = try WhatsApp.load(file); DispatchQueue.main.async { self.chat = chat; self.chatURL = file; self.section = .whatsapp; self.finish() } }
                catch { DispatchQueue.main.async { self.finish(error) } }
            }; return
        }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.plainText]; panel.message = "Abre el TXT de un chat exportado. Para archivar sus adjuntos, analiza la carpeta completa."
        if panel.runModal() == .OK, let url = panel.url { openChat(url) }
    }
    func inspectBackup() {
        folderPanel("Elige un respaldo local de Finder que contenga Info.plist, Manifest.plist, Manifest.db y Status.plist.") { folder in
            do { self.backupInfo = try BackupInspector.inspect(folder); self.backupPath = folder }
            catch { self.error = error.localizedDescription }
        }
    }
    func importDevice() {
        guard let profile = profile else { error = "Primero registra y selecciona una persona y su dispositivo en Mi familia."; return }
        folderPanel("Elige dónde guardar la importación original del iPhone. Después podrás organizarla en otro destino. Necesitas espacio para ambas copias.") { base in
            let root = base.appendingPathComponent(SafeFiles.component(profile.owner)).appendingPathComponent(SafeFiles.component(profile.device)).appendingPathComponent(self.devices.scope == .sample ? "Prueba de copia" : "Fotos y videos")
            if FileManager.default.fileExists(atPath: root.path) { self.prepareResume(at: root); return }
            do {
                guard let plan = self.devices.plan, self.devices.ready else { throw ArchiveError.message("Espera a que el dispositivo termine de leer el catálogo.") }
                let catalogID = self.devices.catalogID, scope = self.devices.scope
                let available = try self.devices.availableSpace(at: base)
                try plan.checkSpace(available: available)
                let alert = NSAlert()
                alert.messageText = "Importar \(plan.items.count) archivos · \(scope.rawValue)"
                alert.informativeText = "Conectado: \(self.devices.selected?.name ?? "iPhone")\nGuardar para: \(profile.owner) · \(profile.device)\n\nTamaño anunciado: \(sizeText(plan.knownBytes))\nEspacio libre: \(sizeText(available))\nMargen de trabajo: \(sizeText(plan.reserveBytes))\n" + (plan.unknownSizes > 0 ? "Hay \(plan.unknownSizes) archivos sin tamaño conocido; necesitarán espacio adicional.\n" : "") + "\nLos complementos pueden necesitar espacio adicional. Para organizar después otra copia, reserva también su espacio.\n\nDestino: \(root.path)\n\nLos originales permanecerán en el iPhone."
                alert.addButton(withTitle: "Importar copia"); alert.addButton(withTitle: "Cancelar")
                guard alert.runModal() == .alertFirstButtonReturn else { return }
                guard self.devices.catalogID == catalogID, self.devices.scope == scope else { throw ArchiveError.message("El catálogo cambió mientras revisabas la copia. Revisa el nuevo lote y vuelve a importar.") }
                try self.devices.beginImport(to: root) { root, errors in self.analyze(root, priorIssues: errors) }
                self.rememberUSB(root)
            } catch { self.error = error.localizedDescription }
        }
    }
    func libraryName(_ session: USBSessionReference) -> String { "Biblioteca de " + (session.ownerName ?? session.deviceName) }
    func openStorage(_ session: USBSessionReference) {
        if let owner = preferences.profiles.first(where: {
            $0.owner == session.ownerName && $0.device == session.deviceName
        }) { profileID = owner.id }
        section = .storage
    }
    func refreshStorage() {
        let request = UUID()
        storageRequest = request
        storageAdvice = nil
        storageLoading = false
        storageNote = ""
        guard let profile = profile else { return }
        let sessions = (preferences.usbSessions ?? []).filter {
            $0.ownerName == profile.owner && $0.deviceName == profile.device
        }
        let session = sessions.first { $0.deviceID == devices.deviceIdentity } ?? sessions.first
        let liveMatches = session.map { $0.deviceID == devices.deviceIdentity } ?? (devices.selected?.name == profile.device)
        let live = devices.ready && liveMatches ? devices.resumeCatalog : nil
        let catalogID = devices.catalogID
        storageLoading = true
        worker.async {
            var manifest: USBManifest?
            var observation: StorageObservation?
            var messages: [String] = []
            if let session = session {
                let root = URL(fileURLWithPath: session.folder)
                do {
                    let saved = try USBResume.load(root)
                    if saved?.deviceID == session.deviceID { manifest = saved }
                    else { messages.append("El registro del respaldo no coincide con el iPhone seleccionado.") }
                } catch { messages.append("No se pudo leer el registro del respaldo.") }
                do { observation = try StorageObservation.load(root, deviceID: session.deviceID) }
                catch { messages.append("No se pudo leer la observación de Finder.") }
            }
            let savedAdvice = StorageAdvice.make(saved: manifest, live: nil, observation: observation)
            let liveAdvice = live.map { StorageAdvice.make(saved: manifest, live: $0, observation: observation) }
            let note = messages.joined(separator: " ")
            DispatchQueue.main.async {
                guard self.storageRequest == request, self.profileID == profile.id else { return }
                self.storageAdvice = self.devices.ready && self.devices.catalogID == catalogID ? liveAdvice ?? savedAdvice : savedAdvice
                self.storageNote = note
                self.storageLoading = false
            }
        }
    }
    private var photoSession: USBSessionReference? {
        guard let profile = profile else { return nil }
        return preferences.usbSessions?.first {
            $0.ownerName == profile.owner && $0.deviceName == profile.device && $0.deviceID == devices.deviceIdentity
        }
    }
    var photoOptionsCurrent: Bool {
        devices.ready && photoSession != nil && photoOptionCatalogue == devices.catalogID && photoOptionProfile == profileID
    }
    var canFindVerifiedPhotos: Bool { devices.ready && photoSession != nil }
    var canRecordPhotoTestBaseline: Bool { false } // La prueba privada de borrado no forma parte de la distribución.
    var hasSavedDisposableTrial: Bool {
        guard canRecordPhotoTestBaseline, let session = photoSession,
              let url = try? DisposablePhotoTrial.baselineURL(under: URL(fileURLWithPath: session.folder)) else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }
    var canSimulateAirDropCancellation: Bool {
        guard let proof = airDropComparison else { return false }
        return canRecordPhotoTestBaseline && photoSession?.deviceID == proof.deviceID && devices.catalogID == proof.generation
    }
    var airDropDeletionDiagnostic: String? {
        guard canSimulateAirDropCancellation, let proof = airDropComparison else { return nil }
        return devices.deletionDiagnostic(for: proof.item, deviceID: proof.deviceID)
    }
    func simulateAirDropCancellation() {
        guard !busy, section == .photoRemoval, canSimulateAirDropCancellation,
              let proof = airDropComparison, let session = photoSession else { return }
        let alert = NSAlert()
        alert.messageText = "Prueba de Cancelar · \(proof.filename)"
        alert.informativeText = "\(session.deviceName) · Una foto de prueba\n\nPulsa Cancelar. Después volveremos a leer la foto para comprobar que siga en el iPhone y coincida con las copias del Mac y DISCO-PRUEBA. Esta simulación no ejecuta borrados."
        alert.addButton(withTitle: "Cancelar")
        alert.addButton(withTitle: "Salir de la simulación").keyEquivalent = ""
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard canSimulateAirDropCancellation, section == .photoRemoval else {
            error = "Se canceló la prueba, pero cambió la conexión. Vuelve a cotejar antes de comprobar el resultado."
            return
        }
        compareAirDropPhotoWithUSB(afterCancelling: proof.item)
    }
    func compareAirDropPhotoWithUSB() { compareAirDropPhotoWithUSB(afterCancelling: nil) }
    private func compareAirDropPhotoWithUSB(afterCancelling previous: USBItem?) {
        guard !busy, !devices.importing, canRecordPhotoTestBaseline, let session = photoSession,
              let catalogue = devices.disposablePhotoCatalogue else { return }
        let root = URL(fileURLWithPath: session.folder)
        let generation = devices.catalogID
        airDropComparison = nil
        begin(previous == nil ? "Comprobando la foto recibida por AirDrop…" : "Cancelado. Comprobando que la foto sigue en el iPhone…")
        let token = cancel
        worker.async {
            do {
                let trial = try DisposablePhotoTrial.load(under: root)
                guard trial.deviceID == session.deviceID else { throw ArchiveError.message("La prueba pertenece a otro iPhone.") }
                let receipt = try trial.airDropCopies(under: root, cancel: token)
                let matches = catalogue.filter {
                    URL(fileURLWithPath: $0.path).lastPathComponent == receipt.filename
                }
                guard matches.count == 1, let item = matches.first, item.path.hasPrefix("DCIM/"),
                      !trial.catalogue.contains(where: { $0.path == item.path }),
                      let date = item.created, date >= trial.recordedAt,
                      date.timeIntervalSince(trial.recordedAt) < 1_800, item.bytes > 0, item.bytes <= PhotoRemoval.maxBytes,
                      previous.map({ $0.sameRemote(item) }) ?? true else {
                    throw ArchiveError.message("El catálogo USB no muestra una coincidencia única con la foto de prueba.")
                }
                DispatchQueue.main.async {
                    guard !token.cancelled, self.devices.catalogID == generation, self.photoSession?.deviceID == session.deviceID,
                          let link = self.devices.comparisonLink(item, deviceID: session.deviceID) else {
                        self.finish(ArchiveError.message("La sesión USB cambió o no permite leer esta foto."))
                        return
                    }
                    let staging = FileManager.default.temporaryDirectory.appendingPathComponent("limpieza-usb-qr-" + UUID().uuidString)
                    do { try SafeFiles.makeDirectory(staging) }
                    catch { self.finish(error); return }
                    self.progressText = "Leyendo solo \(receipt.filename) por cable…"
                    self.devices.readPhoto(link, item: item, into: staging, comparisonOnly: true) { result in
                        self.worker.async {
                            let match = Result {
                                defer { try? FileManager.default.removeItem(at: staging) }
                                let received = try result.get()
                                try trial.verifyMarker(in: received)
                                return try receipt.matches(received, cancel: token)
                            }
                            DispatchQueue.main.async {
                                switch match {
                                case .failure(let error): self.finish(error)
                                case .success(let identical):
                                    self.finish()
                                    guard identical else {
                                        self.notice = "\(receipt.filename): el QR coincide, pero el archivo USB difiere de las dos copias de AirDrop. Las copias se conservaron."
                                        return
                                    }
                                    if self.devices.catalogID == generation && self.photoSession?.deviceID == session.deviceID {
                                        self.airDropComparison = AirDropComparison(item: item, deviceID: session.deviceID,
                                                                                   generation: generation, filename: receipt.filename)
                                    }
                                    self.notice = previous == nil
                                        ? "\(receipt.filename): el iPhone, el Mac y DISCO-PRUEBA coinciden byte por byte (\(receipt.bytes) bytes)."
                                        : "Cancelar comprobado. \(receipt.filename) sigue en el iPhone y coincide byte por byte con el Mac y DISCO-PRUEBA (\(receipt.bytes) bytes)."
                                }
                            }
                        }
                    }
                }
            } catch { DispatchQueue.main.async { self.finish(error) } }
        }
    }
    func restoreDisposableTrial() {
        guard !busy, !devices.importing, canRecordPhotoTestBaseline, let session = photoSession else { return }
        do {
            let trial = try DisposablePhotoTrial.load(under: URL(fileURLWithPath: session.folder))
            guard trial.deviceID == session.deviceID, trial.volume.path == "/Volumes/DISCO-PRUEBA",
                  trial.volume.isCurrent(), Date().timeIntervalSince(trial.recordedAt) < 1_800 else {
                throw ArchiveError.message("La prueba venció o cambiaron el iPhone o el disco.")
            }
            disposableVerified = nil; disposableLink = nil; disposableCancelChecked = false
            disposableTrial = trial
            notice = "Prueba recuperada con su código original. Si ya tomaste la foto, verifica las dos copias."
        } catch { self.error = "No se pudo recuperar la prueba: \(error.localizedDescription)" }
    }
    var disposableTrialOnCurrentPhone: Bool {
        guard let trial = disposableTrial, let session = photoSession else { return false }
        return canRecordPhotoTestBaseline && trial.deviceID == session.deviceID
    }
    var canConfirmDisposableTrial: Bool {
        guard disposableTrialOnCurrentPhone, let verified = disposableVerified, let link = disposableLink,
              verified.trial.id == disposableTrial?.id else { return false }
        return devices.canRemoveDisposablePhoto(verified, link: link)
    }
    func recordPhotoTestBaseline() {
        guard !busy, !devices.importing, canRecordPhotoTestBaseline, let session = photoSession,
              let catalogue = devices.disposablePhotoCatalogue else { return }
        do {
            let disk = URL(fileURLWithPath: "/Volumes/DISCO-PRUEBA", isDirectory: true)
            let volume = try DisposablePhotoTrial.RecoveryVolume(url: disk)
            let snapshot = try DisposablePhotoTrial(deviceID: session.deviceID, catalogue: catalogue, volume: volume)
            let root = URL(fileURLWithPath: session.folder)
            let target = try DisposablePhotoTrial.baselineURL(under: root)
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            try encoder.encode(snapshot).write(to: target, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
            disposableVerified = nil; disposableLink = nil; disposableCancelChecked = false
            disposableTrial = snapshot
            notice = "Catálogo inicial guardado: \(snapshot.catalogue.count) elementos de \(session.deviceName). Ya puedes tomar una sola foto de prueba."
        } catch { self.error = "No se guardó el catálogo de la prueba: \(error.localizedDescription)" }
    }
    func verifyDisposableTrial() {
        guard !busy, !devices.importing, disposableTrialOnCurrentPhone, let originalTrial = disposableTrial,
              let session = photoSession, let catalogue = devices.disposablePhotoCatalogue else { return }
        disposableVerified = nil; disposableLink = nil; disposableCancelChecked = false
        do {
            let trial: DisposablePhotoTrial
            if (try? originalTrial.candidate(in: catalogue, deviceID: devices.deviceIdentity)) != nil {
                trial = originalTrial
            } else if let history = try USBResume.load(URL(fileURLWithPath: session.folder)),
                      let expanded = try? originalTrial.includingEarlierCatalogue(history),
                      (try? expanded.candidate(in: catalogue, deviceID: devices.deviceIdentity)) != nil {
                trial = expanded
            } else {
                trial = originalTrial
            }
            let item = try trial.candidate(in: catalogue, deviceID: devices.deviceIdentity)
            guard trial.volume.isCurrent(), let link = devices.photoLink(item, deviceID: session.deviceID) else {
                throw ArchiveError.message("La foto no está disponible de forma individual o cambió el disco DISCO-PRUEBA.")
            }
            let localRoot = URL(fileURLWithPath: session.folder).deletingLastPathComponent()
                .appendingPathComponent("Pruebas de borrado", isDirectory: true)
                .appendingPathComponent(trial.id.uuidString, isDirectory: true)
            let staging = FileManager.default.temporaryDirectory.appendingPathComponent("limpieza-prueba-" + UUID().uuidString)
            try SafeFiles.makeDirectory(staging)
            begin("Comprobando el código y guardando la foto de prueba…")
            let token = cancel
            devices.readPhoto(link, item: item, into: staging) { result in
                self.worker.async {
                    let checked = Result {
                        defer { try? FileManager.default.removeItem(at: staging) }
                        return try trial.verifyAndBackUp(result.get(), item: item, current: catalogue, localRoot: localRoot, cancel: token)
                    }
                    DispatchQueue.main.async {
                        self.finish()
                        switch checked {
                        case .failure(let error): self.error = error.localizedDescription
                        case .success(let verified):
                            guard self.disposableTrial?.id == trial.id, self.disposableTrialOnCurrentPhone,
                                  self.devices.isCurrent(link, item: item), !token.cancelled else { return }
                            self.disposableLink = link; self.disposableVerified = verified
                            self.notice = "Dos copias de la foto de prueba verificadas byte por byte. El iPhone sigue intacto."
                        }
                    }
                }
            }
        } catch { self.error = error.localizedDescription }
    }
    func confirmDisposableTrial(simulateCancel: Bool) {
        guard !busy, section == .photoRemoval, canConfirmDisposableTrial, let verified = disposableVerified,
              let link = disposableLink, simulateCancel || disposableCancelChecked else { return }
        let photo = verified.permission.photo
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = simulateCancel ? "Prueba de Cancelar · \(photo.name)" : "¿Eliminar la única foto de prueba?"
        alert.informativeText = "iPhone de prueba · \(photo.name) · 1 foto de prueba\n\nMac: \(photo.backup.path)\nDISCO-PRUEBA: \(verified.permission.secondCopy.path)\n\nSi confirmas el borrado real, también puede sincronizarse a iCloud. Solo se enviará esta foto."
        let thumbnail = NSImage(contentsOf: photo.backup)
        if let thumbnail = thumbnail {
            let preview = NSImageView(frame: NSRect(x: 0, y: 0, width: 220, height: 140))
            preview.image = thumbnail
            preview.imageScaling = .scaleProportionallyDown
            alert.accessoryView = preview
        }
        alert.addButton(withTitle: "Cancelar")
        alert.addButton(withTitle: simulateCancel ? "Salir de la simulación" : "Eliminar esta foto").keyEquivalent = ""
        let response = alert.runModal()
        guard canConfirmDisposableTrial, verified.permission.stillIntact(), section == .photoRemoval else {
            error = "Cambió la conexión o una copia. Vuelve a verificar la foto de prueba."
            return
        }
        if simulateCancel {
            disposableCancelChecked = response == .alertFirstButtonReturn
            if disposableCancelChecked { notice = "Cancelar funcionó. La foto de prueba sigue en el iPhone y las dos copias coinciden." }
            return
        }
        guard response == .alertSecondButtonReturn, disposableCancelChecked, let session = photoSession else { return }
        // Consume the trial before sending the one-item request; it cannot be retried automatically.
        do {
            let root = URL(fileURLWithPath: session.folder)
            guard try DisposablePhotoTrial.load(under: root).id == verified.trial.id else {
                throw ArchiveError.message("El registro inicial ya no corresponde a esta prueba.")
            }
            let baseline = try DisposablePhotoTrial.baselineURL(under: root)
            let consumed = try SafeFiles.relativeURL(".photo-test-consumed-" + verified.trial.id.uuidString + ".json", under: root)
            try FileManager.default.moveItem(at: baseline, to: consumed)
        } catch {
            self.error = error.localizedDescription
            return
        }
        disposableTrial = nil; disposableVerified = nil; disposableLink = nil; disposableCancelChecked = false
        begin("Esperando la respuesta del iPhone para la foto de prueba…")
        let sent = devices.removeDisposablePhoto(verified, link: link, confirmed: true) { deleted in
            self.finish()
            self.notice = deleted
                ? "El iPhone confirmó el borrado de la foto de prueba. Revisa Eliminados en el iPhone e intenta recuperarla. Las dos copias siguen guardadas."
                : "El iPhone no confirmó el resultado. No repitas la prueba hasta comprobar si la foto sigue en Fotos o en Eliminados."
        }
        if !sent { finish(ArchiveError.message("El iPhone o las copias cambiaron. No se envió el borrado.")) }
    }
    var canRemoveReviewedPhoto: Bool {
        guard photoOptionsCurrent, let photo = photoReviewed, let proof = photoProof else { return false }
        return devices.canRemovePhoto(proof.link, item: photo.remote)
    }
    func resetPhotoReview() {
        photoOptions = []; photoReviewed = nil; photoProof = nil
        photoOptionCatalogue = nil; photoOptionProfile = nil; photoHandoff = false
    }
    func findVerifiedPhotos() {
        guard !busy, !devices.importing, devices.ready, let session = photoSession else { return }
        resetPhotoReview()
        let root = URL(fileURLWithPath: session.folder)
        let generation = devices.catalogID, owner = profileID, catalogue = devices.resumeCatalog
        let search = photoSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        begin("Comprobando copias de fotos individuales…")
        let token = cancel
        worker.async {
            do {
                guard let manifest = try USBResume.load(root) else {
                    throw ArchiveError.message("No hay un registro de respaldo para este iPhone.")
                }
                let records = try PhotoRemoval.candidates(manifest: manifest, catalogue: catalogue,
                    deviceID: session.deviceID, search: search, cancel: token)
                var options: [VerifiedPhoto] = []
                for record in records {
                    try token.check()
                    if let photo = try? PhotoRemoval.verify(record, under: root, cancel: token) { options.append(photo) }
                    if options.count == 24 { break }
                }
                try token.check()
                let verified = options
                DispatchQueue.main.async {
                    defer { self.finish() }
                    guard self.section == .photoRemoval, self.devices.ready, self.devices.catalogID == generation,
                          self.profileID == owner, self.photoSession?.folder == session.folder else { return }
                    self.photoOptions = verified
                    self.photoOptionCatalogue = generation
                    self.photoOptionProfile = owner
                    if verified.isEmpty { self.notice = "No se encontraron fotos individuales con copia verificable para esta búsqueda." }
                }
            } catch { DispatchQueue.main.async { self.finish(error) } }
        }
    }
    func reviewPhoto(_ photo: VerifiedPhoto) {
        guard !busy, !devices.importing, photoOptionsCurrent,
              photoOptions.contains(where: { $0.id == photo.id }), let session = photoSession,
              let link = devices.photoLink(photo.remote, deviceID: session.deviceID) else {
            error = "La foto cambió o tiene componentes asociados. Actualiza la lista."
            return
        }
        photoReviewed = nil; photoProof = nil; photoHandoff = false
        let staging = FileManager.default.temporaryDirectory.appendingPathComponent("limpieza-cotejo-" + UUID().uuidString)
        do { try SafeFiles.makeDirectory(staging) }
        catch { self.error = error.localizedDescription; return }
        begin("Cotejando una foto del iPhone con su copia…")
        let token = cancel
        devices.readPhoto(link, item: photo.remote, into: staging) { result in
            self.worker.async {
                let proof = Result {
                    defer { try? FileManager.default.removeItem(at: staging) }
                    return try PhotoRemoval.verifyCurrentCopy(result.get(), photo: photo, cancel: token)
                }
                DispatchQueue.main.async {
                    switch proof {
                    case .failure(let error): self.finish(error)
                    case .success(let stamp):
                        self.finish()
                        guard !token.cancelled, self.section == .photoRemoval, self.photoOptionsCurrent,
                              self.devices.isCurrent(link, item: photo.remote) else { return }
                        self.photoProof = (link, stamp); self.photoReviewed = photo
                    }
                }
            }
        }
    }
    private func reviewedPhotoIsCurrent(_ photo: VerifiedPhoto) -> Bool {
        guard photoOptionsCurrent, section == .photoRemoval, photoReviewed?.id == photo.id,
              let proof = photoProof, devices.isCurrent(proof.link, item: photo.remote) else { return false }
        return (try? PhotoRemoval.stamp(photo.backup)) == proof.stamp
    }
    func confirmPhotoHandoff() {
        guard !busy, let photo = photoReviewed, reviewedPhotoIsCurrent(photo), let session = photoSession else {
            error = "Vuelve a verificar la foto y su copia."
            return
        }
        let alert = NSAlert()
        alert.messageText = "Revisar una foto para quitar en Fotos"
        alert.informativeText = "\(session.deviceName) · \(photo.name) · \(sizeText(photo.remote.bytes))\n\nCopia verificada: \(photo.backup.path)\n\nLa selección se prepara en el Mac. El borrado se confirma en Fotos del iPhone. Si usas Fotos en iCloud, el borrado también se sincroniza."
        alert.addButton(withTitle: "Cancelar")
        alert.addButton(withTitle: "Preparar esta foto").keyEquivalent = ""
        guard alert.runModal() == .alertSecondButtonReturn, reviewedPhotoIsCurrent(photo) else { return }
        photoHandoff = true
    }
    func confirmPhotoRemoval() {
        guard !busy, canRemoveReviewedPhoto, let photo = photoReviewed, let proof = photoProof,
              reviewedPhotoIsCurrent(photo), let session = photoSession else { return }
        let picker = NSOpenPanel()
        picker.message = "Elige una segunda copia de esta foto en un disco externo."
        picker.canChooseFiles = true; picker.canChooseDirectories = false; picker.allowsMultipleSelection = false
        picker.prompt = "Verificar copia"
        guard picker.runModal() == .OK, let second = picker.url, reviewedPhotoIsCurrent(photo) else { return }
        begin("Verificando la copia de recuperación…")
        let token = cancel
        worker.async {
            let result = Result { try PhotoRemoval.Permission(photo: photo, secondCopy: second, cancel: token) }
            DispatchQueue.main.async {
                self.finish()
                do {
                    let permission = try result.get()
                    guard !token.cancelled, self.reviewedPhotoIsCurrent(photo), self.canRemoveReviewedPhoto else { return }
                    let alert = NSAlert()
                    alert.alertStyle = .warning
                    alert.messageText = "¿Eliminar \(photo.name) del iPhone?"
                    alert.informativeText = "\(session.deviceName) · 1 foto · \(sizeText(photo.remote.bytes))\n\nRespaldo: \(photo.backup.path)\nCopia externa: \(second.path)\n\nPuede que el borrado por cable no permita deshacerlo en Fotos. Las dos copias verificadas quedarán disponibles."
                    alert.addButton(withTitle: "Cancelar")
                    alert.addButton(withTitle: "Eliminar esta foto").keyEquivalent = ""
                    let confirmed = alert.runModal() == .alertSecondButtonReturn
                    guard confirmed, self.reviewedPhotoIsCurrent(photo) else { return }
                    self.begin("Esperando el resultado del iPhone…")
                    let sent = self.devices.removePhoto(permission, link: proof.link, confirmed: confirmed) { deleted in
                        self.resetPhotoReview(); self.finish()
                        self.notice = deleted
                            ? "El iPhone confirmó que se eliminó \(photo.name). Se conservaron ambas copias."
                            : "El iPhone no confirmó el borrado de \(photo.name). Vuelve a leer el catálogo antes de decidir."
                    }
                    if !sent { self.finish(ArchiveError.message("Cambió el iPhone o una de las copias. No se envió ningún borrado.")) }
                } catch { self.finish(error) }
            }
        }
    }
    func openLibrary(_ session: USBSessionReference, verify: Bool = false) {
        guard !busy, !devices.importing else { return }
        let root = URL(fileURLWithPath: session.folder)
        libraryTitle = libraryName(session); section = .library
        begin(verify ? "Verificando las copias de tu biblioteca…" : "Abriendo tu biblioteca…")
        preparedResume = nil; preparedCatalogID = nil; comparison = [:]; cleanupReview = nil
        let token = cancel
        worker.async {
            do {
                if !verify, let index = try LibraryIndex.load(root) {
                    DispatchQueue.main.async {
                        self.scan = ScanResult(root: root, files: index.files, warnings: [])
                        self.selected = []; self.page = 0; self.filter = "Fotos y videos"; self.query = ""; self.onlyReviewSelection = false; self.month = "Todos los meses"
                        self.gallery = true; self.archiveFolder = nil; self.viewingArchive = false; self.resumeFolder = root
                        self.comparisonSummary = "Índice guardado el \(index.date.formatted(date: .abbreviated, time: .shortened)). No es un cotejo actual con el teléfono."
                        self.notice = "Biblioteca abierta. Verificar copias vuelve a leer los originales guardados; Cotejar iPhone necesita el teléfono conectado."
                        self.finish()
                    }
                    return
                }
                guard let manifest = try USBResume.load(root), manifest.deviceID == session.deviceID else { throw ArchiveError.message("No coincide el registro de esta biblioteca. No se modificó el respaldo.") }
                let result = try USBResume.prepare(root: root, deviceID: manifest.deviceID, deviceName: manifest.deviceName, catalog: manifest.catalog, cancel: token) { n, name in
                    if n % 20 == 0 { DispatchQueue.main.async { self.progressText = "Verificando \(n) archivos · \(name)" } }
                }
                try LibraryIndex.save(result.scan)
                DispatchQueue.main.async {
                    self.scan = result.scan; self.selected = []; self.page = 0; self.filter = "Fotos y videos"; self.query = ""; self.onlyReviewSelection = false; self.month = "Todos los meses"
                    self.gallery = true; self.archiveFolder = nil; self.viewingArchive = false; self.resumeFolder = root
                    self.comparisonSummary = "Verificación local: \(result.reused) coinciden con el registro · \(result.pending.count) pendientes históricos · \(result.conflicts.count) incidencias. Falta cotejar con el iPhone actual."
                    self.comparison = result.statuses.mapValues { _ in "Copia local · cotejo actual pendiente" }
                    self.issues = result.conflicts; self.notice = "Tus archivos están aquí. No se ha borrado nada del iPhone."; self.finish()
                }
            } catch { DispatchQueue.main.async { self.finish(error) } }
        }
    }
    func verifyLibrary() {
        guard let root = scan?.root, let session = preferences.usbSessions?.first(where: { $0.folder == root.path }) else { error = "Abre una biblioteca guardada primero."; return }
        openLibrary(session, verify: true)
    }
    func compareLibrary() {
        guard let root = scan?.root else { return }
        prepareResume(at: root)
    }
    func prepareCleanupReview() {
        guard !busy, !devices.importing, let source = scan else { return }
        let paths = Set(selectedFiles.map(\.relativePath))
        guard !paths.isEmpty else { error = "Selecciona primero las fotos o vídeos que quieras revisar."; return }
        let live = canResume && resumeFolder == source.root
        let catalog = live ? devices.resumeCatalog : nil, identity = live ? devices.deviceIdentity : nil
        let generation = devices.catalogID
        begin("Comprobando la selección y sus archivos asociados…"); let token = cancel
        worker.async {
            do {
                guard let manifest = try USBResume.load(source.root) else { throw ArchiveError.message("Esta carpeta no tiene un registro de copia del iPhone.") }
                var result = try CleanupPlanner.prepare(scan: source, selectedPaths: paths, manifest: manifest, currentCatalog: catalog, currentDeviceID: identity, cancel: token)
                DispatchQueue.main.async {
                    if live && (!self.devices.ready || self.devices.catalogID != generation) {
                        result.currentPhoneCompared = false
                        result.notices.insert("El teléfono no está disponible o cambió el catálogo; vuelve a cotejar antes de decidir.", at: 0)
                    }
                    self.cleanupReview = result; self.reviewPage = 0; self.section = .guide
                    self.notice = "Selección preparada para revisar. No se ha enviado ninguna solicitud de borrado."; self.finish()
                }
            } catch { DispatchQueue.main.async { self.finish(error) } }
        }
    }
    func loadCleanupSelection() {
        guard !busy, !devices.importing, let scan = scan else { return }
        do {
            let url = try SafeFiles.relativeURL(".revision-borrado.json", under: scan.root)
            let attrs = try SafeFiles.regular(url)
            guard (attrs[.size] as? NSNumber)?.intValue ?? 0 < 30_000_000 else { throw ArchiveError.message("Selección guardada demasiado grande.") }
            guard let data = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any],
                  data["operation"] as? String == "review_only",
                  let items = data["items"] as? [[String: Any]],
                  let manifest = try USBResume.load(scan.root), data["deviceID"] as? String == manifest.deviceID else {
                throw ArchiveError.message("La selección guardada no corresponde a esta biblioteca.")
            }
            let paths = Set(items.compactMap { ($0["file"] as? [String: Any])?["relativePath"] as? String })
            selected = Set(scan.files.filter { paths.contains($0.relativePath) }.map(\.id))
            cleanupReview = nil; onlyReviewSelection = true; page = 0; month = "Todos los meses"; filter = "Todos"; query = ""
            notice = "Selección recuperada: \(selected.count) archivos localizados. Vuelve a preparar la revisión para comprobarlos de nuevo. No se autorizó ningún borrado."
        } catch { self.error = "No se pudo recuperar una selección guardada: \(error.localizedDescription)" }
    }
    func saveCleanupReview() {
        guard let review = cleanupReview else { return }
        do {
            let root = URL(fileURLWithPath: review.root)
            let url = try SafeFiles.relativeURL(".revision-borrado.json", under: root)
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; encoder.dateEncodingStrategy = .iso8601
            try encoder.encode(review).write(to: url, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
            notice = "Selección guardada junto al respaldo. Sigue pendiente de revisión y no autoriza borrados."
        } catch { self.error = error.localizedDescription }
    }
    func rememberUSB(_ root: URL) {
        var session = USBSessionReference(deviceID: devices.deviceIdentity, deviceName: devices.selected?.name ?? "iPhone", folder: root.path)
        session.ownerName = preferences.usbSessions?.first { $0.folder == root.path }?.ownerName ?? profile?.owner
        preferences.rememberUSB(session)
        save()
    }
    func resumeSaved(_ session: USBSessionReference) {
        guard devices.ready, !busy, !devices.importing else { error = "Conecta el iPhone y pulsa Leer catálogo antes de reanudar."; return }
        guard session.deviceID == devices.deviceIdentity else { error = "Este respaldo pertenece a otro iPhone. Conecta \(session.deviceName) para retomarlo."; return }
        prepareResume(at: URL(fileURLWithPath: session.folder), continueAfterCheck: true)
    }
    func prepareResume(at savedRoot: URL? = nil, continueAfterCheck: Bool = false) {
        guard devices.ready, !busy, !devices.importing else { error = "Conecta el iPhone y termina de leer su catálogo."; return }
        let prepare: (URL) -> Void = { root in
            guard FileManager.default.fileExists(atPath: root.path) else { self.error = "No encontramos la carpeta guardada. Conecta el disco o usa Elegir otra copia si la moviste."; return }
            guard FileManager.default.fileExists(atPath: root.appendingPathComponent("DCIM").path) || FileManager.default.fileExists(atPath: root.appendingPathComponent(USBResume.filename).path) else { self.error = "Elige la carpeta de sesión que contiene DCIM o su registro de avance, no la carpeta general de respaldos."; return }
            self.preparedResume = nil; self.preparedCatalogID = nil
            let catalog = self.devices.resumeCatalog, identity = self.devices.deviceIdentity, name = self.devices.selected?.name ?? "iPhone", generation = self.devices.catalogID
            self.begin("Comprobando las copias existentes. Los vídeos grandes pueden tardar…")
            let token = self.cancel
            self.worker.async {
                do {
                    let result = try USBResume.prepare(root: root, deviceID: identity, deviceName: name, catalog: catalog, cancel: token) { count, name in
                        DispatchQueue.main.async { self.progressText = "Comprobando \(count) archivos locales · \(name)" }
                    }
                    try LibraryIndex.save(result.scan)
                    DispatchQueue.main.async {
                        self.finish()
                        guard self.devices.ready, self.devices.catalogID == generation else { self.error = "El iPhone se desconectó o cambió el catálogo durante la comprobación. Las copias siguen intactas; vuelve a comparar."; return }
                        self.preparedResume = result; self.preparedCatalogID = generation; self.resumeFolder = root
                        self.rememberUSB(root)
                        self.scan = result.scan; self.selected = []; self.archiveFolder = nil; self.viewingArchive = false; self.filter = "Todos"; self.query = ""; self.page = 0; self.onlyReviewSelection = false; self.month = "Todos los meses"
                        self.comparison = result.statuses
                        self.comparisonSummary = "Comparado con \(name) · \(Date().formatted(date: .abbreviated, time: .shortened)) · \(result.reused) coinciden · \(result.pending.count) pendientes · \(result.conflicts.count) incidencias"
                        self.issues = result.conflicts; self.section = .library
                        self.notice = "Copias revisadas. Puedes navegar por la galería o continuar solo con lo pendiente. Una coincidencia de ruta y tamaño no compara el contenido remoto del iPhone."
                        if continueAfterCheck { self.continueResume() }
                    }
                } catch { DispatchQueue.main.async { self.finish(error) } }
            }
        }
        if let root = savedRoot { prepare(root) }
        else { folderPanel("Selecciona la carpeta de la copia interrumpida: la que contiene DCIM. Se comprobarán los archivos antes de continuar en el mismo lugar.", completion: prepare) }
    }
    var canResume: Bool { preparedResume != nil && preparedCatalogID == devices.catalogID && devices.ready && !devices.importing && !busy }
    func continueResume() {
        guard canResume, let result = preparedResume, let root = resumeFolder else { error = "Compara de nuevo la carpeta con el iPhone conectado."; return }
        guard !result.pending.isEmpty else {
            notice = result.conflicts.isEmpty ? "Todo el catálogo accesible de esta comparación ya está copiado. No hay archivos pendientes de transferir." : "No hay transferencias pendientes, pero quedan \(result.conflicts.count) incidencias por revisar. No se considera un respaldo completo."
            return
        }
        do {
            let remaining = try ImportPlan(catalog: result.pending.map { ImportItem(index: $0.index, path: $0.path, bytes: $0.bytes) }, scope: .all)
            let free = try devices.availableSpace(at: root); try remaining.checkSpace(available: free)
            let alert = NSAlert(); alert.messageText = "Continuar en la misma carpeta"
            alert.informativeText = "iPhone: \(devices.selected?.name ?? "iPhone")\nYa presentes: \(result.reused) elementos\nPendientes: \(result.pending.count) · \(sizeText(remaining.knownBytes))\nIncidencias que se conservarán para revisión: \(result.conflicts.count)\nEspacio libre: \(sizeText(free))\n\n\(root.path)\n\nSe copiará solo lo pendiente sin sobrescribir lo existente. La copia antigua se reconoce por ruta y tamaño, con huellas locales para próximas comprobaciones. No se borrará nada del iPhone."
            alert.addButton(withTitle: "Continuar copia"); alert.addButton(withTitle: "Cancelar")
            guard alert.runModal() == .alertFirstButtonReturn else { return }
            guard canResume else { throw ArchiveError.message("El catálogo cambió; compara de nuevo.") }
            notice = "Copia reanudada en la misma carpeta. Los archivos existentes se conservan."; section = .device
            try devices.beginImport(to: root, resume: result) { root, errors in self.analyze(root, priorIssues: errors) }
            rememberUSB(root)
            preparedResume = nil
        } catch { self.error = error.localizedDescription }
    }
    func reveal(_ url: URL) { NSWorkspace.shared.activateFileViewerSelecting([url]) }
    func exportPlan() {
        guard let scan = scan else { return }
        let files = selectedFiles
        guard !files.isEmpty else { error = "Selecciona los archivos que deseas incluir en el plan."; return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.plainText]; panel.nameFieldStringValue = "Plan de limpieza.txt"
        if panel.runModal() == .OK, let url = panel.url {
            let text = "LOGIKAPPS · PLAN DE REVISIÓN\n\(Date().formatted())\nPersona: \(profile?.owner ?? "Sin asignar")\nOrigen: \(scan.root.path)\n\nEsta lista NO autoriza ni ejecuta borrados. El tamaño corresponde a los archivos seleccionados; no es una estimación confirmada de espacio liberado en el iPhone.\n\nAntes de retirar contenido: comprueba el respaldo, abre las copias, revisa Live Photos/ediciones y confirma el alcance de Fotos en iCloud. Los chats exportados no se restauran en WhatsApp.\n\n" + files.map { "• \($0.relativePath)\n  \($0.bytes) bytes · SHA-256: \($0.sha256)" }.joined(separator: "\n")
            do { try text.write(to: url, atomically: true, encoding: .utf8); notice = "Plan guardado. No se eliminó contenido." } catch { self.error = error.localizedDescription }
        }
    }
}

func sizeText(_ bytes: Int64) -> String { ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file) }
