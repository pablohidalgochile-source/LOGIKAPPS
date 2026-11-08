import Foundation

public enum BrowserFragment {
    // Experimental review only. Relabel PCM sample rate; no extra capture or playback.
    // The decoder resamples this short WAV before fingerprinting. Source timestamps stay unchanged.
    public static func adjustedReview(_ data: Data) -> Data? {
        guard var result = firstSixSeconds(data) else { return nil }
        let rate = Int(result[24]) | Int(result[25]) << 8 | Int(result[26]) << 16 | Int(result[27]) << 24
        let adjusted = Int((Double(rate) * 0.945).rounded())
        for (offset, value) in [(24, adjusted), (28, adjusted * 2)] {
            for byte in 0..<4 { result[offset + byte] = UInt8((value >> (byte * 8)) & 255) }
        }
        return result
    }
    // Keep a shorter fingerprint window without changing playback or the source capture.
    public static func firstSixSeconds(_ data: Data) -> Data? {
        guard valid(data) else { return nil }
        let rate = Int(data[24]) | Int(data[25]) << 8 | Int(data[26]) << 16 | Int(data[27]) << 24
        var result = Data(data.prefix(min(data.count, 44 + rate * 6 * 2)))
        for (offset, value) in [(4, result.count - 8), (40, result.count - 44)] {
            for byte in 0..<4 { result[offset + byte] = UInt8((value >> (byte * 8)) & 255) }
        }
        return result
    }
    // Accept only our canonical mono PCM WAV, never containers, URLs or paths.
    public static func valid(_ data: Data) -> Bool {
        guard data.count >= 44, data.count <= 1_200_000 else { return false }
        func text(_ offset: Int, _ count: Int) -> String { String(decoding: data[offset..<offset+count], as: UTF8.self) }
        func u16(_ p: Int) -> Int { Int(data[p]) | Int(data[p+1]) << 8 }
        func u32(_ p: Int) -> Int { u16(p) | u16(p+2) << 16 }
        let rate = u32(24), samples = (data.count - 44) / 2
        return text(0,4) == "RIFF" && text(8,4) == "WAVE" && text(12,4) == "fmt " && text(36,4) == "data"
            && u32(4) == data.count - 8 && u32(16) == 16 && u16(20) == 1 && u16(22) == 1
            && [44100,48000].contains(rate) && u32(28) == rate * 2 && u16(32) == 2 && u16(34) == 16
            && u32(40) == data.count - 44 && (data.count - 44) % 2 == 0
            && samples >= rate * 3 && samples <= rate * 12
    }
}
