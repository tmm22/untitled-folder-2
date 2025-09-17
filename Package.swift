// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TextToSpeechApp",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "TextToSpeechApp",
            targets: ["TextToSpeechApp"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/kishikawakatsumi/KeychainAccess.git", from: "4.2.2")
    ],
    targets: [
        .executableTarget(
            name: "TextToSpeechApp",
            dependencies: ["KeychainAccess"],
            path: "Sources"
        ),
        .testTarget(
            name: "TextToSpeechAppTests",
            dependencies: ["TextToSpeechApp"],
            path: "Tests"
        )
    ]
)