import AppKit
import SwiftUI
import SlackClawClient
import SlackClawProtocol
import SlackClawChatUI

private struct SectionCard<Content: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder let content: Content

    init(title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.title3)
                .fontWeight(.semibold)
            if let subtitle {
                Text(subtitle)
                    .foregroundStyle(.secondary)
            }
            content
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.white)
                .shadow(color: Color.black.opacity(0.05), radius: 24, x: 0, y: 14)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color(red: 0.87, green: 0.9, blue: 0.96), lineWidth: 1)
        )
    }
}

private struct NativeMetricCard: View {
    let title: String
    let value: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 32, weight: .bold))
            Text(detail)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.white)
                .shadow(color: Color.black.opacity(0.04), radius: 16, x: 0, y: 10)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(red: 0.9, green: 0.93, blue: 0.97), lineWidth: 1)
        )
    }
}

private struct NativeBadge: View {
    let label: String
    let systemImage: String
    let tone: NativeDashboardTone

    var body: some View {
        Label(label, systemImage: systemImage)
            .font(.system(size: 12, weight: .semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(backgroundColor, in: Capsule())
            .foregroundStyle(foregroundColor)
    }

    private var backgroundColor: Color {
        switch tone {
        case .success:
            return Color.green.opacity(0.14)
        case .warning:
            return Color.orange.opacity(0.16)
        case .info:
            return Color.blue.opacity(0.14)
        case .neutral:
            return Color.primary.opacity(0.08)
        }
    }

    private var foregroundColor: Color {
        switch tone {
        case .success:
            return .green
        case .warning:
            return .orange
        case .info:
            return .blue
        case .neutral:
            return .primary
        }
    }
}

private struct DashboardStatusPill: View {
    let status: String
    let tone: NativeDashboardTone

    var body: some View {
        Text(status)
            .font(.system(size: 12, weight: .semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(backgroundColor, in: Capsule())
            .foregroundStyle(foregroundColor)
    }

    private var backgroundColor: Color {
        switch tone {
        case .success:
            return Color.green.opacity(0.14)
        case .warning:
            return Color.orange.opacity(0.16)
        case .info:
            return Color.blue.opacity(0.14)
        case .neutral:
            return Color.primary.opacity(0.08)
        }
    }

    private var foregroundColor: Color {
        switch tone {
        case .success:
            return .green
        case .warning:
            return .orange
        case .info:
            return .blue
        case .neutral:
            return .primary
        }
    }
}

private struct NativeDashboardMemberAvatar: View {
    let avatar: MemberAvatar
    let name: String
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(accentColor.opacity(0.14))

            if let image = onboardingAssetImage(avatar.presetId) {
                image
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(accentColor)
            }
        }
        .frame(width: size, height: size)
        .overlay(
            Circle()
                .stroke(accentColor.opacity(0.18), lineWidth: 1)
        )
    }

    private var accentColor: Color {
        colorFromHex(avatar.accent) ?? .blue
    }
}

private func colorFromHex(_ hex: String) -> Color? {
    var sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    sanitized = sanitized.replacingOccurrences(of: "#", with: "")

    guard sanitized.count == 6, let value = Int(sanitized, radix: 16) else {
        return nil
    }

    let red = Double((value >> 16) & 0xFF) / 255.0
    let green = Double((value >> 8) & 0xFF) / 255.0
    let blue = Double(value & 0xFF) / 255.0
    return Color(red: red, green: green, blue: blue)
}

private struct DashboardEmployeeCard: View {
    let row: NativeDashboardEmployeeRow

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 16) {
                NativeDashboardMemberAvatar(avatar: row.avatar, name: row.name, size: 72)

                VStack(alignment: .leading, spacing: 8) {
                    Text(row.name)
                        .font(.headline)
                        .fontWeight(.semibold)
                    Text(row.jobTitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        DashboardStatusPill(status: row.status, tone: row.status == "ready" ? .success : row.status == "busy" ? .info : .neutral)
                        if row.activeTaskCount > 0 {
                            DashboardStatusPill(status: "\(row.activeTaskCount) active", tone: .neutral)
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
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
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
            DashboardStatusPill(status: item.status, tone: item.tone)
        }
        .padding(.vertical, 2)
    }
}

struct DashboardScreen: View {
    @Bindable var appState: SlackClawAppState

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                if let overview = appState.overview {
                    let presentation = makeDashboardPresentation(
                        overview: overview,
                        modelConfig: appState.modelConfig,
                        aiTeamOverview: appState.aiTeamOverview
                    )

                    dashboardContent(
                        overview: overview,
                        presentation: presentation,
                        availableWidth: geometry.size.width
                    )
                    .padding(24)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(24)
                }
            }
        }
    }

