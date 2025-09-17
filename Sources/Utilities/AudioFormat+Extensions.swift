import Foundation
import UniformTypeIdentifiers

extension AudioSettings.AudioFormat {
    var displayName: String {
        switch self {
        case .mp3:
            return "MP3"
        case .wav:
            return "WAV (Lossless)"
        case .aac:
            return "AAC"
        case .flac:
            return "FLAC (Lossless)"
        case .opus:
            return "OGG Opus"
        }
    }

    var fileExtension: String {
        switch self {
        case .aac:
            return "aac"
        case .opus:
            return "ogg"
        default:
            return rawValue
        }
    }

    var contentType: UTType? {
        switch self {
        case .mp3:
            return .mp3
        case .wav:
            return .wav
        case .aac:
            return .aacAudio
        case .flac:
            return .flac
        case .opus:
            return UTType(filenameExtension: "ogg")
        }
    }
}
