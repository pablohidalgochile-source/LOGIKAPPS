import Foundation
import ScanCore
@main struct PersistenceCheck {
    @MainActor static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("trackhunt-persistence-check-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        for path in CommandLine.arguments.dropFirst() {
            let file = URL(fileURLWithPath: path), id = UUID().uuidString
            let rows = [Detection(seconds: 0, identity: "original", title: "Original", artist: "Artist"), Detection(seconds: 28)]
            let snapshot = ScanSnapshot(id: id, fileName: file.lastPathComponent, status: "complete", duration: 40, phase: "refinement", completed: 2, total: 2, tracks: ScanPlan.tracks(rows, step: 60), unknown: [28])
            let values = try file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            let bookmark = try file.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
            let saved = SavedScan(snapshot: snapshot, observations: rows, queue: [], bookmark: bookmark, fileSize: values.fileSize, fileModified: values.contentModificationDate, resumeAfter: Date().addingTimeInterval(120), nextAllowed: .distantPast)
            try JSONEncoder().encode(saved).write(to: root.appendingPathComponent(id + ".json"))
            try Data(id.utf8).write(to: root.appendingPathComponent("latest.json"))
            let model = ScanModel(storage: root)
            precondition(model.snapshot.id == id && model.snapshot.needsFile == false)
            try model.review(seconds: 0, identity: "original", artist: "Correct", title: "Correction", decision: "confirmed", jobID: id)
            precondition(model.snapshot.tracks[0].title == "Original")
            let restart = ScanModel(storage: root)
            precondition(restart.snapshot.reviews?.first?.title == "Correction")
            try restart.reanalyze(start: 6, end: 18, jobID: id)
            precondition(restart.snapshot.total == 5 && restart.snapshot.completed == 2 && restart.snapshot.status == "paused")
            let recovered = ScanModel(storage: root)
            precondition(recovered.snapshot.total == 5 && recovered.snapshot.completed == 2 && recovered.snapshot.phase == "targeted")
            let checkpoint = try JSONDecoder().decode(SavedScan.self, from: Data(contentsOf: root.appendingPathComponent(id + ".json")))
            precondition(checkpoint.queue == [6,12,18] && checkpoint.shortPoints == [6,12,18] && checkpoint.resumeAfter.timeIntervalSinceNow > 100)
            try recovered.reanalyze(start: 18, end: 24, jobID: id, speedMultiplier: 0.945)
            let combined = try JSONDecoder().decode(SavedScan.self, from: Data(contentsOf: root.appendingPathComponent(id + ".json")))
            precondition(combined.queue == [24,6,12,18] && combined.shortPoints == [6,12,18,24])
            precondition(combined.adjustedPoints == [24])
            let speedRestart = ScanModel(storage: root)
            let afterRestart = try JSONDecoder().decode(SavedScan.self, from: Data(contentsOf: root.appendingPathComponent(id + ".json")))
            precondition(afterRestart.adjustedPoints == [24] && afterRestart.queue == combined.queue)
            do { try speedRestart.reanalyze(start: 25, end: 26, jobID: id, speedMultiplier: 0); fatalError("Accepted invalid speed") } catch { }
            precondition(combined.observations == rows && combined.snapshot.reviews?.first?.title == "Correction")
            precondition(recovered.snapshot.reviews?.first?.title == "Correction")
            do { try recovered.loadJob("../outside"); fatalError("Accepted traversal") } catch { }
            print("PASS: " + file.pathExtension + " bookmark, original preserved, correction persisted, exact targeted queue after restart, provider wait retained")
        }
    }
}