    @ViewBuilder
    private func dashboardContent(
        overview: ProductOverview,
        presentation: NativeDashboardPresentation,
        availableWidth: CGFloat
    ) -> some View {
        let isCompact = availableWidth < 1120
        let metricColumns = dashboardMetricColumns(for: availableWidth)

        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Dashboard")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text("Track your workspace status, AI member roster, and recent activity from one screen.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                HStack(spacing: 12) {
                    Button("Create Employee") {
                        appState.selectedSection = .members
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Open Team") {
                        appState.selectedSection = .team
                    }
                    .buttonStyle(.bordered)
                }
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    NativeBadge(label: "Powered by OpenClaw", systemImage: "sparkles", tone: .info)
                    NativeBadge(label: "Workspace active", systemImage: "checkmark.circle.fill", tone: .success)
                    NativeBadge(label: presentation.heroVersion, systemImage: "brain.head.profile", tone: .neutral)
                }

                Text("Figma shell, backend-truthful state")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("The layout mirrors the React dashboard while the metrics and lists stay daemon-backed.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(
                    colors: [
                        Color.blue.opacity(0.18),
                        Color.green.opacity(0.10),
                        Color.purple.opacity(0.12)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 24, style: .continuous)
            )

            LazyVGrid(columns: metricColumns, spacing: 16) {
                ForEach(presentation.metrics, id: \.title) { metric in
                    NativeMetricCard(title: metric.title, value: metric.value, detail: metric.detail)
                }
            }

            if isCompact {
                VStack(alignment: .leading, spacing: 16) {
                    employeeStatusSection(presentation: presentation)
                    recentActivitySection(presentation: presentation)
                    workspaceHealthSection(presentation: presentation)
                }
            } else {
                HStack(alignment: .top, spacing: 16) {
                    employeeStatusSection(presentation: presentation)
                        .frame(maxWidth: .infinity, alignment: .topLeading)

                    VStack(alignment: .leading, spacing: 16) {
                        recentActivitySection(presentation: presentation)
                        workspaceHealthSection(presentation: presentation)
                    }
                    .frame(width: min(availableWidth * 0.34, 420), alignment: .top)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func dashboardMetricColumns(for width: CGFloat) -> [GridItem] {
        if width >= 1340 {
            return Array(repeating: GridItem(.flexible(minimum: 160), spacing: 16), count: 5)
        }
        if width >= 1100 {
            return Array(repeating: GridItem(.flexible(minimum: 180), spacing: 16), count: 3)
        }
        if width >= 760 {
            return Array(repeating: GridItem(.flexible(minimum: 200), spacing: 16), count: 2)
        }
        return [GridItem(.flexible(minimum: 220), spacing: 16)]
    }

    private func employeeStatusSection(presentation: NativeDashboardPresentation) -> some View {
        SectionCard(title: "Employee Status") {
            HStack {
                Spacer()
                Button("View all") {
                    appState.selectedSection = .team
                }
                .buttonStyle(.plain)
                .foregroundStyle(.blue)
            }

            if presentation.employeeRows.isEmpty {
                Text("No AI members yet.")
                    .foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(presentation.employeeRows) { row in
                        DashboardEmployeeCard(row: row)
                    }
                }
            }
        }
    }

    private func recentActivitySection(presentation: NativeDashboardPresentation) -> some View {
        SectionCard(title: "Recent Activity") {
            if presentation.activityRows.isEmpty {
                Text("No recent activity.")
                    .foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(presentation.activityRows) { row in
                        DashboardActivityCard(row: row)
                    }
                }
            }
        }
    }

