import CoreGraphics
import Testing
@testable import SlackClawNative

struct UIContractTests {
    @Test
    func deployBadgesMapToSharedBadgeSemantics() {
        #expect(nativeDeployBadgeSemantic(.installed) == .status(.success))
        #expect(nativeDeployBadgeSemantic(.current) == .status(.info))
        #expect(nativeDeployBadgeSemantic(.updateAvailable) == .status(.warning))
        #expect(nativeDeployBadgeSemantic(.recommended) == .tag(.success))
        #expect(nativeDeployBadgeSemantic(.comingSoon) == .tag(.neutral))
    }

    @Test
    func workspaceMetricColumnsFollowSharedBreakpoints() {
        #expect(nativeWorkspaceMetricColumnCount(for: 1400) == 5)
        #expect(nativeWorkspaceMetricColumnCount(for: 1180) == 3)
        #expect(nativeWorkspaceMetricColumnCount(for: 820) == 2)
        #expect(nativeWorkspaceMetricColumnCount(for: 700) == 1)
    }

    @Test
    func operationsSummaryColumnsFollowSharedBreakpoints() {
        #expect(nativeOperationsSummaryColumnCount(for: 1400) == 3)
        #expect(nativeOperationsSummaryColumnCount(for: 980) == 2)
        #expect(nativeOperationsSummaryColumnCount(for: 720) == 1)
    }
}
