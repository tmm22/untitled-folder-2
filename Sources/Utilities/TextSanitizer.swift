import Foundation

struct TextSanitizer {
    static func cleanImportedText(_ text: String) -> String {
        let newlineNormalized = text.replacingOccurrences(of: "\r", with: "\n")
        let rawLines = newlineNormalized.components(separatedBy: CharacterSet.newlines)

        let boilerplateKeywords: Set<String> = [
            "skip to content",
            "skip content",
            "main menu",
            "menu",
            "search",
            "search website",
            "navigation",
            "site navigation",
            "footer navigation",
            "header navigation",
            "sign in",
            "sign up",
            "log in",
            "log out",
            "account",
            "subscribe",
            "newsletter",
            "share",
            "share this",
            "follow",
            "advertisement",
            "advertising",
            "cookie policy",
            "privacy policy",
            "terms of use",
            "read more",
            "related articles",
            "recent posts",
            "trending",
            "latest",
            "home"
        ]

        let filtered = rawLines.compactMap { line -> String? in
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }

            let lower = trimmed.lowercased()

            if lower.count <= 35 && boilerplateKeywords.contains(lower) {
                return nil
            }

            if lower.contains("skip to") && lower.count <= 50 {
                return nil
            }

            if lower.contains("menu") && lower.count <= 60 {
                return nil
            }

            if lower.contains("sign") && lower.count <= 40 {
                return nil
            }

            if lower.contains("search") && lower.count <= 40 {
                return nil
            }

            if lower.contains("cookie") || lower.contains("privacy") {
                return nil
            }

            if lower.contains("newsletter") || lower.contains("subscribe") {
                return nil
            }

            if lower.contains("advert") {
                return nil
            }

            return trimmed
        }

        let joined = filtered.joined(separator: " ")
        let condensed = joined.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return condensed.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
