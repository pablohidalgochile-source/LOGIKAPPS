import Foundation

public struct ChatMessage: Identifiable {
    public let id: Int
    public let timestamp: String
    public let sender: String
    public var text: String
}

public struct ChatExport {
    public var messages: [ChatMessage]
    public var participants: [String]
    public var preamble: String
    public var limited: Bool
}

public enum WhatsApp {
    // Dates are deliberately not interpreted: day/month order varies by the exporting phone's locale.
    public static func parse(_ text: String, limit: Int = 50_000) -> ChatExport {
        let patterns = [
            #"^\[([^\]]{6,50})\]\s?(.*)$"#,
            #"^(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[aApP]\.?[mM]\.?)?)\s+-\s+(.*)$"#
        ].compactMap { try? NSRegularExpression(pattern: $0) }
        var messages: [ChatMessage] = []
        var preamble: [String] = []
        var limited = false
        let clean = text.replacingOccurrences(of: "\u{200e}", with: "").replacingOccurrences(of: "\u{200f}", with: "").replacingOccurrences(of: "\r\n", with: "\n")
        for line in clean.components(separatedBy: "\n") {
            let ns = line as NSString
            if let match = patterns.compactMap({ $0.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) }).first {
                if messages.count >= limit { limited = true; break }
                let timestamp = ns.substring(with: match.range(at: 1)), body = ns.substring(with: match.range(at: 2))
                let split = body.range(of: ": ")
                let sender = split.map { String(body[..<$0.lowerBound]) } ?? "Sistema"
                let content = split.map { String(body[$0.upperBound...]) } ?? body
                messages.append(ChatMessage(id: messages.count, timestamp: timestamp, sender: sender, text: content))
            } else if !messages.isEmpty { messages[messages.count - 1].text += "\n" + line }
            else { preamble.append(line) }
        }
        return ChatExport(messages: messages, participants: Array(Set(messages.map(\.sender).filter { $0 != "Sistema" })).sorted(), preamble: preamble.joined(separator: "\n"), limited: limited)
    }
    public static func load(_ url: URL) throws -> ChatExport {
        let attrs = try SafeFiles.regular(url)
        guard (attrs[.size] as? NSNumber)?.intValue ?? 0 <= 20_000_000 else { throw ArchiveError.message("El visor admite TXT de hasta 20 MB. El archivo puede archivarse sin abrirlo.") }
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else { throw ArchiveError.message("No se reconoce la codificación del texto.") }
        let result = parse(text)
        guard !result.messages.isEmpty else { throw ArchiveError.message("No se reconocen mensajes de WhatsApp en este TXT. Se conserva el original.") }
        return result
    }
}

public struct BackupInfo {
    public var name: String
    public var version: String
    public var date: Date?
    public var encrypted: Bool
    public var finished: Bool
}

public enum BackupInspector {
    public static func inspect(_ folder: URL) throws -> BackupInfo {
        func plist(_ name: String) throws -> [String: Any] {
            let url = folder.appendingPathComponent(name)
            let attrs = try SafeFiles.regular(url)
            guard (attrs[.size] as? NSNumber)?.intValue ?? 0 < 20_000_000,
                  let value = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any] else {
                throw ArchiveError.message("Metadatos de respaldo no válidos: \(name)")
            }
            return value
        }
        let info = try plist("Info.plist"), manifest = try plist("Manifest.plist"), status = try plist("Status.plist")
        _ = try SafeFiles.regular(folder.appendingPathComponent("Manifest.db"))
        return BackupInfo(name: info["Device Name"] as? String ?? "iPhone", version: info["Product Version"] as? String ?? "Desconocida", date: status["Date"] as? Date ?? info["Last Backup Date"] as? Date, encrypted: manifest["IsEncrypted"] as? Bool ?? false, finished: status["SnapshotState"] as? String == "finished")
    }
}