    private func workspaceHealthSection(presentation: NativeDashboardPresentation) -> some View {
        SectionCard(title: "Workspace Health") {
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
            ScrollView {
                let presentation = makeDeployPresentation(
                    overview: appState.overview,
                    targets: appState.deploymentTargets
                )

                VStack(alignment: .leading, spacing: 20) {
                    HStack(alignment: .top, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Deploy OpenClaw")
                                .font(.system(size: 46, weight: .bold))
                                .fontWeight(.bold)
                            Text("Choose a variant and deploy with one click")
                                .font(.system(size: 20))
                                .foregroundStyle(.secondary)
                        }

                        Spacer(minLength: 0)

                        HStack(spacing: 12) {
                            Button {
                                Task { await appState.refreshCurrentSectionIfNeeded() }
                            } label: {
                                Label("Refresh", systemImage: "arrow.clockwise")
                            }
                            .buttonStyle(.bordered)

                            Button {
                                Task { await runGatewayRestart() }
                            } label: {
                                HStack(spacing: 8) {
                                    if restartingGateway {
                                        ProgressView()
                                            .controlSize(.small)
                                    } else {
                                        Image(systemName: "bolt.fill")
                                    }
                                    Text(restartingGateway ? "Restarting…" : "Restart Gateway")
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(actionBusy || presentation.installedTargets.isEmpty)
                        }
                    }

                    if actionBusy {
                        deployActivityCard
                    }

                    deployHeroCard(lastCheckedAt: presentation.lastCheckedAt)

                    deploySection(
                        title: "Installed variants",
                        subtitle: "OpenClaw variants already ready on this Mac.",
                        targets: presentation.installedTargets,
                        emptyTitle: "Nothing installed yet",
                        emptyBody: "Pick an available variant below to deploy OpenClaw."
                    )

                    deploySection(
                        title: "Available variants",
                        subtitle: "Ready-to-deploy options supported by SlackClaw today.",
                        targets: presentation.availableTargets,
                        emptyTitle: "No available variants",
                        emptyBody: "SlackClaw could not find a deployable target right now."
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

                    LazyVGrid(columns: deploySummaryColumns(for: geometry.size.width), alignment: .leading, spacing: 16) {
                        ForEach(presentation.summaryCards) { card in
                            deploySummaryCard(card)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(24)
            }
        }
    }

    private func runInstall(_ targetId: String) async {
        installingTargetId = targetId
        activityTitle = "Installing OpenClaw"
        activitySummary = "Preparing the selected runtime and configuring SlackClaw."
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

    private var deployActivityCard: some View {
        HStack(spacing: 16) {
            ProgressView()
            VStack(alignment: .leading, spacing: 6) {
                Text(activityTitle)
                    .font(.headline)
                Text(activitySummary)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.04), radius: 20, x: 0, y: 12)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.blue.opacity(0.18), lineWidth: 1)
        )
    }

    private func deployHeroCard(lastCheckedAt: String?) -> some View {
        HStack(alignment: .top, spacing: 18) {
            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.blue.opacity(0.12))
                Image(systemName: "rocket")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.blue)
            }
            .frame(width: 96, height: 132)

            VStack(alignment: .leading, spacing: 14) {
                Text("One-Click Deployment")
                    .font(.system(size: 24, weight: .bold))
                Text("Select your preferred OpenClaw variant and deploy instantly. No terminal commands or manual configuration required.")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)
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
            Spacer(minLength: 0)
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.blue.opacity(0.08))
                .shadow(color: Color.blue.opacity(0.08), radius: 22, x: 0, y: 14)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.blue.opacity(0.18), lineWidth: 1)
        )
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
        SectionCard(title: title, subtitle: subtitle) {
            if targets.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    if !emptyTitle.isEmpty {
                        Text(emptyTitle)
                            .font(.headline)
                    }
                    if !emptyBody.isEmpty {
                        Text(emptyBody)
                            .foregroundStyle(.secondary)
                    }
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
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(deployAccentColor(target.accent).opacity(0.14))
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
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.white)
                .shadow(color: Color.black.opacity(0.05), radius: 22, x: 0, y: 14)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Color(red: 0.86, green: 0.9, blue: 0.96), lineWidth: 1)
        )
    }

    private func deployActionButton(_ action: NativeDeployActionKind, targetId: String, prominent: Bool) -> some View {
        let isBusy = isActionBusy(action, targetId: targetId)
        return Button {
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
        } label: {
            HStack(spacing: 8) {
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: iconName(for: action))
                }
                Text(buttonTitle(for: action, busy: isBusy))
            }
            .frame(maxWidth: .infinity)
        }
        .modifier(NativeDeployButtonStyleModifier(prominent: prominent))
        .disabled(actionBusy)
    }

    private func deploySummaryCard(_ card: NativeDeploySummaryCard) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: card.symbol)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(deployAccentColor(card.accent))
                .frame(width: 36, height: 36)
                .background(deployAccentColor(card.accent).opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text(card.title)
                    .font(.headline)
                Text(card.body)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.white)
                .shadow(color: Color.black.opacity(0.04), radius: 18, x: 0, y: 12)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(red: 0.9, green: 0.93, blue: 0.97), lineWidth: 1)
        )
    }

    private func deployBadge(_ badge: NativeDeployBadge) -> some View {
        let palette = deployBadgePalette(badge)
        return Text(palette.label)
            .font(.system(size: 12, weight: .semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(palette.background, in: Capsule())
            .foregroundStyle(palette.foreground)
    }

    private func deployBadgePalette(_ badge: NativeDeployBadge) -> (label: String, background: Color, foreground: Color) {
        switch badge {
        case .installed:
            return ("Installed", Color.green.opacity(0.14), .green)
        case .current:
            return ("Current", Color.blue.opacity(0.14), .blue)
        case .updateAvailable:
            return ("Update available", Color.orange.opacity(0.18), .orange)
        case .recommended:
            return ("Recommended", .green, .white)
        case .comingSoon:
            return ("Coming soon", Color.purple.opacity(0.16), .purple)
        }
    }

    private func deploySummaryColumns(for width: CGFloat) -> [GridItem] {
        if width >= 1260 {
            return Array(repeating: GridItem(.flexible(minimum: 220), spacing: 16), count: 3)
        }
        if width >= 860 {
            return Array(repeating: GridItem(.flexible(minimum: 220), spacing: 16), count: 2)
        }
        return [GridItem(.flexible(minimum: 240), spacing: 16)]
    }

    private func deployAccentColor(_ accent: NativeDeployAccent) -> Color {
        switch accent {
        case .blue:
            return .blue
        case .green:
            return .green
        case .purple:
            return .purple
        case .orange:
            return .orange
        }
    }

    private func iconName(for action: NativeDeployActionKind) -> String {
        switch action {
        case .install:
            return "rocket"
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

private struct NativeDeployButtonStyleModifier: ViewModifier {
    let prominent: Bool

    func body(content: Content) -> some View {
        if prominent {
            content.buttonStyle(.borderedProminent)
        } else {
            content.buttonStyle(.bordered)
        }
    }
}

struct ConfigurationScreen: View {
    @Bindable var appState: SlackClawAppState
    @State private var selectedTab = 0
    @State private var showModelSheet = false
    @State private var showChannelSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("Configuration")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Spacer()
                    if selectedTab == 0 {
                        Button("Add Model") { showModelSheet = true }
                    } else {
                        Button("Add Channel") { showChannelSheet = true }
                    }
                }

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
            .padding(24)
        }
        .sheet(isPresented: $showModelSheet) {
            ModelEntrySheet(appState: appState, existingEntry: nil)
        }
        .sheet(isPresented: $showChannelSheet) {
            ChannelEntrySheet(appState: appState, existingEntry: nil)
        }
    }

    private var modelsView: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(appState.modelConfig?.savedEntries ?? []) { entry in
                SectionCard(title: entry.label, subtitle: entry.modelKey) {
                    HStack {
                        Text(entry.providerId)
                            .foregroundStyle(.secondary)
                        Spacer()
                        if entry.isDefault {
                            Text("Default")
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.green.opacity(0.16), in: Capsule())
                        }
                        Button("Edit") {
                            showModelSheet = true
                        }
                        .disabled(true)
                        Button("Set Default") {
                            Task { await setDefaultModel(entry.id) }
                        }
                        .disabled(entry.isDefault)
                        Button("Remove", role: .destructive) {
                            Task { await removeModel(entry.id) }
                        }
                    }
                }
            }
        }
    }

    private var channelsView: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(appState.channelConfig?.entries ?? []) { entry in
                SectionCard(title: entry.label, subtitle: entry.channelId.capitalized) {
                    HStack {
                        Text(entry.summary)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Remove", role: .destructive) {
                            Task {
                                await removeChannel(entry)
                            }
                        }
                    }
                }
            }

            if let activeSession = appState.channelConfig?.activeSession {
                SectionCard(title: "Active Channel Session", subtitle: activeSession.message) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let prompt = activeSession.inputPrompt {
                            Text(prompt)
                        }
                        if let launchUrl = activeSession.launchUrl, let url = URL(string: launchUrl) {
                            Button("Open Session Link") {
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
            let response = try await appState.client.deleteChannelEntry(request: RemoveChannelEntryRequest(entryId: entry.id, channelId: entry.channelId, values: nil))
            appState.channelConfig = response.channelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.presentErrorUnlessCancelled(error)
        }
    }
}

