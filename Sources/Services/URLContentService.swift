import Foundation

protocol URLContentLoading {
    func fetchPlainText(from url: URL) async throws -> String
}

struct URLContentService: URLContentLoading {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchPlainText(from url: URL) async throws -> String {
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        let (data, response) = try await session.data(for: request)

        if let httpResponse = response as? HTTPURLResponse,
           !(200...299).contains(httpResponse.statusCode) {
            throw URLError(.badServerResponse)
        }

        guard !data.isEmpty else {
            throw URLError(.zeroByteResource)
        }

        let encodingName = (response as? HTTPURLResponse)?.textEncodingName
        let encoding = encodingName.flatMap { CFStringConvertIANACharSetNameToEncoding($0 as CFString) }
            .flatMap { String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding($0)) }

        let rawHTML = String(data: data, encoding: encoding ?? .utf8) ?? String(decoding: data, as: UTF8.self)

        if let attributed = try? NSAttributedString(
            data: Data(rawHTML.utf8),
            options: [
                .documentType: NSAttributedString.DocumentType.html,
                .characterEncoding: String.Encoding.utf8.rawValue
            ],
            documentAttributes: nil
        ) {
            return attributed.string
        } else {
            return rawHTML
        }
    }
}
