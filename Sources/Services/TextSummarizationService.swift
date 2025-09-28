import Foundation

struct SummarizationResult: Equatable {
    let condensedArticle: String
    let summary: String
}

protocol TextSummarizationService {
    func hasCredentials() -> Bool
    func summarize(text: String, sourceURL: URL?) async throws -> SummarizationResult
}
