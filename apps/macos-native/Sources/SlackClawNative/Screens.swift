import AppKit
import SwiftUI
import SlackClawClient
import SlackClawProtocol
import SlackClawChatUI

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
    @Bindable var appState: SlackClawAppState
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
    @Bindable var appState: SlackClawAppState
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

struct ConfigurationScreen: View {
    @Bindable var appState: SlackClawAppState
    @State private var selectedTab = 0
    @State private var showModelSheet = false
    @State private var showChannelSheet = false
    @State private var selectedChannelEntry: ConfiguredChannelEntry?
    @State private var channelSheetAction: NativeConfigurationChannelSheetAction = .save

    var body: some View {
        WorkspaceScaffold(title: "Configuration", subtitle: "Manage models, channels, and pairing flows.") {
            if selectedTab == 0 {
                ActionButton("Add Model", systemImage: "plus", variant: .primary) { showModelSheet = true }
            } else {
                ActionButton("Add Channel", systemImage: "plus", variant: .primary) { presentAddChannelSheet() }
            }
        } content: {
            VStack(alignment: .leading, spacing: 20) {
                Picker("Config", selection: $selectedTab) {
                    Text("Models").tag(0)
                    Text("Channels").tag(1)
                }
                .pickerStyle(.segmented)

                if selectedTab == 0 {
                    modelsView
                } else {
                    channelsView
                }
            }
        }
        .sheet(isPresented: $showModelSheet) {
            ModelEntrySheet(appState: appState, existingEntry: nil)
        }
        .sheet(isPresented: $showChannelSheet) {
            ChannelEntrySheet(
                appState: appState,
                existingEntry: selectedChannelEntry,
                preferredAction: channelSheetAction
            )
        }
    }

