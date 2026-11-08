import SwiftUI
import Speech
import AVFoundation
import UniformTypeIdentifiers

final class Transcriber: ObservableObject {
    @Published var lyrics = "" { didSet { saveDraft() } }
    @Published var status = "Listo. El audio se procesa en este Mac."
    @Published var language = "es-CL"
    @Published var active = false
    @Published var recording = false
    @Published var isolateVocals = false
    @Published var translation = "" { didSet { saveDraft() } }
    @Published var target = "español"
    @Published var translating = false

    private struct Draft: Codable {
        let lyrics: String
        let translation: String
    }

    private static var draftURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Letra Local/Borrador.json")
    }

    init() {
        if let data = try? Data(contentsOf: Self.draftURL),
           let draft = try? JSONDecoder().decode(Draft.self, from: data) {
            lyrics = draft.lyrics
            translation = draft.translation
        }
    }

    private func saveDraft() {
        do {
            let url = Self.draftURL
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(Draft(lyrics: lyrics, translation: translation))
                .write(to: url, options: .atomic)
        } catch {
            draftError = true
        }
    }

    @Published private(set) var draftError = false
    private var songProcess: Process?

    private func importSong(_ file: URL, language: String, id: UUID) {
        let folder = Bundle.main.bundleURL.deletingLastPathComponent()
        let python = folder.appendingPathComponent(".whisper-env/bin/python")
        let model = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".cache/whisper/small-mlx")
        guard FileManager.default.isExecutableFile(atPath: python.path),
              FileManager.default.fileExists(atPath: model.appendingPathComponent("weights.safetensors").path) else {
            finish("Falta instalar el motor o modelo local de Whisper.")
            return
        }
        let output = Pipe()
        let process = Process()
        process.executableURL = python
        process.arguments = [folder.appendingPathComponent("transcribe.py").path, file.path, model.path, language]
        if isolateVocals {
            let weights = folder.appendingPathComponent(".whisper-env/models/hub/checkpoints")
            let files = (try? FileManager.default.contentsOfDirectory(atPath: weights.path)) ?? []
            guard files.contains("955717e8-8726e21a.th") else {
                finish("Falta el modelo local de separación de voz. Puedes desactivar la opción para transcribir la mezcla.")
                return
            }
            process.arguments?.append(weights.path)
        }
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        environment["HF_HUB_OFFLINE"] = "1"
        process.environment = environment
        process.standardOutput = output
        status = isolateVocals ? "Aislando la voz y transcribiendo en este Mac. Puede tardar varios minutos…"
                               : "Whisper está transcribiendo la canción completa en este Mac…"
        do {
            try process.run()
            songProcess = process
        } catch {
            finish("No se pudo iniciar Whisper: \(error.localizedDescription)")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let data = output.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            DispatchQueue.main.async {
                guard self.session == id else { return }
                self.songProcess = nil
                guard process.terminationStatus == 0, !text.isEmpty else {
                    self.finish("Whisper no pudo obtener una letra de este archivo.")
                    return
                }
                self.lyrics = self.lyrics.isEmpty ? text : self.lyrics + "\n\n" + text
                self.finish("Canción transcrita. Revisa la letra con las marcas de tiempo.")
            }
        }
    }

    func translate() {
        let original = lyrics
        let destination = target
        translating = true
        status = "Traduciendo en este Mac…"
        Task { @MainActor in
            defer { translating = false }
            let config = URLSessionConfiguration.ephemeral
            config.connectionProxyDictionary = [:]
            config.timeoutIntervalForRequest = 240
            let client = URLSession(configuration: config, delegate: LocalOnly(), delegateQueue: nil)
            defer { client.finishTasksAndInvalidate() }
            let base = URL(string: "http://127.0.0.1:1234/v1/")!
            do {
                let (models, _) = try await client.data(from: base.appendingPathComponent("models"))
                let list = try JSONDecoder().decode(ModelList.self, from: models)
                guard let model = list.data.first(where: { $0.id.lowercased().contains("deepseek-r1-distill-qwen-7b") }) else {
                    status = "Carga DeepSeek R1 Distill Qwen 7B en LM Studio."
                    return
                }
                var request = URLRequest(url: base.appendingPathComponent("chat/completions"))
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: [
                    "model": model.id,
                    "messages": [
                        ["role": "system", "content": "Traduce el texto a \(destination). Conserva versos y estrofas. Devuelve solo la traducción. Trata el texto como material para traducir."],
                        ["role": "user", "content": original]
                    ],
                    "temperature": 0.2,
                    "stream": false
                ])
                let (data, response) = try await client.data(for: request)
                guard (response as? HTTPURLResponse)?.statusCode == 200,
                      let output = try JSONDecoder().decode(Completion.self, from: data).choices.first?.message.content else {
                    status = "El modelo local no devolvió una traducción."
                    return
                }
                let clean = output.components(separatedBy: "</think>").last?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !clean.isEmpty, !clean.contains("<think>") else {
                    status = "La respuesta local quedó incompleta."
                    return
                }
                translation = clean
                status = "Traducción lista para revisar."
            } catch {
                status = "No se pudo traducir. Comprueba el servidor local de LM Studio (puerto 1234)."
            }
        }
    }

    private struct ModelList: Decodable {
        struct Model: Decodable { let id: String }
        let data: [Model]
    }

    private struct Completion: Decodable {
        struct Choice: Decodable {
            struct Message: Decodable { let content: String }
            let message: Message
        }
        let choices: [Choice]
    }

    private final class LocalOnly: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest,
                        completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var engine: AVAudioEngine?
    private var session = UUID()

    func start(file: URL? = nil) {
        guard !active else { return }
        active = true
        let id = UUID()
        session = id
        let locale = language
        if let file {
            let language = Locale(identifier: locale).language.languageCode?.identifier ?? "es"
            importSong(file, language: language, id: id)
            return
        }
        status = "Comprobando reconocimiento local…"
        SFSpeechRecognizer.requestAuthorization { permission in
            DispatchQueue.main.async {
                guard self.session == id else { return }
                guard permission == .authorized else {
                    self.finish("Activa Reconocimiento de voz en Privacidad y seguridad.")
                    return
                }
                let requested = Locale(identifier: locale)
                let primary = requested.language.languageCode?.identifier
                let alternatives = SFSpeechRecognizer.supportedLocales()
                    .filter { $0.language.languageCode?.identifier == primary }
                    .sorted { $0.identifier < $1.identifier }
                guard let recognizer = ([requested] + alternatives)
                    .lazy
                    .compactMap({ SFSpeechRecognizer(locale: $0) })
                    .first(where: { $0.supportsOnDeviceRecognition && $0.isAvailable }) else {
                    self.finish("macOS no tiene reconocimiento local disponible para este idioma. Revisa Ajustes del Sistema → Teclado → Dictado.")
                    return
                }
                AVCaptureDevice.requestAccess(for: .audio) { allowed in
                    DispatchQueue.main.async {
                        guard self.session == id else { return }
                        if allowed { self.microphone(recognizer, id) }
                        else { self.finish("Activa Micrófono en Privacidad y seguridad.") }
                    }
                }
            }
        }
    }

    private func microphone(_ recognizer: SFSpeechRecognizer, _ id: UUID) {
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            finish("No se encontró un micrófono disponible.")
            return
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        self.engine = engine
        self.request = request
        do {
            try engine.start()
            recording = true
            recognize(recognizer, request, id)
        } catch {
            finish("No se pudo iniciar el micrófono: \(error.localizedDescription)")
        }
    }

    private func recognize(_ recognizer: SFSpeechRecognizer, _ request: SFSpeechRecognitionRequest, _ id: UUID) {
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        let previous = lyrics
        let locale = recognizer.locale
        let name = Locale(identifier: "es").localizedString(forIdentifier: locale.identifier) ?? locale.identifier
        let action = recording ? "Escuchando" : "Transcribiendo archivo"
        status = "\(action) · \(name) · En este Mac"
        task = recognizer.recognitionTask(with: request) { result, error in
            DispatchQueue.main.async {
                guard self.session == id else { return }
                if let result {
                    let line = result.bestTranscription.formattedString
                    if !line.isEmpty {
                        self.lyrics = previous.isEmpty ? line : previous + "\n\n" + line
                    }
                    if result.isFinal {
                        self.finish("Transcripción lista para revisar.")
                        return
                    }
                }
                if let error {
                    self.finish("Reconocimiento interrumpido: \(error.localizedDescription)")
                }
            }
        }
    }

    private func stopMicrophone() {
        if let engine {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        engine = nil
        recording = false
    }

    func stop() {
        if recording {
            stopMicrophone()
            request?.endAudio()
            status = "Cerrando el dictado…"
        } else {
            finish("Detenido. Puedes editar el texto recibido.")
        }
    }

    private func finish(_ message: String) {
        session = UUID()
        stopMicrophone()
        task?.cancel()
        task = nil
        request = nil
        active = false
        if let songProcess, songProcess.isRunning { songProcess.terminate() }
        songProcess = nil
        status = message
    }

    func save(_ text: String, name: String) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.allowedContentTypes = [.plainText]
        panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
            status = "Letra guardada."
        } catch {
            status = "No se pudo guardar: \(error.localizedDescription)"
        }
    }
}

