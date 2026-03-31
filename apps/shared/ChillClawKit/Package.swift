// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "ChillClawKit",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "ChillClawProtocol", targets: ["ChillClawProtocol"]),
        .library(name: "ChillClawClient", targets: ["ChillClawClient"]),
        .library(name: "ChillClawChatUI", targets: ["ChillClawChatUI"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-testing.git",
            revision: "4b38ab01ee6b5d6ba6d21eaaed60f8e13b3a021d"
        ),
    ],
    targets: [
        .target(
            name: "ChillClawProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .target(
            name: "ChillClawClient",
            dependencies: ["ChillClawProtocol"],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .target(
            name: "ChillClawChatUI",
            dependencies: ["ChillClawProtocol", "ChillClawClient"],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .testTarget(
            name: "ChillClawKitTests",
            dependencies: [
                "ChillClawProtocol",
                "ChillClawClient",
                "ChillClawChatUI",
                .product(name: "Testing", package: "swift-testing"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
    ]
)