struct SkillsScreen: View {
    @Bindable var appState: SlackClawAppState
    @State private var showCustomSkillSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("Skills Management")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Spacer()
                    Button("New Custom Skill") {
                        showCustomSkillSheet = true
                    }
                }

                SectionCard(title: "Installed Skills") {
                    ForEach(appState.skillConfig?.installedSkills ?? []) { skill in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(skill.name).fontWeight(.semibold)
                                Text(skill.description).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Remove", role: .destructive) {
                                Task { await removeSkill(skill.id) }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                SectionCard(title: "Marketplace Preview") {
                    ForEach(appState.skillConfig?.marketplacePreview ?? []) { skill in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(skill.name).fontWeight(.semibold)
                                Text(skill.summary).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button(skill.installed ? "Reinstall" : "Install") {
                                Task { await installSkill(skill.slug) }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .padding(24)
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
}

struct MembersScreen: View {
    @Bindable var appState: SlackClawAppState
    @State private var showMemberSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("AI Members")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Spacer()
                    Button("Create AI Member") {
                        showMemberSheet = true
                    }
                }

                ForEach(appState.aiTeamOverview?.members ?? []) { member in
                    SectionCard(title: member.name, subtitle: member.jobTitle) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(member.currentStatus)
                                .foregroundStyle(.secondary)
                            if let brain = member.brain {
                                Text("Brain: \(brain.label)")
                            }
                            if !member.bindings.isEmpty {
                                Text("Bindings: \(member.bindings.map { $0.target }.joined(separator: ", "))")
                                    .foregroundStyle(.secondary)
                            }
                            HStack {
                                Button("Delete", role: .destructive) {
                                    Task { await deleteMember(member.id) }
                                }
                            }
                        }
                    }
                }
            }
            .padding(24)
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
        HSplitView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Conversations")
                        .font(.title3)
                        .fontWeight(.semibold)
                    Spacer()
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
                    Button("New Chat") {
                        Task {
                            guard let memberId = appState.selectedMemberForChat ?? appState.aiTeamOverview?.members.first?.id else { return }
                            await appState.chatViewModel.createThread(memberId: memberId)
                        }
                    }
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
            .padding(20)

            VStack(alignment: .leading, spacing: 12) {
                if let thread = appState.chatViewModel.selectedThread {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(thread.title)
                                .font(.title2)
                                .fontWeight(.semibold)
                            Text(thread.sessionKey)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if thread.composerState.canAbort {
                            Button("Stop") {
                                Task { await appState.chatViewModel.abortCurrentRun() }
                            }
                        }
                    }
                    SlackClawChatTranscriptView(messages: thread.messages)
                    HStack {
                        TextField("Message", text: $appState.chatViewModel.draftMessage, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                        Button("Send") {
                            Task { await appState.chatViewModel.sendCurrentMessage() }
                        }
                        .disabled(!thread.composerState.canSend)
                    }
                } else {
                    ContentUnavailableView("Choose a chat", systemImage: "bubble.left.and.bubble.right", description: Text("Create a new chat or select an existing conversation."))
                }
            }
            .padding(20)
        }
    }
}

