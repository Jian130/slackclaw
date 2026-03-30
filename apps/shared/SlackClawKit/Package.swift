// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "SlackClawKit",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .library(name: "SlackClawProtocol", targets: ["SlackClawProtocol"]),
        .library(name: "SlackClawClient", targets: ["SlackClawClient"]),
        .library(name: "SlackClawChatUI", targets: ["SlackClawChatUI"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-testing.git",
            revision: "4b38ab01ee6b5d6ba6d21eaaed60f8e13b3a021d"
        ),
    ],
    targets: [
        .target(
            name: "SlackClawProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .target(
            name: "SlackClawClient",
            dependencies: ["SlackClawProtocol"],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .target(
            name: "SlackClawChatUI",
            dependencies: ["SlackClawProtocol", "SlackClawClient"],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .testTarget(
            name: "SlackClawKitTests",
            dependencies: [
                "SlackClawProtocol",
                "SlackClawClient",
                "SlackClawChatUI",
                .product(name: "Testing", package: "swift-testing"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
    ]
)
