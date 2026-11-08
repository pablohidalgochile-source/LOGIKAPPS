import Foundation

public struct Detection: Codable, Equatable {
    public var seconds: Double
    public var identity: String?
    public var title: String?
    public var artist: String?
    public var shazamURL: String?
    public var windowSeconds: Double?
    public var speedMultiplier: Double?
    public init(seconds: Double, identity: String? = nil, title: String? = nil, artist: String? = nil, shazamURL: String? = nil, windowSeconds: Double? = nil, speedMultiplier: Double? = nil) {
        self.seconds = seconds; self.identity = identity; self.title = title
        self.artist = artist; self.shazamURL = shazamURL
        self.windowSeconds = windowSeconds
        self.speedMultiplier = speedMultiplier
    }
}

public struct DetectedTrack: Codable, Equatable {
    public var identity: String
    public var title: String
    public var artist: String
    public var seconds: Double
    public var lastSeen: Double
    public var hits: Int
    public var shazamURL: String?
    public var speedMultiplier: Double? = nil
}

public enum ScanPlan {
    public static let clip: Double = 12
    public static let maxDuration: Double = 8 * 3600
    public static func initial(duration: Double, step: Double) -> [Double] {
        guard duration.isFinite, duration >= 3, duration <= maxDuration, [30.0, 60.0].contains(step) else { return [] }
        var points = stride(from: 0.0, through: max(0, duration - clip), by: step).map { $0 }
        let tail = max(0, duration - clip)
        if let last = points.last, tail - last >= 3 { points.append(tail) }
        return points
    }
    // A second pass narrows transitions and samples on both sides of unknown points.
    // Service errors are never inserted as unknown observations.
    public static func refinement(_ input: [Detection], duration: Double, step: Double) -> [Double] {
        let rows = input.sorted { $0.seconds < $1.seconds }
        let used = Set(rows.map { Int(($0.seconds * 1000).rounded()) })
        var candidates = Set<Int>()
        func add(_ point: Double) {
            let bounded = max(0, min(duration - clip, point))
            let ms = Int((bounded * 1000).rounded())
            if !used.contains(ms) && bounded >= 0 { candidates.insert(ms) }
        }
        for (i, row) in rows.enumerated() {
            if row.identity == nil { add(row.seconds - step / 4); add(row.seconds + step / 4) }
            if i > 0, row.identity != rows[i - 1].identity || row.identity == nil {
                add((row.seconds + rows[i - 1].seconds) / 2)
            }
        }
        return candidates.sorted().map { Double($0) / 1000 }
    }
    // New samples only; no full scan and no duplicate requests for completed points.
    public static func targeted(start: Double, end: Double, duration: Double, existing: [Double]) -> [Double] {
        guard duration.isFinite, duration >= 3, duration <= maxDuration,
              start.isFinite, end.isFinite, start >= 0, end > start, end <= duration, end - start <= 300 else { return [] }
        let used = Set(existing.map { Int(($0 * 1000).rounded()) })
        return Array(Set(stride(from: start, through: min(end, max(0, duration - clip)), by: 6).map { Int(($0 * 1000).rounded()) }))
            .filter { !used.contains($0) }.sorted().map { Double($0) / 1000 }
    }
    // Recover only when every completed observation and hit count can be reconstructed exactly.
    public static func recover(saved: [DetectedTrack], unknown: [Double], completed: Int, total: Int, phase: String, duration: Double, step: Double) -> (observations: [Detection], pending: [Double])? {
        let first = initial(duration: duration, step: step)
        guard !first.isEmpty, completed >= 0, completed <= total, total <= 5000,
              saved.count <= 5000, unknown.count <= 5000, Set(unknown).count == unknown.count,
              unknown.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= duration }),
              saved.allSatisfy({ !$0.identity.isEmpty && $0.identity.count <= 600 && !$0.title.isEmpty && $0.title.count <= 500 && !$0.artist.isEmpty && $0.artist.count <= 500 && $0.seconds.isFinite && $0.lastSeen.isFinite && $0.seconds >= 0 && $0.lastSeen >= $0.seconds && $0.lastSeen <= duration && $0.hits > 0 && $0.hits <= 5000 }) else { return nil }
        let empty = Set(unknown)
        func observation(_ point: Double) -> Detection? {
            if empty.contains(point) { return Detection(seconds: point) }
            let matches = saved.filter { $0.seconds <= point && $0.lastSeen >= point }
            guard matches.count == 1, let track = matches.first else { return nil }
            return Detection(seconds: point, identity: track.identity, title: track.title, artist: track.artist, shazamURL: track.shazamURL)
        }
        var all = first
        if phase == "refinement" {
            guard completed >= first.count else { return nil }
            let rows = first.compactMap(observation)
            guard rows.count == first.count else { return nil }
            all += refinement(rows, duration: duration, step: step)
        } else if phase != "initial" { return nil }
        guard all.count == total else { return nil }
        let rows = all.prefix(completed).compactMap(observation)
        guard rows.count == completed, tracks(rows, step: step) == saved,
              rows.filter({ $0.identity == nil }).map(\.seconds).sorted() == unknown.sorted() else { return nil }
        return (rows, Array(all.dropFirst(completed)))
    }
    public static func tracks(_ input: [Detection], step: Double) -> [DetectedTrack] {
        var result: [DetectedTrack] = []
        for row in input.sorted(by: { $0.seconds < $1.seconds }) {
            guard let identity = row.identity, let title = row.title, !title.isEmpty,
                  let artist = row.artist, !artist.isEmpty else { continue }
            if let last = result.last, last.identity == identity, last.speedMultiplier == row.speedMultiplier, row.seconds - last.lastSeen <= step * 1.6 {
                result[result.count - 1].lastSeen = row.seconds
                result[result.count - 1].hits += 1
            } else {
                result.append(DetectedTrack(identity: identity, title: title, artist: artist,
                    seconds: row.seconds, lastSeen: row.seconds, hits: 1, shazamURL: row.shazamURL, speedMultiplier: row.speedMultiplier))
            }
        }
        return result
    }
}

public enum BridgePolicy {
    public static let port = 43871
    public static let extensionOrigin = "chrome-extension://necoajnfjeigpkepmelbgglbmogaeldj"
    public static let production = "https://trackhunt-dj.nanook.chatgpt.site"
    public static func allows(origin: String, host: String) -> Bool {
        guard host == "127.0.0.1:\(port)" else { return false }
        return origin == extensionOrigin || origin == production || origin == "http://127.0.0.1:4318" || origin == "http://localhost:4318"
    }
}
