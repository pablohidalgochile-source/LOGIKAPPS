import Foundation
import ShazamKit
import AVFoundation
import ScanCore

@main struct AudioCheck {
    @MainActor static func main() async throws {
        let url = URL(fileURLWithPath: CommandLine.arguments[1])
        let duration = try AudioFragments.duration(url)
        precondition(duration > 20)
        let reference = try AudioFragments.signature(url, seconds: 0, length: 24)
        let query = try AudioFragments.signature(url, seconds: 6)
        precondition(abs(query.duration - 12) < 0.1)
        let catalog = SHCustomCatalog()
        let item = SHMediaItem(properties: [.title: "Track Hunt synthetic check", .artist: "Local test"])
        try catalog.addReferenceSignature(reference, representing: [item])
        let match = try await SignatureMatcher().match(query, catalog: catalog)
        precondition(match?.title == "Track Hunt synthetic check", "Custom catalog did not match the extracted fragment")
        print("PASS: silent decode, seeking, mono conversion, signature generation and ShazamKit local-catalog match")
        // This deliberately tests our own synthetic catalog, not Apple's licensed song catalog.
    }
}