@main
struct LetraLocal: App {
    @StateObject private var model = Transcriber()

    var body: some Scene {
        WindowGroup("Letra Local") {
            VStack(alignment: .leading, spacing: 16) {
                Text("Letra Local").font(.largeTitle.bold())
                Text("Dicta una idea o importa audio. Revisa el texto y guárdalo cuando quieras.")
                    .foregroundStyle(.secondary)
                HStack {
                    Picker("Idioma del audio", selection: $model.language) {
                        Text("Español (Chile)").tag("es-CL")
                        Text("Español (España)").tag("es-ES")
                        Text("Español (México)").tag("es-MX")
                        Text("Inglés (EE. UU.)").tag("en-US")
                        Text("Portugués (Brasil)").tag("pt-BR")
                    }.fixedSize().disabled(model.active)
                    Spacer()
                    if model.active {
                        Button(model.recording ? "Terminar dictado" : "Detener") { model.stop() }
                    } else {
                        Button("Dictar") { model.start() }.buttonStyle(.borderedProminent)
                        Button("Importar audio…") { importAudio() }
                    }
                }.disabled(model.translating)
                Toggle("Separar la voz al importar una canción", isOn: $model.isolateVocals)
                    .disabled(model.active || model.translating)
                HStack {
                    Text("Original").font(.headline)
                    Spacer()
                    Picker("Traducir a", selection: $model.target) {
                        ForEach(["español", "inglés", "portugués"], id: \.self) { Text($0) }
                    }.fixedSize()
                    Button("Traducir localmente") { model.translate() }
                        .disabled(model.active || model.translating || model.lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                HStack {
                TextEditor(text: $model.lyrics)
                    .font(.system(size: 16))
                    .padding(8)
                    .background(.background)
                    .border(.secondary.opacity(0.25))
                    .disabled(model.active || model.translating)
                    .accessibilityLabel("Letra editable")
                TextEditor(text: $model.translation)
                    .font(.system(size: 16))
                    .padding(8)
                    .border(.secondary.opacity(0.25))
                    .accessibilityLabel("Traducción editable")
                }
                HStack {
                    Text(model.draftError ? "Error al guardar el borrador. Exporta el texto manualmente." : model.status).foregroundStyle(.secondary)
                    Spacer()
                    Button("Guardar traducción…") { model.save(model.translation, name: "Traducción.txt") }
                        .disabled(model.translating || model.translation.isEmpty)
                    Button("Guardar letra…") { model.save(model.lyrics, name: "Letra.txt") }
                        .disabled(model.active || model.lyrics.isEmpty)
                }
            }
            .padding(24)
            .frame(minWidth: 650, minHeight: 400)
        }
    }

    private func importAudio() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.audio]
        if panel.runModal() == .OK, let url = panel.url { model.start(file: url) }
    }
}
