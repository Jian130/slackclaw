import AppKit
import SwiftUI
import SlackClawProtocol

struct NativeOnboardingHostView: View {
    @Bindable var appState: SlackClawAppState
    @State private var viewModel: NativeOnboardingViewModel

    init(appState: SlackClawAppState) {
        self.appState = appState
        _viewModel = State(initialValue: NativeOnboardingViewModel(appState: appState))
    }

    var body: some View {
        NativeOnboardingView(appState: appState, viewModel: viewModel)
            .preferredColorScheme(nativeOnboardingPreferredColorScheme)
            .task {
                await viewModel.bootstrap()
            }
    }
}

private struct OnboardingProgressStep: View {
    let index: Int
    let title: String
    let active: Bool
    let complete: Bool

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(complete ? Color(red: 0.18, green: 0.64, blue: 0.40) : active ? Color(red: 0.24, green: 0.41, blue: 0.95) : Color.white.opacity(0.85))
                    .frame(width: 34, height: 34)
                Text("\(index + 1)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(complete || active ? Color.white : nativeOnboardingTextSecondary)
            }

            Text(title)
                .font(.system(size: 12, weight: active ? .semibold : .medium))
                .foregroundStyle(active ? nativeOnboardingTextPrimary : nativeOnboardingTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct OnboardingHighlightCard: View {
    let title: String
    let bodyText: String
    let accent: Color
    let symbol: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(accent.opacity(0.14))
                    .frame(width: 46, height: 46)
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(accent)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                Text(bodyText)
                    .font(.callout)
                    .foregroundStyle(nativeOnboardingTextSecondary)
            }
            Spacer()
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.76))
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.72))
                )
        )
    }
}

private struct OnboardingSelectCard<Content: View>: View {
    let selected: Bool
    let action: () -> Void
    @ViewBuilder let content: Content

    init(selected: Bool, action: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.selected = selected
        self.action = action
        self.content = content()
    }

    var body: some View {
        Button(action: action) {
            content
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(selected ? Color(red: 0.95, green: 0.97, blue: 1.0) : Color.white.opacity(0.78))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(selected ? Color(red: 0.24, green: 0.41, blue: 0.95) : Color.black.opacity(0.08), lineWidth: selected ? 2 : 1)
                )
        }
        .buttonStyle(.plain)
    }
}

private struct OnboardingGlassPanel<Content: View>: View {
    let title: String?
    let subtitle: String?
    @ViewBuilder let content: Content

    init(title: String? = nil, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let title {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.title3.weight(.semibold))
                    if let subtitle {
                        Text(subtitle)
                            .font(.callout)
                            .foregroundStyle(nativeOnboardingTextSecondary)
                    }
                }
            }
            content
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.white.opacity(0.78))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.78))
                )
        )
    }
}

private struct AvatarPresetView: View {
    let presetId: String
    let size: CGFloat

    var body: some View {
        let preset = resolveOnboardingAvatarPreset(presetId)
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.96))
                .overlay(Circle().strokeBorder(Color.black.opacity(0.08)))
            if let image = onboardingAssetImage(presetId) {
                image
                    .resizable()
                    .scaledToFill()
                    .clipShape(Circle())
            } else {
                Text(preset.emoji)
                    .font(.system(size: size * 0.42))
            }
        }
        .frame(width: size, height: size)
    }
}

