import AppKit
import SwiftUI
import ChillClawClient
import ChillClawProtocol
import ChillClawChatUI

private struct DashboardEmployeeCard: View {
    let row: NativeDashboardEmployeeRow

    var body: some View {
        SurfaceCard(tone: .muted, padding: 18, spacing: 12) {
            HStack(alignment: .center, spacing: 16) {
                AvatarView(avatar: row.avatar, name: row.name, size: 72)

                VStack(alignment: .leading, spacing: 8) {
                    Text(row.name)
                        .font(.headline)
                        .fontWeight(.semibold)
                    Text(row.jobTitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        StatusBadge(row.status, tone: nativeStatusTone(from: row.statusTone))
                        if row.activeTaskCount > 0 {
                            StatusBadge(row.activeTaskLabel, tone: .neutral)
                        }
                    }
                }

                Spacer(minLength: 0)
            }

            Text(row.currentStatus)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct DashboardActivityCard: View {
    let row: NativeDashboardActivityRow

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(activityColor)
                Text(String(row.memberName.prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 4) {
                Text(row.action)
                    .fontWeight(.semibold)
                Text(row.description)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Text("\(row.memberName) · \(row.timestamp)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }

    private var activityColor: Color {
        switch row.tone {
        case .success:
            return .green
        case .warning:
            return .orange
        case .info:
            return .blue
        case .neutral:
            return .purple
        }
    }
}

private struct DashboardHealthRow: View {
    let item: NativeDashboardHealthItem

    var body: some View {
        HStack {
            Text(item.title)
                .fontWeight(.semibold)
            Spacer()
            StatusBadge(item.status, tone: nativeStatusTone(from: item.tone))
        }
        .padding(.vertical, 2)
    }
}

struct DashboardScreen: View {
    @Bindable var appState: ChillClawAppState
    @AppStorage(nativeOnboardingLocaleDefaultsKey) private var selectedLocaleIdentifier = resolveNativeOnboardingLocaleIdentifier()

    var body: some View {
        GeometryReader { geometry in
            if let overview = appState.overview {
                let localeIdentifier = resolveNativeOnboardingLocaleIdentifier(selectedLocaleIdentifier)
                let presentation = makeDashboardPresentation(
                    overview: overview,
                    modelConfig: appState.modelConfig,
                    aiTeamOverview: appState.aiTeamOverview,
                    localeIdentifier: localeIdentifier
                )

                dashboardContent(
                    overview: overview,
                    presentation: presentation,
                    availableWidth: geometry.size.width,
                    localeIdentifier: localeIdentifier
                )
            } else {
                WorkspaceScaffold(
                    title: nativeDashboardCopy(localeIdentifier: resolveNativeOnboardingLocaleIdentifier(selectedLocaleIdentifier)).dashboardTitle,
                    subtitle: nativeDashboardCopy(localeIdentifier: resolveNativeOnboardingLocaleIdentifier(selectedLocaleIdentifier)).dashboardSubtitle,
                    contentWidth: nativeDashboardContentWidth
                ) {
                    LoadingState(title: "Loading dashboard", description: "ChillClaw is gathering runtime, model, and team health data.")
                }
            }
        }
    }

    @ViewBuilder
    private func dashboardContent(
        overview: ProductOverview,
        presentation: NativeDashboardPresentation,
        availableWidth: CGFloat,
        localeIdentifier: String
    ) -> some View {
        let isCompact = availableWidth < 1120
        let metricColumns = nativeWorkspaceMetricColumns(for: availableWidth)
        let copy = nativeDashboardCopy(localeIdentifier: localeIdentifier)

        WorkspaceScaffold(title: copy.dashboardTitle, subtitle: copy.dashboardSubtitle, contentWidth: nativeDashboardContentWidth) {
            HStack(spacing: 12) {
                ActionButton(copy.createEmployee, variant: .primary) {
                    appState.selectedSection = .members
                }

                ActionButton(copy.openTeam, variant: .outline) {
                    appState.selectedSection = .team
                }
            }
        } content: {
            SurfaceCard(tone: .accent, spacing: 14) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 10) {
                        TagBadge(copy.poweredByOpenClaw, tone: .info, systemImage: "sparkles")
                        StatusBadge(copy.workspaceActive, tone: .success, systemImage: "checkmark.circle.fill")
                        TagBadge(presentation.heroVersion, tone: .neutral, systemImage: "brain.head.profile")
                    }

                    Text(copy.heroTitle)
                        .font(.title2)
                        .fontWeight(.semibold)

                    Text(copy.heroBody)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            LazyVGrid(columns: metricColumns, spacing: 16) {
                ForEach(presentation.metrics, id: \.title) { metric in
                    MetricCard(title: metric.title, value: metric.value, detail: metric.detail)
                }
            }

            if isCompact {
                VStack(alignment: .leading, spacing: 16) {
                    employeeStatusSection(presentation: presentation, localeIdentifier: localeIdentifier)
                    recentActivitySection(presentation: presentation, localeIdentifier: localeIdentifier)
                    workspaceHealthSection(presentation: presentation, localeIdentifier: localeIdentifier)
                }
            } else {
                HStack(alignment: .top, spacing: 16) {
                    employeeStatusSection(presentation: presentation, localeIdentifier: localeIdentifier)
                        .frame(maxWidth: .infinity, alignment: .topLeading)

                    VStack(alignment: .leading, spacing: 16) {
                        recentActivitySection(presentation: presentation, localeIdentifier: localeIdentifier)
                        workspaceHealthSection(presentation: presentation, localeIdentifier: localeIdentifier)
                    }
                    .frame(width: min(availableWidth * 0.34, 420), alignment: .top)
                }
            }
        }
    }

    private func employeeStatusSection(presentation: NativeDashboardPresentation, localeIdentifier: String) -> some View {
        let copy = nativeDashboardCopy(localeIdentifier: localeIdentifier)

        return SurfaceCard(title: copy.employeeStatusTitle) {
            HStack {
                Spacer()
                ActionButton(copy.viewAll, variant: .ghost) {
                    appState.selectedSection = .team
                }
            }

            if presentation.employeeRows.isEmpty {
                EmptyState(title: copy.employeeStatusTitle, description: copy.noMembersYet, symbol: "person.2.slash")
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(presentation.employeeRows) { row in
                        DashboardEmployeeCard(row: row)
                    }
                }
            }
        }
    }

    private func recentActivitySection(presentation: NativeDashboardPresentation, localeIdentifier: String) -> some View {
        let copy = nativeDashboardCopy(localeIdentifier: localeIdentifier)

        return SurfaceCard(title: copy.recentActivityTitle) {
            if presentation.activityRows.isEmpty {
                EmptyState(title: copy.recentActivityTitle, description: copy.noRecentActivity, symbol: "clock.arrow.circlepath")
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(presentation.activityRows) { row in
                        DashboardActivityCard(row: row)
                    }
                }
            }
        }
    }

    private func workspaceHealthSection(presentation: NativeDashboardPresentation, localeIdentifier: String) -> some View {
        let copy = nativeDashboardCopy(localeIdentifier: localeIdentifier)

        return SurfaceCard(title: copy.workspaceHealthTitle) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(presentation.healthItems, id: \.title) { item in
                    DashboardHealthRow(item: item)
                }
            }
        }
    }
}

struct DeployScreen: View {
    @Bindable var appState: ChillClawAppState
    @State private var installingTargetId = ""
    @State private var updatingTargetId = ""
    @State private var uninstallingTargetId = ""
    @State private var restartingGateway = false
    @State private var activityTitle = ""
    @State private var activitySummary = ""

    var body: some View {
        GeometryReader { geometry in
            let presentation = makeDeployPresentation(
                overview: appState.overview,
                targets: appState.deploymentTargets
            )

            OperationsScaffold(title: "Deploy OpenClaw", subtitle: "Choose a variant and deploy with one click") {
                HStack(spacing: 12) {
                    ActionButton("Refresh", systemImage: "arrow.clockwise", variant: .outline) {
                        Task { await appState.refreshCurrentSectionIfNeeded() }
                    }

                    ActionButton(
                        restartingGateway ? "Restarting…" : "Restart Gateway",
                        systemImage: restartingGateway ? nil : "bolt.fill",
                        variant: .primary,
                        isBusy: restartingGateway,
                        isDisabled: actionBusy || presentation.installedTargets.isEmpty
                    ) {
                        Task { await runGatewayRestart() }
                    }
                }
            } activity: {
                if actionBusy {
                    LoadingState(title: activityTitle, description: activitySummary)
                }
            } hero: {
                deployHeroCard(lastCheckedAt: presentation.lastCheckedAt)
            } content: {
                deploySection(
                    title: "Installed variants",
                    subtitle: "OpenClaw variants already ready on this Mac.",
                    targets: presentation.installedTargets,
                    emptyTitle: "Nothing installed yet",
                    emptyBody: "Pick an available variant below to deploy OpenClaw."
                )

                deploySection(
                    title: "Available variants",
                    subtitle: "Ready-to-deploy options supported by ChillClaw today.",
                    targets: presentation.availableTargets,
                    emptyTitle: "No available variants",
                    emptyBody: "ChillClaw could not find a deployable target right now."
                )

                if !presentation.plannedTargets.isEmpty {
                    deploySection(
                        title: "Planned variants",
                        subtitle: "Future engine adapters reserved in the product architecture.",
                        targets: presentation.plannedTargets,
                        emptyTitle: "",
                        emptyBody: ""
                    )
                }

                LazyVGrid(columns: nativeOperationsSummaryColumns(for: geometry.size.width), alignment: .leading, spacing: 16) {
                    ForEach(presentation.summaryCards) { card in
                        deploySummaryCard(card)
                    }
                }
            }
        }
    }

    private func runInstall(_ targetId: String) async {
        installingTargetId = targetId
        activityTitle = "Installing OpenClaw"
        activitySummary = "Preparing the selected runtime and configuring ChillClaw."
        do {
            let response = try await appState.client.installTarget(targetId)
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
        installingTargetId = ""
        resetActivityIfIdle()
    }

    private func runUpdate(_ targetId: String) async {
        updatingTargetId = targetId
        activityTitle = "Updating OpenClaw"
        activitySummary = "Applying the latest compatible OpenClaw update."
        do {
            let response = try await appState.client.updateTarget(targetId)
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
        updatingTargetId = ""
        resetActivityIfIdle()
    }

    private func runUninstall(_ targetId: String) async {
        uninstallingTargetId = targetId
        activityTitle = "Removing OpenClaw"
        activitySummary = "Cleaning up the selected runtime from this Mac."
        do {
            let response = try await appState.client.uninstallTarget(targetId)
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
        uninstallingTargetId = ""
        resetActivityIfIdle()
    }

    private func runGatewayRestart() async {
        restartingGateway = true
        activityTitle = "Restarting gateway"
        activitySummary = "Waiting for the OpenClaw gateway to become reachable again."
        do {
            let response = try await appState.client.restartGateway()
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
        restartingGateway = false
        resetActivityIfIdle()
    }

    private var actionBusy: Bool {
        !installingTargetId.isEmpty || !updatingTargetId.isEmpty || !uninstallingTargetId.isEmpty || restartingGateway
    }

    private func deployHeroCard(lastCheckedAt: String?) -> some View {
        InfoBanner(
            title: "One-Click Deployment",
            description: "Select your preferred OpenClaw variant and deploy instantly. No terminal commands or manual configuration required.",
            icon: "shippingbox",
            accent: .blue
        ) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 24) {
                    deployHeroCheck("Automatic setup")
                    deployHeroCheck("Docker containerized")
                    deployHeroCheck("Pre-configured")
                }
                if let lastCheckedAt {
                    Text("Last checked: \(formattedDeployCheckedAt(lastCheckedAt))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func deployHeroCheck(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Text(text)
                .font(.callout)
        }
    }

    private func deploySection(
        title: String,
        subtitle: String,
        targets: [NativeDeployTargetPresentation],
        emptyTitle: String,
        emptyBody: String
    ) -> some View {
        SurfaceCard(title: title, subtitle: subtitle) {
            if targets.isEmpty {
                if !emptyTitle.isEmpty || !emptyBody.isEmpty {
                    EmptyState(title: emptyTitle, description: emptyBody, symbol: "shippingbox")
                }
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(targets) { target in
                        deployTargetCard(target)
                    }
                }
            }
        }
    }

    private func deployTargetCard(_ target: NativeDeployTargetPresentation) -> some View {
        SurfaceCard(padding: 22, spacing: 18) {
            HStack(alignment: .top, spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: NativeUI.mediumCornerRadius, style: .continuous)
                        .fill(nativeAccentColor(target.accent).opacity(0.14))
                    Text(target.icon)
                        .font(.system(size: 32))
                }
                .frame(width: 88, height: 88)

                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        Text(target.title)
                            .font(.system(size: 22, weight: .bold))
                        ForEach(target.badges, id: \.self) { badge in
                            deployBadge(badge)
                        }
                    }
                    Text(target.description)
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                    Text(target.summary)
                        .font(.callout)
                }

                Spacer(minLength: 0)
            }

            if let version = target.version ?? target.latestVersion {
                Text("Version: \(version)")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            if let updateSummary = target.updateSummary {
                Text(updateSummary)
                    .font(.callout)
                    .foregroundStyle(.orange)
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Features")
                    .font(.headline)
                ForEach(target.features, id: \.self) { feature in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text(feature)
                            .font(.callout)
                    }
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 12) {
                Text("Requirements")
                    .font(.headline)
                if target.requirements.isEmpty {
                    Text("Requirements will be documented when this target becomes available.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 160), spacing: 14), count: 3), alignment: .leading, spacing: 12) {
                        ForEach(target.requirements, id: \.self) { requirement in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                                Text(requirement)
                                    .font(.callout)
                            }
                        }
                    }
                }
            }

            HStack(spacing: 12) {
                if let primaryAction = target.primaryAction {
                    deployActionButton(primaryAction, targetId: target.id, prominent: true)
                }
                ForEach(target.secondaryActions, id: \.self) { action in
                    deployActionButton(action, targetId: target.id, prominent: false)
                }
            }
        }
    }

    private func deployActionButton(_ action: NativeDeployActionKind, targetId: String, prominent: Bool) -> some View {
        let isBusy = isActionBusy(action, targetId: targetId)
        return ActionButton(
            buttonTitle(for: action, busy: isBusy),
            systemImage: isBusy ? nil : iconName(for: action),
            variant: deployButtonVariant(for: action, prominent: prominent),
            isBusy: isBusy,
            isDisabled: actionBusy,
            fullWidth: true
        ) {
            Task {
                switch action {
                case .install:
                    await runInstall(targetId)
                case .update:
                    await runUpdate(targetId)
                case .uninstall:
                    await runUninstall(targetId)
                }
            }
        }
    }

