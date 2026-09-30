import Cocoa
import Foundation
import Darwin

final class LocalProbeDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

final class ManagedLauncher {
    private var trackhunt: Process?
    private var starting = false
    private var launchDeadline = Date.distantPast
    private let store: StateStore
    private let endpoint = URL(string: "http://127.0.0.1:4391")!
    private let session = URLSession(configuration: .ephemeral, delegate: LocalProbeDelegate(), delegateQueue: nil)

    init(store: StateStore) { self.store = store }

    static func projectRoot(for app: [String: Any]) throws -> URL {
        guard app["kind"] as? String == "managed", app["target"] as? String == "trackhunt",
              let sourcePath = app["sourcePath"] as? String, !sourcePath.isEmpty else {
            throw LogikError.message("El acceso de TRACKHUNT necesita la carpeta actual de su proyecto. Edita su ubicación.")
        }
        let root = try StateStore.localURL(sourcePath).resolvingSymlinksInPath()
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: root.path, isDirectory: &isDirectory), isDirectory.boolValue,
              FileManager.default.fileExists(atPath: root.appendingPathComponent("node_modules/vinext/dist/cli.js").path) else {
            throw LogikError.message("No encontramos el proyecto de TRACKHUNT y sus dependencias. Revisa su carpeta desde la tarjeta.")
        }
        return root
    }

    private func probe(_ completion: @escaping (Bool, Bool) -> Void) {
        let statusURL = endpoint.appendingPathComponent("api/remix/status")
        var request = URLRequest(url: statusURL)
        request.timeoutInterval = 1.5
        session.dataTask(with: request) { data, response, _ in
            let http = response as? HTTPURLResponse
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let statusMatches = http?.statusCode == 200 && http?.url == statusURL &&
                http?.mimeType == "application/json" && Set(json?.keys.map { $0 } ?? []) == Set(["audioMode", "webSearch", "soundcloud"]) &&
                ["connected", "evaluation"].contains(json?["audioMode"] as? String ?? "") &&
                json?["webSearch"] is Bool && json?["soundcloud"] is Bool
            guard statusMatches else { DispatchQueue.main.async { completion(false, response != nil) }; return }
            var pageRequest = URLRequest(url: self.endpoint); pageRequest.timeoutInterval = 1.5
            self.session.dataTask(with: pageRequest) { page, pageResponse, _ in
                let pageHTTP = pageResponse as? HTTPURLResponse
                let text = page.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                let pageURL = pageHTTP?.url
                let matches = pageHTTP?.statusCode == 200 && pageURL?.scheme == "http" && pageURL?.host == "127.0.0.1" && pageURL?.port == 4391 && (pageURL?.path == "" || pageURL?.path == "/") && text.contains("rh-brand") && text.lowercased().contains("trackhunt")
                DispatchQueue.main.async { completion(matches, true) }
            }.resume()
        }.resume()
    }

    func launch(root: URL, _ completion: @escaping (Result<String, Error>) -> Void) {
        guard !starting else { completion(.failure(LogikError.message("TRACKHUNT ya se está iniciando. Espera unos segundos."))); return }
        starting = true
        launchDeadline = Date().addingTimeInterval(24)
        probe { [weak self] matches, occupied in
            guard let self = self else { return }
            if matches { self.starting = false; self.open(completion); return }
            if occupied { self.starting = false; completion(.failure(LogikError.message("El puerto de TRACKHUNT lo está usando otra herramienta. No abrimos una app diferente."))); return }
            do {
                guard FileManager.default.fileExists(atPath: root.appendingPathComponent("node_modules/vinext/dist/cli.js").path) else {
                    throw LogikError.message("No encontramos el proyecto de TRACKHUNT y sus dependencias. Revisa su carpeta desde la tarjeta.")
                }
                if let previous = self.trackhunt, previous.isRunning { self.waitForReady(attempt: 0, completion); return }
                let node = Self.nodePath()
                guard node != nil else { throw LogikError.message("TRACKHUNT necesita Node.js instalado en este Mac.") }
                let logURL = self.store.directory.appendingPathComponent("trackhunt.log")
                FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600])
                let output = try FileHandle(forWritingTo: logURL)
                let process = Process()
                process.executableURL = Bundle.main.executableURL
                process.arguments = ["--run-trackhunt", root.path]
                process.currentDirectoryURL = root
                var environment = ProcessInfo.processInfo.environment
                environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
                environment["WRANGLER_LOG_PATH"] = self.store.directory.appendingPathComponent("trackhunt-wrangler.log").path
                environment["WRANGLER_SEND_METRICS"] = "false"
                environment["BROWSER"] = "none"
                process.environment = environment
                process.standardOutput = output
                process.standardError = output
                try process.run()
                self.trackhunt = process
                try? output.close()
                self.waitForReady(attempt: 0, completion)
            } catch { self.starting = false; completion(.failure(error)) }
        }
    }

    private func waitForReady(attempt: Int, _ completion: @escaping (Result<String, Error>) -> Void) {
        if let process = trackhunt, !process.isRunning {
            starting = false
            completion(.failure(LogikError.message("TRACKHUNT no pudo iniciarse. El detalle quedó en trackhunt.log, dentro de la carpeta de datos.")))
            return
        }
        probe { [weak self] ready, occupied in
            guard let self = self else { return }
            if ready { self.starting = false; self.open(completion) }
            else if attempt >= 25 || Date() >= self.launchDeadline {
                self.stop()
                completion(.failure(LogikError.message("TRACKHUNT tardó demasiado en responder. Revisa trackhunt.log en la carpeta de datos y vuelve a intentar.")))
            } else if occupied && self.trackhunt == nil {
                self.starting = false
                completion(.failure(LogikError.message("Hay otra herramienta en el puerto de TRACKHUNT.")))
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { self.waitForReady(attempt: attempt + 1, completion) }
            }
        }
    }

    private func open(_ completion: @escaping (Result<String, Error>) -> Void) {
        if NSWorkspace.shared.open(endpoint) { completion(.success("TRACKHUNT abierto en tu navegador.")) }
        else { completion(.failure(LogikError.message("TRACKHUNT está listo, pero no pudimos abrir el navegador."))) }
    }

    func stop() {
        if let process = trackhunt, process.isRunning {
            // The helper starts its own session. Signal only processes owned by this launcher.
            if getpgid(process.processIdentifier) == process.processIdentifier { _ = kill(-process.processIdentifier, SIGTERM) }
            else { process.terminate() }
        }
        trackhunt = nil
        starting = false
    }

    static func nodePath() -> String? {
        ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"].first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    static func runHelper(root: String) -> Never {
        guard let node = nodePath() else { exit(126) }
        // Foundation Process can already create a separate group; setsid would fail for its leader.
        if getpgrp() != getpid(), setsid() == -1 { exit(126) }
        let script = URL(fileURLWithPath: root).appendingPathComponent("node_modules/vinext/dist/cli.js").path
        let args = [node, script, "dev", "--hostname", "127.0.0.1", "--port", "4391"]
        var pointers = args.map { strdup($0) } + [nil]
        execv(node, &pointers)
        exit(127)
    }
}
