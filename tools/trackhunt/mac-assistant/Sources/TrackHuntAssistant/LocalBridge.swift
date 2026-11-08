import Foundation
import Network
import ScanCore

final class LocalBridge {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "chat.trackhunt.bridge")
    private let token = UUID().uuidString + UUID().uuidString
    private let model: ScanModel
    init(model: ScanModel) { self.model = model }
    func start() throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: UInt16(BridgePolicy.port))!)
        let server = try NWListener(using: parameters)
        listener = server
        server.stateUpdateHandler = { [weak self] state in
            guard let model = self?.model else { return }
            Task { @MainActor in
                switch state {
                case .ready: model.connectionMessage = "Listo para conectar con Track Hunt en este Mac."
                case .failed: model.connectionMessage = "No se pudo abrir la conexión local. Cierra otras copias del asistente y vuelve a abrirlo."
                default: break
                }
            }
        }
        server.newConnectionHandler = { [weak self] connection in
            connection.start(queue: self?.queue ?? .global())
            self?.receive(connection, accumulated: Data())
            self?.queue.asyncAfter(deadline: .now() + 120) { connection.cancel() }
        }
        server.start(queue: queue)
    }
    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, complete, error in
            guard let self, error == nil else { connection.cancel(); return }
            var buffer = accumulated; if let data { buffer.append(data) }
            do {
                if let request = try BridgeRequest.parse(buffer) {
                    Task { @MainActor in await self.handle(request, connection) }
                } else if !complete { self.receive(connection, accumulated: buffer) }
                else { connection.cancel() }
            } catch { self.respond(connection, code: 400, origin: nil, data: Data("{}".utf8)) }
        }
    }
    private func respond(_ connection: NWConnection, code: Int = 200, origin: String?, data: Data) {
        let reason = code < 400 ? "OK" : "Error"
        var headers = "HTTP/1.1 \(code) \(reason)\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: \(data.count)\r\n"
        if let origin {
            headers += "Access-Control-Allow-Origin: \(origin)\r\nVary: Origin\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Trackhunt-Token, X-Trackhunt-Job, X-Trackhunt-Seconds\r\nAccess-Control-Allow-Private-Network: true\r\n"
        }
        var output = Data((headers + "\r\n").utf8); output.append(data)
        connection.send(content: output, completion: .contentProcessed { _ in connection.cancel() })
    }
    @MainActor private func handle(_ request: BridgeRequest, _ connection: NWConnection) async {
        let origin = request.headers["origin"] ?? ""
        guard BridgePolicy.allows(origin: origin, host: request.headers["host"] ?? "") else {
            respond(connection, code: 403, origin: nil, data: Data("{}".utf8)); return
        }
        func json(_ object: Any, code: Int = 200) {
            respond(connection, code: code, origin: origin, data: (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8))
        }
        if request.method == "OPTIONS" { json([:]); return }
        if request.path == "/v1/session", request.method == "GET" || (request.method == "POST" && origin == BridgePolicy.extensionOrigin) {
            json(["service": "trackhunt-shazam", "protocolVersion": 1, "token": token,
                  "ready": model.ready, "version": "0.4.2", "speedReview": true, "shortReview": true, "review": true, "browserCapture": true, "engine": "shazamio", "message": model.ready ? "Asistente conectado" : "Falta el motor ShazamIO incluido. Vuelve a descargar el asistente."])
            return
        }
        guard request.headers["x-trackhunt-token"] == token else { json(["error": "Vuelve a conectar el asistente."], code: 401); return }
        if request.path == "/v1/status", request.method == "GET" || (request.method == "POST" && origin == BridgePolicy.extensionOrigin) {
            respond(connection, origin: origin, data: (try? JSONEncoder().encode(model.snapshot)) ?? Data("{}".utf8)); return
        }
        if request.path == "/v1/jobs", request.method == "GET" { json(model.savedJobs()); return }
        if request.path.hasPrefix("/v1/browser/") {
            guard origin == BridgePolicy.extensionOrigin else { json(["error": "Solo la extensión instalada puede enviar fragmentos."], code: 403); return }
            do {
                if request.path == "/v1/browser/next", request.method == "POST" { json(model.browserNext()); return }
                guard request.method == "POST" else { json(["error": "Método inválido"], code: 405); return }
                if request.path == "/v1/browser/restore" {
                    guard request.headers["content-type"] == "application/json" else { json(["error": "Formato inválido"], code: 400); return }
                    try model.restoreBrowser(JSONDecoder().decode(ScanSnapshot.self, from: request.body))
                } else if request.path == "/v1/browser/fragment" {
                    guard request.headers["content-type"] == "audio/wav", let id = request.headers["x-trackhunt-job"],
                          let seconds = Double(request.headers["x-trackhunt-seconds"] ?? "") else { json(["error": "Fragmento inválido"], code: 400); return }
                    try await model.browserFragment(request.body, jobID: id, seconds: seconds)
                } else {
                    guard request.headers["content-type"] == "application/json",
                          let object = try JSONSerialization.jsonObject(with: request.body) as? [String: Any] else { json(["error": "JSON inválido"], code: 400); return }
                    if request.path == "/v1/browser/start" {
                        guard let title = object["title"] as? String, let videoID = object["videoID"] as? String,
                              let duration = object["duration"] as? Double, let step = object["step"] as? Double else { json(["error": "Video inválido"], code: 400); return }
                        try model.startBrowser(title: title, videoID: videoID, duration: duration, step: step)
                    } else if request.path == "/v1/browser/problem", let id = object["id"] as? String, let message = object["message"] as? String {
                        model.browserProblem(message, jobID: id)
                    } else { json(["error": "Ruta inválida"], code: 404); return }
                }
                json(model.browserNext())
            } catch { json(["error": error.localizedDescription], code: 409) }
            return
        }
        guard request.method == "POST", request.headers["content-type"]?.hasPrefix("application/json") == true else {
            json(["error": "Solicitud no admitida."], code: 405); return
        }
        do {
            switch request.path {
            case "/v1/start":
                let object = try JSONSerialization.jsonObject(with: request.body) as? [String: Any]
                guard let step = object?["step"] as? Double else { json(["error": "Intervalo inválido."], code: 400); return }
                try await model.pickAndStart(step: step)
            case "/v1/load":
                let object = try JSONSerialization.jsonObject(with: request.body) as? [String: Any]
                guard let id = object?["id"] as? String else { throw AssistantError.message("Trabajo inválido.") }
                try model.loadJob(id)
            case "/v1/relink": try await model.relinkFile()
            case "/v1/reanalyze":
                let object = try JSONSerialization.jsonObject(with: request.body) as? [String: Any]
                guard let id = object?["id"] as? String, let start = object?["start"] as? Double, let end = object?["end"] as? Double else { throw AssistantError.message("Tramo inválido.") }
                if let speed = object?["speedMultiplier"], !(speed is Double) { throw AssistantError.message("Ajuste de velocidad inválido.") }
                try model.reanalyze(start: start, end: end, jobID: id, speedMultiplier: object?["speedMultiplier"] as? Double ?? 1)
            case "/v1/review":
                let object = try JSONSerialization.jsonObject(with: request.body) as? [String: Any]
                guard let id = object?["id"] as? String, let seconds = object?["seconds"] as? Double, let identity = object?["identity"] as? String, let artist = object?["artist"] as? String, let title = object?["title"] as? String, let decision = object?["decision"] as? String else { throw AssistantError.message("Revisión inválida.") }
                try model.review(seconds: seconds, identity: identity, artist: artist, title: title, decision: decision, jobID: id)
            case "/v1/pause": model.pause()
            case "/v1/resume": model.resume()
            case "/v1/cancel": model.cancel()
            default: json(["error": "Ruta desconocida."], code: 404); return
            }
            json(["ok": true])
        } catch { json(["error": error.localizedDescription], code: 409) }
    }
}