    private func deploySummaryCard(_ card: NativeDeploySummaryCard) -> some View {
        SurfaceCard(tone: .muted, padding: 18, spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: card.symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(nativeAccentColor(card.accent))
                    .frame(width: 36, height: 36)
                    .background(nativeAccentColor(card.accent).opacity(0.14), in: RoundedRectangle(cornerRadius: NativeUI.iconCornerRadius, style: .continuous))
                VStack(alignment: .leading, spacing: 6) {
                    Text(card.title)
                        .font(.headline)
                    Text(card.body)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func deployBadge(_ badge: NativeDeployBadge) -> some View {
        let label = deployBadgeLabel(badge)
        let semantic = nativeDeployBadgeSemantic(badge)

        return Group {
            switch semantic {
            case let .status(tone):
                StatusBadge(label, tone: tone)
            case let .tag(tone):
                TagBadge(label, tone: tone)
            }
        }
    }

    private func deployBadgeLabel(_ badge: NativeDeployBadge) -> String {
        switch badge {
        case .installed:
            return "Installed"
        case .current:
            return "Current"
        case .updateAvailable:
            return "Update available"
        case .recommended:
            return "Recommended"
        case .comingSoon:
            return "Coming soon"
        }
    }

    private func deployButtonVariant(for action: NativeDeployActionKind, prominent: Bool) -> ActionButtonVariant {
        switch (action, prominent) {
        case (.uninstall, _):
            return .destructive
        case (_, true):
            return .primary
        default:
            return .outline
        }
    }

    private func iconName(for action: NativeDeployActionKind) -> String {
        switch action {
        case .install:
            return "arrow.down.circle"
        case .update:
            return "arrow.clockwise"
        case .uninstall:
            return "trash"
        }
    }

    private func buttonTitle(for action: NativeDeployActionKind, busy: Bool) -> String {
        switch action {
        case .install:
            return busy ? "Installing…" : "Install"
        case .update:
            return busy ? "Updating…" : "Update"
        case .uninstall:
            return busy ? "Removing…" : "Uninstall"
        }
    }

    private func isActionBusy(_ action: NativeDeployActionKind, targetId: String) -> Bool {
        switch action {
        case .install:
            return installingTargetId == targetId
        case .update:
            return updatingTargetId == targetId
        case .uninstall:
            return uninstallingTargetId == targetId
        }
    }

    private func formattedDeployCheckedAt(_ checkedAt: String) -> String {
        let parsed = ISO8601DateFormatter().date(from: checkedAt)
        return parsed?.formatted(date: .abbreviated, time: .shortened) ?? checkedAt
    }

    private func resetActivityIfIdle() {
        guard !actionBusy else { return }
        activityTitle = ""
        activitySummary = ""
    }
}

func nativeRuntimeConfiguredModels(_ modelConfig: ModelConfigOverview?) -> [ModelCatalogEntry] {
    guard let modelConfig else { return [] }

    return modelConfig.models
        .filter { modelConfig.configuredModelKeys.contains($0.key) }
        .sorted { left, right in
            if left.key == modelConfig.defaultModel { return true }
            if right.key == modelConfig.defaultModel { return false }

            let leftFallback = nativeModelFallbackOrder(left)
            let rightFallback = nativeModelFallbackOrder(right)
            if leftFallback != rightFallback {
                return leftFallback < rightFallback
            }

            return left.key < right.key
        }
}

func nativeManagedConfiguredModelEntries(_ modelConfig: ModelConfigOverview?) -> [SavedModelEntry] {
    let runtimeKeys = Set(nativeRuntimeConfiguredModels(modelConfig).map(\.key))
    return (modelConfig?.savedEntries ?? []).filter { !$0.id.hasPrefix("runtime:") && runtimeKeys.contains($0.modelKey) }
}

func nativeRuntimeOnlyModels(_ modelConfig: ModelConfigOverview?) -> [ModelCatalogEntry] {
    let managedKeys = Set(nativeManagedConfiguredModelEntries(modelConfig).map(\.modelKey))
    return nativeRuntimeConfiguredModels(modelConfig).filter { !managedKeys.contains($0.key) }
}

func nativeRuntimeDerivedModelEntry(_ modelConfig: ModelConfigOverview?, modelKey: String) -> SavedModelEntry? {
    (modelConfig?.savedEntries ?? []).first { $0.id.hasPrefix("runtime:") && $0.modelKey == modelKey }
}

func nativeShouldDefaultNewModelEntry(_ modelConfig: ModelConfigOverview?) -> Bool {
    nativeRuntimeConfiguredModels(modelConfig).isEmpty
}

private func nativeModelFallbackOrder(_ model: ModelCatalogEntry) -> Int {
    for tag in model.tags {
        guard tag.hasPrefix("fallback#") else { continue }
        let suffix = String(tag.dropFirst("fallback#".count))
        if let value = Int(suffix) {
            return value
        }
    }

    return Int.max
}

private func nativeProviderForModel(_ model: ModelCatalogEntry, modelConfig: ModelConfigOverview?) -> ModelProviderConfig? {
    modelConfig?.providers.first { provider in
        provider.providerRefs.contains { prefix in model.key.hasPrefix(prefix) }
    }
}

private struct NativeConfigurationPalette {
    let accent: Color
    let accentStrong: Color
    let softFill: Color
    let softHighlight: Color
}

private func nativeConfigurationProviderCount(_ modelConfig: ModelConfigOverview?) -> Int {
    guard let modelConfig else { return 0 }

    return modelConfig.providers.filter { provider in
        provider.configured || modelConfig.configuredModelKeys.contains(where: { key in
            provider.providerRefs.contains { key.hasPrefix($0) }
        })
    }.count
}

private func nativeConfigurationDefaultRuntimeModel(_ modelConfig: ModelConfigOverview?) -> ModelCatalogEntry? {
    guard let defaultModel = modelConfig?.defaultModel else { return nil }
    return nativeRuntimeConfiguredModels(modelConfig).first(where: { $0.key == defaultModel })
}

private func nativeConfigurationProviderPalette(_ providerId: String) -> NativeConfigurationPalette {
    switch providerId {
    case "openai":
        return .init(accent: Color(red: 0.07, green: 0.72, blue: 0.52), accentStrong: Color(red: 0.03, green: 0.60, blue: 0.42), softFill: Color(red: 0.93, green: 0.99, blue: 0.96), softHighlight: Color(red: 0.82, green: 0.97, blue: 0.90))
    case "anthropic":
        return .init(accent: Color(red: 0.96, green: 0.62, blue: 0.12), accentStrong: Color(red: 0.84, green: 0.45, blue: 0.04), softFill: Color(red: 1.0, green: 0.98, blue: 0.92), softHighlight: Color(red: 0.99, green: 0.93, blue: 0.78))
    case "google", "gemini":
        return .init(accent: Color(red: 0.24, green: 0.52, blue: 0.98), accentStrong: Color(red: 0.14, green: 0.39, blue: 0.90), softFill: Color(red: 0.94, green: 0.97, blue: 1.0), softHighlight: Color(red: 0.86, green: 0.92, blue: 1.0))
    case "github", "github-copilot":
        return .init(accent: Color(red: 0.43, green: 0.31, blue: 0.92), accentStrong: Color(red: 0.31, green: 0.23, blue: 0.80), softFill: Color(red: 0.98, green: 0.96, blue: 1.0), softHighlight: Color(red: 0.93, green: 0.91, blue: 0.99))
    case "minimax":
        return .init(accent: Color(red: 0.92, green: 0.29, blue: 0.60), accentStrong: Color(red: 0.84, green: 0.19, blue: 0.47), softFill: Color(red: 1.0, green: 0.95, blue: 0.98), softHighlight: Color(red: 0.99, green: 0.90, blue: 0.95))
    default:
        return .init(accent: Color(red: 0.39, green: 0.40, blue: 0.95), accentStrong: Color(red: 0.31, green: 0.28, blue: 0.89), softFill: Color(red: 0.94, green: 0.95, blue: 1.0), softHighlight: Color(red: 0.88, green: 0.90, blue: 0.99))
    }
}

private func nativeConfigurationChannelPalette(_ channelId: SupportedChannelId) -> NativeConfigurationPalette {
    switch channelId {
    case .telegram:
        return .init(accent: Color(red: 0.23, green: 0.57, blue: 0.98), accentStrong: Color(red: 0.12, green: 0.44, blue: 0.88), softFill: Color(red: 0.94, green: 0.97, blue: 1.0), softHighlight: Color(red: 0.87, green: 0.93, blue: 1.0))
    case .whatsapp, .wechat:
        return .init(accent: Color(red: 0.11, green: 0.68, blue: 0.31), accentStrong: Color(red: 0.08, green: 0.54, blue: 0.24), softFill: Color(red: 0.94, green: 0.99, blue: 0.95), softHighlight: Color(red: 0.85, green: 0.97, blue: 0.88))
    case .feishu:
        return .init(accent: Color(red: 0.06, green: 0.72, blue: 0.67), accentStrong: Color(red: 0.05, green: 0.56, blue: 0.52), softFill: Color(red: 0.92, green: 0.99, blue: 0.98), softHighlight: Color(red: 0.82, green: 0.98, blue: 0.95))
    case .wechatWork:
        return .init(accent: Color(red: 0.05, green: 0.64, blue: 0.91), accentStrong: Color(red: 0.02, green: 0.47, blue: 0.75), softFill: Color(red: 0.94, green: 0.98, blue: 1.0), softHighlight: Color(red: 0.86, green: 0.95, blue: 0.99))
    }
}

private func nativeConfigurationProviderSymbol(_ providerId: String) -> String {
    switch providerId {
    case "openai": return "sparkles"
    case "anthropic": return "brain.head.profile"
    case "google", "gemini": return "wand.and.stars"
    case "github", "github-copilot": return "command"
    case "minimax": return "bolt.fill"
    default: return "cpu"
    }
}

private func nativeConfigurationChannelSymbol(_ channelId: SupportedChannelId) -> String {
    switch channelId {
    case .telegram: return "paperplane.fill"
    case .whatsapp, .wechat: return "message.fill"
    case .feishu: return "sparkles"
    case .wechatWork: return "briefcase.fill"
    }
}

private func nativeConfigurationAuthLabel(_ entry: SavedModelEntry) -> String {
    if let label = entry.authModeLabel, !label.isEmpty {
        return label
    }
    if let method = entry.authMethodId?.lowercased(), method.contains("api-key") {
        return "API key"
    }
    if let method = entry.authMethodId?.lowercased(), method.contains("oauth") {
        return "OAuth"
    }
    return "Configured"
}

private func nativeConfigurationFormattedTimestamp(_ value: String?) -> String {
    guard let value, !value.isEmpty else { return "Unknown" }
    guard let parsed = ISO8601DateFormatter().date(from: value) else { return value }
    return parsed.formatted(date: .abbreviated, time: .shortened)
}

private func nativeConfigurationChannelTone(_ status: String) -> NativeStatusTone {
    switch status {
    case "completed", "ready":
        return .success
    case "failed":
        return .warning
    case "awaiting-pairing", "in-progress":
        return .info
    default:
        return .neutral
    }
}

private struct NativeConfigurationIconTile: View {
    let palette: NativeConfigurationPalette
    let systemImage: String

    var body: some View {
        RoundedRectangle(cornerRadius: NativeUI.panelCornerRadius, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [palette.accent, palette.accentStrong],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay {
                Image(systemName: systemImage)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 74, height: 74)
            .shadow(color: palette.accent.opacity(0.22), radius: 18, x: 0, y: 10)
    }
}

private struct NativeConfigurationMetricView: View {
    let title: String
    let value: String
    let palette: NativeConfigurationPalette
    let emphasize: Bool

    init(title: String, value: String, palette: NativeConfigurationPalette, emphasize: Bool = false) {
        self.title = title
        self.value = value
        self.palette = palette
        self.emphasize = emphasize
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: emphasize ? 20 : 18, weight: .bold))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: NativeUI.panelCornerRadius, style: .continuous)
                .fill(.white.opacity(0.86))
        )
        .overlay(
            RoundedRectangle(cornerRadius: NativeUI.panelCornerRadius, style: .continuous)
                .stroke(emphasize ? palette.accent.opacity(0.20) : Color.white.opacity(0.68), lineWidth: 1)
        )
    }
}

private struct NativeConfigurationSectionHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    let count: Int
    let tone: NativeTagTone

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 14) {
                copy
                Spacer(minLength: 12)
                TagBadge("\(count)", tone: tone)
            }

            VStack(alignment: .leading, spacing: 12) {
                copy
                TagBadge("\(count)", tone: tone)
            }
        }
    }

    private var copy: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
            Text(title)
                .font(.title3.weight(.bold))
            Text(subtitle)
                .foregroundStyle(.secondary)
        }
    }
}

private struct NativeConfigurationMetaPill: View {
    let title: String
    let value: String
    let palette: NativeConfigurationPalette

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                .fill(palette.softFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                .stroke(palette.accent.opacity(0.12), lineWidth: 1)
        )
    }
}

private struct NativeConfigurationAddCard: View {
    let title: String
    let description: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: NativeUI.mediumCornerRadius, style: .continuous)
                        .fill(nativeBrandMarkGradient())
                    Image(systemName: "plus")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(description)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: NativeUI.heroCornerRadius, style: .continuous)
                    .fill(Color.white.opacity(0.9))
            )
            .overlay(
                RoundedRectangle(cornerRadius: NativeUI.heroCornerRadius, style: .continuous)
                    .stroke(style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                    .foregroundStyle(Color.blue.opacity(0.35))
            )
        }
        .buttonStyle(.plain)
    }
}

