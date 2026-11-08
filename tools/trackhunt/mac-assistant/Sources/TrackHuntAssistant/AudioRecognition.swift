import Foundation
import AVFoundation
import ShazamKit
import ScanCore

enum AssistantError: LocalizedError {
    case message(String)
    case rateLimited(String, Double)
    var errorDescription: String? {
        switch self { case .message(let text), .rateLimited(let text, _): return text }
    }
}

enum AudioFragments {
    static func duration(_ url: URL) throws -> Double {
        let asset = AVURLAsset(url: url)
        guard !asset.tracks(withMediaType: .audio).isEmpty else { throw AssistantError.message("El archivo no contiene una pista de audio compatible.") }
        return CMTimeGetSeconds(asset.duration)
    }
    static func buffer(_ url: URL, seconds: Double, length: Double = ScanPlan.clip) throws -> AVAudioPCMBuffer {
        guard let file = try? AVAudioFile(forReading: url) else { return try videoBuffer(url, seconds: seconds, length: length) }
        let rate = file.processingFormat.sampleRate
        guard rate > 0, rate <= 384_000, file.processingFormat.channelCount <= 8 else {
            throw AssistantError.message("Formato de audio no compatible. Exporta el set en WAV, MP3 o M4A estéreo.")
        }
        file.framePosition = min(file.length, AVAudioFramePosition(seconds * rate))
        let frames = AVAudioFrameCount(min(Double(file.length - file.framePosition), length * rate))
        guard frames > 0, let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frames),
              let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1),
              let converter = AVAudioConverter(from: file.processingFormat, to: format),
              let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(length * 44_100) + 2048) else {
            throw AssistantError.message("No se pudo preparar este fragmento de audio.")
        }
        try file.read(into: input, frameCount: frames)
        var supplied = false
        var conversionError: NSError?
        let status = converter.convert(to: output, error: &conversionError) { _, outStatus in
            if supplied { outStatus.pointee = .endOfStream; return nil }
            supplied = true; outStatus.pointee = .haveData; return input
        }
        if let error = conversionError { throw error }
        guard status != .error, output.frameLength > 0 else { throw AssistantError.message("El fragmento no contiene audio legible.") }
        return output
    }
    // AVAssetReader decodes only the requested audio time range, including MP4/MOV video containers.
    static func videoBuffer(_ url: URL, seconds: Double, length: Double) throws -> AVAudioPCMBuffer {
        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .audio).first,
              let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(length * 44_100)) else {
            throw AssistantError.message("No se pudo leer una pista de audio de este video. Usa un MP4 o MOV con audio compatible.")
        }
        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = CMTimeRange(start: CMTime(seconds: seconds, preferredTimescale: 44_100), duration: CMTime(seconds: length, preferredTimescale: 44_100))
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsNonInterleaved: false])
        guard reader.canAdd(output) else { throw AssistantError.message("Formato de video no compatible con macOS.") }
        reader.add(output); guard reader.startReading() else { throw reader.error ?? AssistantError.message("No se pudo abrir el audio del video.") }
        defer { reader.cancelReading() }
        var written = 0
        while let sample = output.copyNextSampleBuffer(), written < Int(buffer.frameCapacity) {
            guard let data = CMSampleBufferGetDataBuffer(sample), let destination = buffer.floatChannelData?[0] else { throw AssistantError.message("El video devolvió audio ilegible.") }
            let count = min(CMBlockBufferGetDataLength(data) / 4, Int(buffer.frameCapacity) - written)
            guard CMBlockBufferCopyDataBytes(data, atOffset: 0, dataLength: count * 4, destination: destination.advanced(by: written)) == kCMBlockBufferNoErr else { throw AssistantError.message("No se pudo decodificar el fragmento.") }
            written += count
        }
        if reader.status == .failed { throw reader.error ?? AssistantError.message("Falló la lectura del video.") }
        guard written >= 3 * 44_100 else { throw AssistantError.message("El tramo no contiene tres segundos de audio legible.") }
        buffer.frameLength = AVAudioFrameCount(written); return buffer
    }
    static func fragment(_ url: URL, seconds: Double, length: Double = ScanPlan.clip, speedMultiplier: Double = 1) throws -> URL {
        guard speedMultiplier == 1 || (speedMultiplier == 0.945 && length == 6) else {
            throw AssistantError.message("Ajuste de velocidad inválido para el repaso.")
        }
        var output = try buffer(url, seconds: seconds, length: length)
        if speedMultiplier != 1 {
            guard let format = AVAudioFormat(standardFormatWithSampleRate: output.format.sampleRate * speedMultiplier, channels: 1),
                  let adjusted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: output.frameLength),
                  let target = adjusted.floatChannelData?[0], let source = output.floatChannelData?[0] else {
                throw AssistantError.message("No se pudo ajustar la muestra de repaso.")
            }
            target.update(from: source, count: Int(output.frameLength)); adjusted.frameLength = output.frameLength
            output = adjusted
        }
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent("trackhunt-\(UUID().uuidString).wav")
        do {
            let file = try AVAudioFile(forWriting: destination, settings: output.format.settings)
            try file.write(from: output)
            return destination
        } catch { try? FileManager.default.removeItem(at: destination); throw error }
    }
    static func signature(_ url: URL, seconds: Double, length: Double = ScanPlan.clip) throws -> SHSignature {
        let output = try buffer(url, seconds: seconds, length: length)
        let generator = SHSignatureGenerator()
        try generator.append(output, at: nil)
        return generator.signature()
    }
}

@MainActor
final class SignatureMatcher: NSObject, SHSessionDelegate {
    private var continuation: CheckedContinuation<SHMatchedMediaItem?, Error>?
    private var session: SHSession?
    private var timeout: Task<Void, Never>?
    func match(_ signature: SHSignature, catalog: SHCatalog? = nil) async throws -> SHMatchedMediaItem? {
        try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { pending in
                continuation = pending
                let session = catalog.map { SHSession(catalog: $0) } ?? SHSession()
                self.session = session; session.delegate = self
                timeout = Task { [weak self] in
                    do { try await Task.sleep(nanoseconds: 25_000_000_000) } catch { return }
                    self?.finish(.failure(AssistantError.message("Shazam no respondió a tiempo. Puedes reanudar el barrido.")))
                }
                session.match(signature)
            }
        }, onCancel: { Task { @MainActor [weak self] in self?.finish(.failure(CancellationError())) } })
    }
    private func finish(_ result: Result<SHMatchedMediaItem?, Error>) {
        guard let pending = continuation else { return }
        continuation = nil; session?.delegate = nil; session = nil; timeout?.cancel(); timeout = nil
        pending.resume(with: result)
    }
    nonisolated func session(_ session: SHSession, didFind match: SHMatch) {
        Task { @MainActor in self.finish(.success(match.mediaItems.first)) }
    }
    nonisolated func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
        Task { @MainActor in
            if let error { self.finish(.failure(error)) } else { self.finish(.success(nil)) }
        }
    }
}
