import Foundation

@MainActor
protocol TranscriptInsightsServicing {
    func generateInsights(for transcript: String) async throws -> TranscriptionSummaryBlock
}

@MainActor
final class TranscriptInsightsService: TranscriptInsightsServicing {
    private let session: URLSession
    private let keychain: KeychainManager
    private let managedProvisioningClient: ManagedProvisioningClient
    private var activeManagedCredential: ManagedCredential?
    private let endpoint = URL(string: "https://api.openai.com/v1/responses")!
    private let model = "gpt-4o-mini"

    init(session: URLSession = SecureURLSession.makeEphemeral(),
         keychain: KeychainManager = KeychainManager(),
         managedProvisioningClient: ManagedProvisioningClient = .shared) {
        self.session = session
        self.keychain = keychain
        self.managedProvisioningClient = managedProvisioningClient
    }

    func generateInsights(for transcript: String) async throws -> TranscriptionSummaryBlock {
        guard !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return TranscriptionSummaryBlock(summary: "", actionItems: [], scheduleRecommendation: nil)
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let authorization = try await authorizationHeader()
        request.setValue(authorization.value, forHTTPHeaderField: authorization.header)
        request.timeoutInterval = 45

        let prompt = Self.transcriptInsightPrompt
        let body = ResponsesRequest(
            model: model,
            instructions: prompt.system,
            input: String(transcript.prefix(8_000)),
            temperature: 0.2,
            text: .jsonObject
        )

        request.httpBody = try JSONEncoder().encode(body)

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw TTSError.networkError("Invalid response")
            }

            switch httpResponse.statusCode {
            case 200:
                let decoded = try JSONDecoder().decode(ResponsesPayload.self, from: data)
                guard let content = decoded.textOutput,
                      let payloadData = content.data(using: .utf8) else {
                    throw TTSError.apiError("Transcript insight response missing content")
                }
                let payload = try JSONDecoder().decode(TranscriptInsightsPayload.self, from: payloadData)

                let actions = payload.actionItems?.compactMap { item -> TranscriptionSummaryAction? in
                    let trimmed = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { return nil }
                    return TranscriptionSummaryAction(text: trimmed,
                                                      ownerHint: item.ownerHint?.nilIfEmpty,
                                                      dueDateHint: item.dueDateHint?.nilIfEmpty)
                } ?? []

                let schedule: TranscriptionScheduleRecommendation?
                if let candidate = payload.scheduleRecommendation,
                   let title = candidate.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
                    schedule = TranscriptionScheduleRecommendation(
                        title: title,
                        startWindow: candidate.startWindow?.nilIfEmpty,
                        durationMinutes: candidate.durationMinutes,
                        participants: candidate.participants?.nilIfEmpty
                    )
                } else {
                    schedule = nil
                }

                return TranscriptionSummaryBlock(
                    summary: payload.summary?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
                    actionItems: actions,
                    scheduleRecommendation: schedule
                )
            case 401:
                if authorization.usedManagedCredential {
                    managedProvisioningClient.invalidateCredential(for: .openAI)
                    activeManagedCredential = nil
                }
                throw TTSError.invalidAPIKey
            case 429:
                throw TTSError.quotaExceeded
            case 400...499:
                throw TTSError.apiError("Transcript insights request failed (\(httpResponse.statusCode))")
            case 500...599:
                throw TTSError.apiError("Transcript insights service unavailable (\(httpResponse.statusCode))")
            default:
                throw TTSError.apiError("Unexpected response: \(httpResponse.statusCode)")
            }
        } catch let error as TTSError {
            throw error
        } catch {
            throw TTSError.networkError(error.localizedDescription)
        }
    }
}

private extension TranscriptInsightsService {
    struct AuthorizationHeader {
        let header: String
        let value: String
        let usedManagedCredential: Bool
    }

    func authorizationHeader() async throws -> AuthorizationHeader {
        if let key = keychain.getAPIKey(for: "OpenAI"), !key.isEmpty {
            return AuthorizationHeader(header: "Authorization", value: "Bearer \(key)", usedManagedCredential: false)
        }

        guard let credential = try await managedProvisioningClient.credential(for: .openAI) else {
            throw TTSError.invalidAPIKey
        }
        activeManagedCredential = credential
        return AuthorizationHeader(header: "Authorization", value: "Bearer \(credential.token)", usedManagedCredential: true)
    }

    struct ResponsesRequest: Codable {
        let model: String
        let instructions: String
        let input: String
        let temperature: Double
        let text: TextConfiguration

        struct TextConfiguration: Codable {
            struct Format: Codable {
                let type: String
            }

            let format: Format

            static let jsonObject = TextConfiguration(format: .init(type: "json_object"))
        }
    }

    struct ResponsesPayload: Codable {
        struct OutputItem: Codable {
            struct Content: Codable {
                let type: String?
                let text: String?
            }

            let content: [Content]?
        }

        let outputText: String?
        let output: [OutputItem]?

        var textOutput: String? {
            if let outputText {
                return outputText
            }
            return output?
                .flatMap { $0.content ?? [] }
                .first(where: { $0.type == "output_text" && $0.text != nil })?
                .text
        }

        enum CodingKeys: String, CodingKey {
            case outputText = "output_text"
            case output
        }
    }

    struct TranscriptInsightsPayload: Codable {
        struct ActionItem: Codable {
            let text: String
            let ownerHint: String?
            let dueDateHint: String?

            enum CodingKeys: String, CodingKey {
                case text
                case ownerHint = "ownerHint"
                case dueDateHint = "dueDateHint"
            }
        }

        struct Schedule: Codable {
            let title: String?
            let startWindow: String?
            let durationMinutes: Int?
            let participants: [String]?
        }

        let summary: String?
        let actionItems: [ActionItem]?
        let scheduleRecommendation: Schedule?
    }

    struct Prompt {
        let system: String
    }

    static var transcriptInsightPrompt: Prompt {
        Prompt(system: """
You are an assistant that analyses meetings, dispatch logs, and interview transcripts. Return a minified JSON object with this exact shape:
{
  \"summary\": string,
  \"actionItems\": Array<{ \"text\": string, \"ownerHint\"?: string, \"dueDateHint\"?: string }>,
  \"scheduleRecommendation\": { \"title\": string, \"startWindow\"?: string, \"durationMinutes\"?: number, \"participants\"?: string[] } | null
}
Keep actionItems to at most 5. Leave optional fields null or omit them if unknown.
""")
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension Array where Element == String {
    var nilIfEmpty: [String]? {
        let trimmed = map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return trimmed.isEmpty ? nil : trimmed
    }
}
