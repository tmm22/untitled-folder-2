import Foundation

struct CostEstimate: Equatable {
    let summary: String
    let detail: String?
}

struct ProviderCostProfile {
    let provider: TTSProviderType
    let freeTierChars: Int?
    let pricePerMillionCharsUSD: Double?
    let detail: String

    func estimate(for characters: Int) -> CostEstimate {
        guard characters > 0 else {
            return CostEstimate(summary: "Enter text to see an estimated cost.", detail: detail)
        }

        let trimmedDetail = detail

        guard let rate = pricePerMillionCharsUSD else {
            return CostEstimate(summary: trimmedDetail, detail: nil)
        }

        let freeTier = freeTierChars ?? 0
        let billableCharacters = max(characters - freeTier, 0)
        let cost = Double(billableCharacters) * rate / 1_000_000.0
        let formattedCost = ProviderCostProfile.currencyFormatter.string(from: NSNumber(value: cost)) ?? "$0.00"

        if billableCharacters == 0, freeTier > 0 {
            let freeText = ProviderCostProfile.countFormatter.string(from: NSNumber(value: freeTier)) ?? "\(freeTier)"
            return CostEstimate(
                summary: "≈$0.00 (within \(freeText) character free tier)",
                detail: trimmedDetail
            )
        }

        if cost < 0.005 {
            return CostEstimate(
                summary: "< \(ProviderCostProfile.currencyFormatter.string(from: 0.01) ?? "$0.01") estimated for this generation",
                detail: ProviderCostProfile.billableDetail(characters: billableCharacters, baseDetail: trimmedDetail, freeTier: freeTier)
            )
        }

        return CostEstimate(
            summary: "≈\(formattedCost) for this generation",
            detail: ProviderCostProfile.billableDetail(characters: billableCharacters, baseDetail: trimmedDetail, freeTier: freeTier)
        )
    }

    private static func billableDetail(characters: Int, baseDetail: String, freeTier: Int) -> String? {
        let formattedCharacters = countFormatter.string(from: NSNumber(value: characters)) ?? "\(characters)"
        guard characters > 0 else { return baseDetail }

        if freeTier > 0 {
            return "\(baseDetail) This run estimates \(formattedCharacters) billable characters after the free tier."
        }

        return "\(baseDetail) This run estimates \(formattedCharacters) billable characters."
    }
}

extension ProviderCostProfile {
    static func profile(for provider: TTSProviderType) -> ProviderCostProfile {
        switch provider {
        case .openAI:
            return ProviderCostProfile(
                provider: provider,
                freeTierChars: nil,
                pricePerMillionCharsUSD: 15.0,
                detail: "OpenAI tts-1 pricing at $15 per 1M characters (≈$0.015 per 1K)."
            )
        case .google:
            return ProviderCostProfile(
                provider: provider,
                freeTierChars: 1_000_000,
                pricePerMillionCharsUSD: 4.0,
                detail: "Google Cloud standard voices include 1M free characters/month, then ~$4 per additional 1M."
            )
        case .elevenLabs:
            return ProviderCostProfile(
                provider: provider,
                freeTierChars: 10_000,
                pricePerMillionCharsUSD: 50.0,
                detail: "ElevenLabs Creator plan includes 10K characters/month; additional usage billed at about $5 per 100K."
            )
        }
    }

    static var currencyFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale(identifier: "en_US")
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter
    }()

    static var countFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = ","
        formatter.maximumFractionDigits = 0
        return formatter
    }()
}

private extension NumberFormatter {
    func string(from value: Double) -> String? {
        return string(from: NSNumber(value: value))
    }
}
