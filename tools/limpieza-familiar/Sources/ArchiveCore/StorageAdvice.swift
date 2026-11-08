import Foundation

/// A measurement obtained outside the USB media catalogue, with its own date and identity.
public struct StorageObservation: Codable {
    public struct ChatBackup: Codable {
        public var observedAt: Date
        public var dataBytes: Int64
        public var neverBackedUp: Bool
    }

    public var deviceID: String
    public var observedAt: Date
    public var availableBytes: Int64?
    public var visibleApps: [String]
    public var whatsapp: ChatBackup?

    public static func load(_ root: URL, deviceID: String) throws -> StorageObservation? {
        let url = try SafeFiles.relativeURL(".storage-observation.json", under: root)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let attrs = try SafeFiles.regular(url)
        guard let bytes = attrs[.size] as? NSNumber, bytes.intValue <= 64_000 else {
            throw ArchiveError.message("La observación de almacenamiento es demasiado grande.")
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let observation = try decoder.decode(Self.self, from: Data(contentsOf: url))
        return observation.deviceID == deviceID ? observation : nil
    }
}

public struct StorageAdvice {
    public struct Suggestion: Identifiable {
        public var title: String
        public var detail: String
        public var id: String { title }
    }

    public var catalogueDate: Date?
    public var itemCount: Int
    public var registeredCount: Int?
    public var photoBytes: Int64
    public var videoBytes: Int64
    public var unregisteredExamples: [String]
    public var observation: StorageObservation?
    public var suggestions: [Suggestion]

    public static func make(saved: USBManifest?, live: [USBItem]?, observation: StorageObservation?) -> Self {
        let catalogue = live ?? saved?.catalog ?? []
        var photoBytes: Int64 = 0
        var videoBytes: Int64 = 0
        var matched = 0
        var unmatched: [String] = []
        for item in catalogue {
            let kind = FileKind.of(URL(fileURLWithPath: item.path))
            if kind == .photo { photoBytes += max(0, item.bytes) }
            if kind == .video { videoBytes += max(0, item.bytes) }
            if let saved = saved {
                if saved.records[item.path]?.remote.sameRemote(item) == true {
                    matched += 1
                } else if unmatched.count < 3 {
                    unmatched.append((item.path as NSString).lastPathComponent)
                }
            }
        }
        var suggestions: [Suggestion] = []
        let names = Set((observation?.visibleApps ?? []).map { $0.lowercased() })
        if names.contains("spotify") {
            suggestions.append(.init(title: "Spotify · caché y descargas",
                detail: "Spotify figuraba en Finder. Revisa Spotify → Perfil → Configuración y privacidad → Ahorro de datos y reproducción sin conexión → Almacenamiento. Empieza por Borrar caché. Quita las descargas si puedes volver a bajarlas."))
        }
        if names.contains("viki") {
            suggestions.append(.init(title: "Viki · episodios descargados",
                detail: "Viki figuraba en Finder. Si hay episodios descargados, quita solo las descargas desde Viki. Conserva tus fotos y conversaciones."))
        }
        if suggestions.isEmpty {
            suggestions.append(.init(title: "Descargas que puedas volver a bajar",
                detail: "Empieza por el contenido sin conexión de tus apps de música, series, pódcasts o mapas. Retira solo la descarga dentro de la app."))
        }
        suggestions.append(.init(title: "Apps que ya no uses",
            detail: "En Configuración → General → Almacenamiento del iPhone, usa Desinstalar app o Vaciar app en una app que reconozcas y ya no uses. iOS conserva sus documentos y datos."))
        return Self(catalogueDate: live == nil ? saved?.checkedAt : Date(), itemCount: catalogue.count,
                    registeredCount: saved == nil ? nil : matched, photoBytes: photoBytes, videoBytes: videoBytes,
                    unregisteredExamples: unmatched, observation: observation, suggestions: suggestions)
    }
}
