import Foundation

public enum ImportScope: String, CaseIterable {
    case sample = "Prueba pequeña"
    case all = "Todo lo accesible"
}

public struct ImportItem {
    public let index: Int
    public let path: String
    public let bytes: Int64
    public init(index: Int, path: String, bytes: Int64) {
        self.index = index; self.path = path; self.bytes = bytes
    }
    var group: String { (path as NSString).deletingPathExtension.lowercased() }
}

/// Pure planning logic: does not access the phone or change files.
public struct ImportPlan {
    public let items: [ImportItem]
    public let knownBytes: Int64
    public let unknownSizes: Int
    public let reserveBytes: Int64
    public let requiredBytes: Int64

    public init(catalog: [ImportItem], scope: ImportScope) throws {
        if scope == .sample {
            // Choose small groups, retaining same-stem Live Photo / editing companions.
            let groups = Dictionary(grouping: catalog, by: \.group)
            func cost(_ values: [ImportItem]) -> Int64 {
                values.reduce(Int64(0)) { sum, item in
                    guard item.bytes > 0 else { return Int64.max }
                    let (value, overflow) = sum.addingReportingOverflow(item.bytes)
                    return overflow ? Int64.max : value
                }
            }
            let keys = groups.keys.sorted {
                let a = cost(groups[$0]!), b = cost(groups[$1]!)
                return a == b ? $0 < $1 : a < b
            }
            let chosen = Set(keys.prefix(20))
            items = catalog.filter { chosen.contains($0.group) }
        } else { items = catalog }
        var sum: Int64 = 0
        for item in items where item.bytes > 0 {
            let (value, overflow) = sum.addingReportingOverflow(item.bytes)
            guard !overflow else { throw ArchiveError.message("El catálogo anuncia un tamaño fuera del rango admitido.") }
            sum = value
        }
        knownBytes = sum
        unknownSizes = items.filter { $0.bytes <= 0 }.count
        reserveBytes = max(512 * 1_024 * 1_024, sum / 10)
        let (required, overflow) = sum.addingReportingOverflow(reserveBytes)
        guard !overflow else { throw ArchiveError.message("No se pudo estimar el espacio necesario.") }
        requiredBytes = required
    }

    public func checkSpace(available: Int64) throws {
        guard available >= requiredBytes else {
            let required = ByteCountFormatter.string(fromByteCount: requiredBytes, countStyle: .file)
            let free = ByteCountFormatter.string(fromByteCount: max(0, available), countStyle: .file)
            throw ArchiveError.message("Espacio insuficiente: este lote necesita al menos \(required), incluido un margen de trabajo. Hay \(free) libres. Elige otro disco o la prueba pequeña.")
        }
    }
}