struct TeamScreen: View {
    @Bindable var appState: SlackClawAppState
    @State private var showTeamSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("AI Team")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Spacer()
                    Button("Create Team") {
                        showTeamSheet = true
                    }
                }

                ForEach(appState.aiTeamOverview?.teams ?? []) { team in
                    SectionCard(title: team.name, subtitle: team.purpose) {
                        HStack {
                            Text("\(team.memberCount) members")
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("Delete", role: .destructive) {
                                Task { await deleteTeam(team.id) }
                            }
                        }
                    }
                }
            }
            .padding(24)
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
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Settings")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                SectionCard(title: "Daemon") {
                    Text(String(describing: appState.processManager.status))
                    HStack {
                        Button("Refresh State") {
                            Task { await appState.refreshDaemonState() }
                        }
                        Button("Restart Daemon") {
                            Task {
                                await appState.processManager.restart()
                                await appState.refreshAll()
                            }
                        }
                        Button("Stop Daemon", role: .destructive) {
                            Task {
                                await appState.processManager.stop()
                                await appState.refreshDaemonState()
                            }
                        }
                    }
                }

                SectionCard(title: "Fallback") {
                    Text("Open the existing React UI in your browser if you need parity with the current web surface.")
                    Button("Open Web Fallback") {
                        appState.openFallbackWeb()
                    }
                }

                SectionCard(title: "Guided Setup") {
                    Text("Run the guided setup again without uninstalling SlackClaw.")
                    Button(isRedoingOnboarding ? "Resetting..." : "Redo onboarding") {
                        Task {
                            isRedoingOnboarding = true
                            defer { isRedoingOnboarding = false }
                            await appState.redoOnboarding()
                        }
                    }
                    .disabled(isRedoingOnboarding)
                }
            }
            .padding(24)
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

    @State private var channelId = ""
    @State private var values: [String: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Add Channel")
                .font(.title2)
                .fontWeight(.semibold)
            Picker("Channel", selection: $channelId) {
                ForEach(appState.channelConfig?.capabilities ?? []) { capability in
                    Text(capability.label).tag(capability.id)
                }
            }
            ForEach(currentCapability?.fieldDefs ?? []) { field in
                TextField(field.label, text: Binding(
                    get: { values[field.id, default: ""] },
                    set: { values[field.id] = $0 }
                ))
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") {
                    Task { await save() }
                }
                .disabled(channelId.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 520)
        .onAppear {
            channelId = appState.channelConfig?.capabilities.first?.id ?? ""
        }
    }

    private var currentCapability: ChannelCapability? {
        appState.channelConfig?.capabilities.first(where: { $0.id == channelId })
    }

    private func save() async {
        do {
            let response = try await appState.client.saveChannelEntry(
                entryId: existingEntry?.id,
                request: SaveChannelEntryRequest(channelId: channelId, entryId: existingEntry?.id, values: values, action: "save")
            )
            appState.channelConfig = response.channelConfig
            appState.applyBanner(response.message)
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
    @State private var jobTitle = ""
    @State private var personality = ""
    @State private var soul = ""
    @State private var selectedBrain = ""
    @State private var workStyles = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Create AI Member")
                .font(.title2)
                .fontWeight(.semibold)
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
        }
    }

    private func save() async {
        do {
            let request = SaveAIMemberRequest(
                name: name,
                jobTitle: jobTitle,
                avatar: MemberAvatar(presetId: "operator", accent: "#4f46e5", emoji: "✨", theme: nil),
                brainEntryId: selectedBrain,
                personality: personality,
                soul: soul,
                workStyles: workStyles.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty },
                skillIds: [],
                knowledgePackIds: [],
                capabilitySettings: MemberCapabilitySettings(memoryEnabled: true, contextWindow: 8000)
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
