import Foundation
import AVFoundation
import ScanCore
@main struct MediaCheck {
    static func main() throws {
        for name in CommandLine.arguments.dropFirst() {
            let url = URL(fileURLWithPath: name)
            let duration = try AudioFragments.duration(url)
            precondition(abs(duration - 40) < 0.2)
            let short = try AudioFragments.buffer(url, seconds: 2, length: 6)
            precondition(abs(Double(short.frameLength)/short.format.sampleRate - 6) < 0.1)
            let adjustedURL = try AudioFragments.fragment(url, seconds: 2, length: 6, speedMultiplier: 0.945)
            let adjustedFile = try AVAudioFile(forReading: adjustedURL)
            precondition(abs(Double(adjustedFile.length) / adjustedFile.processingFormat.sampleRate - 6 / 0.945) < 0.1)
            precondition(abs(adjustedFile.processingFormat.sampleRate - 44100 * 0.945) < 1)
            try FileManager.default.removeItem(at: adjustedURL)
            let first = try AudioFragments.buffer(url, seconds: 2)
            let last = try AudioFragments.buffer(url, seconds: 25)
            for b in [first,last] { precondition(b.format.channelCount == 1 && abs(Double(b.frameLength)/b.format.sampleRate - 12) < 0.1) }
            func crossings(_ b: AVAudioPCMBuffer) -> Int {
                let p = b.floatChannelData![0]; return (1..<Int(b.frameLength)).filter { p[$0-1] < 0 && p[$0] >= 0 }.count
            }
            precondition(crossings(last) > Int(Double(crossings(first)) * 1.8), "Seeking did not reach the second tone")
            print("PASS: silent bounded 12-second decode and seek for " + url.pathExtension)
        }
    }
}
