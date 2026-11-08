import Foundation

struct EngineMatch: Decodable {
    let identity: String
    let title: String
    let artist: String
}
private struct EngineReply: Decodable {
    let ok: Bool
    let match: EngineMatch?
    let error: String?
    let retryAfter: Double?
}

// The bundled process sees only one temporary PCM fragment, never a shell command.
@MainActor
final class ShazamIOEngine {
    static var executable: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("engine/trackhunt-recognize")
    }
    static var ready: Bool {
        executable.map { FileManager.default.isExecutableFile(atPath: $0.path) } ?? false
    }
    private var process: Process?
    private var pending: CheckedContinuation<EngineReply, Error>?
    private var timeout: Task<Void, Never>?

    func match(fragment: URL) async throws -> EngineMatch? {
        try await execute(arguments: [fragment.path], timeoutSeconds: 40).match
    }
    private func execute(arguments: [String], timeoutSeconds: UInt64) async throws -> EngineReply {
        try Task.checkCancellation()
        guard let executable = Self.executable, Self.ready else {
            throw AssistantError.message("Falta el motor ShazamIO. Descarga de nuevo el asistente completo.")
        }
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                let job = Process(), pipe = Pipe()
                process = job
                job.executableURL = executable
                job.arguments = arguments
                job.standardOutput = pipe
                job.standardError = FileHandle.nullDevice
                job.standardInput = FileHandle.nullDevice
                job.terminationHandler = { [weak self] process in
                    let data = pipe.fileHandleForReading.readDataToEndOfFile()
                    guard let self else { return }
                    Task { @MainActor in
                        guard self.pending != nil else { return }
                        guard process.terminationStatus == 0, data.count < 16_384,
                              let reply = try? JSONDecoder().decode(EngineReply.self, from: data) else {
                            self.finish(.failure(AssistantError.message("ShazamIO se cerró sin responder. Puedes reanudar el fragmento."))); return
                        }
                        if reply.ok { self.finish(.success(reply)) }
                        else if let delay = reply.retryAfter, delay.isFinite, delay > 0 {
                            self.finish(.failure(AssistantError.rateLimited(reply.error ?? "Shazam pidió esperar.", delay)))
                        } else { self.finish(.failure(AssistantError.message(reply.error ?? "ShazamIO no respondió."))) }
                    }
                }
                do { try job.run() }
                catch { finish(.failure(AssistantError.message("No se pudo abrir el motor ShazamIO incluido en la app."))); return }
                timeout = Task { [weak self] in
                    do { try await Task.sleep(nanoseconds: timeoutSeconds * 1_000_000_000) } catch { return }
                    self?.stop(.failure(AssistantError.message("ShazamIO excedió el tiempo de espera. Puedes reanudar.")))
                }
            }
        }, onCancel: { Task { @MainActor [weak self] in self?.stop(.failure(CancellationError())) } })
    }
    private func stop(_ result: Result<EngineReply, Error>) {
        if process?.isRunning == true { process?.terminate() }
        finish(result)
    }
    private func finish(_ result: Result<EngineReply, Error>) {
        guard let continuation = pending else { return }
        pending = nil; timeout?.cancel(); timeout = nil; process = nil
        continuation.resume(with: result)
    }
}
