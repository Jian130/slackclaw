import AppKit
import Testing
@testable import SlackClawNative
@testable import SlackClawProtocol

struct ChatPresentationTests {
    @Test
    func chatStatusHelpersMapBridgeAndToolStates() {
        #expect(nativeChatComposerLabel(for: "sending") == "Sending")
        #expect(nativeChatComposerLabel(for: "thinking") == "Thinking")
        #expect(nativeChatComposerLabel(for: "streaming") == "Streaming")
        #expect(nativeChatComposerLabel(for: "aborting") == "Stopping")
        #expect(nativeChatComposerTone(for: "failed") == .danger)
        #expect(nativeChatBridgeLabel(for: .reconnecting) == "Reconnecting")
        #expect(nativeChatBridgeTone(for: .disconnected) == .warning)
        #expect(nativeChatToolActivityLabel(for: .running) == "Running")
        #expect(nativeChatToolActivityTone(for: .completed) == .success)
    }

    @Test
    func composerShortcutHelpersMatchCodexStyleBehavior() {
        #expect(
            nativeChatShouldSendComposerShortcut(
                keyCode: 36,
                modifierFlags: [],
                isComposing: false,
                canSend: true,
                draft: "Send this"
            ) == true
        )
        #expect(
            nativeChatShouldSendComposerShortcut(
                keyCode: 36,
                modifierFlags: [.shift],
                isComposing: false,
                canSend: true,
                draft: "Keep newline"
            ) == false
        )
        #expect(
            nativeChatShouldSendComposerShortcut(
                keyCode: 36,
                modifierFlags: [],
                isComposing: true,
                canSend: true,
                draft: "正在输入"
            ) == false
        )
        #expect(
            nativeChatShouldInsertComposerLineBreak(
                keyCode: 36,
                modifierFlags: [.shift],
                isComposing: false
            ) == true
        )
    }
}
