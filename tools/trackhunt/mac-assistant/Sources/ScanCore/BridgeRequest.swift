import Foundation

public struct BridgeRequest {
    public var method: String
    public var path: String
    public var headers: [String: String]
    public var body: Data
    public enum ParseError: Error { case invalid }
    public static func parse(_ data: Data) throws -> BridgeRequest? {
        guard data.count <= 1_208_192 else { throw ParseError.invalid }
        guard let delimiter = data.range(of: Data("\r\n\r\n".utf8)) else {
            if data.count > 8192 { throw ParseError.invalid }; return nil
        }
        guard delimiter.lowerBound <= 8192,
              let head = String(data: data[..<delimiter.lowerBound], encoding: .utf8) else { throw ParseError.invalid }
        let lines = head.components(separatedBy: "\r\n")
        let requestLine = lines[0].split(separator: " ")
        guard requestLine.count == 3, requestLine[2] == "HTTP/1.1" else { throw ParseError.invalid }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let separator = line.firstIndex(of: ":"), !line.hasPrefix(" "), !line.hasPrefix("\t") else { throw ParseError.invalid }
            let key = line[..<separator].lowercased()
            guard headers[key] == nil else { throw ParseError.invalid }
            headers[key] = line[line.index(after: separator)...].trimmingCharacters(in: .whitespaces)
        }
        guard headers["transfer-encoding"] == nil,
              let length = Int(headers["content-length"] ?? "0"), length >= 0, length <= (requestLine[1] == "/v1/browser/fragment" ? 1_200_000 : (requestLine[1] == "/v1/browser/restore" ? 512_000 : 4096)) else { throw ParseError.invalid }
        let body = Data(data[delimiter.upperBound...])
        if body.count < length { return nil }
        guard body.count == length else { throw ParseError.invalid }
        return BridgeRequest(method: String(requestLine[0]), path: String(requestLine[1]), headers: headers, body: body)
    }
}
