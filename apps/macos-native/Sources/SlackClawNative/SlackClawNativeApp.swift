import SwiftUI
import SlackClawClient
import SlackClawProtocol
import SlackClawChatUI

@main
struct SlackClawNativeApp: App {
    @State private var appState = SlackClawAppState()

    var body: some Scene {
        WindowGroup("SlackClaw") {
            RootView(appState: appState)
                .task {
                    await appState.bootstrap()
                }
        }
        .windowResizability(.contentSize)
        .defaultSize(width: 1340, height: 860)
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
                NavigationSplitView {
                    List(NativeSection.allCases, selection: $appState.selectedSection) { section in
                        Label(section.rawValue, systemImage: icon(for: section))
                            .tag(section)
                    }
                    .navigationTitle("SlackClaw")
                } detail: {
                    VStack(spacing: 0) {
                        toolbar
                        Divider()
                        content
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

    private var toolbar: some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                Text("SlackClaw Native")
                    .font(.title2)
                    .fontWeight(.semibold)
                Text(statusText)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Refresh") {
                Task { await appState.refreshAll() }
            }
            Button("Open Web Fallback") {
                appState.openFallbackWeb()
            }
        }
        .padding(16)
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
}
