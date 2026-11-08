import Foundation

/// Tracks lack of progress rather than total duration: large libraries may take minutes.
public struct CatalogProgress {
    public private(set) var lastChange: TimeInterval
    private var signature = ""
    public init(now: TimeInterval) { lastChange = now }
    public mutating func update(percent: Int, count: Int, sessionOpen: Bool, restricted: Bool, now: TimeInterval) -> Bool {
        let next = "\(percent):\(count):\(sessionOpen):\(restricted)"
        if signature != next { signature = next; lastChange = now }
        return now - lastChange >= 60
    }
    public static func isReady(sessionOpen: Bool, restricted: Bool, percent: Int, completionReceived: Bool) -> Bool {
        sessionOpen && !restricted && (percent >= 100 || completionReceived)
    }
}
