import Testing
@testable import ChillClawNative
@testable import ChillClawProtocol

struct SettingsPresentationTests {
    @Test
    func nativeSettingsUpdatePresentationSurfacesInstallerDownload() {
        let presentation = makeNativeAppUpdatePresentation(
            status: .init(
                status: "update-available",
                supported: true,
                currentVersion: "0.1.2",
                latestVersion: "0.1.4",
                downloadUrl: "https://github.com/Jian130/chillclaw/releases/download/v0.1.4/ChillClaw-macOS.pkg",
                releaseUrl: "https://github.com/Jian130/chillclaw/releases/tag/v0.1.4",
                publishedAt: "2026-04-04T10:00:00.000Z",
                checkedAt: "2026-04-04T11:00:00.000Z",
                summary: "ChillClaw 0.1.4 is available.",
                detail: "Download the latest signed installer."
            )
        )

        #expect(presentation.badge == "Update Available")
        #expect(presentation.primaryActionTitle == "Download 0.1.4")
        #expect(presentation.downloadURL?.absoluteString.hasSuffix("ChillClaw-macOS.pkg") == true)
    }
}
