// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TrackHuntAssistant", platforms: [.macOS(.v13)],
    products: [.executable(name: "TrackHuntAssistant", targets: ["TrackHuntAssistant"])],
    targets: [
        .target(name: "ScanCore"),
        .executableTarget(name: "TrackHuntAssistant", dependencies: ["ScanCore"]),
        .executableTarget(name: "ScanCoreChecks", dependencies: ["ScanCore"], path: "Checks/Core")
    ]
)