struct NativeOnboardingView: View {
    @Bindable var appState: SlackClawAppState
    @Bindable var viewModel: NativeOnboardingViewModel

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.94, green: 0.97, blue: 1.00),
                    Color(red: 0.95, green: 0.96, blue: 1.00),
                    Color(red: 0.97, green: 0.95, blue: 1.00),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            if viewModel.pageLoading && viewModel.onboardingState == nil {
                VStack(spacing: 18) {
                    ProgressView()
                    Text(viewModel.copy.loading)
                        .font(.headline)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 28) {
                        header
                        progressHeader
                        mainCard
                    }
                    .padding(.horizontal, 32)
                    .padding(.vertical, 28)
                    .frame(maxWidth: 1100)
                }
                .scrollIndicators(.never)
            }
        }
        .onChange(of: viewModel.providerId) { _, _ in viewModel.persistModelSelection() }
        .onChange(of: viewModel.methodId) { _, _ in viewModel.persistModelSelection() }
        .onChange(of: viewModel.modelKey) { _, _ in viewModel.persistModelSelection() }
        .onChange(of: viewModel.selectedChannelId) { _, _ in viewModel.persistChannelSelection() }
        .onChange(of: viewModel.employeeName) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.employeeJobTitle) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.employeeAvatarPresetId) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.selectedTraits) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.selectedSkillIds) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.memoryEnabled) { _, _ in viewModel.persistEmployeeDraft() }
        .alert("SlackClaw", isPresented: Binding(
            get: { viewModel.pageError != nil },
            set: { if !$0 { viewModel.pageError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.pageError ?? "")
        }
    }

    private var header: some View {
        VStack(spacing: 14) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.23, green: 0.39, blue: 0.95), Color(red: 0.34, green: 0.25, blue: 0.97)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 60, height: 60)
                    Image(systemName: "sparkles")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(.white)
                }
                Text("SlackClaw")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .tracking(-1.2)
            }

            Text(viewModel.copy.subtitle)
                .font(.title3)
                .foregroundStyle(nativeOnboardingTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var progressHeader: some View {
        let progressValue = Double(viewModel.currentStepIndex + 1)
        let progressPercent = Int((progressValue / Double(nativeOnboardingStepOrder.count)) * 100)

        return VStack(spacing: 18) {
            HStack(spacing: 10) {
                Text("Step \(viewModel.currentStepIndex + 1) of \(nativeOnboardingStepOrder.count)")
                    .font(.headline)
                Spacer()
                Text("\(progressPercent)%")
                    .font(.headline)
                    .foregroundStyle(nativeOnboardingTextSecondary)
            }

            ProgressView(value: progressValue, total: Double(nativeOnboardingStepOrder.count))
                .tint(Color(red: 0.24, green: 0.41, blue: 0.95))

            HStack(alignment: .top, spacing: 10) {
                ForEach(Array(nativeOnboardingStepOrder.enumerated()), id: \.offset) { index, step in
                    OnboardingProgressStep(
                        index: index,
                        title: viewModel.copy.stepLabels[index],
                        active: step == viewModel.currentStep,
                        complete: onboardingStepIndex(viewModel.currentStep) > index
                    )
                }
            }
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color.white.opacity(0.56))
                .overlay(
                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.74))
                )
        )
    }

    private var mainCard: some View {
        VStack(alignment: .leading, spacing: 24) {
            switch viewModel.currentStep {
            case .welcome:
                welcomeStep
            case .install:
                installStep
            case .model:
                modelStep
            case .channel:
                channelStep
            case .employee:
                employeeStep
            case .complete:
                completeStep
            }
        }
        .padding(34)
        .background(
            RoundedRectangle(cornerRadius: 36, style: .continuous)
                .fill(Color.white.opacity(0.84))
                .overlay(
                    RoundedRectangle(cornerRadius: 36, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.82))
                )
                .shadow(color: Color.black.opacity(0.06), radius: 30, x: 0, y: 16)
        )
    }

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 12) {
                Text(viewModel.copy.welcomeEyebrow.uppercased())
                    .font(.headline)
                    .foregroundStyle(Color(red: 0.24, green: 0.41, blue: 0.95))
                Text(viewModel.copy.welcomeTitle)
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                Text(viewModel.copy.welcomeBody)
                    .font(.title3)
                    .foregroundStyle(nativeOnboardingTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                OnboardingHighlightCard(title: viewModel.copy.welcomeHighlights[0].title, bodyText: viewModel.copy.welcomeHighlights[0].body, accent: .blue, symbol: "shippingbox")
                OnboardingHighlightCard(title: viewModel.copy.welcomeHighlights[1].title, bodyText: viewModel.copy.welcomeHighlights[1].body, accent: .green, symbol: "slider.horizontal.3")
                OnboardingHighlightCard(title: viewModel.copy.welcomeHighlights[2].title, bodyText: viewModel.copy.welcomeHighlights[2].body, accent: .purple, symbol: "person.crop.circle.badge.plus")
            }

            HStack {
                Spacer()
                Button {
                    Task { await viewModel.markWelcomeStarted() }
                } label: {
                    Text(viewModel.copy.begin)
                        .font(.headline)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
    }

    private var installStep: some View {
        let engineInstalled = appState.overview?.engine.installed ?? false

        return VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.installTitle, body: viewModel.copy.installBody)

            HStack(alignment: .top, spacing: 20) {
                OnboardingGlassPanel {
                    VStack(alignment: .leading, spacing: 14) {
                        Label(engineInstalled ? viewModel.copy.installDetected : viewModel.copy.installMissing, systemImage: engineInstalled ? "checkmark.circle.fill" : "shippingbox")
                            .font(.headline)
                            .foregroundStyle(engineInstalled ? Color.green : Color.orange)
                        Text(appState.overview?.engine.summary ?? "")
                            .foregroundStyle(nativeOnboardingTextSecondary)
                        if let version = appState.overview?.engine.version {
                            Text(version)
                                .font(.headline)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                OnboardingGlassPanel {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(viewModel.copy.installSuccess)
                            .foregroundStyle(nativeOnboardingTextSecondary)
                        HStack(spacing: 12) {
                            Button(viewModel.copy.back) {
                                Task { await viewModel.persistDraftSafely(.init(currentStep: .welcome)) }
                            }
                            .buttonStyle(.bordered)

                            Button {
                                Task { await viewModel.runInstall() }
                            } label: {
                                if viewModel.installBusy {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Text(engineInstalled ? viewModel.copy.installContinue : viewModel.copy.installCta)
                                        .fontWeight(.semibold)
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                        }
                    }
                }
                .frame(width: 320)
            }
        }
    }

    private var modelStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.modelTitle, body: viewModel.copy.modelBody)

            if viewModel.selectedProvider == nil {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    ForEach(appState.modelConfig?.providers ?? []) { provider in
                        OnboardingSelectCard(selected: viewModel.providerId == provider.id) {
                            viewModel.providerId = provider.id
                            viewModel.methodId = provider.authMethods.first?.id ?? ""
                            viewModel.modelKey = provider.sampleModels.first ?? provider.id
                            viewModel.modelLabel = provider.label
                        } content: {
                            VStack(alignment: .leading, spacing: 12) {
                                Text(provider.label)
                                    .font(.title3.weight(.semibold))
                                Text(provider.description)
                                    .foregroundStyle(.secondary)
                                Text("\(provider.modelCount) models")
                                    .font(.callout.weight(.medium))
                                    .foregroundStyle(Color(red: 0.24, green: 0.41, blue: 0.95))
                            }
                        }
                    }
                }
            } else {
                HStack(alignment: .top, spacing: 20) {
                    OnboardingGlassPanel(title: viewModel.selectedProvider?.label, subtitle: viewModel.selectedProvider?.description) {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(viewModel.copy.authTitle)
                                .font(.headline)
                            Picker(viewModel.copy.authTitle, selection: $viewModel.methodId) {
                                ForEach(viewModel.selectedProvider?.authMethods ?? []) { method in
                                    Text(method.label).tag(method.id)
                                }
                            }
                            .pickerStyle(.menu)

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Display name")
                                    .font(.headline)
                                TextField(viewModel.selectedProvider?.label ?? "", text: $viewModel.modelLabel)
                                    .textFieldStyle(.roundedBorder)
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                    Text("Model")
                                        .font(.headline)
                                Picker("Model", selection: $viewModel.modelKey) {
                                    ForEach(viewModel.availableModelKeys, id: \.self) { key in
                                        Text(viewModel.availableModels.first(where: { $0.key == key })?.name ?? key)
                                            .tag(key)
                                    }
                                }
                                .pickerStyle(.menu)
                            }

                            ForEach(viewModel.selectedMethod?.fields ?? []) { field in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(field.label)
                                        .font(.headline)
                                    if field.secret == true {
                                        SecureField(field.placeholder ?? field.label, text: Binding(
                                            get: { viewModel.modelValues[field.id] ?? "" },
                                            set: { viewModel.updateModelValue(fieldId: field.id, value: $0) }
                                        ))
                                        .textFieldStyle(.roundedBorder)
                                    } else {
                                        TextField(field.placeholder ?? field.label, text: Binding(
                                            get: { viewModel.modelValues[field.id] ?? "" },
                                            set: { viewModel.updateModelValue(fieldId: field.id, value: $0) }
                                        ))
                                        .textFieldStyle(.roundedBorder)
                                    }
                                }
                            }

                            HStack(spacing: 12) {
                                Button(viewModel.copy.back) {
                                    viewModel.providerId = ""
                                    viewModel.methodId = ""
                                    viewModel.modelKey = ""
                                    viewModel.modelLabel = ""
                                }
                                .buttonStyle(.bordered)

                                Button {
                                    Task { await viewModel.saveModel() }
                                } label: {
                                    if viewModel.modelBusy == "save" {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Text(viewModel.copy.modelSave)
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.large)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    OnboardingGlassPanel(title: viewModel.copy.authProgressTitle, subtitle: viewModel.modelSession?.message) {
                        if let session = viewModel.modelSession {
                            VStack(alignment: .leading, spacing: 14) {
                                Text(session.message)
                                if session.launchUrl != nil {
                                    Button(viewModel.copy.openAuthWindow) {
                                        viewModel.openModelAuthWindow()
                                    }
                                    .buttonStyle(.bordered)
                                }
                                if let prompt = session.inputPrompt {
                                    Text(prompt)
                                        .font(.headline)
                                    TextField(prompt, text: $viewModel.modelSessionInput)
                                        .textFieldStyle(.roundedBorder)
                                    Button {
                                        Task { await viewModel.submitModelSessionInput() }
                                    } label: {
                                        if viewModel.modelBusy == "input" {
                                            ProgressView().controlSize(.small)
                                        } else {
                                            Text(viewModel.copy.submitAuthInput)
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                }
                                if !session.logs.isEmpty {
                                    Divider()
                                    ScrollView {
                                        VStack(alignment: .leading, spacing: 6) {
                                            ForEach(session.logs, id: \.self) { line in
                                                Text(line)
                                                    .font(.system(.caption, design: .monospaced))
                                                    .foregroundStyle(nativeOnboardingTextSecondary)
                                                    .frame(maxWidth: .infinity, alignment: .leading)
                                            }
                                        }
                                    }
                                    .frame(minHeight: 140)
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(viewModel.copy.modelSaved)
                                    .foregroundStyle(nativeOnboardingTextSecondary)
                                if let selectedModelEntry = viewModel.selectedModelEntry {
                                    Text(selectedModelEntry.label)
                                        .font(.headline)
                                }
                            }
                        }
                    }
                    .frame(width: 320)
                }
            }
        }
    }

    private var channelStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.channelTitle, body: viewModel.copy.channelBody)

            HStack(alignment: .top, spacing: 20) {
                OnboardingGlassPanel(title: viewModel.copy.chooseChannel, subtitle: nil) {
                    VStack(spacing: 14) {
                        ForEach(viewModel.visibleChannelCapabilities) { capability in
                            OnboardingSelectCard(selected: viewModel.selectedChannelId == capability.id) {
                                viewModel.selectedChannelId = capability.id
                            } content: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(capability.label)
                                        .font(.headline)
                                    Text(capability.description)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                .frame(width: 300)

                OnboardingGlassPanel(title: viewModel.selectedChannelCapability?.label, subtitle: viewModel.selectedChannelCapability?.description) {
                    if let capability = viewModel.selectedChannelCapability {
                        VStack(alignment: .leading, spacing: 14) {
                            ForEach(capability.fieldDefs) { field in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(field.label)
                                        .font(.headline)
                                    if let options = field.options, !options.isEmpty {
                                        Picker(field.label, selection: Binding(
                                            get: { viewModel.channelValues[field.id] ?? options.first?.value ?? "" },
                                            set: { viewModel.updateChannelValue(fieldId: field.id, value: $0) }
                                        )) {
                                            ForEach(options, id: \.value) { option in
                                                Text(option.label).tag(option.value)
                                            }
                                        }
                                        .pickerStyle(.menu)
                                    } else if field.secret == true {
                                        SecureField(field.placeholder ?? field.label, text: Binding(
                                            get: { viewModel.channelValues[field.id] ?? "" },
                                            set: { viewModel.updateChannelValue(fieldId: field.id, value: $0) }
                                        ))
                                        .textFieldStyle(.roundedBorder)
                                    } else {
                                        TextField(field.placeholder ?? field.label, text: Binding(
                                            get: { viewModel.channelValues[field.id] ?? "" },
                                            set: { viewModel.updateChannelValue(fieldId: field.id, value: $0) }
                                        ))
                                        .textFieldStyle(.roundedBorder)
                                    }
                                    if let help = field.helpText {
                                        Text(help)
                                            .font(.caption)
                                            .foregroundStyle(nativeOnboardingTextSecondary)
                                    }
                                }
                            }

                            if let message = viewModel.channelMessage {
                                Text(message)
                                    .font(.callout)
                                    .foregroundStyle(nativeOnboardingTextSecondary)
                            }
                            if viewModel.channelRequiresApply {
                                Label(viewModel.copy.channelApplyHint, systemImage: "arrow.triangle.2.circlepath.circle")
                                    .font(.callout)
                                    .foregroundStyle(Color.orange)
                            }

                            HStack(spacing: 12) {
                                Button(viewModel.copy.back) {
                                    Task { await viewModel.persistDraftSafely(.init(currentStep: .model)) }
                                }
                                .buttonStyle(.bordered)

                                Button("Docs") {
                                    viewModel.openChannelDocs()
                                }
                                .buttonStyle(.bordered)

                                Button {
                                    Task { await viewModel.saveChannel() }
                                } label: {
                                    if viewModel.channelBusy {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Text(viewModel.copy.channelSave)
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.large)
                            }
                        }
                    } else {
                        Text(viewModel.copy.chooseChannel)
                            .foregroundStyle(nativeOnboardingTextSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var employeeStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.employeeTitle, body: viewModel.copy.employeeBody)

            HStack(alignment: .top, spacing: 20) {
                OnboardingGlassPanel(title: viewModel.copy.chooseAvatar, subtitle: nil) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 12) {
                            ForEach(nativeOnboardingAvatarPresets) { preset in
                                Button {
                                    viewModel.employeeAvatarPresetId = preset.id
                                } label: {
                                    AvatarPresetView(presetId: preset.id, size: 70)
                                        .overlay(
                                            Circle()
                                                .strokeBorder(viewModel.employeeAvatarPresetId == preset.id ? Color(red: 0.24, green: 0.41, blue: 0.95) : Color.clear, lineWidth: 4)
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text(viewModel.copy.employeeName)
                                .font(.headline)
                            TextField(viewModel.copy.employeeName, text: $viewModel.employeeName)
                                .textFieldStyle(.roundedBorder)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text(viewModel.copy.employeeRole)
                                .font(.headline)
                            TextField(viewModel.copy.employeeRole, text: $viewModel.employeeJobTitle)
                                .textFieldStyle(.roundedBorder)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text(viewModel.copy.personalityTitle)
                                .font(.headline)
                            FlowLayout(nativeOnboardingTraits, id: \.self) { trait in
                                Button(trait) {
                                    viewModel.toggleTrait(trait)
                                }
                                .buttonStyle(.bordered)
                                .tint(viewModel.selectedTraits.contains(trait) ? .blue : .gray)
                            }
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text(viewModel.copy.skillsTitle)
                                .font(.headline)
                            FlowLayout(appState.aiTeamOverview?.skillOptions ?? [], id: \.id) { skill in
                                Button(skill.label) {
                                    viewModel.toggleSkill(skill.id)
                                }
                                .buttonStyle(.bordered)
                                .tint(viewModel.selectedSkillIds.contains(skill.id) ? .blue : .gray)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                OnboardingGlassPanel(title: viewModel.copy.employeePreview, subtitle: nil) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 16) {
                            AvatarPresetView(presetId: viewModel.employeeAvatarPresetId, size: 84)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(viewModel.employeeName.isEmpty ? "AI Employee" : viewModel.employeeName)
                                    .font(.title3.weight(.semibold))
                                Text(viewModel.employeeJobTitle.isEmpty ? "Role" : viewModel.employeeJobTitle)
                                    .foregroundStyle(nativeOnboardingTextSecondary)
                            }
                        }

                        if let selectedModelEntry = viewModel.selectedModelEntry {
                            Label(selectedModelEntry.label, systemImage: "brain")
                                .font(.callout)
                        }

                        HStack {
                            Text(viewModel.memoryEnabled ? viewModel.copy.memoryOn : viewModel.copy.memoryOff)
                                .font(.callout.weight(.medium))
                            Spacer()
                            Toggle("", isOn: $viewModel.memoryEnabled)
                                .labelsHidden()
                        }

                        HStack(spacing: 12) {
                            Button(viewModel.copy.back) {
                                Task { await viewModel.persistDraftSafely(.init(currentStep: .channel)) }
                            }
                            .buttonStyle(.bordered)

                            Button {
                                Task { await viewModel.createEmployee() }
                            } label: {
                                if viewModel.employeeBusy {
                                    ProgressView().controlSize(.small)
                                } else {
                                    Text(viewModel.copy.createEmployee)
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                        }
                    }
                }
                .frame(width: 340)
            }
        }
    }

    private var completeStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .center, spacing: 14) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [.green, .mint], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 92, height: 92)
                    Image(systemName: "checkmark")
                        .font(.system(size: 38, weight: .bold))
                        .foregroundStyle(.white)
                }

                Text(viewModel.copy.completeTitle)
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                Text(viewModel.copy.completeBody)
                    .font(.title3)
                    .foregroundStyle(nativeOnboardingTextSecondary)
            }
            .frame(maxWidth: .infinity)

            HStack(spacing: 16) {
                summaryCard(title: viewModel.copy.completionInstall, value: viewModel.onboardingState?.summary.install?.version ?? appState.overview?.engine.version ?? "Not installed")
                summaryCard(title: viewModel.copy.completionModel, value: viewModel.selectedModelEntry?.label ?? viewModel.onboardingState?.summary.model?.modelKey ?? "Not configured")
                summaryCard(title: viewModel.copy.completionChannel, value: viewModel.onboardingState?.summary.channel?.channelId.capitalized ?? "Not configured")
                summaryCard(title: viewModel.copy.completionEmployee, value: viewModel.onboardingState?.summary.employee?.name ?? "Not created")
            }

            HStack(spacing: 16) {
                destinationCard(title: viewModel.copy.goTeam, subtitle: "Manage AI employees and teams", destination: .team)
                destinationCard(title: viewModel.copy.goDashboard, subtitle: "Open the workspace overview", destination: .dashboard)
                destinationCard(title: viewModel.copy.goChat, subtitle: "Start a conversation right away", destination: .chat)
            }
        }
    }

    private func destinationCard(title: String, subtitle: String, destination: OnboardingDestination) -> some View {
        Button {
            Task { await viewModel.complete(destination: destination) }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(subtitle)
                    .foregroundStyle(nativeOnboardingTextSecondary)
                Spacer()
                HStack {
                    Spacer()
                    if viewModel.completionBusy == destination {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.right")
                            .font(.headline.weight(.semibold))
                    }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 170, alignment: .leading)
            .padding(22)
            .background(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(Color.white.opacity(0.78))
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.78))
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private func summaryCard(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(nativeOnboardingTextSecondary)
            Text(value)
                .font(.title3.weight(.semibold))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.72))
                .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.white.opacity(0.78)))
        )
    }

    private func headerBlock(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 34, weight: .bold, design: .rounded))
            Text(body)
                .font(.title3)
                .foregroundStyle(nativeOnboardingTextSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct FlowLayout<Data: RandomAccessCollection, ID: Hashable, Content: View>: View {
    private let data: Data
    private let id: KeyPath<Data.Element, ID>
    private let content: (Data.Element) -> Content

    init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder content: @escaping (Data.Element) -> Content) {
        self.data = data
        self.id = id
        self.content = content
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], spacing: 10) {
            ForEach(Array(data), id: id, content: content)
        }
    }
}
