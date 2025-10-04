import Foundation

final class OpenAISummarizationService: TextSummarizationService {
    private let session: URLSession
    private let keychain: KeychainManager
    private let endpoint = URL(string: "https://api.openai.com/v1/chat/completions")!
    private let model = "gpt-4o-mini"

    init(session: URLSession = SecureURLSession.makeEphemeral(), keychain: KeychainManager = KeychainManager()) {
        self.session = session
        self.keychain = keychain
    }

    func hasCredentials() -> Bool {
        guard let key = keychain.getAPIKey(for: "OpenAI") else { return false }
        return !key.isEmpty
    }

    func summarize(text: String, sourceURL: URL?) async throws -> SummarizationResult {
        guard let apiKey = keychain.getAPIKey(for: "OpenAI"), !apiKey.isEmpty else {
            throw TTSError.invalidAPIKey
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 45

        let articleSnippet = text.prefix(6_000)
        let sourceClause = sourceURL.map { "Source URL: \($0.absoluteString)" } ?? ""
        let prompt = """
        You are helping a narrator prepare spoken audio from an article. Extract the core article prose, discarding navigation, headers, footers, cookie notices, bylines, or reader comments. Then produce a tight two-to-three sentence summary that captures the key takeaway as it should be spoken aloud.

        Respond only with JSON matching the schema {"conciseArticle":"<full cleaned text>","summary":"<2-3 sentence spoken summary>"}.
        - Keep `conciseArticle` as readable paragraphs ready for TTS (no headings, bullet markers, or attribution boilerplate).
        - Never include legal disclaimers or call-to-action language unless it is critical to the article.
        - The `summary` must be at most three sentences intended to be spoken verbatim.
        - Do not add explanations outside the JSON.

        \(sourceClause)
        <article>
        \(articleSnippet)
        </article>
        """

        let body = ChatCompletionRequest(
            model: model,
            messages: [
                .init(role: "system", content: "You generate cleaned narration scripts and concise spoken summaries. Respond strictly with the requested JSON."),
                .init(role: "user", content: prompt)
            ],
            temperature: 0.2,
            responseFormat: .init(type: "json_object")
        )

        request.httpBody = try JSONEncoder().encode(body)

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw TTSError.networkError("Invalid response")
            }

            switch httpResponse.statusCode {
            case 200:
                let decoded = try JSONDecoder().decode(ChatCompletionResponse.self, from: data)
                guard let content = decoded.choices.first?.message.content,
                      let payloadData = content.data(using: .utf8) else {
                    throw TTSError.apiError("Summarization response missing content")
                }

                let payload = try JSONDecoder().decode(SummarizationPayload.self, from: payloadData)
                return SummarizationResult(
                    condensedArticle: payload.conciseArticle,
                    summary: payload.summary
                )
            case 401:
                throw TTSError.invalidAPIKey
            case 429:
                throw TTSError.quotaExceeded
            case 400...499:
                throw TTSError.apiError("Summarization request failed (\(httpResponse.statusCode))")
            case 500...599:
                throw TTSError.apiError("Summarization service unavailable (\(httpResponse.statusCode))")
            default:
                throw TTSError.apiError("Unexpected summarization response: \(httpResponse.statusCode)")
            }
        } catch let error as TTSError {
            throw error
        } catch {
            throw TTSError.networkError(error.localizedDescription)
        }
    }
}

private struct ChatCompletionRequest: Codable {
    let model: String
    let messages: [ChatMessage]
    let temperature: Double
    let responseFormat: ResponseFormat

    struct ChatMessage: Codable {
        let role: String
        let content: String
    }

    struct ResponseFormat: Codable {
        let type: String

        enum CodingKeys: String, CodingKey {
            case type
        }
    }

    enum CodingKeys: String, CodingKey {
        case model
        case messages
        case temperature
        case responseFormat = "response_format"
    }
}

private struct ChatCompletionResponse: Codable {
    struct Choice: Codable {
        let message: ChatCompletionRequest.ChatMessage
    }

    let choices: [Choice]
}

private struct SummarizationPayload: Codable {
    let conciseArticle: String
    let summary: String

    enum CodingKeys: String, CodingKey {
        case conciseArticle = "conciseArticle"
        case summary
    }
}
