import AppKit
import SwiftUI
import ScanCore
import UniformTypeIdentifiers

struct TrackReview: Codable {
    var seconds: Double
    var originalIdentity: String
    var artist: String
    var title: String
    var decision: String
}

struct ScanSnapshot: Codable {
    var id = UUID().uuidString
    var fileName = ""
    var status = "idle"
    var message = "Selecciona el archivo desde Track Hunt o desde este asistente."
    var duration: Double = 0
    var step: Double = 60
    var clipSeconds: Double = ScanPlan.clip
    var phase = "initial"
    var source = "file"
    var sourceURL: String?
    var completed = 0
    var total = 0
    var currentSeconds: Double = 0
    var tracks: [DetectedTrack] = []
    var unknown: [Double] = []
    var reviews: [TrackReview]?
    var revision: Int?
    var savedAt: String?
    var saveError: String?
    var needsFile: Bool?
}

struct SavedScan: Codable {
    var schema = 1
    var snapshot: ScanSnapshot
    var observations: [Detection]
    var queue: [Double]
    var bookmark: Data?
    var fileSize: Int?
    var fileModified: Date?
    var resumeAfter: Date
    var nextAllowed: Date
    var shortPoints: [Double]?
    var adjustedPoints: [Double]?

}

@MainActor
final class ScanModel: ObservableObject {
    @Published var snapshot = ScanSnapshot()
    @Published var connectionMessage = "Conectando el asistente local…"
    @Published var picking = false
    var ready: Bool { ShazamIOEngine.ready }
    private var fileURL: URL?
    private var suppressSave = false
    private var bookmark: Data?
    private var fileSize: Int?
    private var fileModified: Date?
    private let storage: URL
    init(storage: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("TrackHunt/Scans", isDirectory: true)) {
        self.storage = storage
        do {
            try FileManager.default.createDirectory(at: storage, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if let data = try? Data(contentsOf: storage.appendingPathComponent("latest.json")), let id = String(data: data, encoding: .utf8) { try loadJob(id) }
        } catch { snapshot.saveError = "No se pudo recuperar el guardado: " + error.localizedDescription }
    }
    private func persist() {
        guard snapshot.status != "idle", !suppressSave else { return }
        snapshot.revision = (snapshot.revision ?? 0) + 1
        snapshot.savedAt = ISO8601DateFormatter().string(from: Date()); snapshot.saveError = nil
        do {
            let saved = SavedScan(snapshot: snapshot, observations: observations, queue: queue, bookmark: bookmark, fileSize: fileSize, fileModified: fileModified, resumeAfter: resumeAfter, nextAllowed: nextAllowed, shortPoints: shortPoints.sorted(), adjustedPoints: adjustedPoints.sorted())
            let target = storage.appendingPathComponent(snapshot.id + ".json")
            try JSONEncoder().encode(saved).write(to: target, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
            try Data(snapshot.id.utf8).write(to: storage.appendingPathComponent("latest.json"), options: .atomic)
        } catch { snapshot.saveError = "No se guardó el último cambio. Mantén abierto el asistente: " + error.localizedDescription }
    }
    func savedJobs() -> [[String: Any]] {
        let urls = (try? FileManager.default.contentsOfDirectory(at: storage, includingPropertiesForKeys: nil)) ?? []
        return urls.filter { $0.pathExtension == "json" && $0.lastPathComponent != "latest.json" }.compactMap { url in
            guard let data = try? Data(contentsOf: url), let saved = try? JSONDecoder().decode(SavedScan.self, from: data) else { return nil }
            return ["id": saved.snapshot.id, "name": saved.snapshot.fileName, "savedAt": saved.snapshot.savedAt ?? "", "source": saved.snapshot.source]
        }.sorted { ($0["savedAt"] as? String ?? "") > ($1["savedAt"] as? String ?? "") }
    }
    func loadJob(_ id: String) throws {
        guard UUID(uuidString: id) != nil, runner == nil, fragmentTask == nil, snapshot.status != "scanning", !picking else { throw AssistantError.message("Pausa o termina el trabajo actual antes de abrir otro.") }
        let data = try Data(contentsOf: storage.appendingPathComponent(id + ".json"))
        let saved = try JSONDecoder().decode(SavedScan.self, from: data)
        guard saved.schema == 1, saved.snapshot.id == id,
              ["file", "youtube-tab"].contains(saved.snapshot.source), ["initial", "refinement", "targeted"].contains(saved.snapshot.phase),
              ["scanning", "paused", "error", "complete", "cancelled"].contains(saved.snapshot.status),
              !ScanPlan.initial(duration: saved.snapshot.duration, step: saved.snapshot.step).isEmpty,
              saved.snapshot.total <= 5000, saved.snapshot.completed == saved.observations.count,
              saved.snapshot.tracks == ScanPlan.tracks(saved.observations, step: saved.snapshot.step),
              Set(saved.shortPoints ?? []).isSubset(of: Set(saved.queue)),
              Set(saved.adjustedPoints ?? []).isSubset(of: Set(saved.shortPoints ?? [])),
              saved.observations.allSatisfy({ $0.speedMultiplier == nil || ($0.speedMultiplier == 0.945 && $0.windowSeconds == 6) }),
              Set(saved.queue).count == saved.queue.count, Set(saved.observations.map(\.seconds)).count == saved.observations.count,
              Set(saved.queue).isDisjoint(with: saved.observations.map(\.seconds)),
              saved.queue.count <= 5000, saved.observations.count <= 5000,
              saved.queue.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= saved.snapshot.duration }),
              saved.observations.allSatisfy({ $0.seconds.isFinite && $0.seconds >= 0 && $0.seconds <= saved.snapshot.duration }),
              saved.snapshot.total - saved.snapshot.completed == saved.queue.count else { throw AssistantError.message("Guardado inválido. No se reemplazó el trabajo actual.") }
        if resourceAccess { fileURL?.stopAccessingSecurityScopedResource() }
        browserWatchdog?.cancel(); fileURL = nil; resourceAccess = false
        snapshot = saved.snapshot; observations = saved.observations; queue = saved.queue; shortPoints = Set(saved.shortPoints ?? [])
        adjustedPoints = Set(saved.adjustedPoints ?? [])
        bookmark = saved.bookmark; fileSize = saved.fileSize; fileModified = saved.fileModified
        resumeAfter = max(resumeAfter, saved.resumeAfter); nextAllowed = max(nextAllowed, saved.nextAllowed)
        cancelled = false; paused = true; browserJob = snapshot.source == "youtube-tab" && !queue.isEmpty
        if let bookmark {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: bookmark, options: [.withSecurityScope, .withoutUI], relativeTo: nil, bookmarkDataIsStale: &stale) {
                let access = url.startAccessingSecurityScopedResource()
                if fileMatches(url) { fileURL = url; resourceAccess = access } else if access { url.stopAccessingSecurityScopedResource() }
            }
        }
        snapshot.needsFile = snapshot.source == "file" && fileURL == nil
        if ["scanning", "paused", "error"].contains(snapshot.status) {
            snapshot.status = "paused"
            snapshot.message = browserJob ? "Progreso recuperado. En la extensión pulsa Retomar captura interrumpida." : "Progreso recuperado. Reanuda para continuar solo los fragmentos pendientes."
        }
        if browserJob { watchBrowser() }
        persist()
    }
    private func fileMatches(_ url: URL) -> Bool {
        guard let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey]) else { return false }
        return values.fileSize == fileSize && values.contentModificationDate == fileModified
    }
    func relinkFile() async throws {
        guard snapshot.source == "file", runner == nil, fragmentTask == nil, !picking, snapshot.status != "scanning" else { throw AssistantError.message("Pausa el análisis antes de volver a vincular el archivo.") }
        picking = true; defer { picking = false }
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSOpenPanel(); panel.title = "Vuelve a seleccionar el archivo original: " + snapshot.fileName
        panel.allowedContentTypes = [.audio, .movie]; panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { throw AssistantError.message("Selección cancelada.") }
        let access = url.startAccessingSecurityScopedResource()
        guard fileMatches(url) else { if access { url.stopAccessingSecurityScopedResource() }; throw AssistantError.message("El tamaño o fecha del archivo no coincide con el original. No se cambió la fuente.") }
        if resourceAccess { fileURL?.stopAccessingSecurityScopedResource() }
        fileURL = url; resourceAccess = access; bookmark = try url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        snapshot.needsFile = false; persist()
    }
    func review(seconds: Double, identity: String, artist: String, title: String, decision: String, jobID: String) throws {
        guard snapshot.id == jobID, ["pending", "confirmed", "rejected"].contains(decision), !artist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, artist.count <= 500, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.count <= 500,
              snapshot.tracks.contains(where: { $0.identity == identity && $0.seconds <= seconds && $0.lastSeen >= seconds }) else { throw AssistantError.message("La detección cambió. Actualiza la revisión antes de guardar.") }
        var reviews = snapshot.reviews ?? []
        reviews.removeAll { $0.originalIdentity == identity && $0.seconds == seconds }
        guard reviews.count < 5000 else { throw AssistantError.message("Se alcanzó el máximo de revisiones de este trabajo.") }
        reviews.append(TrackReview(seconds: seconds, originalIdentity: identity, artist: artist, title: title, decision: decision))
        snapshot.reviews = reviews; persist()
    }
    func reanalyze(start: Double, end: Double, jobID: String, speedMultiplier: Double = 1) throws {
        guard speedMultiplier == 1 || speedMultiplier == 0.945 else { throw AssistantError.message("Ajuste de velocidad no compatible.") }
        guard snapshot.id == jobID, ["complete", "paused", "error"].contains(snapshot.status), !processingFileFragment, fragmentTask == nil, !picking else { throw AssistantError.message("Pausa el barrido y espera a que termine el fragmento en curso antes de preparar el repaso.") }
        let plan = ScanPlan.targeted(start: start, end: end, duration: snapshot.duration, existing: observations.map(\.seconds) + queue)
        guard !plan.isEmpty, snapshot.total + plan.count <= 5000 else { throw AssistantError.message("Selecciona un tramo de hasta 5 minutos con puntos todavía no consultados.") }
        guard snapshot.source == "youtube-tab" || fileURL != nil else { throw AssistantError.message("Vuelve a vincular el archivo original antes de analizar el tramo.") }
        if snapshot.status == "complete" { snapshot.phase = "targeted" }
        queue = plan + queue; shortPoints.formUnion(plan); cancelled = false; paused = true
        if speedMultiplier == 0.945 { adjustedPoints.formUnion(plan) }
        snapshot.total += plan.count; snapshot.status = "paused"
        snapshot.message = snapshot.source == "youtube-tab" ? "Tramo preparado. En el mismo video abre la extensión y pulsa Retomar captura interrumpida." : "Tramo preparado. Pulsa Reanudar para analizar solo los nuevos fragmentos."
        if snapshot.source == "youtube-tab" { browserJob = true; watchBrowser() }
        persist()
    }

    private var browserJob = false
    private var browserHeartbeat = Date.distantPast
    private var browserWatchdog: Task<Void, Never>?
    private var fragmentTask: Task<EngineMatch?, Error>?
    private var nextAllowed = Date.distantPast
    private var resumeAfter = Date.distantPast
    private var observations: [Detection] = []
    private var queue: [Double] = []
    private var shortPoints = Set<Double>()
    private var adjustedPoints = Set<Double>()
    private var processingFileFragment = false
    private var runner: Task<Void, Never>?
    private var paused = false
    private var cancelled = false
    private var resourceAccess = false
    var active: Bool { ["scanning", "paused", "error"].contains(snapshot.status) && (snapshot.source == "file" || browserJob) }

    func pickAndStart(step: Double) async throws {
        guard ready else { throw AssistantError.message("Falta el motor ShazamIO. Descarga y abre el asistente actualizado completo.") }
        guard runner == nil, fragmentTask == nil, !active, !picking else { throw AssistantError.message("Ya existe un barrido. Termínalo o cancélalo y espera a que cierre el fragmento en curso antes de elegir otro set.") }
        guard [30.0, 60.0].contains(step) else { throw AssistantError.message("El intervalo debe ser de 30 o 60 segundos.") }
        guard Date() >= resumeAfter else { throw AssistantError.message("Shazam pidió esperar antes de iniciar otro barrido.") }
        picking = true
        defer { picking = false }
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSOpenPanel()
        panel.title = "Selecciona el set que quieres analizar en silencio"
        panel.allowedContentTypes = [.audio, .movie]
        panel.allowsMultipleSelection = false
        let response = panel.runModal()
        guard response == .OK, let url = panel.url else { throw AssistantError.message("Selección cancelada. No se inició ningún análisis.") }
        let access = url.startAccessingSecurityScopedResource()
        let duration: Double
        do { duration = try await Task.detached { try AudioFragments.duration(url) }.value }
        catch { if access { url.stopAccessingSecurityScopedResource() }; throw error }
        let plan = ScanPlan.initial(duration: duration, step: step)
        guard !plan.isEmpty else {
            if access { url.stopAccessingSecurityScopedResource() }
            throw AssistantError.message("Selecciona un archivo de audio o video de entre 3 segundos y 8 horas.")
        }
        if resourceAccess { fileURL?.stopAccessingSecurityScopedResource() }
        fileURL = url; resourceAccess = access
        bookmark = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        fileSize = values?.fileSize; fileModified = values?.contentModificationDate
        observations = []; shortPoints = []; adjustedPoints = []; queue = plan; paused = false; cancelled = false
        snapshot = ScanSnapshot(fileName: url.lastPathComponent, status: "scanning", message: "Barrido inicial por fragmentos. El audio no se reproduce.", duration: duration, step: step, total: plan.count)
        persist(); runner = Task { await run() }
    }
    func pause() { guard snapshot.status == "scanning" else { return }; paused = true; snapshot.status = "paused"; snapshot.message = "Pausado. El fragmento en curso puede terminar; no se iniciarán otros."; persist() }
    func resume() {
        guard active, ["paused", "error"].contains(snapshot.status) else { return }
        guard Date() >= resumeAfter else { snapshot.message = "Shazam pidió esperar. Reanuda en \(Int(resumeAfter.timeIntervalSinceNow.rounded(.up))) segundos."; return }
        guard snapshot.source != "file" || fileURL != nil else { snapshot.message = "Vuelve a vincular el archivo original desde Track Hunt."; return }
        paused = false; snapshot.status = "scanning"; snapshot.message = "Reanudando el análisis pendiente…"
        if snapshot.source == "file", runner == nil { runner = Task { await run() } }
        persist()
    }
    func cancel() {
        guard active else { return }
        cancelled = true; paused = false; runner?.cancel(); fragmentTask?.cancel(); browserJob = false; browserWatchdog?.cancel()
        snapshot.status = "cancelled"; snapshot.message = "Barrido cancelado. Las coincidencias obtenidas siguen disponibles."; persist()
    }
    func startBrowser(title: String, videoID: String, duration: Double, step: Double) throws {
        guard ready, runner == nil, fragmentTask == nil, !active, !picking else { throw AssistantError.message("Termina o cancela el barrido actual antes de iniciar otro.") }
        guard videoID.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { throw AssistantError.message("Video inválido.") }
        let plan = ScanPlan.initial(duration: duration, step: step)
        guard !plan.isEmpty else { throw AssistantError.message("El video debe durar entre 3 segundos y 8 horas.") }
        guard Date() >= resumeAfter else { throw AssistantError.message("Shazam pidió esperar antes de iniciar otro barrido.") }
        if resourceAccess { fileURL?.stopAccessingSecurityScopedResource() }; fileURL = nil; resourceAccess = false
        bookmark = nil; fileSize = nil; fileModified = nil
        browserJob = true; observations = []; shortPoints = []; adjustedPoints = []; queue = plan; paused = false; cancelled = false
        snapshot = ScanSnapshot(fileName: String(title.prefix(240)), status: "scanning", message: "YouTube: capturando solo fragmentos, sin salida a los altavoces.", duration: duration, step: step, total: plan.count)
        snapshot.source = "youtube-tab"; snapshot.sourceURL = "https://www.youtube.com/watch?v=" + videoID
        watchBrowser(); persist()
    }
    private func watchBrowser() {
        browserHeartbeat = Date(); browserWatchdog?.cancel()
        browserWatchdog = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { return }
                guard let self, self.browserJob else { return }
                if self.snapshot.status == "scanning", self.fragmentTask == nil, Date().timeIntervalSince(self.browserHeartbeat) > 75 {
                    self.browserProblem("Se perdió la captura de Chrome. Abre la extensión en el mismo video y pulsa Retomar captura interrumpida.", jobID: self.snapshot.id)
                }
            }
        }
    }
    func restoreBrowser(_ saved: ScanSnapshot) throws {
        guard !active, runner == nil, fragmentTask == nil, !picking,
              UUID(uuidString: saved.id) != nil, saved.source == "youtube-tab", ["error", "paused", "complete"].contains(saved.status), saved.fileName.count <= 240,
              !saved.message.contains("limitó las consultas"),
              let source = saved.sourceURL, source.range(of: "^https://www\\.youtube\\.com/watch\\?v=[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil,
              let recovered = ScanPlan.recover(saved: saved.tracks, unknown: saved.unknown, completed: saved.completed, total: saved.total, phase: saved.phase, duration: saved.duration, step: saved.step) else {
            throw AssistantError.message("El estado guardado no se puede recuperar exactamente. No se reemplazó el trabajo actual.")
        }
        // Bootstrap only the validated source and reuse the ordinary watchdog.
        suppressSave = true; defer { suppressSave = false }
        try startBrowser(title: saved.fileName, videoID: String(source.suffix(11)), duration: saved.duration, step: saved.step)
        observations = recovered.observations; shortPoints = []; adjustedPoints = []; queue = recovered.pending
        snapshot = saved; paused = true; suppressSave = false
        if saved.status == "complete" { browserJob = false; browserWatchdog?.cancel() }
        else { snapshot.status = "paused"; snapshot.message = "Estado recuperado sin perder detecciones. En Chrome pulsa Retomar captura interrumpida." }
        persist()
    }
    func browserNext() -> [String: Any] {
        browserHeartbeat = Date()
        if browserJob && snapshot.status == "scanning" && queue.isEmpty && fragmentTask == nil {
            if snapshot.phase == "initial" {
                queue = ScanPlan.refinement(observations, duration: snapshot.duration, step: snapshot.step)
                snapshot.phase = "refinement"; snapshot.total += queue.count; persist()
            }
            if queue.isEmpty {
                snapshot.status = "complete"; browserJob = false; browserWatchdog?.cancel()
                snapshot.message = "Barrido de YouTube terminado. Solo se capturaron fragmentos temporales; revisa las coincidencias."; persist()
            }
        }
        var result: [String: Any] = ["id": snapshot.id, "status": snapshot.status, "message": snapshot.message,
            "wait": max(0, max(nextAllowed, resumeAfter).timeIntervalSinceNow), "busy": fragmentTask != nil]
        if browserJob, let point = queue.first { result["seconds"] = point; result["clipSeconds"] = min(12, snapshot.duration - point) }
        return result
    }
    func browserProblem(_ message: String, jobID: String) {
        guard browserJob, snapshot.id == jobID, !cancelled else { return }
        paused = true; snapshot.status = "error"; snapshot.message = String(message.prefix(500)); persist()
    }
    func browserFragment(_ data: Data, jobID: String, seconds: Double) async throws {
        guard browserJob, snapshot.id == jobID, snapshot.status == "scanning", fragmentTask == nil,
              seconds.isFinite, queue.first == seconds else { throw AssistantError.message("El fragmento ya no corresponde al punto pendiente.") }
        guard Date() >= max(nextAllowed, resumeAfter) else { throw AssistantError.message("Espera antes de consultar otro fragmento.") }
        guard BrowserFragment.valid(data) else { throw AssistantError.message("Fragmento PCM inválido; se admiten entre 3 y 12 segundos mono.") }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("trackhunt-browser-" + UUID().uuidString + ".wav")
        let short = shortPoints.contains(seconds)
        let adjusted = adjustedPoints.contains(seconds)
        let payload = adjusted ? BrowserFragment.adjustedReview(data)! : (short ? BrowserFragment.firstSixSeconds(data)! : data)
        try payload.write(to: url, options: .atomic)
        defer { try? FileManager.default.removeItem(at: url); fragmentTask = nil }
        snapshot.currentSeconds = seconds
        let task = Task { try await ShazamIOEngine().match(fragment: url) }; fragmentTask = task
        do {
            let item = try await task.value
            guard browserJob, snapshot.id == jobID, !cancelled else { return }
            let row = Detection(seconds: seconds, identity: item?.identity, title: item?.title, artist: item?.artist, windowSeconds: short ? 6 : 12, speedMultiplier: adjusted ? 0.945 : nil)
            observations.append(row); queue.removeFirst(); snapshot.completed += 1; finishShortPoint(seconds); refreshTracks()
            nextAllowed = Date().addingTimeInterval(10); persist()
        } catch {
            guard snapshot.id == jobID, !cancelled else { return }
            if case AssistantError.rateLimited(_, let delay) = error { resumeAfter = Date().addingTimeInterval(delay) }
            browserProblem(error.localizedDescription + " Reanuda cuando corresponda; el punto pendiente se conserva.", jobID: jobID)
            throw error
        }
    }
    private func finishShortPoint(_ seconds: Double) {
        adjustedPoints.remove(seconds)
        if shortPoints.remove(seconds) != nil && shortPoints.isEmpty && !queue.isEmpty {
            paused = true; snapshot.status = "paused"
            snapshot.message = "Repaso de 6 segundos terminado. Revisa los candidatos; el resto del barrido sigue guardado y pausado."
        }
    }
    private func refreshTracks() {
        snapshot.tracks = ScanPlan.tracks(observations, step: snapshot.step)
        snapshot.unknown = observations.filter { $0.identity == nil }.map(\.seconds).sorted()
    }
    private func run() async {
        defer { runner = nil; persist() }
        while !cancelled && !Task.isCancelled {
            if paused {
                do { try await Task.sleep(nanoseconds: 250_000_000) } catch { break }
                continue
            }
            if queue.isEmpty {
                if snapshot.phase == "initial" {
                    queue = ScanPlan.refinement(observations, duration: snapshot.duration, step: snapshot.step)
                    snapshot.phase = "refinement"; snapshot.total += queue.count
                    snapshot.message = "Repasando huecos y cambios de canción…"; persist()
                    if !queue.isEmpty { continue }
                }
                snapshot.status = "complete"
                snapshot.message = "Barrido terminado. Los tiempos indican la primera detección, no el inicio exacto de cada canción."
                break
            }
            guard let url = fileURL, let seconds = queue.first else { break }
            snapshot.currentSeconds = seconds
            do {
                let delay = max(nextAllowed, resumeAfter).timeIntervalSinceNow
                if delay > 0 { try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)); continue }
                processingFileFragment = true
                defer { processingFileFragment = false }
                let length: Double = shortPoints.contains(seconds) ? 6 : 12
                let speed: Double = adjustedPoints.contains(seconds) ? 0.945 : 1
                let fragment = try await Task.detached { try AudioFragments.fragment(url, seconds: seconds, length: length, speedMultiplier: speed) }.value
                defer { try? FileManager.default.removeItem(at: fragment) }
                try Task.checkCancellation()
                let item = try await ShazamIOEngine().match(fragment: fragment)
                try Task.checkCancellation()
                var observation = Detection(seconds: seconds, windowSeconds: length, speedMultiplier: speed == 1 ? nil : speed)
                if let item, !item.title.isEmpty, !item.artist.isEmpty {
                    observation = Detection(seconds: seconds, identity: item.identity, title: item.title, artist: item.artist, windowSeconds: length, speedMultiplier: speed == 1 ? nil : speed)
                }
                observations.append(observation); queue.removeFirst(); snapshot.completed += 1; finishShortPoint(seconds)
                refreshTracks(); nextAllowed = Date().addingTimeInterval(10); persist()
                try await Task.sleep(nanoseconds: 10_000_000_000)
            } catch is CancellationError { break }
            catch {
                if cancelled { break }
                if case AssistantError.rateLimited(_, let delay) = error { resumeAfter = Date().addingTimeInterval(delay) }
                paused = true; snapshot.status = "error"
                snapshot.message = "\(error.localizedDescription) El punto pendiente se conserva; no se cuenta como canción desconocida."; persist()
            }
        }
    }
}
