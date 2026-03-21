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
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct DashboardScreen: View {
    @Bindable var appState: SlackClawAppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Dashboard")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                if let overview = appState.overview {
                    HStack(spacing: 16) {
                        NativeMetricCard(
                            title: "Engine",
                            value: overview.engine.installed ? "Installed" : "Missing",
                            detail: overview.engine.summary
                        )
                        NativeMetricCard(
                            title: "Connected Models",
                            value: "\(appState.modelConfig?.configuredModelKeys.count ?? 0)",
                            detail: appState.modelConfig?.defaultModel ?? "No default model"
                        )
                        NativeMetricCard(
                            title: "AI Members",
                            value: "\(appState.aiTeamOverview?.members.count ?? 0)",
                            detail: "\(appState.aiTeamOverview?.teams.count ?? 0) teams"
                        )
                    }

                    SectionCard(title: "Health & Recovery") {
                        ForEach(overview.healthChecks) { check in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(check.title).fontWeight(.semibold)
                                Text(check.summary)
                                Text(check.detail).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4)
                        }
                    }

                    SectionCard(title: "Recent Tasks") {
                        if overview.recentTasks.isEmpty {
                            Text("No recent tasks.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(overview.recentTasks) { task in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(task.title).fontWeight(.semibold)
                                    Text(task.summary)
                                    Text(task.status.capitalized).foregroundStyle(.secondary)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                } else {
                    ProgressView()
                }
            }
            .padding(24)
        }
    }
}

struct DeployScreen: View {
    @Bindable var appState: SlackClawAppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("Deploy")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Spacer()
                    Button("Restart Gateway") {
                        Task { await runGatewayRestart() }
                    }
                }

                ForEach(appState.deploymentTargets?.targets ?? []) { target in
                    SectionCard(title: target.title, subtitle: target.description) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(target.summary)
                            HStack {
                                Label(target.installed ? "Installed" : "Not installed", systemImage: target.installed ? "checkmark.circle.fill" : "circle")
                                if let version = target.version {
                                    Text(version).foregroundStyle(.secondary)
                                }
                            }
                            HStack(spacing: 12) {
                                if !target.installed && target.installable && !target.planned {
                                    Button("Install") {
                                        Task { await runInstall(target.id) }
                                    }
                                }
                                if target.installed {
                                    Button("Update") {
                                        Task { await runUpdate(target.id) }
                                    }
                                    if target.installMode != "future" {
                                        Button("Uninstall", role: .destructive) {
                                            Task { await runUninstall(target.id) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }

    private func runInstall(_ targetId: String) async {
        do {
            let response = try await appState.client.installTarget(targetId)
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.errorMessage = error.localizedDescription
        }
    }

    private func runUpdate(_ targetId: String) async {
        do {
            let response = try await appState.client.updateTarget(targetId)
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.errorMessage = error.localizedDescription
        }
    }

    private func runUninstall(_ targetId: String) async {
        do {
            let response = try await appState.client.uninstallTarget(targetId)
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.errorMessage = error.localizedDescription
        }
    }

    private func runGatewayRestart() async {
        do {
            let response = try await appState.client.restartGateway()
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
        }
    }

    private func removeModel(_ entryId: String) async {
        do {
            let response = try await appState.client.deleteModelEntry(entryId: entryId)
            appState.modelConfig = response.modelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.errorMessage = error.localizedDescription
        }
    }

    private func removeChannel(_ entry: ConfiguredChannelEntry) async {
        do {
            let response = try await appState.client.deleteChannelEntry(request: RemoveChannelEntryRequest(entryId: entry.id, channelId: entry.channelId, values: nil))
            appState.channelConfig = response.channelConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
        }
    }

    private func removeSkill(_ id: String) async {
        do {
            let response = try await appState.client.removeSkill(skillId: id)
            appState.skillConfig = response.skillConfig
            appState.applyBanner(response.message)
            await appState.refreshAll()
        } catch {
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
        }
    }
}

struct SettingsScreen: View {
    @Bindable var appState: SlackClawAppState

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
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
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
            appState.errorMessage = error.localizedDescription
        }
    }
}
