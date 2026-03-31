// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "ChillClawNative",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "ChillClawNative", targets: ["ChillClawNative"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-testing.git",
            revision: "4b38ab01ee6b5d6ba6d21eaaed60f8e13b3a021d"
        ),
        .package(path: "../shared/ChillClawKit"),
    ],
    targets: [
        .executableTarget(
            name: "ChillClawNative",
            dependencies: [
                .product(name: "ChillClawProtocol", package: "ChillClawKit"),
                .product(name: "ChillClawClient", package: "ChillClawKit"),
                .product(name: "ChillClawChatUI", package: "ChillClawKit"),
            ],
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .testTarget(
            name: "ChillClawNativeTests",
            dependencies: [
                "ChillClawNative",
                .product(name: "Testing", package: "swift-testing"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
    ]
)
