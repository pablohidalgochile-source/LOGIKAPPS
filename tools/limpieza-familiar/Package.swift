// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "LimpiezaFamiliar", platforms: [.macOS(.v13)],
    products: [.executable(name: "LimpiezaFamiliar", targets: ["LimpiezaFamiliar"])],
    targets: [
        .target(name: "ArchiveCore"),
        .executableTarget(name: "LimpiezaFamiliar", dependencies: ["ArchiveCore"]),
        .executableTarget(name: "ArchiveCoreChecks", dependencies: ["ArchiveCore"], path: "Tests/ArchiveCoreChecks")
    ]
)
