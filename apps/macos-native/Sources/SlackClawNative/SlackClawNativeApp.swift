import SwiftUI
import SlackClawClient
import SlackClawProtocol
import SlackClawChatUI

@main
struct SlackClawNativeApp: App {
    @NSApplicationDelegateAdaptor(NativeAppDelegate.self) private var appDelegate
    @State private var appState = SlackClawAppState()

    var body: some Scene {
        WindowGroup("SlackClaw") {
            RootView(appState: appState)
                .task {
                    await appState.bootstrap()
                }
                .preferredColorScheme(.light)
        }
        .windowResizability(.automatic)
        .defaultSize(width: nativeOnboardingDefaultWindowSize.width, height: nativeOnboardingDefaultWindowSize.height)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Refresh") {
                    Task { await appState.refreshAll() }
                }
                .keyboardShortcut("r", modifiers: [.command])

                Button("Open Web Fallback") {
                    appState.openFallbackWeb()
                }
            }
        }
    }
}

struct RootView: View {
    @Bindable var appState: SlackClawAppState

    var body: some View {
        Group {
            if !appState.hasBootstrapped && appState.overview == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if appState.requiresOnboarding {
                NativeOnboardingHostView(appState: appState)
            } else {
                HStack(spacing: 0) {
                    NativeSidebar(appState: appState, iconForSection: icon(for:))
                    ZStack {
                        nativeShellBackground
                            .ignoresSafeArea()
                        content
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                    .frame(minWidth: 940, minHeight: 760)
                }
                .overlay(alignment: .top) {
                    if let banner = appState.bannerMessage {
                        Text(banner)
                            .font(.callout)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(.regularMaterial, in: Capsule())
                            .padding(.top, 12)
                        }
                }
                .task(id: appState.selectedSection) {
                    await appState.refreshCurrentSectionIfNeeded()
                }
            }
        }
        .alert("SlackClaw", isPresented: Binding(
            get: { appState.errorMessage != nil },
            set: { if !$0 { appState.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(appState.errorMessage ?? "")
        }
    }

    private var statusText: String {
        switch appState.endpointStatus {
        case let .ready(url):
            return "Daemon ready at \(url.absoluteString)"
        case let .unavailable(reason):
            return reason
        }
    }

    @ViewBuilder
    private var content: some View {
        switch appState.selectedSection {
        case .dashboard:
            DashboardScreen(appState: appState)
        case .deploy:
            DeployScreen(appState: appState)
        case .configuration:
            ConfigurationScreen(appState: appState)
        case .skills:
            SkillsScreen(appState: appState)
        case .members:
            MembersScreen(appState: appState)
        case .chat:
            ChatScreen(appState: appState)
        case .team:
            TeamScreen(appState: appState)
        case .settings:
            SettingsScreen(appState: appState)
        }
    }

    private func icon(for section: NativeSection) -> String {
        switch section {
        case .dashboard: return "square.grid.2x2"
        case .deploy: return "shippingbox"
        case .configuration: return "slider.horizontal.3"
        case .skills: return "bolt"
        case .members: return "person.2"
        case .chat: return "bubble.left.and.bubble.right"
        case .team: return "person.3"
        case .settings: return "gearshape"
        }
    }

    private var nativeShellBackground: some View {
        LinearGradient(
            colors: [
                Color(red: 0.95, green: 0.97, blue: 1.0),
                Color(red: 0.99, green: 0.99, blue: 1.0)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private struct NativeSidebar: View {
    @Bindable var appState: SlackClawAppState
    let iconForSection: (NativeSection) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sidebarBrand
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                ForEach(NativeSection.allCases) { section in
                    Button {
                        appState.selectedSection = section
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: iconForSection(section))
                                .font(.system(size: 18, weight: .medium))
                                .frame(width: 24)
                            Text(section.rawValue)
                                .font(.system(size: 17, weight: .semibold))
                            Spacer(minLength: 0)
                        }
                        .foregroundStyle(appState.selectedSection == section ? Color.blue : Color(red: 0.22, green: 0.28, blue: 0.4))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(appState.selectedSection == section ? Color.blue.opacity(0.12) : Color.clear)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 10) {
                Text("Status: Active")
                    .font(.system(size: 17, weight: .semibold))
                Text(sidebarStatusSummary)
                    .font(.system(size: 15))
                    .foregroundStyle(Color(red: 0.34, green: 0.41, blue: 0.54))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.blue.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.blue.opacity(0.14), lineWidth: 1)
            )
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .frame(width: 312)
        .background(Color.white)
    }

    private var sidebarBrand: some View {
        HStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 0.18, green: 0.39, blue: 1.0), Color(red: 0.42, green: 0.24, blue: 1.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Image(systemName: "sparkles")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 72, height: 72)

            VStack(alignment: .leading, spacing: 4) {
                Text("SlackClaw")
                    .font(.system(size: 26, weight: .bold))
                Text("OpenClaw Made Easy")
                    .font(.system(size: 15))
                    .foregroundStyle(Color(red: 0.38, green: 0.46, blue: 0.6))
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 26)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sidebarStatusSummary: String {
        switch appState.endpointStatus {
        case .ready:
            return "All systems operational"
        case let .unavailable(reason):
            return reason
        }
    }
}
