import Foundation
import ScanCore

func check(_ condition: @autoclosure () -> Bool, _ name: String) {
    guard condition() else { fatalError("FAILED: \(name)") }; print("PASS: \(name)")
}
let plan = ScanPlan.initial(duration: 3600, step: 60)
check(plan.first == 0 && plan.last == 3588, "Includes start and tail of a one-hour set")
check(plan.count == 61, "No ten-sample cap")
check(ScanPlan.initial(duration: 3, step: 60) == [0], "Short file has one fragment")
check(ScanPlan.initial(duration: .nan, step: 60).isEmpty, "Rejects NaN duration")
check(ScanPlan.initial(duration: 3600, step: 0).isEmpty, "Rejects invalid step")
check(ScanPlan.initial(duration: 28_801, step: 60).isEmpty, "Rejects files above documented limit")
let observations = (0..<48).map { Detection(seconds: Double($0 * 60), identity: "id\($0)", title: "Song \($0)", artist: "Artist") }
check(ScanPlan.tracks(observations, step: 60).count == 48, "Preserves 48 distinct tracks")
let repeated = [Detection(seconds: 0, identity: "a", title: "A", artist: "One"), Detection(seconds: 60, identity: "a", title: "A", artist: "One"), Detection(seconds: 120, identity: "b", title: "B", artist: "Two"), Detection(seconds: 180, identity: "a", title: "A", artist: "One")]
let tracks = ScanPlan.tracks(repeated.reversed(), step: 60)
check(tracks.count == 3 && tracks[0].hits == 2 && tracks[2].seconds == 180, "Groups adjacent hits but preserves later return of the same song")
let refinement = ScanPlan.refinement([Detection(seconds: 0, identity: "a"), Detection(seconds: 60), Detection(seconds: 120, identity: "b")], duration: 140, step: 60)
check(refinement == [30, 45, 75, 90], "Targets unknown fragments and transitions without resampling old points")
check(ScanPlan.refinement([Detection(seconds: 0, identity: "a"), Detection(seconds: 60, identity: "a")], duration: 100, step: 60).isEmpty, "Does not add unnecessary requests to stable runs")
check(BridgePolicy.allows(origin: BridgePolicy.production, host: "127.0.0.1:43871"), "Allows the Track Hunt origin")
check(!BridgePolicy.allows(origin: "https://evil.example", host: "127.0.0.1:43871"), "Rejects unrelated origins")
check(!BridgePolicy.allows(origin: BridgePolicy.production, host: "evil.example:43871"), "Rejects DNS rebinding hosts")
check(!BridgePolicy.allows(origin: "null", host: "127.0.0.1:43871"), "Rejects opaque origins")
let valid = Data("POST /v1/start HTTP/1.1\r\nHost: 127.0.0.1:43871\r\nContent-Length: 2\r\n\r\n{}".utf8)
let parsed = try BridgeRequest.parse(valid)
let partial = try BridgeRequest.parse(valid.dropLast())
check(parsed?.body == Data("{}".utf8), "Parses a complete request")
check(partial == nil, "Waits for fragmented bodies")
for raw in ["Content-Length: -1", "Content-Length: 90000", "Content-Length: 0\r\nContent-Length: 0", "Transfer-Encoding: chunked"] {
    do { _ = try BridgeRequest.parse(Data("POST /v1/start HTTP/1.1\r\n\(raw)\r\n\r\n".utf8)); fatalError("Accepted malformed request") }
    catch { print("PASS: rejects malformed HTTP header") }
}
print("ScanCore checks complete.")
check(BridgePolicy.allows(origin: BridgePolicy.extensionOrigin, host: "127.0.0.1:43871"), "Allows the pinned extension only")
check(!BridgePolicy.allows(origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", host: "127.0.0.1:43871"), "Rejects unrelated Chrome extensions")
var wav = Data(repeating: 0, count: 44 + 48000 * 12 * 2)
func text(_ offset: Int, _ value: String) { wav.replaceSubrange(offset..<offset+value.utf8.count, with: value.utf8) }
func u16(_ offset: Int, _ value: Int) { wav[offset] = UInt8(value & 255); wav[offset+1] = UInt8((value >> 8) & 255) }
func u32(_ offset: Int, _ value: Int) { u16(offset,value);u16(offset+2,value >> 16) }
text(0,"RIFF");u32(4,wav.count-8);text(8,"WAVE");text(12,"fmt ");u32(16,16);u16(20,1);u16(22,1);u32(24,48000);u32(28,96000);u16(32,2);u16(34,16);text(36,"data");u32(40,wav.count-44)
check(BrowserFragment.valid(wav), "Accepts exactly 12 seconds of mono PCM")
check(!BrowserFragment.valid(wav.dropLast()), "Rejects truncated fragments")
var stereo = wav; stereo[22] = 2
check(!BrowserFragment.valid(stereo), "Rejects unexpected channel encoding")
check(!BrowserFragment.valid(Data("https://youtube.com/watch?v=foo".utf8)), "Never accepts URLs as fragment bytes")
var request = Data("POST /v1/browser/fragment HTTP/1.1\r\nContent-Length: \(wav.count)\r\n\r\n".utf8);request.append(wav)
let browserParsed = try BridgeRequest.parse(request)
check(browserParsed?.body.count == wav.count, "Parses a complete bounded browser fragment")
let browserPartial = try BridgeRequest.parse(request.dropLast())
check(browserPartial == nil, "Waits for the whole fragment")
let restoreRows = [Detection(seconds: 0, identity: "a", title: "A", artist: "One"), Detection(seconds: 60), Detection(seconds: 120, identity: "b", title: "B", artist: "Two"), Detection(seconds: 128, identity: "b", title: "B", artist: "Two")]
let restoreTracks = ScanPlan.tracks(restoreRows, step: 60)
let recoveredInitial = ScanPlan.recover(saved: restoreTracks, unknown: [60], completed: 4, total: 4, phase: "initial", duration: 140, step: 60)
check(recoveredInitial?.observations == restoreRows, "Recovers initial observations exactly")
check(ScanPlan.recover(saved: restoreTracks, unknown: [60], completed: 3, total: 4, phase: "initial", duration: 140, step: 60) == nil, "Rejects a checkpoint with inconsistent completed count")
check(ScanPlan.recover(saved: restoreTracks, unknown: [60,60], completed: 4, total: 4, phase: "initial", duration: 140, step: 60) == nil, "Rejects duplicate unknown points")
if CommandLine.arguments.count == 2 {
    struct Saved: Decodable { let tracks: [DetectedTrack]; let unknown: [Double]; let completed: Int; let total: Int; let phase: String; let duration: Double; let step: Double }
    let saved = try JSONDecoder().decode(Saved.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
    let recovered = ScanPlan.recover(saved: saved.tracks, unknown: saved.unknown, completed: saved.completed, total: saved.total, phase: saved.phase, duration: saved.duration, step: saved.step)
    check(recovered != nil, "Recovers the live KYBBA checkpoint exactly")
    check(recovered?.observations.count == saved.completed, "Preserves every completed observation")
    check(recovered?.pending.count == saved.total - saved.completed, "Preserves pending queue length")
    check(recovered?.pending.first == 810, "Resumes KYBBA at the exact pending point, 13:30")
}
let selectedRange = ScanPlan.targeted(start: 6, end: 24, duration: 3600, existing: [0,12,60])
check(selectedRange == [6,18,24], "Targeted review skips existing points and limits work to requested range")
check(ScanPlan.targeted(start: 0, end: 301, duration: 3600, existing: []).isEmpty, "Rejects a targeted range longer than five minutes")
check(ScanPlan.targeted(start: -1, end: 20, duration: 3600, existing: []).isEmpty, "Rejects negative targeted ranges")
check(ScanPlan.targeted(start: .nan, end: 20, duration: 3600, existing: []).isEmpty, "Rejects non-finite targeted ranges")
check(ScanPlan.targeted(start: 0, end: 3, duration: 3, existing: []).first == 0, "Allows a short three-second input")
check(ScanPlan.targeted(start: 3590, end: 3600, duration: 3600, existing: []).isEmpty, "Does not request a partial clip past the playable tail")

let shortWav = BrowserFragment.firstSixSeconds(wav)!
check(shortWav.count == 44 + 48000 * 6 * 2 && BrowserFragment.valid(shortWav), "Short review trims to six seconds and repairs WAV sizes")
check(shortWav.dropFirst(44) == wav.dropFirst(44).prefix(48000 * 6 * 2), "Short review keeps exact original PCM samples")
check(BrowserFragment.firstSixSeconds(stereo) == nil, "Short review rejects invalid input")
let adjustedWav = BrowserFragment.adjustedReview(wav)!
check(adjustedWav.count == shortWav.count && adjustedWav.dropFirst(44) == shortWav.dropFirst(44), "Speed review preserves every PCM sample and only uses six source seconds")
let adjustedRate = Int(adjustedWav[24]) | Int(adjustedWav[25]) << 8 | Int(adjustedWav[26]) << 16 | Int(adjustedWav[27]) << 24
check(adjustedRate == 45360, "Experimental speed is exactly bounded to 0.945")
check(!BrowserFragment.valid(adjustedWav), "Externally submitted altered WAVs remain rejected by capture validation")
let speedRows = [Detection(seconds: 0, identity: "same", title: "Song", artist: "Artist"), Detection(seconds: 6, identity: "same", title: "Song", artist: "Artist", windowSeconds: 6, speedMultiplier: 0.945)]
check(ScanPlan.tracks(speedRows, step: 60).count == 2, "Adjusted evidence stays separate from unmodified matches")
