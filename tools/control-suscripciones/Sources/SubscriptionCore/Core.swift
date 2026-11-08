import Foundation
import CryptoKit

public enum SubError: LocalizedError {
    case message(String)
    public var errorDescription: String? { if case .message(let s) = self { return s }; return nil }
}
public struct Mail: Codable, Identifiable, Equatable {
    public var id: String
    public var threadID: String
    public var from: String
    public var subject: String
    public var date: String
    public var url: String
    public var snippet: String
    public var detail: String?
    public init(id: String, threadID: String = "", from: String, subject: String, date: String, url: String = "", snippet: String, detail: String? = nil) {
        self.id = id; self.threadID = threadID; self.from = from; self.subject = subject; self.date = date; self.url = url; self.snippet = snippet; self.detail = detail
    }
    public var text: String { detail ?? snippet }
}
public struct Audit: Codable {
    public var schema: Int = 1
    public var account: String
    public var reviewedOn: String
    public var query: String
    public var complete: Bool
    public var nextPageToken: String?
    public var limitation: String
    public var messages: [Mail]
    public init(account: String, reviewedOn: String, query: String, complete: Bool, limitation: String, messages: [Mail]) {
        self.account = account; self.reviewedOn = reviewedOn; self.query = query; self.complete = complete; self.limitation = limitation; self.messages = messages
    }
}
public struct Review: Codable, Equatable {
    public var use = "Por clasificar"
    public var status = "Sin verificar"
    public var decision = "Pendiente"
    public var notes = ""
    public var amount = ""
    public var currency = ""
    public var cadence = "Sin confirmar"
    public var verifiedOn = ""
    public var evidence = ""
    public var renewal = ""
    public var commitment = ""
    public init() {}
}
public struct Entry: Identifiable {
    public var id: String
    public var service: String
    public var account: String
    public var mailbox: String
    public var channel: String
    public var evidence: [Mail]
    public var amount: Decimal?
    public var currency: String?
    public var cadence: String
    public var renewal: String?
    public var incomplete: Bool
    public var amountFrom: String?
    public var lastSeen: String { String(evidence.first?.date.prefix(10) ?? "") }
    public var portal: URL? {
        switch channel {
        case "Apple": return URL(string: "https://account.apple.com/")
        case "PayPal": return URL(string: "https://www.paypal.com/myaccount/autopay/")
        default:
            if service == "Runway" { return URL(string: "https://app.runwayml.com/") }
            if service == "Todoist" { return URL(string: "https://app.todoist.com/") }
            return nil
        }
    }
}
public struct State: Codable {
    public var schema = 1
    public var audits: [Audit] = []
    public var reviews: [String: Review] = [:]
    public init() {}
    public mutating func merge(_ audit: Audit) throws {
        try Engine.validate(audit)
        // Replace only the same search checkpoint. Preserve other searches and user decisions.
        if let i = audits.firstIndex(where: { $0.account.lowercased() == audit.account.lowercased() && $0.query == audit.query }) {
            var merged = audit
            var byID = Dictionary(audits[i].messages.map { ($0.id, $0) }, uniquingKeysWith: { a,b in b.detail == nil && a.detail != nil ? a : b })
            for message in audit.messages {
                if let old = byID[message.id], message.detail == nil, old.detail != nil { continue }
                byID[message.id] = message
            }
            merged.messages = byID.values.sorted { $0.date > $1.date }
            audits[i] = merged
        } else { audits.append(audit) }
    }
}
public enum Engine {
    public static func capture(_ pattern: String, _ text: String, group: Int = 1) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              group < match.numberOfRanges, let range = Range(match.range(at: group), in: text) else { return nil }
        return String(text[range]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    public static func date(_ value: String) -> Date? {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(secondsFromGMT: 0); f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        guard value.count == 10, let d = f.date(from: value), f.string(from: d) == value else { return nil }; return d
    }
    public static func decimal(_ text: String, currency: String) -> Decimal? {
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: " ", with: "")
        if cleaned.contains(",") { cleaned = cleaned.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".") }
        else if currency == "CLP", cleaned.contains(".") { cleaned = cleaned.replacingOccurrences(of: ".", with: "") }
        guard cleaned.range(of: #"^\d+(\.\d{1,2})?$"#, options: .regularExpression) != nil,
              let value = Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX")), value >= 0, value < 1_000_000_000_000 else { return nil }
        return value
    }
    public static func money(_ value: Decimal, _ currency: String) -> String {
        let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "es_CL"); formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = currency == "CLP" ? 0 : 2; formatter.maximumFractionDigits = 2
        return "\(currency) \(formatter.string(from: NSDecimalNumber(decimal: value)) ?? "—")"
    }
    public static func gmailURL(_ mail: Mail, account: String) -> URL? {
        guard mail.id.range(of: #"^[a-fA-F0-9]{8,40}$"#, options: .regularExpression) != nil,
              account.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil else { return nil }
        var c = URLComponents(string: "https://mail.google.com/mail/u/")!
        c.queryItems = [URLQueryItem(name: "authuser", value: account)]
        c.fragment = "all/" + mail.id
        return c.url
    }
    public static func validate(_ audit: Audit) throws {
        guard audit.schema == 1, audit.account.count <= 254,
              audit.account.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil,
              date(audit.reviewedOn) != nil, audit.messages.count <= 50_000,
              audit.query.count <= 5000, audit.limitation.count <= 10000 else { throw SubError.message("La revisión no tiene un formato válido o excede los límites.") }
        for mail in audit.messages {
            guard !mail.id.isEmpty, mail.id.count <= 200, date(String(mail.date.prefix(10))) != nil,
                  mail.from.count <= 1000, mail.subject.count <= 2000, mail.snippet.count <= 20000,
                  (mail.detail?.count ?? 0) <= 100000 else { throw SubError.message("Un mensaje tiene datos inválidos o demasiado extensos.") }
        }
    }
    public static func validate(_ review: Review) throws {
        guard ["Por clasificar","Personal","Empresa","Mixto","Familiar"].contains(review.use),
              ["Sin verificar","Activa confirmada","Cancelada","Histórica","No es suscripción"].contains(review.status),
              ["Pendiente","Conservar","Reducir plan","Revisar baja","No renovar"].contains(review.decision),
              ["Sin confirmar","Mensual","Anual","Trimestral","Semestral","Semanal","Variable","Único"].contains(review.cadence),
              review.notes.count <= 10000, review.evidence.count <= 4000, review.commitment.count <= 1000 else { throw SubError.message("La revisión tiene campos no válidos.") }
        if !review.amount.isEmpty {
            guard ["CLP","USD","EUR","GBP","UF"].contains(review.currency), decimal(review.amount, currency: review.currency) != nil else { throw SubError.message("Indica moneda e importe válidos. Usa coma decimal: 12,95.") }
        }
        if !review.renewal.isEmpty, date(review.renewal) == nil { throw SubError.message("La fecha de renovación debe ser AAAA-MM-DD.") }
        if review.status != "Sin verificar" {
            guard date(review.verifiedOn) != nil, !review.evidence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw SubError.message("Para confirmar el estado, indica fecha y evidencia de comprobación.") }
        }
    }
    public static func entries(_ state: State) -> [Entry] {
        var messages: [String: (String,Mail)] = [:]
        for audit in state.audits {
            for mail in audit.messages {
                let key = audit.account.lowercased() + "|" + mail.id
                if let old = messages[key], old.1.detail != nil, mail.detail == nil { continue }
                messages[key] = (audit.account.lowercased(),mail)
            }
        }
        var groups: [String: Entry] = [:]
        for (_, pair) in messages {
            let (mailbox, mail) = pair
            let text = mail.text.replacingOccurrences(of: "\u{034f}", with: "")
            let subject = mail.subject.lowercased()
            // A newsletter subscription is not a financial subscription.
            if text.lowercased().contains("newsletter") && !subject.contains("receipt") && !subject.contains("factura") { continue }
            var service: String, account = mailbox, channel = "Directo", incomplete = false
            let sender = mail.from.lowercased()
            if sender.contains("@email.apple.com") {
                channel = "Apple"
                account = capture(#"CUENTA DE APPLE:?\s+([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})"#, text)?.lowercased() ?? "Titular sin identificar"
                let names: [(String,String)] = [("PictureThis","PictureThis"),("Microsoft 365","Microsoft 365"),("YouTube","YouTube"),("Imou Life","Imou Life"),("Transmit","Transmit"),("Todoist","Todoist"),("Meta Verified","Meta Verified"),("iCloud","iCloud"),("Apple Arcade","Apple Arcade"),("Smart TV Mirror","Duplicar Pantalla: Smart TV")]
                service = names.first(where: { text.localizedCaseInsensitiveContains($0.0) })?.1 ?? "Apple · detalle pendiente"
                if names.filter({ text.localizedCaseInsensitiveContains($0.0) }).count > 1 {
                    service = "Apple · varios servicios en un recibo"
                }
                if service == "iCloud", let size = capture(#"iCloud\+ con ([0-9]+\s*(?:GB|TB))"#, text) { service += " " + size }
                incomplete = service.hasPrefix("Apple ·") || account == "Titular sin identificar" || service == "Meta Verified"
            } else if sender.contains("@intl.paypal.com") {
                channel = "PayPal"
                service = capture(#"Recibo de su pago a (.+)"#, mail.subject) ?? capture(#"Pago a (.+?) (?:Nota para|paypal@)"#, text) ?? "PayPal · comercio pendiente"
                incomplete = service.contains("...") || service.contains("pendiente")
            } else if sender.contains("@runwayml.com") { service = "Runway" }
            else if sender.contains("@todoist.com") { service = "Todoist" }
            else {
                service = capture(#"@([A-Z0-9.\-]+)"#, mail.from) ?? "Proveedor sin identificar"
                incomplete = true
            }
            // Never join unknown Apple owners or unresolved merchants into a confirmed service.
            let identity = [channel,service.lowercased(),account,mailbox,channel == "Apple" && service.hasPrefix("Apple ·") ? mail.id : ""].joined(separator: "|")
            let key = SHA256.hash(data: Data(identity.utf8)).map { String(format:"%02x",$0) }.joined()
            var entry = groups[key] ?? Entry(id:key,service:service,account:account,mailbox:mailbox,channel:channel,evidence:[],amount:nil,currency:nil,cadence:"Sin confirmar",renewal:nil,incomplete:incomplete,amountFrom:nil)
            entry.evidence.append(mail); groups[key] = entry
        }
        for key in Array(groups.keys) {
            var entry = groups[key]!
            entry.evidence.sort { $0.date == $1.date ? $0.id > $1.id : $0.date > $1.date }
            // All inferred billing facts come from the newest message; older amounts are not current prices.
            if let recent = entry.evidence.first {
                let text = recent.text
                if let value = capture(#"(?:Ha pagado|Paid|Amount paid)\s*[:\s]*\$?([0-9.,]+)\s*(USD|CLP|EUR|GBP)"#, text),
                   let currency = capture(#"(?:Ha pagado|Paid|Amount paid)\s*[:\s]*\$?[0-9.,]+\s*(USD|CLP|EUR|GBP)"#, text) {
                    entry.amount = decimal(value,currency:currency.uppercased()); entry.currency = currency.uppercased(); entry.amountFrom = recent.id
                }
                if text.localizedCaseInsensitiveContains("(mensual)") { entry.cadence = "Mensual" }
                else if text.localizedCaseInsensitiveContains("(anual)") || text.localizedCaseInsensitiveContains("(1 año)") { entry.cadence = "Anual" }
                if let day = capture(#"Se renovará el (\d{1,2}) de ([a-záéíóú]+) de (\d{4})"#,text),
                   let month = capture(#"Se renovará el (\d{1,2}) de ([a-záéíóú]+) de (\d{4})"#,text,group:2),
                   let year = capture(#"Se renovará el (\d{1,2}) de ([a-záéíóú]+) de (\d{4})"#,text,group:3),
                   let m = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"].firstIndex(of:month.lowercased()), let d = Int(day) {
                    let candidate = String(format:"%@-%02d-%02d",year,m+1,d)
                    if date(candidate) != nil { entry.renewal = candidate }
                }
                if entry.renewal == nil,
                   let day = capture(#"Se renueva el (\d{1,2})/(\d{1,2})/(\d{4})"#,text),
                   let month = capture(#"Se renueva el (\d{1,2})/(\d{1,2})/(\d{4})"#,text,group:2),
                   let year = capture(#"Se renueva el (\d{1,2})/(\d{1,2})/(\d{4})"#,text,group:3),
                   let d = Int(day), let m = Int(month) {
                    let candidate = String(format:"%@-%02d-%02d",year,m,d)
                    if date(candidate) != nil { entry.renewal = candidate }
                }
            }
            groups[key] = entry
        }
        return groups.values.sorted { $0.lastSeen == $1.lastSeen ? $0.service < $1.service : $0.lastSeen > $1.lastSeen }
    }
    public static func monthly(_ review: Review) -> Decimal? {
        guard review.status == "Activa confirmada", let amount = decimal(review.amount,currency:review.currency) else { return nil }
        switch review.cadence {
        case "Mensual": return amount
        case "Anual": return amount / 12
        case "Trimestral": return amount / 3
        case "Semestral": return amount / 6
        case "Semanal": return amount * 52 / 12
        default: return nil
        }
    }
    public static func totals(_ state: State, savingsOnly: Bool = false) -> [String: Decimal] {
        var totals: [String: Decimal] = [:]
        for entry in entries(state) {
            guard let review = state.reviews[entry.id], let amount = monthly(review) else { continue }
            if savingsOnly && !["Revisar baja","No renovar"].contains(review.decision) { continue }
            totals[review.currency,default:0] += amount
        }
        return totals
    }
    public static func csv(_ state: State) -> String {
        func cell(_ raw: String) -> String {
            // Protect spreadsheet formula interpretation when exported text starts with a formula sigil.
            let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            let safe = ["=","+","-","@"].contains(String(text.prefix(1))) ? "'" + raw : raw
            return "\"" + safe.replacingOccurrences(of:"\"",with:"\"\"") + "\""
        }
        var rows = [["Servicio","Titular","Correo receptor","Canal","Uso","Estado confirmado","Decisión","Importe confirmado","Moneda","Frecuencia","Compromiso","Renovación confirmada","Fecha comprobación","Evidencia comprobación","Última evidencia correo","Renovación anunciada correo","Evidencias","Notas"]]
        for e in entries(state) {
            let r = state.reviews[e.id] ?? Review()
            rows.append([e.service,e.account,e.mailbox,e.channel,r.use,r.status,r.decision,r.amount,r.currency,r.cadence,r.commitment,r.renewal,r.verifiedOn,r.evidence,e.lastSeen,e.renewal ?? "",String(e.evidence.count),r.notes])
        }
        return "\u{feff}" + rows.map { $0.map(cell).joined(separator:",") }.joined(separator:"\r\n")
    }
}
public enum Storage {
    public static func safe(_ url: URL) throws {
        var current = url.standardizedFileURL
        while current.path != "/" {
            if (try? FileManager.default.attributesOfItem(atPath:current.path)[.type] as? FileAttributeType) == .typeSymbolicLink {
                if !["/tmp","/var"].contains(current.path) { throw SubError.message("No se admiten enlaces simbólicos en los datos.") }
            }
            current.deleteLastPathComponent()
        }
    }
    public static func read<T: Decodable>(_ type: T.Type, _ url: URL) throws -> T {
        try safe(url)
        let attrs = try FileManager.default.attributesOfItem(atPath:url.path)
        guard attrs[.type] as? FileAttributeType == .typeRegular, (attrs[.size] as? NSNumber)?.intValue ?? Int.max <= 50_000_000 else { throw SubError.message("Selecciona un JSON regular de hasta 50 MB.") }
        return try JSONDecoder().decode(type,from:Data(contentsOf:url))
    }
    public static func load(_ url: URL) throws -> State {
        guard FileManager.default.fileExists(atPath:url.path) else { return State() }
        let state = try read(State.self,url)
        guard state.schema == 1 else { throw SubError.message("Versión de datos no compatible.") }
        for audit in state.audits { try Engine.validate(audit) }
        for review in state.reviews.values { try Engine.validate(review) }
        return state
    }
    public static func save(_ state: State, _ url: URL) throws {
        try safe(url)
        guard state.schema == 1 else { throw SubError.message("Versión de datos no compatible.") }
        for audit in state.audits { try Engine.validate(audit) }
        for review in state.reviews.values { try Engine.validate(review) }
        let folder = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted,.sortedKeys]
        let data = try encoder.encode(state)
        guard data.count <= 50_000_000 else { throw SubError.message("La revisión excede el límite de 50 MB.") }
        if FileManager.default.fileExists(atPath:url.path) {
            let backup = folder.appendingPathComponent("Copias de seguridad")
            try safe(backup)
            try FileManager.default.createDirectory(at:backup,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
            try FileManager.default.copyItem(at:url,to:backup.appendingPathComponent(UUID().uuidString + ".json"))
        }
        try data.write(to:url,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
    }
}
