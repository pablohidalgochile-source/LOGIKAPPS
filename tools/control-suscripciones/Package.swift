// swift-tools-version: 5.10
import PackageDescription
let package = Package(name: "ControlSuscripciones", platforms: [.macOS(.v13)], targets: [
    .target(name: "SubscriptionCore"),
    .executableTarget(name: "ControlSuscripciones", dependencies: ["SubscriptionCore"]),
    .executableTarget(name: "SubscriptionChecks", dependencies: ["SubscriptionCore"], path: "Tests/SubscriptionChecks")
])