    private var modelsView: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(appState.modelConfig?.savedEntries ?? []) { entry in
                SurfaceCard(title: entry.label, subtitle: entry.modelKey) {
                    HStack {
                        Text(entry.providerId)
                            .foregroundStyle(.secondary)
                        Spacer()
                        if entry.isDefault {
                            TagBadge("Default", tone: .success)
                        }
                        ActionButton("Edit", variant: .outline) {
                            showModelSheet = true
                        }
                        .disabled(true)
                        ActionButton("Set Default", variant: .secondary) {
                            Task { await setDefaultModel(entry.id) }
                        }
                        .disabled(entry.isDefault)
                        ActionButton("Remove", variant: .destructive) {
                            Task { await removeModel(entry.id) }
                        }
                    }
                }
            }
        }
    }

    private var channelsView: some View {
        let entries = appState.channelConfig?.entries ?? []
        return VStack(alignment: .leading, spacing: 14) {
            ForEach(entries) { entry in
                let capability = appState.channelConfig?.capabilities.first(where: { $0.id == entry.channelId })
                let actionState = configurationChannelActionState(entry: entry, capability: capability)

                SurfaceCard(title: entry.label, subtitle: nativeChannelDisplayLabel(entry.channelId)) {
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(entry.summary)
                                .foregroundStyle(.secondary)
                            if entry.pairingRequired {
                                TagBadge("Pairing required", tone: .info)
                            }
                        }
                        Spacer()
                        if actionState.showApproveAction {
                            ActionButton("Approve Pairing", variant: .secondary) {
                                presentChannelSheet(for: entry, action: .approvePairing)
                            }
                        }
                        ActionButton(actionState.primaryAction == .continueSetup ? "Continue Setup" : "Edit", variant: .outline) {
                            presentChannelSheet(for: entry, action: .save)
                        }
                        ActionButton("Remove", variant: .destructive) {
                            Task {
                                await removeChannel(entry)
                            }
                        }
                    }
                }
        }

        if let activeSession = appState.channelConfig?.activeSession {
            SurfaceCard(title: "Active Channel Session", subtitle: activeSession.message) {
                VStack(alignment: .leading, spacing: 8) {
                    if let prompt = activeSession.inputPrompt {
                        Text(prompt)
                    }
                    if let launchUrl = activeSession.launchUrl, let url = URL(string: launchUrl) {
                        ActionButton("Open Session Link", systemImage: "link", variant: .outline) {
                            NSWorkspace.shared.open(url)
                        }
                    }
                }
            }
            }
        }
    }

    private func setDefaultModel(_ entryId: String) async {
        do {
            let response = try await appState.client.setDefaultModelEntry(entryId: entryId)
            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func removeModel(_ entryId: String) async {
        do {
            let response = try await appState.client.deleteModelEntry(entryId: entryId)
            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }

    private func removeChannel(_ entry: ConfiguredChannelEntry) async {
        do {
            let response = try await appState.client.deleteChannelEntry(request: RemoveChannelEntryRequest(entryId: entry.id, channelId: entry.channelId.rawValue, values: nil))
            appState.channelConfig = response.channelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
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
}

private enum NativeManagedPluginAction {
    case install
    case update
    case remove
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
    @Bindable var appState: SlackClawAppState
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
    @Bindable var appState: SlackClawAppState
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
    @Bindable var appState: SlackClawAppState
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
    @Bindable var appState: SlackClawAppState

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

                        SlackClawChatTranscriptView(thread: thread)

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
    @Bindable var appState: SlackClawAppState
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
    @Bindable var appState: SlackClawAppState
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

private struct ModelEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: SlackClawAppState
    let existingEntry: SavedModelEntry?

    @State private var providerId = ""
    @State private var label = ""
    @State private var modelKey = ""
    @State private var methodId = ""
    @State private var secretValue = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(existingEntry == nil ? "Add Model" : "Edit Model")
                .font(.title2)
                .fontWeight(.semibold)
            Picker("Provider", selection: $providerId) {
                ForEach(appState.modelConfig?.providers ?? []) { provider in
                    Text(provider.label).tag(provider.id)
                }
            }
            TextField("Display name", text: $label)
            TextField("Model key", text: $modelKey)
            Picker("Auth Method", selection: $methodId) {
                ForEach(currentProvider?.authMethods ?? []) { method in
                    Text(method.label).tag(method.id)
                }
            }
            if !(currentProvider?.authMethods.first(where: { $0.id == methodId })?.interactive ?? false) {
                SecureField("Secret", text: $secretValue)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button(existingEntry == nil ? "Save" : "Update") {
                    Task { await save() }
                }
                .disabled(providerId.isEmpty || modelKey.isEmpty || methodId.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 520)
        .onAppear {
            if let firstProvider = appState.modelConfig?.providers.first {
                providerId = firstProvider.id
                methodId = firstProvider.authMethods.first?.id ?? ""
            }
        }
    }

    private var currentProvider: ModelProviderConfig? {
        appState.modelConfig?.providers.first(where: { $0.id == providerId })
    }

    private func save() async {
        do {
            let request = SaveModelEntryRequest(
                label: label.isEmpty ? (currentProvider?.label ?? modelKey) : label,
                providerId: providerId,
                methodId: methodId,
                modelKey: modelKey,
                values: secretValue.isEmpty ? [:] : ["token": secretValue, "apiKey": secretValue],
                makeDefault: appState.modelConfig?.savedEntries.isEmpty == true,
                useAsFallback: false
            )
            let response: ModelConfigActionResponse
            if let existingEntry {
                response = try await appState.client.updateModelEntry(entryId: existingEntry.id, request: request)
            } else {
                response = try await appState.client.createModelEntry(request)
            }
            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
            dismiss()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

private struct ChannelEntrySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: SlackClawAppState
    let existingEntry: ConfiguredChannelEntry?
    let preferredAction: NativeConfigurationChannelSheetAction

    @State private var channelId: SupportedChannelId = .telegram
    @State private var values: [String: String] = [:]
    @State private var busyAction: NativeConfigurationChannelSheetAction?
    @State private var message = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(existingEntry == nil ? "Add Channel" : "Edit Channel")
                .font(.title2)
                .fontWeight(.semibold)
            Picker("Channel", selection: $channelId) {
                ForEach(appState.channelConfig?.capabilities ?? []) { capability in
                    Text(capability.label).tag(capability.id)
                }
            }
            if let existingEntry {
                HStack(spacing: 10) {
                    Text(existingEntry.summary)
                        .foregroundStyle(.secondary)
                    if existingEntry.pairingRequired {
                        Text("Pairing required")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(.blue)
                    }
                }
            }
            ForEach(currentCapability?.fieldDefs ?? []) { field in
                TextField(field.label, text: Binding(
                    get: { values[field.id, default: ""] },
                    set: { values[field.id] = $0 }
                ))
            }
            if let activeSession, activeSession.channelId == channelId {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Active session")
                        .font(.headline)
                    Text(activeSession.message)
                        .foregroundStyle(.secondary)
                    if !activeSession.logs.isEmpty {
                        ScrollView {
                            Text(activeSession.logs.joined(separator: "\n"))
                                .font(.system(size: 12, weight: .regular, design: .monospaced))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(minHeight: 100, maxHeight: 160)
                    }
                    if let prompt = activeSession.inputPrompt {
                        Text(prompt)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: NativeUI.compactCornerRadius, style: .continuous))
            }
            if !message.isEmpty {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button(currentCapability?.id == .wechat ? (activeSession == nil ? "Start Login" : "Restart Login") : (existingEntry == nil ? "Save Channel" : "Save Changes")) {
                    Task { await runAction(.save) }
                }
                .disabled(false)
                if currentCapability?.supportsPairing == true {
                    Button("Approve Pairing") {
                        Task { await runAction(.approvePairing) }
                    }
                    .disabled(values["code", default: ""].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .padding(24)
        .frame(width: 520)
        .onAppear {
            channelId = existingEntry?.channelId ?? appState.channelConfig?.capabilities.first?.id ?? .telegram
            values = defaultChannelValues.merging(existingEntry?.editableValues ?? [:], uniquingKeysWith: { _, new in new })
            message = ""
            if preferredAction == .approvePairing {
                values["code"] = values["code", default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
    }

    private var currentCapability: ChannelCapability? {
        appState.channelConfig?.capabilities.first(where: { $0.id == channelId })
    }

    private var activeSession: ChannelSession? {
        appState.channelConfig?.activeSession
    }

    private var defaultChannelValues: [String: String] {
        [
            "domain": "feishu",
            "botName": "ChillClaw Assistant"
        ]
    }

    private func runAction(_ action: NativeConfigurationChannelSheetAction) async {
        guard busyAction == nil else { return }

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
            await appState.refreshAll()
            dismiss()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

private struct CustomSkillSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var appState: SlackClawAppState
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
    @Bindable var appState: SlackClawAppState

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
    @Bindable var appState: SlackClawAppState
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
