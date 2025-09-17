import Foundation

class GoogleTTSService: TTSProvider {
    // MARK: - Properties
    var name: String { "Google Cloud TTS" }
    private var apiKey: String?
    private let baseURL = "https://texttospeech.googleapis.com/v1/text:synthesize"
    private let session = URLSession.shared
    
    // MARK: - Default Voice
    var defaultVoice: Voice {
        Voice(
            id: "en-US-Neural2-F",
            name: "Neural2 Female",
            language: "en-US",
            gender: .female,
            provider: .google,
            previewURL: nil
        )
    }
    
    // MARK: - Available Voices
    var availableVoices: [Voice] {
        // Google Cloud TTS has many voices, these are some popular ones
        // In production, you would fetch these from the API
        return [
            // Neural2 voices (highest quality)
            Voice(id: "en-US-Neural2-A", name: "Neural2 Male A", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-C", name: "Neural2 Female C", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-D", name: "Neural2 Male D", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-E", name: "Neural2 Female E", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-F", name: "Neural2 Female F", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-G", name: "Neural2 Female G", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-H", name: "Neural2 Female H", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-I", name: "Neural2 Male I", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Neural2-J", name: "Neural2 Male J", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            
            // WaveNet voices (high quality)
            Voice(id: "en-US-Wavenet-A", name: "WaveNet Male A", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Wavenet-B", name: "WaveNet Male B", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Wavenet-C", name: "WaveNet Female C", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Wavenet-D", name: "WaveNet Male D", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Wavenet-E", name: "WaveNet Female E", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Wavenet-F", name: "WaveNet Female F", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            
            // Standard voices (lower cost)
            Voice(id: "en-US-Standard-A", name: "Standard Male A", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Standard-B", name: "Standard Male B", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Standard-C", name: "Standard Female C", language: "en-US", gender: .female, provider: .google, previewURL: nil),
            Voice(id: "en-US-Standard-D", name: "Standard Male D", language: "en-US", gender: .male, provider: .google, previewURL: nil),
            Voice(id: "en-US-Standard-E", name: "Standard Female E", language: "en-US", gender: .female, provider: .google, previewURL: nil)
        ]
    }
    
    // MARK: - Initialization
    init() {
        // Load API key from keychain if available
        self.apiKey = KeychainManager().getAPIKey(for: "Google")
    }
    
    // MARK: - API Key Management
    func updateAPIKey(_ key: String) {
        self.apiKey = key
    }
    
    func hasValidAPIKey() -> Bool {
        return apiKey != nil && !apiKey!.isEmpty
    }
    
    // MARK: - Speech Synthesis
    func synthesizeSpeech(text: String, voice: Voice, settings: AudioSettings) async throws -> Data {
        guard let apiKey = apiKey, !apiKey.isEmpty else {
            throw TTSError.invalidAPIKey
        }
        
        guard text.count <= 5000 else {
            throw TTSError.textTooLong(5000)
        }
        
        // Prepare URL with API key
        let urlString = "\(baseURL)?key=\(apiKey)"
        guard let url = URL(string: urlString) else {
            throw TTSError.networkError("Invalid URL")
        }
        
        // Prepare request
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Parse voice ID to get language code and name
        let voiceComponents = voice.id.split(separator: "-")
        let languageCode = voiceComponents.prefix(2).joined(separator: "-")
        
        // Determine SSML gender
        let ssmlGender: String
        switch voice.gender {
        case .male:
            ssmlGender = "MALE"
        case .female:
            ssmlGender = "FEMALE"
        default:
            ssmlGender = "NEUTRAL"
        }
        
        // Prepare request body
        let requestBody = GoogleTTSRequest(
            input: InputText(text: text),
            voice: VoiceSelection(
                languageCode: languageCode,
                name: voice.id,
                ssmlGender: ssmlGender
            ),
            audioConfig: AudioConfig(
                audioEncoding: settings.format.googleFormat,
                speakingRate: settings.speed,
                pitch: settings.pitch,
                volumeGainDb: convertVolumeToDb(settings.volume),
                sampleRateHertz: settings.sampleRate
            )
        )
        
        request.httpBody = try JSONEncoder().encode(requestBody)
        
        // Make request
        do {
            let (data, response) = try await session.data(for: request)
            
            // Check response
            if let httpResponse = response as? HTTPURLResponse {
                switch httpResponse.statusCode {
                case 200:
                    // Parse response to get audio content
                    let ttsResponse = try JSONDecoder().decode(GoogleTTSResponse.self, from: data)
                    
                    // Decode base64 audio content
                    guard let audioData = Data(base64Encoded: ttsResponse.audioContent) else {
                        throw TTSError.apiError("Failed to decode audio content")
                    }
                    
                    return audioData
                case 400:
                    if let errorData = try? JSONDecoder().decode(GoogleError.self, from: data) {
                        throw TTSError.apiError(errorData.error.message)
                    }
                    throw TTSError.apiError("Bad request")
                case 401, 403:
                    throw TTSError.invalidAPIKey
                case 429:
                    throw TTSError.quotaExceeded
                case 400...499:
                    if let errorData = try? JSONDecoder().decode(GoogleError.self, from: data) {
                        throw TTSError.apiError(errorData.error.message)
                    }
                    throw TTSError.apiError("Client error: \(httpResponse.statusCode)")
                case 500...599:
                    throw TTSError.apiError("Server error: \(httpResponse.statusCode)")
                default:
                    throw TTSError.apiError("Unexpected response: \(httpResponse.statusCode)")
                }
            }
            
            throw TTSError.networkError("Invalid response")
        } catch let error as TTSError {
            throw error
        } catch {
            throw TTSError.networkError(error.localizedDescription)
        }
    }
    
    // MARK: - Helper Methods
    private func convertVolumeToDb(_ volume: Double) -> Double {
        // Convert 0-1 volume to -96 to 16 dB range
        // 0.5 = 0 dB (normal volume)
        if volume <= 0 {
            return -96.0
        } else if volume >= 1 {
            return 16.0
        } else {
            // Logarithmic scale conversion
            let db = 20 * log10(volume * 2)
            return max(-96, min(16, db))
        }
    }
}

// MARK: - Request/Response Models
private struct GoogleTTSRequest: Codable {
    let input: InputText
    let voice: VoiceSelection
    let audioConfig: AudioConfig
}

private struct InputText: Codable {
    let text: String
}

private struct VoiceSelection: Codable {
    let languageCode: String
    let name: String
    let ssmlGender: String
}

private struct AudioConfig: Codable {
    let audioEncoding: String
    let speakingRate: Double
    let pitch: Double
    let volumeGainDb: Double
    let sampleRateHertz: Int
}

private struct GoogleTTSResponse: Codable {
    let audioContent: String
}

private struct GoogleError: Codable {
    let error: GoogleErrorDetail
}

private struct GoogleErrorDetail: Codable {
    let code: Int
    let message: String
    let status: String?
}

// MARK: - Format Extensions
private extension AudioSettings.AudioFormat {
    var googleFormat: String {
        switch self {
        case .mp3:
            return "MP3"
        case .wav:
            return "LINEAR16"
        case .opus:
            return "OGG_OPUS"
        case .aac:
            return "MP3"  // Google doesn't support AAC directly, use MP3
        case .flac:
            return "MP3"  // Google doesn't support FLAC directly, use MP3
        }
    }
}

// MARK: - Voice Extensions
extension Voice {
    static var googleVoices: [Voice] {
        return [
            // Neural2 voices
            Voice(
                id: "en-US-Neural2-A",
                name: "Neural2 Male A",
                language: "en-US",
                gender: .male,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Neural2-C",
                name: "Neural2 Female C",
                language: "en-US",
                gender: .female,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Neural2-D",
                name: "Neural2 Male D",
                language: "en-US",
                gender: .male,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Neural2-E",
                name: "Neural2 Female E",
                language: "en-US",
                gender: .female,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Neural2-F",
                name: "Neural2 Female F",
                language: "en-US",
                gender: .female,
                provider: .google,
                previewURL: nil
            ),
            
            // WaveNet voices
            Voice(
                id: "en-US-Wavenet-A",
                name: "WaveNet Male A",
                language: "en-US",
                gender: .male,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Wavenet-C",
                name: "WaveNet Female C",
                language: "en-US",
                gender: .female,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Wavenet-D",
                name: "WaveNet Male D",
                language: "en-US",
                gender: .male,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Wavenet-E",
                name: "WaveNet Female E",
                language: "en-US",
                gender: .female,
                provider: .google,
                previewURL: nil
            ),
            Voice(
                id: "en-US-Wavenet-F",
                name: "WaveNet Female F",
                language: "en-US",
                gender: .female,
                provider: .google,
                previewURL: nil
            )
        ]
    }
}