private struct NativeConfigurationTabButton: View {
    let title: String
    let subtitle: String
    let count: Int
    let palette: NativeConfigurationPalette
    let systemImage: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [palette.accent, palette.accentStrong],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 42, height: 42)
                .shadow(color: palette.accent.opacity(isSelected ? 0.24 : 0.14), radius: isSelected ? 14 : 10, x: 0, y: 8)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)

                Text("\(count)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color(red: 0.45, green: 0.28, blue: 0.88))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(
                        Capsule()
                            .fill(Color(red: 0.95, green: 0.90, blue: 1.0))
                    )
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: NativeUI.heroCornerRadius, style: .continuous)
                    .fill(isSelected ? Color.white.opacity(0.98) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: NativeUI.heroCornerRadius, style: .continuous)
                    .stroke(
                        isSelected ? Color.blue.opacity(0.30) : Color.clear,
                        lineWidth: isSelected ? 1.5 : 0
                    )
            )
            .shadow(color: isSelected ? Color.blue.opacity(0.08) : .clear, radius: 14, x: 0, y: 8)
            .contentShape(RoundedRectangle(cornerRadius: NativeUI.heroCornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

@MainActor
struct ConfigurationScreen: View {
    @Bindable var appState: ChillClawAppState
    @State private var selectedTab = 0
    @State private var showModelSheet = false
    @State private var selectedModelEntry: SavedModelEntry?
    @State private var showChannelSheet = false
    @State private var selectedChannelEntry: ConfiguredChannelEntry?
    @State private var channelSheetAction: NativeConfigurationChannelSheetAction = .save
    @State private var pendingConfigurationAction: NativeConfigurationPendingAction?

    var body: some View {
        let liveModelCount = nativeRuntimeConfiguredModels(appState.modelConfig).count
        let liveChannelCount = appState.channelConfig?.entries.count ?? 0

        WorkspaceScaffold(title: "Configuration", subtitle: "Configure AI models and communication channels.") {
            HStack(spacing: 12) {
                ActionButton("Refresh", systemImage: "arrow.clockwise", variant: .outline) {
                    Task { await appState.refreshCurrentSectionIfNeeded() }
                }
            }
        } content: {
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 14) {
                    NativeConfigurationTabButton(
                        title: "AI Models",
                        subtitle: liveModelCount > 0 ? "Live runtime models" : "No live runtime models yet",
                        count: liveModelCount,
                        palette: nativeConfigurationProviderPalette("default"),
                        systemImage: "sparkles",
                        isSelected: selectedTab == 0
                    ) {
                        selectedTab = 0
                    }

                    NativeConfigurationTabButton(
                        title: "Channels",
                        subtitle: liveChannelCount > 0 ? "Configured live channels" : "No live channels yet",
                        count: liveChannelCount,
                        palette: nativeConfigurationChannelPalette(.feishu),
                        systemImage: "message.fill",
                        isSelected: selectedTab == 1
                    ) {
                        selectedTab = 1
                    }
                }
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: NativeUI.heroCornerRadius, style: .continuous)
                        .fill(Color.white.opacity(0.92))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: NativeUI.heroCornerRadius, style: .continuous)
                        .stroke(Color.blue.opacity(0.12), lineWidth: 1)
                )
                .shadow(color: Color.blue.opacity(0.06), radius: 20, x: 0, y: 12)

                configurationQuickActions

                if selectedTab == 0 {
                    modelsView
                } else {
                    channelsView
                }
            }
        }
        .sheet(isPresented: $showModelSheet) {
            ModelEntrySheet(appState: appState, existingEntry: selectedModelEntry)
        }
        .sheet(isPresented: $showChannelSheet) {
            ChannelEntrySheet(
                appState: appState,
                existingEntry: selectedChannelEntry,
                preferredAction: channelSheetAction
            )
        }
    }

    @ViewBuilder
    private var configurationQuickActions: some View {
        if selectedTab == 0 {
            NativeConfigurationAddCard(
                title: "Add Model",
                description: "Create a new managed entry for a live provider or model."
            ) {
                presentAddModelSheet()
            }
        } else {
            NativeConfigurationAddCard(
                title: "Add Channel",
                description: "Start another live channel setup in the current OpenClaw runtime."
            ) {
                presentAddChannelSheet()
            }
        }
    }

    private var modelsView: some View {
        let runtimeManagedEntries = nativeManagedConfiguredModelEntries(appState.modelConfig)
        let runtimeOnlyModels = nativeRuntimeOnlyModels(appState.modelConfig)
        let runtimeModels = nativeRuntimeConfiguredModels(appState.modelConfig)
        let palette = nativeConfigurationProviderPalette("default")
        let providerCount = nativeConfigurationProviderCount(appState.modelConfig)
        let defaultModel = nativeConfigurationDefaultRuntimeModel(appState.modelConfig)

        return VStack(alignment: .leading, spacing: 18) {
            SurfaceCard(tone: .accent, padding: 24, spacing: 18) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 22) {
                        modelHeroSummary(palette: palette)
                        modelHeroMetrics(palette: palette, runtimeModels: runtimeModels, providerCount: providerCount, defaultModel: defaultModel)
                            .frame(width: 300)
                    }

                    VStack(alignment: .leading, spacing: 18) {
                        modelHeroSummary(palette: palette)
                        modelHeroMetrics(palette: palette, runtimeModels: runtimeModels, providerCount: providerCount, defaultModel: defaultModel)
                    }
                }
            }

            if runtimeManagedEntries.isEmpty && runtimeOnlyModels.isEmpty {
                EmptyState(
                    title: "No configured models",
                    description: "ChillClaw only shows models that are live in the current OpenClaw runtime.",
                    symbol: "sparkles"
                )
            } else {
                if !runtimeManagedEntries.isEmpty {
                    VStack(alignment: .leading, spacing: 16) {
                        NativeConfigurationSectionHeader(
                            eyebrow: "Managed entries",
                            title: "Installed AI models",
                            subtitle: "Managed entries that are active in the current OpenClaw runtime.",
                            count: runtimeManagedEntries.count,
                            tone: .accent
                        )

                        ForEach(runtimeManagedEntries) { entry in
                            let provider = appState.modelConfig?.providers.first(where: { $0.id == entry.providerId })
                            let runtimeModel = runtimeModels.first(where: { $0.key == entry.modelKey })
                            let palette = nativeConfigurationProviderPalette(entry.providerId)
                            let fallbackTag = runtimeModel?.tags.first(where: { $0.hasPrefix("fallback#") })

                            SurfaceCard(padding: 22, spacing: 16) {
                                ViewThatFits(in: .horizontal) {
                                    HStack(alignment: .top, spacing: 20) {
                                        NativeConfigurationIconTile(
                                            palette: palette,
                                            systemImage: nativeConfigurationProviderSymbol(entry.providerId)
                                        )
                                        modelEntryBody(
                                            entry: entry,
                                            provider: provider,
                                            palette: palette,
                                            runtimeModel: runtimeModel,
                                            fallbackTag: fallbackTag
                                        )
                                    }

                                    VStack(alignment: .leading, spacing: 18) {
                                        NativeConfigurationIconTile(
                                            palette: palette,
                                            systemImage: nativeConfigurationProviderSymbol(entry.providerId)
                                        )
                                        modelEntryBody(
                                            entry: entry,
                                            provider: provider,
                                            palette: palette,
                                            runtimeModel: runtimeModel,
                                            fallbackTag: fallbackTag
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                if !runtimeOnlyModels.isEmpty {
                    VStack(alignment: .leading, spacing: 16) {
                        NativeConfigurationSectionHeader(
                            eyebrow: "Runtime-only",
                            title: "Detected from current OpenClaw runtime",
                            subtitle: "These live models were detected in OpenClaw but do not have managed ChillClaw metadata yet.",
                            count: runtimeOnlyModels.count,
                            tone: .info
                        )

                        ForEach(runtimeOnlyModels) { model in
                            let provider = nativeProviderForModel(model, modelConfig: appState.modelConfig)
                            let palette = nativeConfigurationProviderPalette(provider?.id ?? "default")
                            let fallbackTag = model.tags.first(where: { $0.hasPrefix("fallback#") })
                            let runtimeEntry = nativeRuntimeDerivedModelEntry(appState.modelConfig, modelKey: model.key)

                            SurfaceCard(padding: 22, spacing: 16) {
                                ViewThatFits(in: .horizontal) {
                                    HStack(alignment: .top, spacing: 20) {
                                        NativeConfigurationIconTile(
                                            palette: palette,
                                            systemImage: nativeConfigurationProviderSymbol(provider?.id ?? "default")
                                        )
                                        runtimeOnlyModelBody(model: model, provider: provider, palette: palette, fallbackTag: fallbackTag, runtimeEntry: runtimeEntry)
                                    }

                                    VStack(alignment: .leading, spacing: 18) {
                                        NativeConfigurationIconTile(
                                            palette: palette,
                                            systemImage: nativeConfigurationProviderSymbol(provider?.id ?? "default")
                                        )
                                        runtimeOnlyModelBody(model: model, provider: provider, palette: palette, fallbackTag: fallbackTag, runtimeEntry: runtimeEntry)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var channelsView: some View {
        let entries = appState.channelConfig?.entries ?? []
        let palette = nativeConfigurationChannelPalette(.feishu)

        return VStack(alignment: .leading, spacing: 18) {
            SurfaceCard(tone: .accent, padding: 24, spacing: 18) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 22) {
                        channelHeroSummary(palette: palette)
                        channelHeroMetrics(palette: palette, entries: entries)
                            .frame(width: 300)
                    }

                    VStack(alignment: .leading, spacing: 18) {
                        channelHeroSummary(palette: palette)
                        channelHeroMetrics(palette: palette, entries: entries)
                    }
                }
            }

            if let activeSession = appState.channelConfig?.activeSession {
                SurfaceCard(title: "Active channel session", subtitle: activeSession.message, tone: .muted, padding: 22, spacing: 14) {
                    if let prompt = activeSession.inputPrompt {
                        Text(prompt)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    ScrollView(.vertical) {
                        Text(activeSession.logs.joined(separator: "\n"))
                            .font(.system(.footnote, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                    }
                    .frame(minHeight: 180)
                    .background(
                        RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                            .fill(Color.white.opacity(0.88))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                            .stroke(Color.teal.opacity(0.12), lineWidth: 1)
                    )

                    if let launchUrl = activeSession.launchUrl, let url = URL(string: launchUrl) {
                        ActionButton("Open Session Link", systemImage: "link", variant: .outline) {
                            NSWorkspace.shared.open(url)
                        }
                    }
                }
            }

            if entries.isEmpty {
                EmptyState(
                    title: "No channels are configured yet",
                    description: "Add Telegram, WhatsApp, Feishu, or WeChat to start managing communication channels in ChillClaw.",
                    symbol: "message"
                )
            } else {
                NativeConfigurationSectionHeader(
                    eyebrow: "Configured now",
                    title: "Live channel entries",
                    subtitle: appState.channelConfig?.gatewaySummary ?? "ChillClaw reads these configured channels directly from the current OpenClaw runtime.",
                    count: entries.count,
                    tone: .accent
                )

                ForEach(entries) { entry in
                    let capability = appState.channelConfig?.capabilities.first(where: { $0.id == entry.channelId })
                    let actionState = configurationChannelActionState(entry: entry, capability: capability)
                    let palette = nativeConfigurationChannelPalette(entry.channelId)

                    SurfaceCard(padding: 22, spacing: 16) {
                        ViewThatFits(in: .horizontal) {
                            HStack(alignment: .top, spacing: 20) {
                                NativeConfigurationIconTile(
                                    palette: palette,
                                    systemImage: nativeConfigurationChannelSymbol(entry.channelId)
                                )
                                channelEntryBody(
                                    entry: entry,
                                    capability: capability,
                                    actionState: actionState,
                                    palette: palette
                                )
                            }

                            VStack(alignment: .leading, spacing: 18) {
                                NativeConfigurationIconTile(
                                    palette: palette,
                                    systemImage: nativeConfigurationChannelSymbol(entry.channelId)
                                )
                                channelEntryBody(
                                    entry: entry,
                                    capability: capability,
                                    actionState: actionState,
                                    palette: palette
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func modelHeroSummary(palette: NativeConfigurationPalette) -> some View {
        HStack(alignment: .top, spacing: 18) {
            NativeConfigurationIconTile(palette: palette, systemImage: "sparkles")

            VStack(alignment: .leading, spacing: 12) {
                Text("LIVE RUNTIME")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                Text("AI model configuration")
                    .font(.system(size: 28, weight: .bold))
                Text("ChillClaw reads the live OpenClaw model catalog and keeps provider status truthful to the installed engine.")
                    .font(.body)
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 8) {
                    Label("Managed entries stay tied to the active OpenClaw runtime.", systemImage: "checkmark.circle.fill")
                    Label("Default and fallback routing are visible in one place.", systemImage: "checkmark.circle.fill")
                    Label("Credentials remain editable without showing stale history.", systemImage: "checkmark.circle.fill")
                }
                .font(.callout.weight(.medium))
                .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func modelHeroMetrics(
        palette: NativeConfigurationPalette,
        runtimeModels: [ModelCatalogEntry],
        providerCount: Int,
        defaultModel: ModelCatalogEntry?
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeConfigurationMetricView(title: "Live models", value: "\(runtimeModels.count)", palette: palette)
            NativeConfigurationMetricView(title: "Providers ready", value: "\(providerCount)", palette: palette)
            NativeConfigurationMetricView(
                title: "Default route",
                value: defaultModel?.name ?? "Not set",
                palette: palette,
                emphasize: true
            )
        }
    }

    @ViewBuilder
    private func modelEntryBody(
        entry: SavedModelEntry,
        provider: ModelProviderConfig?,
        palette: NativeConfigurationPalette,
        runtimeModel: ModelCatalogEntry?,
        fallbackTag: String?
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    modelEntryHeader(entry: entry, provider: provider, runtimeModel: runtimeModel, fallbackTag: fallbackTag)
                    Spacer(minLength: 12)
                }

                VStack(alignment: .leading, spacing: 14) {
                    modelEntryHeader(entry: entry, provider: provider, runtimeModel: runtimeModel, fallbackTag: fallbackTag)
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
                NativeConfigurationMetaPill(title: "Provider", value: provider?.label ?? entry.providerId, palette: palette)
                NativeConfigurationMetaPill(
                    title: "Authentication",
                    value: entry.profileLabel.map { "\(nativeConfigurationAuthLabel(entry)) • \($0)" } ?? nativeConfigurationAuthLabel(entry),
                    palette: palette
                )
                NativeConfigurationMetaPill(
                    title: "Role",
                    value: entry.isDefault ? "Default route" : entry.isFallback ? "Fallback route" : "Managed route",
                    palette: palette
                )
            }

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    Text(runtimeModel?.local == true ? "This model is running in local mode." : "This route is available in the active OpenClaw runtime right now.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 12)
                    modelEntryActions(entry: entry)
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text(runtimeModel?.local == true ? "This model is running in local mode." : "This route is available in the active OpenClaw runtime right now.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    modelEntryActions(entry: entry)
                }
            }
        }
    }

    @ViewBuilder
    private func modelEntryHeader(
        entry: SavedModelEntry,
        provider: ModelProviderConfig?,
        runtimeModel: ModelCatalogEntry?,
        fallbackTag: String?
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text((provider?.label ?? entry.providerId).uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
            Text(entry.label)
                .font(.title3.weight(.bold))
            Text("Managed by ChillClaw and mapped to the live OpenClaw model chain.")
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                TagBadge(entry.modelKey, tone: .neutral)
                if entry.isDefault {
                    TagBadge("Default", tone: .success)
                }
                if entry.isFallback {
                    TagBadge("Fallback", tone: .accent)
                }
                if let fallbackTag {
                    TagBadge(fallbackTag.replacingOccurrences(of: "#", with: " #"), tone: .accent)
                }
                if let runtimeModel, runtimeModel.local {
                    TagBadge("Local", tone: .neutral)
                }
            }
        }
    }

    @ViewBuilder
    private func modelEntryActions(entry: SavedModelEntry) -> some View {
        HStack(spacing: 10) {
            ActionButton("Edit", variant: .outline) {
                presentModelSheet(for: entry)
            }
            .disabled(hasPendingConfigurationAction)

            ActionButton(
                "Set Default",
                variant: .secondary,
                isBusy: pendingConfigurationAction == .setDefaultModel(entry.id),
                isDisabled: entry.isDefault || blocksConfigurationAction(.setDefaultModel(entry.id))
            ) {
                Task { await setDefaultModel(entry.id) }
            }

            ActionButton(
                "Remove",
                variant: .destructive,
                isBusy: pendingConfigurationAction == .removeModel(entry.id),
                isDisabled: blocksConfigurationAction(.removeModel(entry.id))
            ) {
                Task { await removeModel(entry.id) }
            }
        }
    }

    @ViewBuilder
    private func runtimeOnlyModelBody(
        model: ModelCatalogEntry,
        provider: ModelProviderConfig?,
        palette: NativeConfigurationPalette,
        fallbackTag: String?,
        runtimeEntry: SavedModelEntry?
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text((provider?.label ?? model.key).uppercased())
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                Text(model.name)
                    .font(.title3.weight(.bold))
                Text("Live in OpenClaw right now, but not yet managed as a ChillClaw entry.")
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    TagBadge(model.key, tone: .neutral)
                    if model.key == appState.modelConfig?.defaultModel {
                        TagBadge("Default", tone: .success)
                    }
                    if let fallbackTag {
                        TagBadge(fallbackTag.replacingOccurrences(of: "#", with: " #"), tone: .accent)
                    }
                    if model.local {
                        TagBadge("Local", tone: .neutral)
                    }
                    TagBadge("Detected from runtime", tone: .info)
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
                NativeConfigurationMetaPill(title: "Provider", value: provider?.label ?? model.key, palette: palette)
                NativeConfigurationMetaPill(
                    title: "Context window",
                    value: model.contextWindow > 0 ? "\(model.contextWindow.formatted()) tokens" : "Unknown",
                    palette: palette
                )
                NativeConfigurationMetaPill(title: "Availability", value: model.available ? "Available now" : "Unavailable", palette: palette)
            }

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    Text("This model is currently coming from the active OpenClaw runtime without a managed ChillClaw entry.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 12)
                    if let runtimeEntry {
                        ActionButton(
                            "Remove",
                            variant: .destructive,
                            isBusy: pendingConfigurationAction == .removeModel(runtimeEntry.id),
                            isDisabled: blocksConfigurationAction(.removeModel(runtimeEntry.id))
                        ) {
                            Task { await removeModel(runtimeEntry.id) }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("This model is currently coming from the active OpenClaw runtime without a managed ChillClaw entry.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    if let runtimeEntry {
                        ActionButton(
                            "Remove",
                            variant: .destructive,
                            isBusy: pendingConfigurationAction == .removeModel(runtimeEntry.id),
                            isDisabled: blocksConfigurationAction(.removeModel(runtimeEntry.id))
                        ) {
                            Task { await removeModel(runtimeEntry.id) }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func channelHeroSummary(palette: NativeConfigurationPalette) -> some View {
        HStack(alignment: .top, spacing: 18) {
            NativeConfigurationIconTile(palette: palette, systemImage: "message.fill")

            VStack(alignment: .leading, spacing: 12) {
                Text("LIVE RUNTIME")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                Text("Communication channels")
                    .font(.system(size: 28, weight: .bold))
                Text("Configure official and workaround channels one by one through the current OpenClaw runtime.")
                    .font(.body)
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 8) {
                    Label("Only live configured channels appear here.", systemImage: "checkmark.circle.fill")
                    Label("Pairing and login progress stay visible while setup is active.", systemImage: "checkmark.circle.fill")
                    Label("Gateway truth comes directly from the active OpenClaw runtime.", systemImage: "checkmark.circle.fill")
                }
                .font(.callout.weight(.medium))
                .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func channelHeroMetrics(palette: NativeConfigurationPalette, entries: [ConfiguredChannelEntry]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeConfigurationMetricView(title: "Live channels", value: "\(entries.count)", palette: palette)
            NativeConfigurationMetricView(title: "Channel types", value: "\((appState.channelConfig?.capabilities.count) ?? 0)", palette: palette)
            NativeConfigurationMetricView(
                title: "Gateway state",
                value: appState.channelConfig?.gatewaySummary ?? "Ready",
                palette: palette,
                emphasize: true
            )
        }
    }

    @ViewBuilder
    private func channelEntryBody(
        entry: ConfiguredChannelEntry,
        capability: ChannelCapability?,
        actionState: NativeConfigurationChannelActionState,
        palette: NativeConfigurationPalette
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text((capability?.label ?? nativeChannelDisplayLabel(entry.channelId)).uppercased())
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                Text(entry.label)
                    .font(.title3.weight(.bold))
                Text(entry.summary)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    StatusBadge(entry.status.capitalized, tone: nativeConfigurationChannelTone(entry.status))
                    if entry.pairingRequired {
                        TagBadge("Pairing required", tone: .info)
                    }
                    if capability?.officialSupport == false {
                        TagBadge("Workaround", tone: .warning)
                    }
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
                if entry.maskedConfigSummary.isEmpty {
                    NativeConfigurationMetaPill(title: "Capability", value: capability?.label ?? nativeChannelDisplayLabel(entry.channelId), palette: palette)
                    NativeConfigurationMetaPill(title: "Status", value: entry.status, palette: palette)
                    NativeConfigurationMetaPill(title: "Last updated", value: nativeConfigurationFormattedTimestamp(entry.lastUpdatedAt), palette: palette)
                } else {
                    ForEach(entry.maskedConfigSummary, id: \.label) { item in
                        NativeConfigurationMetaPill(title: item.label, value: item.value, palette: palette)
                    }
                }
            }

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    Text(capability?.officialSupport == false ? "This channel uses the current workaround path supported by the active runtime." : "This channel is live in the current OpenClaw runtime.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 12)
                    channelEntryActions(entry: entry, actionState: actionState)
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text(capability?.officialSupport == false ? "This channel uses the current workaround path supported by the active runtime." : "This channel is live in the current OpenClaw runtime.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    channelEntryActions(entry: entry, actionState: actionState)
                }
            }
        }
    }

    @ViewBuilder
    private func channelEntryActions(
        entry: ConfiguredChannelEntry,
        actionState: NativeConfigurationChannelActionState
    ) -> some View {
        HStack(spacing: 10) {
            if actionState.showApproveAction {
                ActionButton("Approve Pairing", variant: .secondary) {
                    presentChannelSheet(for: entry, action: .approvePairing)
                }
                .disabled(hasPendingConfigurationAction)
            }

            ActionButton(actionState.primaryAction == .continueSetup ? "Continue Setup" : "Edit", variant: .outline) {
                presentChannelSheet(for: entry, action: .save)
            }
            .disabled(hasPendingConfigurationAction)

            ActionButton(
                "Remove",
                variant: .destructive,
                isBusy: pendingConfigurationAction == .removeChannel(entry.id),
                isDisabled: blocksConfigurationAction(.removeChannel(entry.id))
            ) {
                Task { await removeChannel(entry) }
            }
        }
    }

    private func setDefaultModel(_ entryId: String) async {
        let didMutate = await runConfigurationAction(.setDefaultModel(entryId)) {
            let response = try await appState.client.setDefaultModelEntry(entryId: entryId)
            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
        }
        guard didMutate else { return }
        refreshConfigurationStateInBackground()
    }

    private func removeModel(_ entryId: String) async {
        let didMutate = await runConfigurationAction(.removeModel(entryId)) {
            let response = try await appState.client.deleteModelEntry(entryId: entryId)
            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
        }
        guard didMutate else { return }
        refreshConfigurationStateInBackground()
    }

    private func removeChannel(_ entry: ConfiguredChannelEntry) async {
        let didMutate = await runConfigurationAction(.removeChannel(entry.id)) {
            let response = try await appState.client.deleteChannelEntry(request: RemoveChannelEntryRequest(entryId: entry.id, channelId: entry.channelId.rawValue, values: nil))
            appState.channelConfig = response.channelConfig
            appState.applyBanner(response.message)
        }
        guard didMutate else { return }
        refreshConfigurationStateInBackground()
    }

    private func presentAddModelSheet() {
        selectedModelEntry = nil
        showModelSheet = true
    }

    private func presentModelSheet(for entry: SavedModelEntry) {
        selectedModelEntry = entry
        showModelSheet = true
    }

    private func presentAddChannelSheet() {
        selectedChannelEntry = nil
        channelSheetAction = .save
        showChannelSheet = true
    }

    private func presentChannelSheet(for entry: ConfiguredChannelEntry, action: NativeConfigurationChannelSheetAction) {
        selectedChannelEntry = entry
        channelSheetAction = action
        showChannelSheet = true
    }

    private var hasPendingConfigurationAction: Bool {
        pendingConfigurationAction != nil
    }

    private func blocksConfigurationAction(_ action: NativeConfigurationPendingAction) -> Bool {
        guard let pendingConfigurationAction else {
            return false
        }

        return pendingConfigurationAction != action
    }

    private func runConfigurationAction(
        _ action: NativeConfigurationPendingAction,
        operation: @escaping () async throws -> Void
    ) async -> Bool {
        guard pendingConfigurationAction == nil else { return false }

        pendingConfigurationAction = action

        do {
            try await operation()
            pendingConfigurationAction = nil
            return true
        } catch {
            pendingConfigurationAction = nil
            appState.presentErrorUnlessCancelled(error)
            return false
        }
    }

    private func refreshConfigurationStateInBackground() {
        Task { await appState.refreshAll() }
    }
}

private enum NativeManagedPluginAction {
    case install
    case update
    case remove
}

private enum NativeConfigurationPendingAction: Equatable {
    case setDefaultModel(String)
    case removeModel(String)
    case removeChannel(String)
}

private func nativeManagedPluginStatusTone(_ status: String) -> NativeStatusTone {
    switch status {
    case "ready":
        return .success
    case "update-available":
        return .info
    case "blocked", "error":
        return .warning
    case "missing":
        return .neutral
    default:
        return .neutral
    }
}

private func nativeManagedPluginStatusLabel(_ status: String) -> String {
    switch status {
    case "ready":
        return "Ready"
    case "update-available":
        return "Update Available"
    case "blocked":
        return "Blocked"
    case "error":
        return "Needs Repair"
    case "missing":
        return "Missing"
    default:
        return "Unknown"
    }
}

private func nativeManagedPluginPrimaryAction(_ entry: ManagedPluginEntry) -> NativeManagedPluginAction? {
    if !entry.installed {
        return .install
    }
    if entry.hasUpdate {
        return .update
    }
    if entry.activeDependentCount == 0 {
        return .remove
    }
    return nil
}

private func nativeManagedPluginActionTitle(_ action: NativeManagedPluginAction, busy: Bool) -> String {
    switch action {
    case .install:
        return busy ? "Installing..." : "Install"
    case .update:
        return busy ? "Updating..." : "Update"
    case .remove:
        return busy ? "Removing..." : "Remove"
    }
}

private func nativeManagedPluginActionIcon(_ action: NativeManagedPluginAction) -> String {
    switch action {
    case .install:
        return "square.and.arrow.down"
    case .update:
        return "arrow.clockwise"
    case .remove:
        return "trash"
    }
}

private func nativeManagedPluginActionVariant(_ action: NativeManagedPluginAction) -> ActionButtonVariant {
    switch action {
    case .install:
        return .primary
    case .update:
        return .secondary
    case .remove:
        return .destructive
    }
}

struct PluginsScreen: View {
    @Bindable var appState: ChillClawAppState
    @State private var busyKey = ""
    @State private var actionError: String?

    var body: some View {
        WorkspaceScaffold(title: "Plugins", subtitle: "Manage daemon-owned OpenClaw plugins and the features that depend on them.") {
            ActionButton("Refresh", systemImage: "arrow.clockwise", variant: .outline) {
                Task {
                    await appState.refreshCurrentSectionIfNeeded()
                }
            }
        } content: {
            VStack(alignment: .leading, spacing: 16) {
                if let overview = appState.pluginConfig {
                    pluginContent(overview)
                } else {
                    LoadingState(
                        title: "Checking managed plugins",
                        description: "ChillClaw is reading the OpenClaw plugin inventory and active feature dependencies."
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func pluginContent(_ overview: PluginConfigOverview) -> some View {
        InfoBanner(
            title: "Daemon-owned plugin lifecycle",
            description: "ChillClaw installs, updates, and removes managed OpenClaw plugins itself. Features such as WeChat depend on these plugin records, so removal is blocked while a live feature still needs the plugin.",
            icon: "puzzlepiece.extension",
            accent: .blue
        )

        if let actionError {
            ErrorState(title: "Plugin action failed", description: actionError)
        }

        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(minimum: 160), spacing: 16), count: 4),
            alignment: .leading,
            spacing: 16
        ) {
            MetricCard(title: "Managed Plugins", value: "\(overview.entries.count)", detail: "Daemon-owned plugin records")
            MetricCard(title: "Ready", value: "\(overview.entries.filter { $0.status == "ready" }.count)", detail: "Healthy and enabled")
            MetricCard(title: "In Use", value: "\(overview.entries.reduce(0) { $0 + $1.activeDependentCount })", detail: "Active dependent features")
            MetricCard(title: "Updates", value: "\(overview.entries.filter(\.hasUpdate).count)", detail: "Plugins with pending updates")
        }

        if overview.entries.isEmpty {
            EmptyState(
                title: "No managed plugins yet",
                description: "ChillClaw has not registered any daemon-owned OpenClaw plugins in this build.",
                symbol: "puzzlepiece.extension"
            )
        } else {
            VStack(alignment: .leading, spacing: 16) {
                ForEach(overview.entries) { entry in
                    pluginCard(entry)
                }
            }
        }
    }

    private func pluginCard(_ entry: ManagedPluginEntry) -> some View {
        let primaryAction = nativeManagedPluginPrimaryAction(entry)
        let isBusy = primaryAction.map { busyKey == "\(entry.id):\($0)" } ?? false

        return SurfaceCard(title: entry.label, subtitle: entry.summary) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        StatusBadge(nativeManagedPluginStatusLabel(entry.status), tone: nativeManagedPluginStatusTone(entry.status))
                        TagBadge(entry.enabled ? "Enabled" : "Disabled", tone: entry.enabled ? .success : .neutral)
                        if entry.hasUpdate {
                            TagBadge("Update available", tone: .info)
                        }
                        if entry.hasError {
                            TagBadge("Load error", tone: .warning)
                        }
                    }
                    Text(entry.detail)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }

            HStack(alignment: .top, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Package")
                        .font(.headline)
                    Text(entry.packageSpec)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text("Runtime ID")
                        .font(.headline)
                        .padding(.top, 8)
                    Text(entry.runtimePluginId)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Config key")
                        .font(.headline)
                    Text(entry.configKey)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text("Dependent features")
                        .font(.headline)
                        .padding(.top, 8)
                    Text(entry.dependencies.map(\.label).joined(separator: ", "))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            if entry.activeDependentCount > 0 {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text("Remove the active dependent feature before uninstalling this plugin. ChillClaw keeps the plugin installed while the feature remains configured.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            HStack {
                Spacer()
                if let primaryAction {
                    ActionButton(
                        nativeManagedPluginActionTitle(primaryAction, busy: isBusy),
                        systemImage: isBusy ? nil : nativeManagedPluginActionIcon(primaryAction),
                        variant: nativeManagedPluginActionVariant(primaryAction),
                        isBusy: isBusy
                    ) {
                        Task { await runAction(primaryAction, entry: entry) }
                    }
                } else {
                    ActionButton("Managed by active features", variant: .outline, isDisabled: true) {}
                }
            }
        }
    }

    private func runAction(_ action: NativeManagedPluginAction, entry: ManagedPluginEntry) async {
        let key = "\(entry.id):\(action)"
        busyKey = key
        defer { busyKey = "" }

        do {
            let response: PluginActionResponse
            switch action {
            case .install:
                response = try await appState.client.installPlugin(entry.id)
            case .update:
                response = try await appState.client.updatePlugin(entry.id)
            case .remove:
                response = try await appState.client.removePlugin(entry.id)
            }

            appState.pluginConfig = response.pluginConfig
            appState.applyBanner(response.message)
            actionError = nil
        } catch {
            actionError = error.localizedDescription
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

struct SkillsScreen: View {
    @Bindable var appState: ChillClawAppState
    @State private var showCustomSkillSheet = false

    var body: some View {
        WorkspaceScaffold(title: "Skills Management", subtitle: "Install, audit, and maintain curated skills.") {
            ActionButton("New Custom Skill", systemImage: "plus", variant: .primary) {
                showCustomSkillSheet = true
            }
        } content: {
            if let presetSync = appState.skillConfig?.presetSkillSync {
                SurfaceCard(title: "Preset Skill Sync", subtitle: presetSync.summary) {
                    let counts = nativePresetSkillSyncCounts(presetSync)
                    HStack {
                        StatusBadge("\(counts.verified) verified", tone: .success)
                        StatusBadge("\(counts.pending) pending", tone: counts.pending > 0 ? .info : .neutral)
                        StatusBadge("\(counts.failed) failed", tone: counts.failed > 0 ? .warning : .neutral)
                        Spacer()
                        if presetSync.repairRecommended {
                            ActionButton("Repair Preset Skills", systemImage: "wrench.and.screwdriver", variant: .outline) {
                                Task { await repairPresetSkills() }
                            }
                        }
                    }
                }
            }

            SurfaceCard(title: "Installed Skills") {
                if let installedSkills = appState.skillConfig?.installedSkills, !installedSkills.isEmpty {
                    ForEach(installedSkills) { skill in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(skill.name).fontWeight(.semibold)
                                Text(skill.description).foregroundStyle(.secondary)
                            }
                            Spacer()
                            ActionButton("Remove", variant: .destructive) {
                                Task { await removeSkill(skill.id) }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } else {
                    EmptyState(title: "No installed skills", description: "Install a curated skill or add a custom one to extend ChillClaw.", symbol: "bolt.slash")
                }
            }

            SurfaceCard(title: "Marketplace Preview") {
                if let marketplacePreview = appState.skillConfig?.marketplacePreview, !marketplacePreview.isEmpty {
                    ForEach(marketplacePreview) { skill in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(skill.name).fontWeight(.semibold)
                                Text(skill.summary).foregroundStyle(.secondary)
                            }
                            Spacer()
                            ActionButton(skill.installed ? "Reinstall" : "Install", variant: .outline) {
                                Task { await installSkill(skill.slug) }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } else {
                    EmptyState(title: "Marketplace unavailable", description: "ChillClaw could not load the curated skill catalog right now.", symbol: "shippingbox")
                }
            }
        }
        .sheet(isPresented: $showCustomSkillSheet) {
            CustomSkillSheet(appState: appState)
        }
    }

    private func installSkill(_ slug: String) async {
        do {
            let response = try await appState.client.installSkill(slug: slug)
            appState.skillConfig = response.skillConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func removeSkill(_ id: String) async {
        do {
            let response = try await appState.client.removeSkill(skillId: id)
            appState.skillConfig = response.skillConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func repairPresetSkills() async {
        do {
            let response = try await appState.client.repairPresetSkillSync()
            appState.skillConfig = response.skillConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

private func nativePresetSkillSyncCounts(_ overview: PresetSkillSyncOverview) -> (pending: Int, verified: Int, failed: Int) {
    overview.entries.reduce(into: (pending: 0, verified: 0, failed: 0)) { counts, entry in
        switch entry.status {
        case .verified, .installed:
            counts.verified += 1
        case .failed:
            counts.failed += 1
        default:
            counts.pending += 1
        }
    }
}

struct MembersScreen: View {
    @Bindable var appState: ChillClawAppState
    @State private var showMemberSheet = false

    var body: some View {
        WorkspaceScaffold(title: "AI Members", subtitle: "Create and manage the roster behind your workspace.") {
            ActionButton("Create AI Member", systemImage: "plus", variant: .primary) {
                showMemberSheet = true
            }
        } content: {
            if let members = appState.aiTeamOverview?.members, !members.isEmpty {
                ForEach(members) { member in
                    SurfaceCard(title: member.name, subtitle: member.jobTitle, minimumHeight: nativeWorkspaceCollectionCardMinHeight) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(member.currentStatus)
                                .foregroundStyle(.secondary)
                            if let brain = member.brain {
                                SettingRow(title: "Brain") {
                                    TagBadge(brain.label, tone: .neutral)
                                }
                            }
                            if !member.bindings.isEmpty {
                                Text("Bindings: \(member.bindings.map { $0.target }.joined(separator: ", "))")
                                    .foregroundStyle(.secondary)
                            }
                            HStack {
                                ActionButton("Delete", variant: .destructive) {
                                    Task { await deleteMember(member.id) }
                                }
                            }
                        }
                    }
                }
            } else {
                EmptyState(title: "No AI members yet", description: "Create a member so ChillClaw can provision a dedicated OpenClaw workspace behind the scenes.", symbol: "person.badge.plus")
            }
        }
        .sheet(isPresented: $showMemberSheet) {
            MemberSheet(appState: appState)
        }
    }

    private func deleteMember(_ id: String) async {
        do {
            let response = try await appState.client.deleteMember(memberId: id, deleteMode: "keep-workspace")
            appState.aiTeamOverview = response.overview
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

struct ChatScreen: View {
    @Bindable var appState: ChillClawAppState

    var body: some View {
        SplitContentScaffold(title: "Conversations", subtitle: "Talk to ChillClaw employees and inspect thread history.") {
            ActionButton("New Chat", systemImage: "plus.bubble", variant: .primary) {
                Task {
                    guard let memberId = appState.selectedMemberForChat ?? appState.aiTeamOverview?.members.first?.id else { return }
                    await appState.chatViewModel.createThread(memberId: memberId)
                }
            }
        } sidebar: {
            SurfaceCard(title: "Conversations", subtitle: "Browse threads or start a new one.") {
                HStack {
                    Picker("AI Member", selection: Binding(
                        get: { appState.selectedMemberForChat ?? "" },
                        set: { appState.selectedMemberForChat = $0.isEmpty ? nil : $0 }
                    )) {
                        Text("All AI Members").tag("")
                        ForEach(appState.aiTeamOverview?.members ?? []) { member in
                            Text(member.name).tag(member.id)
                        }
                    }
                    .frame(width: 220)
                }

                List(appState.chatViewModel.overview.threads) { thread in
                    Button {
                        Task { await appState.chatViewModel.selectThread(thread.id) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(thread.title).fontWeight(.semibold)
                            Text(thread.lastPreview ?? "No messages yet")
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    .buttonStyle(.plain)
                }
                .frame(minWidth: 300)
            }
        } detail: {
            SurfaceCard(tone: .muted, padding: 20, spacing: 12) {
                if let thread = appState.chatViewModel.selectedThread {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .top, spacing: 12) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(thread.title)
                                    .font(.title2)
                                    .fontWeight(.semibold)
                                Text(thread.lastPreview ?? "Waiting for the next assistant update.")
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            Spacer()
                            if thread.composerState.canAbort {
                                ActionButton("Stop", variant: .destructive) {
                                    Task { await appState.chatViewModel.abortCurrentRun() }
                                }
                            }
                        }

                        HStack(spacing: 8) {
                            StatusBadge(
                                nativeChatComposerLabel(for: thread.composerState.status),
                                tone: nativeChatComposerTone(for: thread.composerState.status),
                                systemImage: nativeChatComposerIcon(for: thread.composerState.status)
                            )
                            if let bridgeState = thread.composerState.bridgeState {
                                StatusBadge(
                                    nativeChatBridgeLabel(for: bridgeState),
                                    tone: nativeChatBridgeTone(for: bridgeState),
                                    systemImage: nativeChatBridgeIcon(for: bridgeState)
                                )
                            }
                            if let activeRunState = thread.activeRunState, !activeRunState.isEmpty {
                                TagBadge(activeRunState, tone: .neutral)
                            }
                            if thread.composerState.canAbort {
                                TagBadge("Live run", tone: .accent)
                            }
                        }

                        if let activityLabel = thread.composerState.activityLabel, !activityLabel.isEmpty {
                            Text(activityLabel)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }

                        if let error = thread.composerState.error, !error.isEmpty {
                            InfoBanner(
                                title: "Send failed",
                                description: error,
                                icon: "exclamationmark.triangle.fill",
                                accent: .red
                            )
                        }

                        if let toolActivities = thread.composerState.toolActivities, !toolActivities.isEmpty {
                            SurfaceCard(title: "Tool progress", subtitle: "Current assistant tool calls and their live state.") {
                                VStack(alignment: .leading, spacing: 10) {
                                    ForEach(toolActivities, id: \.id) { activity in
                                        HStack(alignment: .top, spacing: 10) {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(activity.label)
                                                    .fontWeight(.semibold)
                                                if let detail = activity.detail, !detail.isEmpty {
                                                    Text(detail)
                                                        .font(.callout)
                                                        .foregroundStyle(.secondary)
                                                }
                                            }
                                            Spacer(minLength: 0)
                                            StatusBadge(
                                                nativeChatToolActivityLabel(for: activity.status),
                                                tone: nativeChatToolActivityTone(for: activity.status)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        ChillClawChatTranscriptView(thread: thread)

                        HStack(spacing: 12) {
                            ZStack(alignment: .topLeading) {
                                NativeChatComposerTextView(
                                    text: $appState.chatViewModel.draftMessage,
                                    canSend: appState.chatViewModel.canSendCurrentDraft
                                ) {
                                    Task { await appState.chatViewModel.sendCurrentMessage() }
                                }
                                if appState.chatViewModel.draftMessage.isEmpty {
                                    Text("Message")
                                        .foregroundStyle(.tertiary)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 12)
                                        .allowsHitTesting(false)
                                }
                            }
                            .frame(minHeight: 78, maxHeight: 140)
                            ActionButton("Send", systemImage: "paperplane.fill", variant: .primary) {
                                Task { await appState.chatViewModel.sendCurrentMessage() }
                            }
                            .disabled(!appState.chatViewModel.canSendCurrentDraft)
                        }
                        Text("Return sends. Shift-Return adds a new line.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    EmptyState(title: "Choose a chat", description: "Create a new chat or select an existing conversation.", symbol: "bubble.left.and.bubble.right")
                }
            }
        }
    }
}

func nativeChatComposerLabel(for status: String) -> String {
    switch status.lowercased() {
    case "sending":
        return "Sending"
    case "thinking":
        return "Thinking"
    case "streaming":
        return "Streaming"
    case "aborting":
        return "Stopping"
    case "error", "failed":
        return "Failed"
    default:
        return "Idle"
    }
}

func nativeChatComposerTone(for status: String) -> NativeStatusTone {
    switch status.lowercased() {
    case "sending", "thinking", "streaming", "aborting":
        return .info
    case "error", "failed":
        return .danger
    default:
        return .neutral
    }
}

func nativeChatComposerIcon(for status: String) -> String? {
    switch status.lowercased() {
    case "sending":
        return "paperplane"
    case "thinking":
        return "brain"
    case "streaming":
        return "waveform"
    case "aborting":
        return "stop.fill"
    case "error", "failed":
        return "exclamationmark.triangle.fill"
    default:
        return "checkmark.circle.fill"
    }
}

func nativeChatShouldSendComposerShortcut(
    keyCode: Int,
    modifierFlags: NSEvent.ModifierFlags,
    isComposing: Bool,
    canSend: Bool,
    draft: String
) -> Bool {
    guard !isComposing else { return false }
    guard keyCode == 36 || keyCode == 76 else { return false }
    guard !modifierFlags.contains(.shift) else { return false }
    return canSend && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
}

func nativeChatShouldInsertComposerLineBreak(
    keyCode: Int,
    modifierFlags: NSEvent.ModifierFlags,
    isComposing: Bool
) -> Bool {
    guard !isComposing else { return false }
    guard keyCode == 36 || keyCode == 76 else { return false }
    return modifierFlags.contains(.shift)
}

func nativeChatBridgeLabel(for state: ChatBridgeState) -> String {
    switch state {
    case .connected:
        return "Connected"
    case .reconnecting:
        return "Reconnecting"
    case .polling:
        return "Polling"
    case .disconnected:
        return "Disconnected"
    }
}

func nativeChatBridgeTone(for state: ChatBridgeState) -> NativeStatusTone {
    switch state {
    case .connected:
        return .success
    case .reconnecting, .polling:
        return .info
    case .disconnected:
        return .warning
    }
}

func nativeChatBridgeIcon(for state: ChatBridgeState) -> String {
    switch state {
    case .connected:
        return "link.circle.fill"
    case .reconnecting:
        return "arrow.triangle.2.circlepath"
    case .polling:
        return "timer"
    case .disconnected:
        return "wifi.slash"
    }
}

func nativeChatToolActivityLabel(for status: ChatToolActivityStatus) -> String {
    switch status {
    case .queued:
        return "Queued"
    case .running:
        return "Running"
    case .completed:
        return "Completed"
    case .failed:
        return "Failed"
    }
}

func nativeChatToolActivityTone(for status: ChatToolActivityStatus) -> NativeStatusTone {
    switch status {
    case .queued, .running:
        return .info
    case .completed:
        return .success
    case .failed:
        return .danger
    }
}

private struct NativeChatComposerTextView: NSViewRepresentable {
    @Binding var text: String
    let canSend: Bool
    let onSend: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder

        let textView = NativeChatTextView()
        textView.delegate = context.coordinator
        textView.font = .systemFont(ofSize: 14)
        textView.isRichText = false
        textView.importsGraphics = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 10, height: 10)
        textView.onSend = onSend
        textView.canSendDraft = { canSend && !textView.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        scrollView.documentView = textView
        return scrollView
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let textView = nsView.documentView as? NativeChatTextView else { return }
        if textView.string != text {
            textView.string = text
        }
        textView.onSend = onSend
        textView.canSendDraft = { canSend && !textView.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        private var text: Binding<String>

        init(text: Binding<String>) {
            self.text = text
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            text.wrappedValue = textView.string
        }
    }
}

private final class NativeChatTextView: NSTextView {
    var onSend: (() -> Void)?
    var canSendDraft: (() -> Bool)?

    override func keyDown(with event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let composing = hasMarkedText()

        if nativeChatShouldInsertComposerLineBreak(
            keyCode: Int(event.keyCode),
            modifierFlags: flags,
            isComposing: composing
        ) {
            insertNewlineIgnoringFieldEditor(self)
            return
        }

        if nativeChatShouldSendComposerShortcut(
            keyCode: Int(event.keyCode),
            modifierFlags: flags,
            isComposing: composing,
            canSend: canSendDraft?() ?? false,
            draft: string
        ) {
            onSend?()
            return
        }

        super.keyDown(with: event)
    }
}

struct TeamScreen: View {
    @Bindable var appState: ChillClawAppState
    @State private var showTeamSheet = false

    var body: some View {
        WorkspaceScaffold(title: "AI Team", subtitle: "Group members into focused teams.") {
            ActionButton("Create Team", systemImage: "plus", variant: .primary) {
                showTeamSheet = true
            }
        } content: {
            if let teams = appState.aiTeamOverview?.teams, !teams.isEmpty {
                ForEach(teams) { team in
                    SurfaceCard(title: team.name, subtitle: team.purpose) {
                        HStack {
                            TagBadge("\(team.memberCount) members", tone: .neutral)
                            Spacer()
                            ActionButton("Delete", variant: .destructive) {
                                Task { await deleteTeam(team.id) }
                            }
                        }
                    }
                }
            } else {
                EmptyState(title: "No teams yet", description: "Create a team to group members by purpose, workflow, or channel.", symbol: "person.3.sequence")
            }
        }
        .sheet(isPresented: $showTeamSheet) {
            TeamSheet(appState: appState)
        }
    }

    private func deleteTeam(_ id: String) async {
        do {
            let response = try await appState.client.deleteTeam(teamId: id)
            appState.aiTeamOverview = response.overview
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

struct SettingsScreen: View {
    @Bindable var appState: ChillClawAppState
    @State private var isRedoingOnboarding = false

    var body: some View {
        WorkspaceScaffold(title: "Settings", subtitle: "Inspect the daemon, permissions, and recovery controls.") {
            EmptyView()
        } content: {
            SurfaceCard(title: "Daemon", minimumHeight: nativeWorkspaceCollectionCardMinHeight) {
                SettingRow(title: "Current state", subtitle: String(describing: appState.processManager.status)) {
                    EmptyView()
                }
                HStack {
                    ActionButton("Refresh State", variant: .outline) {
                        Task { await appState.refreshDaemonState() }
                    }
                    ActionButton("Restart Daemon", variant: .secondary) {
                        Task {
                            await appState.processManager.restart()
                            await appState.refreshAll()
                        }
                    }
                    ActionButton("Stop Daemon", variant: .destructive) {
                        Task {
                            await appState.processManager.stop()
                            await appState.refreshDaemonState()
                        }
                    }
                }
            }

            SurfaceCard(title: "Fallback", minimumHeight: nativeWorkspaceCollectionCardMinHeight) {
                Text("Open the existing React UI in your browser if you need parity with the current web surface.")
                ActionButton("Open Web Fallback", systemImage: "globe", variant: .outline) {
                    appState.openFallbackWeb()
                }
            }

            SurfaceCard(
                title: nativePermissionsCopy().settingsTitle,
                subtitle: nativePermissionsCopy().settingsBody
            ) {
                NativePermissionsList(localeIdentifier: resolveNativeOnboardingLocaleIdentifier())
            }

            SurfaceCard(title: "Guided Setup", minimumHeight: nativeWorkspaceCollectionCardMinHeight) {
                Text("Run the guided setup again without uninstalling ChillClaw.")
                ActionButton(isRedoingOnboarding ? "Resetting..." : "Redo onboarding", variant: .secondary, isBusy: isRedoingOnboarding) {
                    Task {
                        isRedoingOnboarding = true
                        defer { isRedoingOnboarding = false }
                        await appState.redoOnboarding()
                    }
                }
                .disabled(isRedoingOnboarding)
            }
        }
    }
}

private enum NativeConfigurationModelSheetBusyState: Equatable {
    case idle
    case remove
    case save
    case input
    case refresh
}

private let nativeConfigurationCustomModelKeyOption = "__custom_model_key__"

private enum NativeConfigurationModelEntryRole {
    case normal
    case `default`
    case fallback
}

private struct NativeConfigurationModelOption: Identifiable {
    let key: String
    let name: String

    var id: String { key }
}

private func nativeProviderFallbackGlyph(_ providerId: String, label: String? = nil) -> String {
    let mapped: [String: String] = [
        "openai": "OA",
        "openai-codex": "OC",
        "anthropic": "AN",
        "amazon-bedrock": "AB",
        "byteplus": "BY",
        "cloudflare-ai-gateway": "CF",
        "custom-provider": "CU",
        "github": "GH",
        "github-copilot": "GC",
        "google": "GO",
        "gemini": "GE",
        "huggingface": "HF",
        "hugging-face-inference": "HF",
        "minimax": "MM",
        "mistral": "MI",
        "moonshot": "MO",
        "volcano-engine": "VO",
    ]

    if let mapped = mapped[providerId] { return mapped }

    let source = (label?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? label! : providerId)
    let words = source
        .replacingOccurrences(of: "-", with: " ")
        .split(separator: " ")
        .prefix(2)
    let initials = words.compactMap { $0.first }.map(String.init).joined().uppercased()
    if !initials.isEmpty {
        return initials
    }

    return String(providerId.prefix(2)).uppercased()
}

private func nativeConfigurationModelOptions(
    _ modelConfig: ModelConfigOverview?,
    provider: ModelProviderConfig?
) -> [NativeConfigurationModelOption] {
    guard let modelConfig, let provider else { return [] }

    let providerModels = modelConfig.models.filter { model in
        provider.providerRefs.contains { ref in
            model.key.starts(with: "\(ref.replacingOccurrences(of: #"/$"#, with: "", options: .regularExpression))/")
        }
    }

    if !providerModels.isEmpty {
        return providerModels.map { model in
            NativeConfigurationModelOption(key: model.key, name: model.name)
        }
    }

    return provider.sampleModels.map { modelKey in
        NativeConfigurationModelOption(
            key: modelKey,
            name: modelKey.split(separator: "/").last.map(String.init) ?? modelKey
        )
    }
}

private func nativeConfigurationProviderConfiguredModels(
    _ modelConfig: ModelConfigOverview?,
    provider: ModelProviderConfig?
) -> [String] {
    guard let modelConfig, let provider else { return [] }
    return modelConfig.configuredModelKeys.filter { key in
        provider.providerRefs.contains { ref in key.starts(with: ref) }
    }
}

private func nativeConfigurationProviderActiveModel(
    _ modelConfig: ModelConfigOverview?,
    provider: ModelProviderConfig?
) -> String? {
    guard let modelConfig, let provider else { return nil }

    if let defaultModel = modelConfig.defaultModel,
       provider.providerRefs.contains(where: { defaultModel.starts(with: $0) }) {
        return defaultModel
    }

    return nativeConfigurationProviderConfiguredModels(modelConfig, provider: provider).first
}

private func nativeConfigurationModelKeyPlaceholder(_ provider: ModelProviderConfig?) -> String {
    guard let provider else { return "provider/model-name" }
    if let sample = provider.sampleModels.first, !sample.isEmpty {
        return sample
    }
    return "\(provider.providerRefs.first?.replacingOccurrences(of: #"/?$"#, with: "/", options: .regularExpression) ?? "")model-name"
}

private func nativeConfigurationModelSelectValue(
    models: [NativeConfigurationModelOption],
    modelKey: String
) -> String {
    guard !modelKey.isEmpty else {
        return models.first?.key ?? nativeConfigurationCustomModelKeyOption
    }

    return models.contains(where: { $0.key == modelKey }) ? modelKey : nativeConfigurationCustomModelKeyOption
}

private func nativeConfigurationResolveModelEntryRole(
    makeDefault: Bool,
    useAsFallback: Bool
) -> NativeConfigurationModelEntryRole {
    if makeDefault {
        return .default
    }
    if useAsFallback {
        return .fallback
    }
    return .normal
}

private func nativeConfigurationApplyModelEntryRole(
    _ role: NativeConfigurationModelEntryRole
) -> (makeDefault: Bool, useAsFallback: Bool) {
    (
        makeDefault: role == .default,
        useAsFallback: role == .fallback
    )
}

private func nativeConfigurationDefaultModelEntryRole(
    liveConfiguredModelCount: Int,
    initialEntry: SavedModelEntry?
) -> NativeConfigurationModelEntryRole {
    if let initialEntry {
        return nativeConfigurationResolveModelEntryRole(
            makeDefault: initialEntry.isDefault,
            useAsFallback: initialEntry.isFallback
        )
    }

    return liveConfiguredModelCount == 0 ? .default : .normal
}

private func nativeConfigurationValidateModelEntryDraft(
    method: ModelAuthMethod?,
    values: [String: String],
    role: NativeConfigurationModelEntryRole
) -> String? {
    guard role != .normal else { return nil }
    guard let method else { return "Choose an authentication method first." }

    for field in method.fields {
        let value = values[field.id]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if field.required && value.isEmpty {
            return "\(field.label) is required."
        }

        let lowercaseLabel = field.label.lowercased()
        let lowercaseFieldId = field.id.lowercased()
        let looksLikeAPIKey = lowercaseFieldId.contains("apikey") || lowercaseLabel.contains("api key")
        if looksLikeAPIKey && !value.isEmpty {
            if value.contains(where: \.isWhitespace) {
                return "\(field.label) cannot contain spaces."
            }
            if value.count < 10 {
                return "\(field.label) looks too short."
            }
        }
    }

    return nil
}

private struct NativeConfigurationProviderMark: View {
    let provider: ModelProviderConfig
    let size: CGFloat

    init(provider: ModelProviderConfig, size: CGFloat = 48) {
        self.provider = provider
        self.size = size
    }

    var body: some View {
        let palette = nativeConfigurationProviderPalette(provider.id)

        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color.white.opacity(0.94), palette.softHighlight],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text(nativeProviderFallbackGlyph(provider.id, label: provider.label))
                .font(.system(size: size * 0.30, weight: .bold))
                .foregroundStyle(palette.accentStrong)
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .stroke(palette.accent.opacity(0.18), lineWidth: 1)
        )
    }
}

private struct NativeConfigurationChannelMark: View {
    let channelId: SupportedChannelId
    let size: CGFloat

    init(channelId: SupportedChannelId, size: CGFloat = 48) {
        self.channelId = channelId
        self.size = size
    }

    var body: some View {
        let palette = nativeConfigurationChannelPalette(channelId)

        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [palette.softHighlight, palette.softFill],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Image(systemName: nativeConfigurationChannelSymbol(channelId))
                .font(.system(size: size * 0.34, weight: .semibold))
                .foregroundStyle(palette.accentStrong)
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .stroke(palette.accent.opacity(0.16), lineWidth: 1)
        )
    }
}

private struct ModelEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: ChillClawAppState
    let existingEntry: SavedModelEntry?

    @State private var providerId = ""
    @State private var label = ""
    @State private var modelKey = ""
    @State private var methodId = ""
    @State private var values: [String: String] = [:]
    @State private var session: ModelAuthSession?
    @State private var sessionInput = ""
    @State private var busyState: NativeConfigurationModelSheetBusyState = .idle
    @State private var makeDefault = false
    @State private var useAsFallback = false

    private var modelProviders: [ModelProviderConfig] {
        appState.modelConfig?.providers ?? []
    }

    private var currentProvider: ModelProviderConfig? {
        modelProviders.first(where: { $0.id == providerId })
    }

    private var currentMethod: ModelAuthMethod? {
        currentProvider?.authMethods.first(where: { $0.id == methodId })
    }

    private var models: [NativeConfigurationModelOption] {
        nativeConfigurationModelOptions(appState.modelConfig, provider: currentProvider)
    }

    private var selectedModelValue: String {
        nativeConfigurationModelSelectValue(models: models, modelKey: modelKey)
    }

    private var showCustomModelInput: Bool {
        models.isEmpty || selectedModelValue == nativeConfigurationCustomModelKeyOption
    }

    private var isEdit: Bool {
        existingEntry != nil
    }

    private var role: NativeConfigurationModelEntryRole {
        nativeConfigurationResolveModelEntryRole(makeDefault: makeDefault, useAsFallback: useAsFallback)
    }

    private var validationError: String? {
        nativeConfigurationValidateModelEntryDraft(method: currentMethod, values: values, role: role)
    }

    private var saveDisabled: Bool {
        providerId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        methodId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        modelKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        validationError != nil ||
        busyState != .idle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if providerId.isEmpty {
                        providerChooser
                    } else if let provider = currentProvider {
                        providerSetup(provider: provider)
                    } else {
                        EmptyState(
                            title: "No providers available",
                            description: "Refresh providers to reload the current OpenClaw model catalog.",
                            symbol: "sparkles"
                        )
                    }
                }
                .padding(22)
            }

            if !providerId.isEmpty {
                Divider()
                footer
            }
        }
        .frame(width: 880, height: 720)
        .background(Color(NSColor.windowBackgroundColor))
        .onAppear {
            configureInitialState()
        }
        .onChange(of: methodId) { _, _ in
            session = nil
            sessionInput = ""
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(isEdit ? "Edit AI Model" : "Add AI Model")
                    .font(.title2.weight(.bold))
                Text("Choose a provider, model, and authentication for this saved AI model entry.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
                    .background(
                        RoundedRectangle(cornerRadius: NativeUI.compactCornerRadius, style: .continuous)
                            .fill(Color.secondary.opacity(0.08))
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(22)
    }

    private var providerChooser: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
            ForEach(modelProviders) { provider in
                let palette = nativeConfigurationProviderPalette(provider.id)

                Button {
                    selectProvider(provider.id, preserveSelection: false)
                } label: {
                    HStack(alignment: .top, spacing: 14) {
                        NativeConfigurationProviderMark(provider: provider)

                        VStack(alignment: .leading, spacing: 6) {
                            Text(provider.label)
                                .font(.headline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(provider.description)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 0)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: NativeUI.panelCornerRadius, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.98), palette.softFill],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: NativeUI.panelCornerRadius, style: .continuous)
                            .stroke(Color.blue.opacity(0.12), lineWidth: 1.5)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func providerSetup(provider: ModelProviderConfig) -> some View {
        let palette = nativeConfigurationProviderPalette(provider.id)

        SurfaceCard(tone: .muted, padding: 20, spacing: 16) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 16) {
                    NativeConfigurationProviderMark(provider: provider, size: 56)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(provider.label)
                            .font(.title3.weight(.bold))
                        Text(provider.description)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: 0)
                }

                HStack(spacing: 12) {
                    ActionButton("Change Provider", variant: .outline) {
                        session = nil
                        sessionInput = ""
                        providerId = ""
                    }

                    if !provider.docsUrl.isEmpty {
                        ActionButton("Documentation", systemImage: "arrow.up.right.square", variant: .ghost) {
                            openURLString(provider.docsUrl)
                        }
                    }
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: NativeUI.cardCornerRadius, style: .continuous)
                .stroke(palette.accent.opacity(0.12), lineWidth: 1)
        )

        LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Display name")
                    .font(.headline)
                TextField("\(provider.label) \(modelKey.split(separator: "/").last.map(String.init) ?? "model")", text: $label)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Model")
                    .font(.headline)

                if !models.isEmpty {
                    Picker(
                        "",
                        selection: Binding(
                            get: { selectedModelValue },
                            set: { nextValue in
                                if nextValue == nativeConfigurationCustomModelKeyOption {
                                    if models.contains(where: { $0.key == modelKey }) {
                                        modelKey = ""
                                    }
                                    return
                                }

                                modelKey = nextValue
                            }
                        )
                    ) {
                        ForEach(models) { model in
                            Text("\(model.name) (\(model.key))").tag(model.key)
                        }
                        Text("Custom model key…").tag(nativeConfigurationCustomModelKeyOption)
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                if showCustomModelInput {
                    TextField(nativeConfigurationModelKeyPlaceholder(provider), text: $modelKey)
                        .textFieldStyle(.roundedBorder)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Authentication Method")
                    .font(.headline)
                Picker("", selection: $methodId) {
                    ForEach(provider.authMethods) { method in
                        Text(method.label).tag(method.id)
                    }
                }
                .labelsHidden()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }

        if let method = currentMethod {
            SurfaceCard(padding: 20, spacing: 16) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(nativeConfigurationSetupTitle(for: provider, method: method))
                            .font(.headline)
                        Text(method.description)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    if method.interactive && session == nil {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: onboardingAuthMethodSymbol(method))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(palette.accentStrong)
                                .frame(width: 26, height: 26)
                                .background(
                                    Circle()
                                        .fill(palette.softHighlight)
                                )

                            Text("Saving this entry starts the interactive \(method.label.lowercased()) flow in OpenClaw.")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if !method.fields.isEmpty {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 16) {
                            ForEach(method.fields) { field in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(field.label)
                                        .font(.headline)

                                    if field.secret == true {
                                        SecureField(field.placeholder ?? field.label, text: Binding(
                                            get: { values[field.id] ?? "" },
                                            set: { values[field.id] = $0 }
                                        ))
                                        .textFieldStyle(.roundedBorder)
                                    } else {
                                        TextField(field.placeholder ?? field.label, text: Binding(
                                            get: { values[field.id] ?? "" },
                                            set: { values[field.id] = $0 }
                                        ))
                                        .textFieldStyle(.roundedBorder)
                                    }
                                }
                            }
                        }
                    }

                    if let validationError {
                        Text(validationError)
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }

                    if let session {
                        modelAuthProgress(session: session, palette: palette)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func modelAuthProgress(
        session: ModelAuthSession,
        palette: NativeConfigurationPalette
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider()

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Text("Authentication progress")
                        .font(.headline)
                    StatusBadge(session.status.capitalized, tone: session.status == "completed" ? .success : .info)
                }

                Text(session.message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            if !session.logs.isEmpty {
                ScrollView {
                    Text(session.logs.joined(separator: "\n"))
                        .font(.system(size: 12, weight: .regular, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                }
                .frame(minHeight: 120, maxHeight: 180)
                .background(
                    RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                        .fill(palette.softFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                        .stroke(palette.accent.opacity(0.10), lineWidth: 1)
                )
            }

            HStack(spacing: 12) {
                if let launchURL = session.launchUrl, !launchURL.isEmpty {
                    ActionButton("Open authentication window", systemImage: "arrow.up.right.square", variant: .outline) {
                        openURLString(launchURL)
                    }
                }

                ActionButton("Refresh authentication", systemImage: "arrow.clockwise", variant: .outline, isBusy: busyState == .refresh) {
                    Task { await refreshSession() }
                }
            }

            if session.status == "awaiting-input" {
                VStack(alignment: .leading, spacing: 12) {
                    if let prompt = session.inputPrompt, !prompt.isEmpty {
                        Text(prompt)
                            .font(.callout.weight(.medium))
                    }

                    HStack(alignment: .top, spacing: 12) {
                        TextField(session.inputPrompt ?? "Paste redirect URL or code", text: $sessionInput)
                            .textFieldStyle(.roundedBorder)

                        ActionButton(
                            "Finish Authentication",
                            variant: .primary,
                            isBusy: busyState == .input,
                            isDisabled: sessionInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busyState != .idle
                        ) {
                            Task { await submitSessionInput() }
                        }
                    }
                }
            }
        }
    }

    private var footer: some View {
        HStack(alignment: .center, spacing: 16) {
            HStack(spacing: 10) {
                TagBadge(currentProvider?.configured == true ? "Provider seen in OpenClaw" : "New provider setup", tone: .neutral)
                switch role {
                case .default:
                    TagBadge("Default", tone: .success)
                case .fallback:
                    TagBadge("Fallback", tone: .accent)
                case .normal:
                    TagBadge("Normal", tone: .neutral)
                }
            }

            Spacer(minLength: 0)

            HStack(spacing: 12) {
                if let existingEntry {
                    ActionButton("Remove", variant: .destructive, isBusy: busyState == .remove, isDisabled: busyState != .idle) {
                        Task { await remove(entry: existingEntry) }
                    }
                }

                ActionButton("Refresh providers", systemImage: "arrow.clockwise", variant: .outline, isBusy: busyState == .refresh, isDisabled: busyState != .idle) {
                    Task { await refreshProviders() }
                }

                ActionButton(isEdit ? "Save Changes" : "Save Entry", variant: .primary, isBusy: busyState == .save, isDisabled: saveDisabled) {
                    Task { await save() }
                }
            }
        }
        .padding(20)
    }

    private func remove(entry: SavedModelEntry) async {
        busyState = .remove
        defer { busyState = .idle }

        do {
            let response = try await appState.client.deleteModelEntry(entryId: entry.id)
            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
            dismiss()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func configureInitialState() {
        let runtimeModelCount = nativeRuntimeConfiguredModels(appState.modelConfig).count
        let nextRole = nativeConfigurationDefaultModelEntryRole(
            liveConfiguredModelCount: runtimeModelCount,
            initialEntry: existingEntry
        )
        let nextFlags = nativeConfigurationApplyModelEntryRole(nextRole)
        makeDefault = nextFlags.makeDefault
        useAsFallback = nextFlags.useAsFallback
        session = nil
        sessionInput = ""
        values = [:]

        if let existingEntry {
            label = existingEntry.label
            providerId = existingEntry.providerId
            methodId = existingEntry.authMethodId ?? ""
            modelKey = existingEntry.modelKey
            selectProvider(existingEntry.providerId, preserveSelection: true)
        } else {
            providerId = ""
            label = ""
            methodId = ""
            modelKey = ""
        }
    }

    private func selectProvider(_ nextProviderId: String, preserveSelection: Bool) {
        providerId = nextProviderId
        session = nil
        sessionInput = ""

        guard let provider = modelProviders.first(where: { $0.id == nextProviderId }) else {
            methodId = ""
            modelKey = ""
            values = [:]
            return
        }

        if !preserveSelection || !provider.authMethods.contains(where: { $0.id == methodId }) {
            if let existingEntry, existingEntry.providerId == provider.id, let existingMethodId = existingEntry.authMethodId, provider.authMethods.contains(where: { $0.id == existingMethodId }) {
                methodId = existingMethodId
            } else {
                methodId = provider.authMethods.first?.id ?? ""
            }
        }

        let providerModels = nativeConfigurationModelOptions(appState.modelConfig, provider: provider)
        if preserveSelection {
            if modelKey.isEmpty == false,
               (providerModels.contains(where: { $0.key == modelKey }) || providerModels.isEmpty) {
                // Keep the current selection.
            } else if let existingEntry, existingEntry.providerId == provider.id {
                modelKey = existingEntry.modelKey
            } else {
                modelKey = nativeConfigurationProviderActiveModel(appState.modelConfig, provider: provider)
                    ?? provider.sampleModels.first
                    ?? providerModels.first?.key
                    ?? ""
            }
        } else {
            modelKey = nativeConfigurationProviderActiveModel(appState.modelConfig, provider: provider)
                ?? provider.sampleModels.first
                ?? providerModels.first?.key
                ?? ""
            values = [:]
        }
    }

    private func saveRequestValues() -> [String: String] {
        guard let method = currentMethod else { return [:] }
        return method.fields.reduce(into: [String: String]()) { result, field in
            let value = values[field.id]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !value.isEmpty {
                result[field.id] = value
            }
        }
    }

    private func save() async {
        guard let provider = currentProvider, let currentMethod else { return }

        busyState = .save
        defer {
            if busyState == .save {
                busyState = .idle
            }
        }

        do {
            let request = SaveModelEntryRequest(
                label: label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "\(provider.label) \(modelKey.split(separator: "/").last.map(String.init) ?? modelKey)"
                    : label.trimmingCharacters(in: .whitespacesAndNewlines),
                providerId: provider.id,
                methodId: currentMethod.id,
                modelKey: modelKey.trimmingCharacters(in: .whitespacesAndNewlines),
                values: saveRequestValues(),
                makeDefault: makeDefault,
                useAsFallback: useAsFallback
            )

            let response: ModelConfigActionResponse
            if let existingEntry {
                response = try await appState.client.updateModelEntry(entryId: existingEntry.id, request: request)
            } else {
                response = try await appState.client.createModelEntry(request)
            }

            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
            session = response.authSession

            if response.authSession == nil && response.status == "completed" {
                await appState.refreshAll()
                dismiss()
            } else {
                busyState = .idle
            }
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func refreshProviders() async {
        busyState = .refresh
        defer { busyState = .idle }

        do {
            let next = try await appState.client.fetchModelConfig()
            appState.modelConfig = next

            if !providerId.isEmpty {
                if next.providers.contains(where: { $0.id == providerId }) {
                    selectProvider(providerId, preserveSelection: true)
                } else {
                    providerId = ""
                    methodId = ""
                    modelKey = ""
                    values = [:]
                    session = nil
                    sessionInput = ""
                }
            }
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func refreshSession() async {
        guard let sessionID = session?.id else { return }

        busyState = .refresh
        defer { busyState = .idle }

        do {
            let next = try await appState.client.fetchModelAuthSession(sessionId: sessionID)
            session = next.session
            appState.modelConfig = next.modelConfig

            if next.session.status == "completed" {
                await appState.refreshAll()
                dismiss()
            }
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func submitSessionInput() async {
        guard let sessionID = session?.id else { return }
        let value = sessionInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }

        busyState = .input
        defer { busyState = .idle }

        do {
            let next = try await appState.client.submitModelAuthInput(sessionId: sessionID, value: value)
            session = next.session
            sessionInput = ""
            appState.modelConfig = next.modelConfig

            if next.session.status == "completed" {
                await appState.refreshAll()
                dismiss()
            }
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func openURLString(_ value: String) {
        guard let url = URL(string: value) else { return }
        NSWorkspace.shared.open(url)
    }

    private func nativeConfigurationSetupTitle(
        for provider: ModelProviderConfig,
        method: ModelAuthMethod
    ) -> String {
        switch resolveNativeOnboardingModelSetupVariant(providerID: provider.id, methodKind: method.kind) {
        case .oauth:
            return "Interactive flow"
        case .guidedMiniMaxAPIKey:
            return "API key setup"
        case .defaultAPIKey:
            return method.kind == "api-key" ? "API key setup" : "Direct setup"
        }
    }
}

private struct ChannelEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: ChillClawAppState
    let existingEntry: ConfiguredChannelEntry?
    let preferredAction: NativeConfigurationChannelSheetAction

    @State private var channelId: SupportedChannelId?
    @State private var values: [String: String] = [:]
    @State private var busyAction: NativeConfigurationChannelSheetAction?
    @State private var message = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if channelId == nil {
                        channelChooser
                    } else if let capability = currentCapability {
                        channelSetup(capability: capability)
                    } else {
                        EmptyState(
                            title: "No channels available",
                            description: "Refresh the current OpenClaw channel catalog and try again.",
                            symbol: "message"
                        )
                    }
                }
                .padding(22)
            }

            if channelId != nil {
                Divider()
                footer
            }
        }
        .frame(width: 880, height: 720)
        .background(Color(NSColor.windowBackgroundColor))
        .onAppear {
            configureInitialState()
        }
    }

    private var channelCapabilities: [ChannelCapability] {
        appState.channelConfig?.capabilities ?? []
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(existingEntry == nil ? "Add Channel" : "Edit Channel")
                    .font(.title2.weight(.bold))
                Text("Choose a communication channel, review the setup guidance, and save the account through ChillClaw.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
                    .background(
                        RoundedRectangle(cornerRadius: NativeUI.compactCornerRadius, style: .continuous)
                            .fill(Color.secondary.opacity(0.08))
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(22)
    }

    private var channelChooser: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
            ForEach(channelCapabilities) { capability in
                let palette = nativeConfigurationChannelPalette(capability.id)

                Button {
                    selectChannel(capability.id, preserveValues: false)
                } label: {
                    HStack(alignment: .top, spacing: 14) {
                        NativeConfigurationChannelMark(channelId: capability.id)

                        VStack(alignment: .leading, spacing: 6) {
                            Text(capability.label)
                                .font(.headline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(capability.description)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 0)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: NativeUI.panelCornerRadius, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.98), palette.softFill],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: NativeUI.panelCornerRadius, style: .continuous)
                            .stroke(Color.blue.opacity(0.12), lineWidth: 1.5)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func channelSetup(capability: ChannelCapability) -> some View {
        let palette = nativeConfigurationChannelPalette(capability.id)

        SurfaceCard(tone: .muted, padding: 20, spacing: 16) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 16) {
                    NativeConfigurationChannelMark(channelId: capability.id, size: 56)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(capability.label)
                            .font(.title3.weight(.bold))
                        Text(capability.description)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: 0)
                }

                HStack(spacing: 12) {
                    ActionButton("Change Channel", variant: .outline) {
                        channelId = nil
                        message = ""
                    }

                    if let docsURL = capability.docsUrl, !docsURL.isEmpty {
                        ActionButton("Documentation", systemImage: "arrow.up.right.square", variant: .ghost) {
                            openURLString(docsURL)
                        }
                    }
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: NativeUI.cardCornerRadius, style: .continuous)
                .stroke(palette.accent.opacity(0.12), lineWidth: 1)
        )

        if let existingEntry {
            SurfaceCard(padding: 20, spacing: 14) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .center, spacing: 12) {
                        Text("Current configuration")
                            .font(.headline)
                        Spacer(minLength: 0)
                        StatusBadge(existingEntry.status.capitalized, tone: nativeConfigurationChannelTone(existingEntry.status))
                    }

                    Text(existingEntry.summary)
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    if !existingEntry.maskedConfigSummary.isEmpty {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 16) {
                            ForEach(existingEntry.maskedConfigSummary) { item in
                                NativeConfigurationMetaPill(title: item.label, value: item.value, palette: palette)
                            }
                        }
                    }
                }
            }
        }

        channelGuidance(capability: capability, palette: palette)

        if let activeSession {
            SurfaceCard(padding: 20, spacing: 16) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .center, spacing: 12) {
                        Text("Active session")
                            .font(.headline)
                        StatusBadge(activeSession.status.capitalized, tone: activeSession.status == "completed" ? .success : .info)
                    }

                    Text(activeSession.message)
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    if !activeSession.logs.isEmpty {
                        ScrollView {
                            Text(activeSession.logs.joined(separator: "\n"))
                                .font(.system(size: 12, weight: .regular, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                        }
                        .frame(minHeight: 120, maxHeight: 180)
                        .background(
                            RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                                .fill(palette.softFill)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                                .stroke(palette.accent.opacity(0.10), lineWidth: 1)
                        )
                    }

                    if let prompt = activeSession.inputPrompt, !prompt.isEmpty {
                        Text(prompt)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    if let launchURL = activeSession.launchUrl, !launchURL.isEmpty {
                        ActionButton("Open session link", systemImage: "arrow.up.right.square", variant: .outline) {
                            openURLString(launchURL)
                        }
                    }
                }
            }
        }

        if !capability.fieldDefs.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 16) {
                ForEach(capability.fieldDefs) { field in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(field.label)
                            .font(.headline)

                        channelFieldEditor(field)

                        if let helpText = field.helpText, !helpText.isEmpty {
                            Text(helpText)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .gridCellColumns(field.kind == "textarea" ? 2 : 1)
                }
            }
        }

        if !message.isEmpty {
            Text(message)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func channelGuidance(
        capability: ChannelCapability,
        palette: NativeConfigurationPalette
    ) -> some View {
        switch capability.guidedSetupKind {
        case "feishu":
            SurfaceCard(padding: 20, spacing: 14) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Feishu setup guidance")
                        .font(.headline)
                    Text("Follow the official Feishu channel guide, then return here to save credentials and finish pairing in ChillClaw.")
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("1. Create the enterprise app and enable bot capability.")
                        Text("2. Copy the App ID and App Secret into ChillClaw.")
                        Text("3. Use Prepare so OpenClaw can verify the Feishu plugin is ready.")
                        Text("4. Publish the app, send the bot a direct message, then approve pairing here.")
                    }
                    .font(.callout)
                    .foregroundStyle(.secondary)

                    if let docsURL = capability.docsUrl, !docsURL.isEmpty {
                        ActionButton("Open official Feishu guide", systemImage: "arrow.up.right.square", variant: .outline) {
                            openURLString(docsURL)
                        }
                    }
                }
            }
        case "wechat-work":
            SurfaceCard(padding: 20, spacing: 14) {
                Text("WeChat Work setup guidance")
                    .font(.headline)
                Text("ChillClaw manages the required WeCom plugin automatically. Save the Bot ID and Secret here, and the daemon will install or update the plugin before writing the channel config.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        case "wechat":
            SurfaceCard(padding: 20, spacing: 14) {
                Text("Personal WeChat login")
                    .font(.headline)
                Text("ChillClaw starts the QR-first WeChat installer for you. Use Start Login to begin, then keep this sheet open while the session log streams the pairing steps.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private func channelFieldEditor(_ field: ChannelFieldDefinition) -> some View {
        switch field.kind {
        case "select":
            Picker(
                "",
                selection: Binding(
                    get: { values[field.id] ?? field.options?.first?.value ?? "" },
                    set: { values[field.id] = $0 }
                )
            ) {
                ForEach(field.options ?? [], id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
            .labelsHidden()
            .frame(maxWidth: .infinity, alignment: .leading)
        case "textarea":
            TextEditor(text: Binding(
                get: { values[field.id] ?? "" },
                set: { values[field.id] = $0 }
            ))
            .font(.system(size: 14))
            .frame(minHeight: 120)
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                    .fill(Color(NSColor.textBackgroundColor))
            )
            .overlay(
                RoundedRectangle(cornerRadius: NativeUI.standardCornerRadius, style: .continuous)
                    .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
            )
        default:
            if field.secret == true {
                SecureField(field.placeholder ?? field.label, text: Binding(
                    get: { values[field.id] ?? "" },
                    set: { values[field.id] = $0 }
                ))
                .textFieldStyle(.roundedBorder)
            } else {
                TextField(field.placeholder ?? field.label, text: Binding(
                    get: { values[field.id] ?? "" },
                    set: { values[field.id] = $0 }
                ))
                .textFieldStyle(.roundedBorder)
            }
        }
    }

    private var footer: some View {
        HStack(alignment: .center, spacing: 16) {
            HStack(spacing: 10) {
                TagBadge((currentCapability?.officialSupport == true) ? "Official" : "Workaround", tone: currentCapability?.officialSupport == true ? .success : .warning)
                if existingEntry?.pairingRequired == true {
                    StatusBadge("Pairing required", tone: .info)
                }
            }

            Spacer(minLength: 0)

            HStack(spacing: 12) {
                if currentCapability?.guidedSetupKind == "feishu" {
                    ActionButton("Prepare", variant: .outline, isBusy: busyAction == .prepare, isDisabled: busyAction != nil) {
                        Task { await runAction(.prepare) }
                    }
                }

                if currentCapability?.supportsLogin == true {
                    ActionButton("Start Login", variant: .outline, isBusy: busyAction == .login, isDisabled: busyAction != nil) {
                        Task { await runAction(.login) }
                    }
                }

                if let currentCapability, currentCapability.id != .whatsapp && currentCapability.id != .wechat {
                    ActionButton(existingEntry == nil ? "Save Channel" : "Save Changes", variant: .primary, isBusy: busyAction == .save, isDisabled: busyAction != nil) {
                        Task { await runAction(.save) }
                    }
                }

                if currentCapability?.supportsPairing == true {
                    ActionButton("Approve Pairing", variant: .outline, isBusy: busyAction == .approvePairing, isDisabled: values["code", default: ""].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busyAction != nil) {
                        Task { await runAction(.approvePairing) }
                    }
                }
            }
        }
        .padding(20)
    }

    private var currentCapability: ChannelCapability? {
        guard let channelId else { return nil }
        return channelCapabilities.first(where: { $0.id == channelId })
    }

    private var activeSession: ChannelSession? {
        guard let channelId else { return nil }
        guard let activeSession = appState.channelConfig?.activeSession, activeSession.channelId == channelId else {
            return nil
        }
        return activeSession
    }

    private var defaultChannelValues: [String: String] {
        [
            "domain": "feishu",
            "botName": "ChillClaw Assistant"
        ]
    }

    private func configureInitialState() {
        message = ""
        if let existingEntry {
            selectChannel(existingEntry.channelId, preserveValues: true)
            values = seededValues(for: existingEntry.channelId, existingValues: existingEntry.editableValues)
        } else {
            channelId = nil
            values = defaultChannelValues
        }

        if preferredAction == .approvePairing {
            values["code"] = values["code", default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private func seededValues(
        for channelId: SupportedChannelId,
        existingValues: [String: String]
    ) -> [String: String] {
        let capability = channelCapabilities.first(where: { $0.id == channelId })
        var next = defaultChannelValues
        next.merge(existingValues, uniquingKeysWith: { _, new in new })

        for field in capability?.fieldDefs ?? [] where field.kind == "select" {
            if (next[field.id] ?? "").isEmpty, let defaultValue = field.options?.first?.value {
                next[field.id] = defaultValue
            }
        }

        return next
    }

    private func selectChannel(_ nextChannelId: SupportedChannelId, preserveValues: Bool) {
        channelId = nextChannelId
        message = ""

        if preserveValues, let existingEntry, existingEntry.channelId == nextChannelId {
            values = seededValues(for: nextChannelId, existingValues: existingEntry.editableValues)
            return
        }

        values = seededValues(for: nextChannelId, existingValues: [:])
    }

    private func runAction(_ action: NativeConfigurationChannelSheetAction) async {
        guard busyAction == nil, let channelId else { return }

        busyAction = action
        defer { busyAction = nil }

        do {
            let response = try await appState.client.saveChannelEntry(
                entryId: existingEntry?.id,
                request: buildConfigurationChannelRequest(
                    channelId: channelId,
                    entryId: existingEntry?.id,
                    editableValues: values,
                    action: action,
                    pairingCode: values["code", default: ""]
                )
            )
            appState.channelConfig = response.channelConfig
            appState.applyBanner(response.message)
            message = response.message

            if shouldCloseNativeConfigurationChannelSheetAfterAction(
                action: action,
                channelId: channelId,
                hasSession: response.session != nil
            ) {
                await appState.refreshAll()
                dismiss()
            }
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func openURLString(_ value: String) {
        guard let url = URL(string: value) else { return }
        NSWorkspace.shared.open(url)
    }
}

private struct CustomSkillSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: ChillClawAppState
    @State private var name = ""
    @State private var slug = ""
    @State private var description = ""
    @State private var instructions = ""
    @State private var homepage = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("New Custom Skill")
                .font(.title2)
                .fontWeight(.semibold)
            TextField("Name", text: $name)
            TextField("Slug", text: $slug)
            TextField("Description", text: $description)
            TextField("Homepage", text: $homepage)
            TextEditor(text: $instructions)
                .frame(height: 180)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") {
                    Task { await save() }
                }
                .disabled(name.isEmpty || description.isEmpty || instructions.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 620, height: 460)
    }

    private func save() async {
        do {
            let response = try await appState.client.saveCustomSkill(
                skillId: nil,
                request: SaveCustomSkillRequest(name: name, slug: slug.isEmpty ? nil : slug, description: description, instructions: instructions, homepage: homepage.isEmpty ? nil : homepage)
            )
            appState.skillConfig = response.skillConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
            dismiss()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

private struct MemberSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: ChillClawAppState

    @State private var name = ""
    @State private var selectedPresetId = ""
    @State private var jobTitle = ""
    @State private var personality = ""
    @State private var soul = ""
    @State private var selectedBrain = ""
    @State private var workStyles = ""
    @State private var presetSkillIds: [String] = []
    @State private var skillIds: [String] = []
    @State private var knowledgePackIds: [String] = []
    @State private var memoryEnabled = true

    private var memberPresets: [AIMemberPreset] {
        appState.aiTeamOverview?.memberPresets ?? []
    }

    private var selectedPreset: AIMemberPreset? {
        memberPresets.first(where: { $0.id == selectedPresetId })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Create AI Member")
                .font(.title2)
                .fontWeight(.semibold)
            if !memberPresets.isEmpty {
                Picker("Preset", selection: $selectedPresetId) {
                    ForEach(memberPresets) { preset in
                        Text(preset.label).tag(preset.id)
                    }
                }
                .onChange(of: selectedPresetId) { _, nextPresetId in
                    applyPreset(memberPresets.first(where: { $0.id == nextPresetId }))
                }
                Text(selectedPreset?.description ?? "Choose a preset to preload a useful starter setup.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            TextField("Name", text: $name)
            TextField("Job Title", text: $jobTitle)
            Picker("Brain", selection: $selectedBrain) {
                ForEach(appState.aiTeamOverview?.availableBrains ?? []) { brain in
                    Text(brain.label).tag(brain.id)
                }
            }
            TextField("Personality", text: $personality)
            TextField("Soul", text: $soul)
            TextField("Work styles (comma separated)", text: $workStyles)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") {
                    Task { await save() }
                }
                .disabled(name.isEmpty || jobTitle.isEmpty || selectedBrain.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 560)
        .onAppear {
            selectedBrain = appState.aiTeamOverview?.availableBrains.first?.id ?? ""
            if selectedPresetId.isEmpty, let firstPreset = memberPresets.first {
                selectedPresetId = firstPreset.id
                applyPreset(firstPreset)
            }
        }
    }

    private func save() async {
        do {
            let request = SaveAIMemberRequest(
                name: name,
                jobTitle: jobTitle,
                avatar: memberAvatar(for: selectedPreset?.avatarPresetId),
                brainEntryId: selectedBrain,
                personality: personality,
                soul: soul,
                workStyles: workStyles.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty },
                presetSkillIds: presetSkillIds.isEmpty ? nil : presetSkillIds,
                skillIds: skillIds,
                knowledgePackIds: knowledgePackIds,
                capabilitySettings: MemberCapabilitySettings(memoryEnabled: memoryEnabled, contextWindow: 8000)
            )
            let response = try await appState.client.saveMember(memberId: nil, request: request)
            appState.aiTeamOverview = response.overview
            appState.applyBanner(response.message)
            await appState.refreshAll()
            dismiss()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func applyPreset(_ preset: AIMemberPreset?) {
        guard let preset else { return }
        jobTitle = preset.jobTitle
        personality = preset.personality
        soul = preset.soul
        workStyles = preset.workStyles.joined(separator: ", ")
        presetSkillIds = preset.presetSkillIds ?? []
        skillIds = preset.skillIds
        knowledgePackIds = preset.knowledgePackIds
        memoryEnabled = preset.defaultMemoryEnabled ?? true
    }

    private func memberAvatar(for presetId: String?) -> MemberAvatar {
        switch presetId {
        case "analyst":
            return MemberAvatar(presetId: "analyst", accent: "#97b5ea", emoji: "🧠", theme: "onboarding")
        case "builder":
            return MemberAvatar(presetId: "builder", accent: "#9ec1ef", emoji: "🛠️", theme: "onboarding")
        default:
            return MemberAvatar(presetId: "operator", accent: "#4f46e5", emoji: "✨", theme: nil)
        }
    }
}

private struct TeamSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: ChillClawAppState
    @State private var name = ""
    @State private var purpose = ""
    @State private var selectedMembers: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Create Team")
                .font(.title2)
                .fontWeight(.semibold)
            TextField("Name", text: $name)
            TextField("Purpose", text: $purpose)
            List(appState.aiTeamOverview?.members ?? [], selection: $selectedMembers) { member in
                Text(member.name)
            }
            .frame(height: 200)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") {
                    Task { await save() }
                }
                .disabled(name.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 560, height: 420)
    }

    private func save() async {
        do {
            let response = try await appState.client.saveTeam(teamId: nil, request: SaveTeamRequest(name: name, purpose: purpose, memberIds: Array(selectedMembers), displayOrder: nil))
            appState.aiTeamOverview = response.overview
            appState.applyBanner(response.message)
            await appState.refreshAll()
            dismiss()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}
