import AppKit
import Testing
@testable import ChillClawNative

struct LaunchSupportTests {
    @Test
    @MainActor
    func launchCoordinatorActivatesForegroundAppAndFrontsWindow() {
        let app = FakeNativeApplication()

        NativeLaunchCoordinator.configure(app)

        #expect(app.activationPolicies == [.regular])
        #expect(app.activateCalls == [true])
        #expect(app.firstWindowVisibleCalls == 1)
        #expect(app.minimumSizes == [nativeOnboardingMinimumWindowSize])
    }
}

private final class FakeNativeApplication: NativeApplicationControlling {
    var activationPolicies: [NSApplication.ActivationPolicy] = []
    var activateCalls: [Bool] = []
    var firstWindowVisibleCalls = 0
    var minimumSizes: [CGSize] = []

    @discardableResult
    func setActivationPolicy(_ activationPolicy: NSApplication.ActivationPolicy) -> Bool {
        activationPolicies.append(activationPolicy)
        return true
    }

    func activate(ignoringOtherApps flag: Bool) {
        activateCalls.append(flag)
    }

    func makeFirstWindowVisible(minimumSize: CGSize) {
        minimumSizes.append(minimumSize)
        firstWindowVisibleCalls += 1
    }
}
