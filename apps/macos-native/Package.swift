// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "SlackClawNative",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "SlackClawNative", targets: ["SlackClawNative"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-testing.git",
            revision: "4b38ab01ee6b5d6ba6d21eaaed60f8e13b3a021d"
        ),
        .package(path: "../shared/SlackClawKit"),
    ],
    targets: [
        .executableTarget(
            name: "SlackClawNative",
            dependencies: [
                .product(name: "SlackClawProtocol", package: "SlackClawKit"),
                .product(name: "SlackClawClient", package: "SlackClawKit"),
                .product(name: "SlackClawChatUI", package: "SlackClawKit"),
            ],
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .testTarget(
            name: "SlackClawNativeTests",
            dependencies: [
                "SlackClawNative",
                .product(name: "Testing", package: "swift-testing"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
    ]
)
