import AppKit
import SwiftUI
import WebKit
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
        let state = nativeOnboardingProgressState(active: active, complete: complete)
        let palette = nativeProgressBadgePalette(state)

        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(palette.background)
                    .frame(width: 34, height: 34)
                Text("\(index + 1)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(palette.foreground)
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
    let accent: NativeInfoBannerAccent
    let symbol: String

    var body: some View {
        InfoBanner(title: title, description: bodyText, icon: symbol, accent: accent)
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
        let palette = nativeSelectionPalette(nativeOnboardingSelectionState(selected: selected))

        Button(action: action) {
            SurfaceCard(tone: palette.tone, padding: 18, spacing: 0) {
                content
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .overlay(
                RoundedRectangle(cornerRadius: NativeUI.cardCornerRadius, style: .continuous)
                    .strokeBorder(palette.stroke, lineWidth: palette.lineWidth)
            )
            .contentShape(RoundedRectangle(cornerRadius: NativeUI.cardCornerRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct NativeOnboardingActionButton<Label: View>: View {
    let variant: NativeOnboardingActionButtonVariant
    let disabled: Bool
    let action: () -> Void
    @ViewBuilder let label: Label

    init(
        variant: NativeOnboardingActionButtonVariant,
        disabled: Bool = false,
        action: @escaping () -> Void,
        @ViewBuilder label: () -> Label
    ) {
        self.variant = variant
        self.disabled = disabled
        self.action = action
        self.label = label()
    }

    private var layout: NativeOnboardingActionButtonLayout {
        nativeOnboardingActionButtonLayout(variant: variant)
    }

    var body: some View {
        Button(action: action) {
            label
                .frame(maxWidth: layout.expandsToContainer ? .infinity : nil)
                .frame(minHeight: layout.minHeight)
                .contentShape(RoundedRectangle(cornerRadius: layout.cornerRadius, style: .continuous))
        }
        .buttonStyle(NativeActionButtonStyle(variant: nativeOnboardingActionButtonVariant(variant)))
        .disabled(disabled)
        .opacity(disabled ? 0.55 : 1)
    }
}

private struct OnboardingPresetStatusBadge: View {
    let readiness: NativeOnboardingPresetReadiness

    var body: some View {
        StatusBadge(readiness.label, tone: nativeOnboardingPresetStatusTone(readiness.status))
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
        SurfaceCard(
            title: title,
            subtitle: subtitle,
            tone: .muted,
            padding: nativeOnboardingInnerCardPadding,
            spacing: 16
        ) {
            content
        }
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
                    .frame(width: size, height: size)
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
        GeometryReader { geometry in
            let contentWidth = min(nativeOnboardingContentWidth(for: geometry.size.width), max(geometry.size.width - 48, 0))
            let headerWidth = nativeOnboardingHeaderWidth(for: contentWidth)
            let welcomeMinHeight = nativeOnboardingContentHeight(for: contentWidth)
            let compactProgressLayout = nativeOnboardingUsesCompactProgressLayout(for: contentWidth)
            let compactEmployeeLayout = nativeOnboardingUsesCompactEmployeeLayout(for: contentWidth)

            ZStack {
                nativeShellBackgroundStyle()
                    .ignoresSafeArea()

                if viewModel.pageLoading && viewModel.onboardingState == nil {
                    LoadingState(
                        title: viewModel.copy.loading,
                        description: "ChillClaw is preparing your guided setup.",
                        style: .hero
                    )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    GuidedFlowScaffold {
                        VStack(spacing: nativeOnboardingSectionGap) {
                            header(headerWidth: headerWidth)
                            progressHeader(contentWidth: contentWidth, compactLayout: compactProgressLayout)
                        }
                        .frame(maxWidth: contentWidth)
                    } content: {
                        mainCard(contentWidth: contentWidth, welcomeMinHeight: welcomeMinHeight, compactEmployeeLayout: compactEmployeeLayout)
                            .frame(maxWidth: contentWidth)
                    }
                }
            }
        }
        .onChange(of: viewModel.employeeName) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.employeeJobTitle) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.employeeAvatarPresetId) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.selectedEmployeePresetId) { _, _ in viewModel.persistEmployeeDraft() }
        .onChange(of: viewModel.memoryEnabled) { _, _ in viewModel.persistEmployeeDraft() }
        .alert("ChillClaw", isPresented: Binding(
            get: { viewModel.pageError != nil },
            set: { if !$0 { viewModel.pageError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.pageError ?? "")
        }
        .sheet(isPresented: $viewModel.isModelTutorialPresented) {
            NativeOnboardingTutorialSheet(
                title: viewModel.copy.minimaxTutorialModalTitle,
                subtitle: viewModel.copy.minimaxTutorialModalBody,
                fallbackTitle: viewModel.copy.minimaxTutorialFallbackTitle,
                fallbackBody: viewModel.copy.minimaxTutorialFallbackBody,
                closeLabel: viewModel.copy.minimaxTutorialClose,
                urlString: viewModel.modelTutorialURLString,
                onClose: viewModel.dismissModelTutorial
            )
        }
        .sheet(isPresented: $viewModel.isChannelTutorialPresented) {
            NativeOnboardingTutorialSheet(
                title: viewModel.copy.channelTutorialModalTitle,
                subtitle: viewModel.copy.channelTutorialModalBody,
                fallbackTitle: viewModel.copy.channelTutorialFallbackTitle,
                fallbackBody: viewModel.copy.channelTutorialFallbackBody,
                closeLabel: viewModel.copy.channelTutorialClose,
                urlString: viewModel.channelTutorialURLString,
                onClose: viewModel.dismissChannelTutorial
            )
        }
    }

    private func header(headerWidth: CGFloat) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: NativeUI.mediumCornerRadius, style: .continuous)
                        .fill(nativeBrandMarkGradient())
                        .frame(width: 56, height: 56)
                    Image(systemName: "sparkles")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                }
                Text(viewModel.copy.brand)
                    .font(.system(size: 34, weight: .semibold))
                    .tracking(-0.8)
            }
            .frame(maxWidth: headerWidth)

            Text(viewModel.copy.subtitle)
                .font(.system(size: 16, weight: .regular))
                .lineSpacing(8)
                .foregroundStyle(nativeOnboardingTextSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: headerWidth)

            if viewModel.currentStep == .welcome || viewModel.currentStep == .install || viewModel.currentStep == .model {
                Button(viewModel.copy.skip) {
                    Task { await viewModel.complete(destination: .team) }
                }
                .buttonStyle(.plain)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(nativeOnboardingTextSecondary)
                .underline()
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
        .overlay(alignment: .topTrailing) {
            NativeLocalePicker(
                selected: nativeLocalePickerSelectedOption(
                    localeIdentifier: viewModel.selectedLocaleIdentifier,
                    options: viewModel.localeOptions
                ),
                options: viewModel.localeOptions,
                onSelect: viewModel.updateLocale
            )
        }
    }

    private func progressHeader(contentWidth: CGFloat, compactLayout _: Bool) -> some View {
        let progressValue = Double(viewModel.currentStepIndex + 1)
        let progressPercent = Int((progressValue / Double(nativeOnboardingStepOrder.count)) * 100)
        let progressFraction = progressValue / Double(nativeOnboardingStepOrder.count)

        if nativeOnboardingUsesInlineProgressHeader(step: viewModel.currentStep, contentWidth: contentWidth) {
            return AnyView(
                SurfaceCard(tone: .muted, padding: nativeOnboardingInnerCardPadding, spacing: 8) {
                    HStack(spacing: 10) {
                        Text(formatNativeOnboardingProgressStep(viewModel.copy.progressStep, current: viewModel.currentStepIndex + 1, total: nativeOnboardingStepOrder.count))
                            .font(.system(size: 12, weight: .medium))
                        Spacer()
                        Text("\(progressPercent)% \(viewModel.copy.progressComplete)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(nativeOnboardingTextSecondary)
                    }

                    ProgressBar(value: progressFraction, label: nil)
                }
                .frame(maxWidth: contentWidth)
            )
        }

        return AnyView(
            SurfaceCard(tone: .muted, padding: nativeOnboardingInnerCardPadding, spacing: 18) {
                HStack(spacing: 10) {
                    Text("Step \(viewModel.currentStepIndex + 1) of \(nativeOnboardingStepOrder.count)")
                        .font(.headline)
                    Spacer()
                    Text("\(progressPercent)%")
                        .font(.headline)
                        .foregroundStyle(nativeOnboardingTextSecondary)
                }

                ProgressBar(value: progressFraction, label: nil)

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
        )
    }

    private func mainCard(contentWidth: CGFloat, welcomeMinHeight: CGFloat, compactEmployeeLayout: Bool) -> some View {
        SurfaceCard(tone: .standard, padding: nativeOnboardingOuterPanelPadding, spacing: 24) {
            switch viewModel.currentStep {
            case .welcome:
                welcomeStep
            case .install:
                installStep
            case .permissions:
                permissionsStep
            case .model:
                modelStep
            case .channel:
                channelStep
            case .employee:
                employeeStep(compactLayout: compactEmployeeLayout)
            case .complete:
                completeStep
            }
        }
        .frame(maxWidth: contentWidth, alignment: .leading)
        .frame(minHeight: viewModel.currentStep == .welcome ? welcomeMinHeight : nil, alignment: .top)
    }

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: nativeOnboardingSectionGap) {
            VStack(alignment: .leading, spacing: 8) {
                Text(viewModel.copy.welcomeTitle)
                    .font(.system(size: 34, weight: .semibold))
                Text(viewModel.copy.welcomeBody)
                    .font(.system(size: 16, weight: .regular))
                    .lineSpacing(6)
                    .foregroundStyle(nativeOnboardingTextSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 14) {
                OnboardingHighlightCard(title: viewModel.copy.welcomeHighlights[0].title, bodyText: viewModel.copy.welcomeHighlights[0].body, accent: .blue, symbol: "shippingbox")
                OnboardingHighlightCard(title: viewModel.copy.welcomeHighlights[1].title, bodyText: viewModel.copy.welcomeHighlights[1].body, accent: .green, symbol: "slider.horizontal.3")
                OnboardingHighlightCard(title: viewModel.copy.welcomeHighlights[2].title, bodyText: viewModel.copy.welcomeHighlights[2].body, accent: .purple, symbol: "person.crop.circle.badge.plus")
            }

            Text(viewModel.copy.welcomeSupport)
                .font(.system(size: 15, weight: .regular))
                .lineSpacing(6)
                .foregroundStyle(Color(red: 0.20, green: 0.25, blue: 0.32))
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)

            NativeOnboardingActionButton(variant: .accent) {
                Task { await viewModel.markWelcomeStarted() }
            } label: {
                Text(viewModel.copy.begin)
                    .font(.system(size: 15, weight: .semibold))
            }

            Text(viewModel.copy.welcomeTiming)
                .font(.system(size: 12, weight: .medium))
                .lineSpacing(4)
                .foregroundStyle(nativeOnboardingTextSecondary)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private var installStep: some View {
        let installViewState = resolveNativeOnboardingInstallViewState(
            overview: appState.overview,
            install: viewModel.currentDraft.install,
            busy: viewModel.installBusy,
            progress: viewModel.installProgress,
            copy: viewModel.copy
        )
        let installTarget = viewModel.installTarget
        let installHeadline: String = switch installViewState.kind {
        case .missing:
            viewModel.copy.installNotFoundTitle
        case .found:
            viewModel.copy.installFoundTitle
        case .complete:
            viewModel.copy.installCompleteTitle
        case .installing:
            installViewState.isUpdating ? viewModel.copy.installUpdatingTitle : viewModel.copy.installInstallingTitle
        }
        let installBodyCopy: String = switch installViewState.kind {
        case .missing:
            viewModel.copy.installNotFoundBody
        case .found:
            viewModel.copy.installFoundBody
        case .complete:
            viewModel.copy.installCompleteBody
        case .installing:
            installViewState.isUpdating ? viewModel.copy.installUpdatingBody : viewModel.copy.installInstallingBody
        }

        return VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.installTitle, body: viewModel.copy.installBody)

            if installViewState.kind == .installing {
                VStack(spacing: 16) {
                    ZStack {
                        RoundedRectangle(cornerRadius: nativeOnboardingStandardRadius, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0.88, green: 0.93, blue: 1.0),
                                        Color(red: 0.91, green: 0.95, blue: 1.0),
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 72, height: 72)
                        Image(systemName: "server.rack")
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(Color(red: 0.15, green: 0.34, blue: 0.95))
                    }

                    Text(installHeadline)
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(nativeOnboardingTextPrimary)
                    Text(installBodyCopy)
                        .font(.system(size: 16, weight: .regular))
                        .lineSpacing(6)
                        .foregroundStyle(nativeOnboardingTextSecondary)
                        .multilineTextAlignment(.center)

                    VStack(spacing: 10) {
                        ProgressBar(value: (installViewState.progressPercent ?? 16) / 100, label: nil)
                            .frame(maxWidth: .infinity)
                        Text(installViewState.stageLabel ?? viewModel.copy.installStageDetecting)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(nativeOnboardingTextSecondary)
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 56)
                .frame(maxWidth: .infinity)
            } else {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(alignment: .center, spacing: 20) {
                        ZStack {
                            Circle()
                                .fill(Color.white.opacity(0.94))
                                .frame(width: 64, height: 64)
                            Image(systemName: installViewState.kind == .missing ? "exclamationmark.circle" : "checkmark.circle")
                                .font(.system(size: 30, weight: .semibold))
                                .foregroundStyle(installViewState.kind == .missing ? Color(red: 0.92, green: 0.35, blue: 0.05) : Color(red: 0.08, green: 0.65, blue: 0.31))
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text(installHeadline)
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(nativeOnboardingTextPrimary)

                            Text(installBodyCopy)
                            .font(.system(size: 16, weight: .regular))
                            .lineSpacing(6)
                            .foregroundStyle(nativeOnboardingTextSecondary)

                            if let version = installViewState.version {
                                Text("\(viewModel.copy.installVersionLabel): \(version)")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(nativeOnboardingTextPrimary)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .background(
                                        Capsule(style: .continuous)
                                            .fill(Color.white.opacity(0.9))
                                            .overlay(Capsule(style: .continuous).stroke(Color.black.opacity(0.1), lineWidth: 1))
                                    )
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 28)
                    .padding(.vertical, 28)
                    .background(
                        RoundedRectangle(cornerRadius: nativeOnboardingStandardRadius, style: .continuous)
                            .fill(
                                installViewState.kind == .missing
                                    ? LinearGradient(
                                        colors: [
                                            Color(red: 1.0, green: 0.96, blue: 0.90),
                                            Color(red: 1.0, green: 0.97, blue: 0.92),
                                        ],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                    : LinearGradient(
                                        colors: [
                                            Color(red: 0.90, green: 0.98, blue: 0.93),
                                            Color(red: 0.91, green: 0.99, blue: 0.95),
                                        ],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: nativeOnboardingStandardRadius, style: .continuous)
                                    .stroke(
                                        installViewState.kind == .missing ? Color.orange.opacity(0.45) : Color.green.opacity(0.35),
                                        lineWidth: 1
                                    )
                            )
                    )

                    if installViewState.kind == .missing {
                        NativeOnboardingActionButton(variant: .accent) {
                            Task { await viewModel.runInstall() }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "arrow.down.circle")
                                    .font(.system(size: 18, weight: .semibold))
                                Text(viewModel.copy.installCta)
                                    .font(.system(size: 15, weight: .semibold))
                            }
                        }
                    } else {
                        VStack(spacing: 16) {
                            if installViewState.kind == .found, let installTarget, installTarget.updateAvailable {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(
                                        installTarget.updateSummary
                                            ?? viewModel.copy.installUpdateAvailable.replacingOccurrences(
                                                of: "{version}",
                                                with: installTarget.latestVersion ?? installTarget.version ?? ""
                                            )
                                    )
                                    .font(.system(size: 14, weight: .medium))
                                    .lineSpacing(4)
                                    .foregroundStyle(nativeOnboardingTextPrimary)
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                    NativeOnboardingActionButton(variant: .secondary) {
                                        Task { await viewModel.updateExistingInstall() }
                                    } label: {
                                        HStack(spacing: 10) {
                                            Image(systemName: "arrow.triangle.2.circlepath.circle")
                                                .font(.system(size: 16, weight: .semibold))
                                            Text(viewModel.copy.installUpdateCta)
                                                .font(.system(size: 15, weight: .semibold))
                                        }
                                    }
                                }
                                .padding(.horizontal, 18)
                                .padding(.vertical, 18)
                                .background(
                                    RoundedRectangle(cornerRadius: nativeOnboardingFeatureRadius, style: .continuous)
                                        .fill(Color(red: 0.95, green: 0.97, blue: 1.0))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: nativeOnboardingFeatureRadius, style: .continuous)
                                                .strokeBorder(Color(red: 0.78, green: 0.84, blue: 0.98), lineWidth: 1)
                                        )
                                )
                            }

                            NativeOnboardingActionButton(variant: .primary) {
                                Task {
                                    if installViewState.kind == .found {
                                        await viewModel.useExistingInstall()
                                    } else {
                                        await viewModel.advancePastInstall()
                                    }
                                }
                            } label: {
                                Text(viewModel.copy.installContinue)
                                    .font(.system(size: 15, weight: .semibold))
                            }

                            NativeOnboardingActionButton(variant: .secondary) {
                                Task { await viewModel.persistDraftSafely(.init(currentStep: .welcome)) }
                            } label: {
                                Text(viewModel.copy.back)
                                    .font(.system(size: 15, weight: .semibold))
                            }
                        }
                    }
                }
            }
        }
    }

    private var modelStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.modelTitle, body: viewModel.copy.modelBody)

            switch viewModel.modelViewState.kind {
            case .picker:
                VStack(alignment: .leading, spacing: 20) {
                    Text(viewModel.copy.providerTitle)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Color(red: 0.20, green: 0.25, blue: 0.32))
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)

                    VStack(spacing: 16) {
                        ForEach(viewModel.modelPickerProviders) { provider in
                            OnboardingSelectCard(selected: false) {
                                viewModel.selectProvider(provider)
                            } content: {
                                HStack(spacing: 16) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                            .fill(Color.white.opacity(0.92))
                                            .frame(width: 48, height: 48)
                                        Image(systemName: "brain.head.profile")
                                            .font(.system(size: 22, weight: .semibold))
                                            .foregroundStyle(onboardingProviderAccent(provider.theme))
                                    }

                                    Text(provider.label)
                                        .font(.system(size: 20, weight: .semibold))
                                        .foregroundStyle(nativeOnboardingTextPrimary)

                                    Spacer()

                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundStyle(Color(red: 0.60, green: 0.64, blue: 0.71))
                                }
                                .padding(.horizontal, 6)
                            }
                        }
                    }

                    NativeOnboardingActionButton(variant: .secondary) {
                        Task { await viewModel.persistDraftSafely(.init(currentStep: .install)) }
                    } label: {
                        Text(viewModel.copy.back)
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                }

            case .configure, .connected:
                if let provider = viewModel.modelViewState.provider,
                   let curatedProvider = viewModel.selectedCuratedProvider
                {
                    let authMethods = curatedProvider.authMethods
                    let shouldShowAuthMethodChooser = shouldShowNativeOnboardingAuthMethodChooser(authMethods)
                    let setupVariant = resolveNativeOnboardingModelSetupVariant(
                        providerID: curatedProvider.id,
                        methodKind: viewModel.selectedMethod?.kind
                    )
                    VStack(alignment: .leading, spacing: 24) {
                        HStack(spacing: 16) {
                            ZStack {
                                RoundedRectangle(cornerRadius: nativeOnboardingFeatureRadius, style: .continuous)
                                    .fill(Color.white.opacity(0.92))
                                    .frame(width: 52, height: 52)
                                Image(systemName: "brain.head.profile")
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundStyle(onboardingProviderAccent(curatedProvider.theme))
                            }

                            Text(curatedProvider.label)
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(nativeOnboardingTextPrimary)

                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 24)
                        .background(
                            RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                .fill(onboardingProviderGradient(curatedProvider.theme))
                                .overlay(
                                    RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                        .strokeBorder(Color(red: 0.56, green: 0.75, blue: 0.99), lineWidth: 2)
                                )
                        )

                        if viewModel.modelViewState.kind == .configure {
                            if shouldShowAuthMethodChooser {
                                VStack(alignment: .leading, spacing: 16) {
                                    Text(viewModel.copy.authTitle)
                                        .font(.system(size: 20, weight: .semibold))
                                        .foregroundStyle(nativeOnboardingTextPrimary)

                                    let columns = (authMethods.count <= 1)
                                        ? [GridItem(.fixed(320), spacing: 16)]
                                        : [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]

                                    LazyVGrid(columns: columns, spacing: 16) {
                                        ForEach(authMethods) { method in
                                            OnboardingSelectCard(selected: viewModel.methodId == method.id) {
                                                viewModel.methodId = method.id
                                                viewModel.modelSession = nil
                                                viewModel.modelSessionInput = ""
                                            } content: {
                                                VStack(spacing: 10) {
                                                    ZStack {
                                                        RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                                            .fill(Color(red: 0.93, green: 0.96, blue: 1.0))
                                                            .frame(width: 42, height: 42)
                                                        Image(systemName: onboardingAuthMethodSymbol(method))
                                                            .font(.system(size: 18, weight: .semibold))
                                                            .foregroundStyle(Color(red: 0.24, green: 0.41, blue: 0.95))
                                                    }

                                                    Text(method.kind == "oauth" ? viewModel.copy.authOAuthLabel : viewModel.copy.authApiKeyLabel)
                                                        .font(.system(size: 20, weight: .semibold))
                                                        .foregroundStyle(nativeOnboardingTextPrimary)
                                                        .multilineTextAlignment(.center)

                                                    Text(method.kind == "oauth" ? viewModel.copy.authOAuthBody : viewModel.copy.authApiKeyBody)
                                                        .font(.system(size: 14, weight: .regular))
                                                        .lineSpacing(4)
                                                        .foregroundStyle(nativeOnboardingTextSecondary)
                                                        .multilineTextAlignment(.center)
                                                        .fixedSize(horizontal: false, vertical: true)
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if setupVariant == .oauth {
                                VStack(alignment: .leading, spacing: 16) {
                                    if let message = viewModel.modelSession?.message, !message.isEmpty {
                                        Text(message)
                                            .font(.system(size: 14, weight: .regular))
                                            .foregroundStyle(nativeOnboardingTextSecondary)
                                    }

                                    if !curatedProvider.platformUrl.isEmpty {
                                        NativeOnboardingActionButton(variant: .secondary) {
                                            viewModel.openModelDocs()
                                        } label: {
                                            Label(viewModel.copy.modelGetApiKey, systemImage: "arrow.up.right.square")
                                                .font(.system(size: 15, weight: .semibold))
                                        }
                                    }

                                    if viewModel.modelSession?.launchUrl != nil {
                                        Button(viewModel.copy.openAuthWindow) {
                                            viewModel.openModelAuthWindow()
                                        }
                                        .buttonStyle(.bordered)
                                        .controlSize(.large)
                                    }

                                    if let prompt = viewModel.modelSession?.inputPrompt {
                                        VStack(alignment: .leading, spacing: 8) {
                                            Text(prompt)
                                                .font(.system(size: 16, weight: .semibold))
                                            TextField(prompt, text: $viewModel.modelSessionInput)
                                                .textFieldStyle(.roundedBorder)
                                        }

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
                                        .controlSize(.large)
                                        .disabled(viewModel.modelSessionInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                                    }
                                }
                            } else if setupVariant == .guidedMiniMaxAPIKey {
                                VStack(alignment: .leading, spacing: 18) {
                                    NativeOnboardingGuideCard(
                                        step: "1",
                                        stepGradient: [Color(red: 0.23, green: 0.51, blue: 0.96), Color(red: 0.31, green: 0.27, blue: 0.9)],
                                        tone: .tutorial,
                                        title: viewModel.copy.minimaxTutorialTitle,
                                        body: viewModel.copy.minimaxTutorialBody,
                                        trailing: {
                                            Button {
                                                viewModel.openModelTutorial()
                                            } label: {
                                                Image(systemName: "play.circle")
                                                    .font(.system(size: 34, weight: .regular))
                                                    .foregroundStyle(Color(red: 0.16, green: 0.39, blue: 0.94))
                                            }
                                            .buttonStyle(.plain)
                                        },
                                        content: { EmptyView() }
                                    )

                                    NativeOnboardingGuideCard(
                                        step: "2",
                                        stepGradient: [Color(red: 0.58, green: 0.2, blue: 0.92), Color(red: 0.93, green: 0.28, blue: 0.6)],
                                        tone: .getKey,
                                        title: viewModel.copy.minimaxGetKeyTitle,
                                        body: viewModel.copy.minimaxGetKeyBody,
                                        trailing: { EmptyView() }
                                    ) {
                                        NativeOnboardingActionButton(variant: .accent) {
                                            viewModel.openModelDocs()
                                        } label: {
                                            HStack(spacing: 10) {
                                                Image(systemName: "arrow.up.right.square")
                                                    .font(.system(size: 16, weight: .semibold))
                                                Text(viewModel.copy.minimaxGetKeyCTA)
                                                    .font(.system(size: 15, weight: .semibold))
                                                Image(systemName: "arrow.right")
                                                    .font(.system(size: 14, weight: .semibold))
                                            }
                                        }
                                    }

                                    NativeOnboardingGuideCard(
                                        step: "3",
                                        stepGradient: [Color(red: 0.09, green: 0.64, blue: 0.33), Color(red: 0.06, green: 0.73, blue: 0.51)],
                                        tone: .input,
                                        title: viewModel.copy.minimaxEnterKeyTitle,
                                        body: viewModel.copy.minimaxEnterKeyBody,
                                        trailing: { EmptyView() }
                                    ) {
                                        VStack(alignment: .leading, spacing: 8) {
                                            if let firstField = viewModel.selectedMethod?.fields.first {
                                                if firstField.secret == true {
                                                    SecureField(viewModel.copy.modelApiKeyPlaceholder, text: Binding(
                                                        get: { viewModel.modelValues[firstField.id] ?? "" },
                                                        set: { viewModel.updateModelValue(fieldId: firstField.id, value: $0) }
                                                    ))
                                                    .textFieldStyle(.plain)
                                                    .font(.system(size: 16, weight: .regular, design: .monospaced))
                                                    .padding(.horizontal, 18)
                                                    .frame(height: 56)
                                                    .background(
                                                        RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                                            .fill(Color.white.opacity(0.95))
                                                            .overlay(
                                                                RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                                                    .strokeBorder(Color(red: 0.33, green: 0.85, blue: 0.55), lineWidth: 1.5)
                                                            )
                                                    )
                                                } else {
                                                    TextField(viewModel.copy.modelApiKeyPlaceholder, text: Binding(
                                                        get: { viewModel.modelValues[firstField.id] ?? "" },
                                                        set: { viewModel.updateModelValue(fieldId: firstField.id, value: $0) }
                                                    ))
                                                    .textFieldStyle(.plain)
                                                    .font(.system(size: 16, weight: .regular, design: .monospaced))
                                                    .padding(.horizontal, 18)
                                                    .frame(height: 56)
                                                    .background(
                                                        RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                                            .fill(Color.white.opacity(0.95))
                                                            .overlay(
                                                                RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                                                    .strokeBorder(Color(red: 0.33, green: 0.85, blue: 0.55), lineWidth: 1.5)
                                                            )
                                                    )
                                                }
                                            }

                                            HStack(spacing: 8) {
                                                Image(systemName: "key.fill")
                                                    .font(.system(size: 12, weight: .semibold))
                                                    .foregroundStyle(Color(red: 0.24, green: 0.41, blue: 0.95))
                                                Text(viewModel.copy.modelApiKeyHelp)
                                                    .font(.system(size: 14, weight: .regular))
                                                    .foregroundStyle(nativeOnboardingTextSecondary)
                                            }
                                        }
                                    }
                                }
                            } else {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(viewModel.copy.modelApiKeyTitle)
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(nativeOnboardingTextPrimary)

                                    if let firstField = viewModel.selectedMethod?.fields.first {
                                        if firstField.secret == true {
                                            SecureField(viewModel.copy.modelApiKeyPlaceholder, text: Binding(
                                                get: { viewModel.modelValues[firstField.id] ?? "" },
                                                set: { viewModel.updateModelValue(fieldId: firstField.id, value: $0) }
                                            ))
                                            .textFieldStyle(.roundedBorder)
                                        } else {
                                            TextField(viewModel.copy.modelApiKeyPlaceholder, text: Binding(
                                                get: { viewModel.modelValues[firstField.id] ?? "" },
                                                set: { viewModel.updateModelValue(fieldId: firstField.id, value: $0) }
                                            ))
                                            .textFieldStyle(.roundedBorder)
                                        }
                                    }

                                    Text(viewModel.copy.modelApiKeyHelp)
                                        .font(.system(size: 14, weight: .regular))
                                        .foregroundStyle(nativeOnboardingTextSecondary)

                                    if !curatedProvider.platformUrl.isEmpty {
                                        NativeOnboardingActionButton(variant: .secondary) {
                                            viewModel.openModelDocs()
                                        } label: {
                                            Label(viewModel.copy.modelGetApiKey, systemImage: "arrow.up.right.square")
                                                .font(.system(size: 15, weight: .semibold))
                                        }
                                    }
                                }
                            }

                            HStack(spacing: 16) {
                                NativeOnboardingActionButton(variant: .secondary) {
                                    Task { await viewModel.returnToModelPicker() }
                                } label: {
                                    Text(viewModel.copy.back)
                                        .font(.system(size: 15, weight: .semibold))
                                }
                                .frame(maxWidth: .infinity)

                                NativeOnboardingActionButton(
                                    variant: .primary,
                                    disabled: viewModel.modelBusy == "save" || requiredModelFieldsMissing(viewModel.selectedMethod, values: viewModel.modelValues)
                                ) {
                                    Task { await viewModel.saveModel() }
                                } label: {
                                    if viewModel.modelBusy == "save" {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Text(viewModel.copy.modelSave)
                                            .font(.system(size: 15, weight: .semibold))
                                    }
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 20) {
                                HStack(spacing: 16) {
                                    ZStack {
                                        Circle()
                                            .fill(Color.white.opacity(0.92))
                                            .frame(width: 54, height: 54)
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 28, weight: .semibold))
                                            .foregroundStyle(Color(red: 0.09, green: 0.64, blue: 0.33))
                                    }

                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(viewModel.copy.modelConnectedTitle)
                                            .font(.system(size: 20, weight: .semibold))
                                            .foregroundStyle(nativeOnboardingTextPrimary)
                                        Text(viewModel.copy.modelConnectedBody.replacingOccurrences(of: "{provider}", with: provider.curated.label))
                                            .font(.system(size: 14, weight: .regular))
                                            .foregroundStyle(nativeOnboardingTextSecondary)
                                    }
                                }
                                .padding(.horizontal, 20)
                                .padding(.vertical, 22)
                                .background(
                                    RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                        .fill(LinearGradient(colors: [
                                            Color(red: 0.91, green: 0.99, blue: 0.93),
                                            Color(red: 0.85, green: 0.98, blue: 0.9),
                                        ], startPoint: .topLeading, endPoint: .bottomTrailing))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                                .strokeBorder(Color(red: 0.67, green: 0.96, blue: 0.76))
                                        )
                                )

                                NativeOnboardingActionButton(variant: .primary) {
                                    Task { await viewModel.advancePastModel() }
                                } label: {
                                    Text(viewModel.copy.next)
                                        .font(.system(size: 15, weight: .semibold))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var permissionsStep: some View {
        let permissionsCopy = nativePermissionsCopy(localeIdentifier: viewModel.selectedLocaleIdentifier)

        return VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: permissionsCopy.onboardingTitle, body: permissionsCopy.sharedBody)

            OnboardingGlassPanel {
                NativePermissionsList(localeIdentifier: viewModel.selectedLocaleIdentifier, compact: false)
            }

            HStack(spacing: 16) {
                NativeOnboardingActionButton(variant: .secondary, disabled: viewModel.permissionsNextBusy) {
                    Task { await viewModel.persistDraftSafely(.init(currentStep: .install)) }
                } label: {
                    Text(viewModel.copy.back)
                        .font(.system(size: 15, weight: .semibold))
                }

                NativeOnboardingActionButton(variant: .primary, disabled: viewModel.permissionsNextBusy) {
                    Task { await viewModel.advancePastPermissions() }
                } label: {
                    HStack(spacing: 10) {
                        if viewModel.permissionsNextBusy {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        }

                        Text(viewModel.copy.next)
                            .font(.system(size: 15, weight: .semibold))
                    }
                }
            }
        }
    }

    private var channelStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.channelTitle, body: viewModel.copy.channelBody)
            VStack(alignment: .leading, spacing: 20) {
                if let channel = viewModel.selectedChannelPresentation {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 16) {
                            RoundedRectangle(cornerRadius: nativeOnboardingFeatureRadius, style: .continuous)
                                .fill(Color.white.opacity(0.92))
                                .frame(width: 52, height: 52)
                                .overlay(
                                    Image(systemName: viewModel.channelSymbol(for: channel.id))
                                        .font(.system(size: 24, weight: .semibold))
                                        .foregroundStyle(channelAccentColor(channel.id))
                                )

                            VStack(alignment: .leading, spacing: 4) {
                                Text(channel.label)
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(nativeOnboardingTextPrimary)
                                if let secondary = channel.secondaryLabel, !secondary.isEmpty {
                                    Text(secondary)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(nativeOnboardingTextSecondary)
                                }
                            }

                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 24)
                        .background(
                            RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                .fill(nativeOnboardingChannelPresentationTheme(channel.theme))
                                .overlay(
                                    RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                        .strokeBorder(Color(red: 0.56, green: 0.75, blue: 0.99), lineWidth: 2)
                                )
                        )

                        switch viewModel.selectedChannelSetupVariant {
                        case .wechatWorkGuided?:
                            nativeChannelInstructionCard(
                                title: viewModel.copy.channelWechatInstructionsTitle,
                                steps: viewModel.copy.channelWechatInstructionSteps,
                                ctaLabel: viewModel.copy.channelDocumentationCta,
                                ctaAction: viewModel.openChannelDocs
                            )

                            nativeChannelCredentialCard(title: nil, body: nil) {
                                nativeChannelField(title: viewModel.copy.channelWechatAgentId) {
                                    TextField(viewModel.channelPlaceholder(for: "botId"), text: Binding(
                                        get: { viewModel.channelFieldValue("botId") },
                                        set: { viewModel.updateChannelValue(fieldId: "botId", value: $0) }
                                    ))
                                    .textFieldStyle(.plain)
                                }

                                nativeChannelField(title: viewModel.copy.channelWechatSecret) {
                                    SecureField(viewModel.channelPlaceholder(for: "secret"), text: Binding(
                                        get: { viewModel.channelFieldValue("secret") },
                                        set: { viewModel.updateChannelValue(fieldId: "secret", value: $0) }
                                    ))
                                    .textFieldStyle(.plain)
                                }

                                nativeChannelSecretHelp(viewModel.copy.channelSecretHelp)
                            }

                        case .wechatGuided?:
                            nativeChannelCredentialCard(
                                title: "Personal WeChat login",
                                body: "ChillClaw will run the QR-first WeChat installer and keep the session log here while you scan and confirm the login."
                            ) {
                                if let activeSession = viewModel.activeChannelSession {
                                    VStack(alignment: .leading, spacing: 12) {
                                        Text(activeSession.message)
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundStyle(nativeOnboardingTextSecondary)

                                        ScrollView {
                                            Text(activeSession.logs.joined(separator: "\n"))
                                                .font(.system(size: 12, weight: .regular, design: .monospaced))
                                                .foregroundStyle(nativeOnboardingTextPrimary)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                        }
                                        .frame(minHeight: 120, maxHeight: 180)

                                        if let prompt = activeSession.inputPrompt {
                                            nativeChannelField(title: prompt) {
                                                TextField("Paste the follow-up input from the installer", text: Binding(
                                                    get: { viewModel.channelSessionInput },
                                                    set: { viewModel.channelSessionInput = $0 }
                                                ))
                                                .textFieldStyle(.plain)
                                            }
                                        }
                                    }
                                }
                            }

                        case .telegramGuided?:
                            nativeChannelInstructionCard(
                                title: viewModel.copy.channelTelegramInstructionsTitle,
                                steps: viewModel.copy.channelTelegramInstructionSteps,
                                ctaLabel: viewModel.copy.channelDocumentationCta,
                                ctaAction: viewModel.openChannelDocs
                            )

                            nativeChannelCredentialCard(title: nil, body: nil) {
                                nativeChannelField(title: viewModel.copy.channelTelegramToken) {
                                    SecureField(viewModel.channelPlaceholder(for: "token"), text: Binding(
                                        get: { viewModel.channelFieldValue("token") },
                                        set: { viewModel.updateChannelValue(fieldId: "token", value: $0) }
                                    ))
                                    .textFieldStyle(.plain)
                                }

                                nativeChannelSecretHelp(viewModel.copy.channelSecretHelp)
                            }

                        case .feishuGuided?:
                            VStack(alignment: .leading, spacing: 18) {
                                NativeOnboardingGuideCard(
                                    step: "1",
                                    stepGradient: nativeOnboardingChannelGuideStepGradient("tutorial"),
                                    tone: nativeOnboardingChannelGuideTone("tutorial"),
                                    title: viewModel.copy.channelFeishuTutorialTitle,
                                    body: viewModel.copy.channelFeishuTutorialBody,
                                    trailing: {
                                        Button {
                                            viewModel.openChannelTutorial()
                                        } label: {
                                            Image(systemName: "play.circle")
                                                .font(.system(size: 34, weight: .regular))
                                                .foregroundStyle(nativeOnboardingChannelGuideThemeColor("tutorial"))
                                        }
                                        .buttonStyle(.plain)
                                    },
                                    content: { EmptyView() }
                                )

                                NativeOnboardingGuideCard(
                                    step: "2",
                                    stepGradient: nativeOnboardingChannelGuideStepGradient("platform"),
                                    tone: nativeOnboardingChannelGuideTone("platform"),
                                    title: viewModel.copy.channelFeishuPlatformTitle,
                                    body: viewModel.copy.channelFeishuPlatformBody,
                                    trailing: { EmptyView() }
                                ) {
                                    NativeOnboardingActionButton(variant: .accent) {
                                        viewModel.openChannelPlatform()
                                    } label: {
                                        HStack(spacing: 10) {
                                            Image(systemName: "arrow.up.right.square")
                                                .font(.system(size: 16, weight: .semibold))
                                                Text(viewModel.copy.channelPlatformCta)
                                                    .font(.system(size: 15, weight: .semibold))
                                            Image(systemName: "arrow.right")
                                                .font(.system(size: 14, weight: .semibold))
                                        }
                                    }
                                }

                                nativeChannelCredentialCard(
                                    title: viewModel.copy.channelFeishuCredentialsTitle,
                                    body: viewModel.copy.channelFeishuCredentialsBody
                                ) {
                                    nativeChannelField(title: viewModel.copy.channelFeishuAppId) {
                                        TextField(viewModel.channelPlaceholder(for: "appId"), text: Binding(
                                            get: { viewModel.channelFieldValue("appId") },
                                            set: { viewModel.updateChannelValue(fieldId: "appId", value: $0) }
                                        ))
                                        .textFieldStyle(.plain)
                                    }

                                    nativeChannelField(title: viewModel.copy.channelFeishuAppSecret) {
                                        SecureField(viewModel.channelPlaceholder(for: "appSecret"), text: Binding(
                                            get: { viewModel.channelFieldValue("appSecret") },
                                            set: { viewModel.updateChannelValue(fieldId: "appSecret", value: $0) }
                                        ))
                                        .textFieldStyle(.plain)
                                    }

                                    nativeChannelSecretHelp(viewModel.copy.channelSecretHelp)
                                }
                            }
                        case nil:
                            EmptyView()
                        }

                        if let message = viewModel.channelMessage, !message.isEmpty {
                            Text(message)
                                .font(.system(size: 14, weight: .regular))
                                .foregroundStyle(nativeOnboardingTextSecondary)
                        }

                        if viewModel.channelRequiresApply {
                            Label(viewModel.copy.channelApplyHint, systemImage: "arrow.triangle.2.circlepath.circle")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Color.orange)
                        }

                        HStack(spacing: 16) {
                            NativeOnboardingActionButton(variant: .secondary) {
                                Task { await viewModel.returnToChannelPicker() }
                            } label: {
                                Text(viewModel.copy.back)
                                    .font(.system(size: 15, weight: .semibold))
                            }

                            NativeOnboardingActionButton(
                                variant: .primary,
                                disabled: viewModel.channelBusy || (viewModel.activeChannelSession?.inputPrompt != nil
                                    ? viewModel.channelSessionInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    : viewModel.isSelectedChannelMissingRequiredValues())
                            ) {
                                Task {
                                    if viewModel.activeChannelSession?.inputPrompt != nil {
                                        await viewModel.submitChannelSessionInput()
                                    } else {
                                        await viewModel.saveAndContinueChannel()
                                    }
                                }
                            } label: {
                                HStack(spacing: 10) {
                                    if viewModel.channelBusy {
                                        ProgressView()
                                            .controlSize(.small)
                                            .tint(.white)
                                    }

                                    Text(
                                        viewModel.activeChannelSession?.inputPrompt != nil
                                            ? "Submit Session Input"
                                            : viewModel.selectedChannelSetupVariant == .wechatGuided
                                                ? (viewModel.activeChannelSession == nil ? "Start WeChat Login" : "Restart WeChat Login")
                                                : viewModel.copy.channelSaveContinue
                                    )
                                        .font(.system(size: 15, weight: .semibold))
                                }
                            }
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 20) {
                        Text(viewModel.copy.channelPickerHint)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(Color(red: 0.20, green: 0.25, blue: 0.32))
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)

                        VStack(spacing: 16) {
                            ForEach(viewModel.curatedChannels) { channel in
                                Button {
                                    viewModel.updateSelectedChannel(channel.id)
                                } label: {
                                    HStack(spacing: 16) {
                                        RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                            .fill(Color.white.opacity(0.92))
                                            .frame(width: 48, height: 48)
                                            .overlay(
                                                Image(systemName: viewModel.channelSymbol(for: channel.id))
                                                    .font(.system(size: 22, weight: .semibold))
                                                    .foregroundStyle(channelAccentColor(channel.id))
                                            )

                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(channel.label)
                                                .font(.system(size: 20, weight: .semibold))
                                                .foregroundStyle(nativeOnboardingTextPrimary)
                                            if let secondary = channel.secondaryLabel, !secondary.isEmpty {
                                                Text(secondary)
                                                    .font(.system(size: 14, weight: .semibold))
                                                    .foregroundStyle(nativeOnboardingTextSecondary)
                                            }
                                        }

                                        Spacer()

                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 18, weight: .semibold))
                                            .foregroundStyle(Color(red: 0.60, green: 0.64, blue: 0.71))
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 24)
                                    .contentShape(RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous))
                                    .background(
                                        RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                            .fill(nativeOnboardingChannelPresentationTheme(channel.theme))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                                                    .strokeBorder(channel.id == viewModel.selectedChannelId ? Color(red: 0.56, green: 0.75, blue: 0.99) : Color.black.opacity(0.08), lineWidth: channel.id == viewModel.selectedChannelId ? 2 : 1)
                                            )
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        NativeOnboardingActionButton(variant: .secondary) {
                            Task { await viewModel.goBackFromChannelPicker() }
                        } label: {
                            Text(viewModel.copy.back)
                                .font(.system(size: 15, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func employeeStep(compactLayout: Bool) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            headerBlock(title: viewModel.copy.employeeTitle, body: viewModel.copy.employeeBody)

            Group {
                if compactLayout {
                    VStack(alignment: .leading, spacing: 20) {
                        employeeEditorPanel(compactLayout: compactLayout)
                        employeePreviewPanel(compactLayout: compactLayout)
                    }
                } else {
                    HStack(alignment: .top, spacing: 20) {
                        employeeEditorPanel(compactLayout: compactLayout)
                        employeePreviewPanel(compactLayout: compactLayout)
                            .frame(width: 340)
                    }
                }
            }
        }
    }

    private func employeeEditorPanel(compactLayout: Bool) -> some View {
        OnboardingGlassPanel(title: viewModel.copy.chooseAvatar, subtitle: nil) {
            VStack(alignment: .leading, spacing: 18) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(nativeOnboardingAvatarPresets) { preset in
                            Button {
                                viewModel.employeeAvatarPresetId = preset.id
                            } label: {
                                AvatarPresetView(presetId: preset.id, size: 70)
                                    .padding(6)
                                    .contentShape(Circle())
                                    .overlay(
                                        Circle()
                                            .strokeBorder(viewModel.employeeAvatarPresetId == preset.id ? Color(red: 0.24, green: 0.41, blue: 0.95) : Color.clear, lineWidth: 4)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
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
                    Text(viewModel.copy.skillsTitle)
                        .font(.headline)
                    let presetColumns = compactLayout
                        ? [GridItem(.flexible(minimum: 0), spacing: 12)]
                        : Array(repeating: GridItem(.flexible(minimum: 0), spacing: 12), count: 3)

                    LazyVGrid(columns: presetColumns, alignment: .leading, spacing: 12) {
                        ForEach(viewModel.employeePresets) { preset in
                            let readiness = resolveOnboardingEmployeePresetReadiness(
                                preset: preset,
                                onboardingState: viewModel.onboardingState
                            )

                            Button {
                                viewModel.selectEmployeePreset(preset.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 12) {
                                        RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                                            .fill(nativePresetTheme(preset.theme))
                                            .frame(width: 40, height: 40)
                                            .overlay(
                                                Image(systemName: nativePresetSymbol(preset.theme))
                                                    .font(.system(size: 17, weight: .semibold))
                                                    .foregroundStyle(nativePresetAccent(preset.theme))
                                            )

                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(preset.label)
                                                .font(.system(size: 16, weight: .semibold))
                                                .foregroundStyle(nativeOnboardingTextPrimary)
                                            Text(preset.description)
                                                .font(.system(size: 13, weight: .regular))
                                                .foregroundStyle(nativeOnboardingTextSecondary)
                                                .lineLimit(2)
                                                .multilineTextAlignment(.leading)
                                        }
                                    }

                                    let compactLabels = Array(preset.starterSkillLabels.prefix(1)) + Array(preset.toolLabels.prefix(1))

                                    FlowLayout(["status-\(preset.id)"] + compactLabels, id: \.self) { label in
                                        if label == "status-\(preset.id)" {
                                            OnboardingPresetStatusBadge(readiness: readiness)
                                        } else {
                                            Text(label)
                                                .font(.system(size: 12, weight: .semibold))
                                                .padding(.horizontal, 10)
                                                .padding(.vertical, 6)
                                                .background(
                                                    Capsule().fill(
                                                        preset.starterSkillLabels.contains(label)
                                                            ? Color.green.opacity(0.16)
                                                            : Color.gray.opacity(0.12)
                                                    )
                                                )
                                        }
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .contentShape(RoundedRectangle(cornerRadius: nativeOnboardingStandardRadius, style: .continuous))
                                .background(
                                    RoundedRectangle(cornerRadius: nativeOnboardingStandardRadius, style: .continuous)
                                        .fill(Color.white.opacity(0.92))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: nativeOnboardingStandardRadius, style: .continuous)
                                                .strokeBorder(viewModel.selectedEmployeePreset?.id == preset.id ? Color.blue : Color.black.opacity(0.08), lineWidth: viewModel.selectedEmployeePreset?.id == preset.id ? 2 : 1)
                                        )
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func employeePreviewPanel(compactLayout: Bool) -> some View {
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

                if let selectedPreset = viewModel.selectedEmployeePreset {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(selectedPreset.label)
                            .font(.headline)
                        Text(selectedPreset.description)
                            .foregroundStyle(nativeOnboardingTextSecondary)
                        if let readiness = viewModel.selectedEmployeePresetReadiness {
                            OnboardingPresetStatusBadge(readiness: readiness)
                            if let detail = readiness.detail {
                                Text(detail)
                                    .font(.system(size: 13, weight: .regular))
                                    .foregroundStyle(nativeOnboardingTextSecondary)
                            }
                        }
                        FlowLayout(selectedPreset.starterSkillLabels + selectedPreset.toolLabels, id: \.self) { label in
                            Text(label)
                                .font(.system(size: 12, weight: .semibold))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(
                                    Capsule().fill(
                                        selectedPreset.starterSkillLabels.contains(label)
                                            ? Color.green.opacity(0.16)
                                            : Color.gray.opacity(0.12)
                                    )
                                )
                        }
                    }
                }

                Group {
                    if compactLayout {
                        VStack(spacing: 12) {
                            backButtonToChannel
                            createEmployeeButton
                        }
                    } else {
                        HStack(spacing: 12) {
                            backButtonToChannel
                            createEmployeeButton
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var backButtonToChannel: some View {
        NativeOnboardingActionButton(variant: .secondary) {
            Task { await viewModel.persistDraftSafely(.init(currentStep: .channel)) }
        } label: {
            Text(viewModel.copy.back)
                .font(.system(size: 15, weight: .semibold))
        }
    }

    private var createEmployeeButton: some View {
        NativeOnboardingActionButton(
            variant: .primary,
            disabled: viewModel.selectedEmployeePreset == nil
                || viewModel.selectedBrainEntryId == nil
                || viewModel.employeeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || viewModel.employeeJobTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || (viewModel.selectedEmployeePresetReadiness?.blocking ?? false)
        ) {
            Task { await viewModel.createEmployee() }
        } label: {
            if viewModel.employeeBusy {
                ProgressView().controlSize(.small)
            } else {
                Text(viewModel.copy.createEmployee)
                    .font(.system(size: 15, weight: .semibold))
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
                summaryCard(title: viewModel.copy.completionChannel, value: viewModel.onboardingState?.summary.channel.map { nativeChannelDisplayLabel($0.channelId) } ?? "Not configured")
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
        SurfaceCard(tone: .standard, padding: 22, spacing: 16, minimumHeight: 170) {
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(nativeOnboardingTextPrimary)
                Text(subtitle)
                    .foregroundStyle(nativeOnboardingTextSecondary)
                Spacer(minLength: 0)
                ActionButton(
                    title,
                    systemImage: "arrow.right",
                    variant: .outline,
                    isBusy: viewModel.completionBusy == destination,
                    isDisabled: viewModel.completionBusy != nil && viewModel.completionBusy != destination,
                    fullWidth: true
                ) {
                    Task { await viewModel.complete(destination: destination) }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 170, alignment: .topLeading)
        }
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
            RoundedRectangle(cornerRadius: nativeOnboardingOuterRadius, style: .continuous)
                .fill(Color.white.opacity(0.72))
                .overlay(RoundedRectangle(cornerRadius: nativeOnboardingOuterRadius, style: .continuous).strokeBorder(Color.white.opacity(0.78)))
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

private struct NativeOnboardingGuideCard<Trailing: View, Content: View>: View {
    let step: String
    let stepGradient: [Color]
    let tone: NativeOnboardingGuideTone
    let heading: String
    let message: String
    @ViewBuilder let trailing: Trailing
    @ViewBuilder let content: Content

    init(
        step: String,
        stepGradient: [Color],
        tone: NativeOnboardingGuideTone,
        title: String,
        body: String,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content
    ) {
        self.step = step
        self.stepGradient = stepGradient
        self.tone = tone
        self.heading = title
        self.message = body
        self.trailing = trailing()
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .center, spacing: 18) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: stepGradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 64, height: 64)
                    Text(step)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(heading)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(nativeOnboardingTextPrimary)
                    Text(message)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(nativeOnboardingTextSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                trailing
            }

            content
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                .fill(tone.background)
                .overlay(
                    RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                        .strokeBorder(tone.border, lineWidth: 1.5)
                )
        )
    }
}

private func channelAccentColor(_ channelID: SupportedChannelId) -> Color {
    switch channelID {
    case .wechatWork, .wechat:
        return Color(red: 0.05, green: 0.53, blue: 0.34)
    case .telegram:
        return Color(red: 0.29, green: 0.27, blue: 0.88)
    case .feishu:
        fallthrough
    default:
        return Color(red: 0.16, green: 0.39, blue: 0.94)
    }
}

@MainActor
@ViewBuilder
private func nativeChannelInstructionCard(title: String, steps: [String], ctaLabel: String, ctaAction: @escaping () -> Void) -> some View {
    VStack(alignment: .leading, spacing: 18) {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [Color(red: 0.23, green: 0.51, blue: 0.96), Color(red: 0.31, green: 0.27, blue: 0.90)], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 48, height: 48)
                Image(systemName: "info")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
            }

            Text(title)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(nativeOnboardingTextPrimary)
        }

        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 8) {
                    Text("\(index + 1).")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(nativeOnboardingTextPrimary)
                    Text(step)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(nativeOnboardingTextPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }

        NativeOnboardingActionButton(variant: .secondary, action: ctaAction) {
            HStack(spacing: 12) {
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 16, weight: .semibold))
                Text(ctaLabel)
                    .font(.system(size: 15, weight: .semibold))
            }
        }
    }
    .padding(22)
    .background(
        RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
            .fill(LinearGradient(colors: [Color(red: 0.93, green: 0.96, blue: 1.0), Color(red: 0.94, green: 0.97, blue: 1.0)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                    .strokeBorder(Color(red: 0.69, green: 0.82, blue: 0.99), lineWidth: 1.5)
            )
    )
}

@MainActor
@ViewBuilder
private func nativeChannelCredentialCard<Content: View>(title: String?, body: String?, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 18) {
        if let title {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(nativeOnboardingTextPrimary)
                if let body {
                    Text(body)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(nativeOnboardingTextSecondary)
                }
            }
        }

        content()
    }
    .padding(22)
    .background(
        RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
            .fill(LinearGradient(colors: [Color(red: 0.93, green: 0.99, blue: 0.96), Color(red: 0.94, green: 1.0, blue: 0.97)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                RoundedRectangle(cornerRadius: nativeOnboardingSectionRadius, style: .continuous)
                    .strokeBorder(Color(red: 0.63, green: 0.93, blue: 0.74), lineWidth: 1.5)
            )
    )
}

@MainActor
@ViewBuilder
private func nativeChannelField<FieldContent: View>(title: String, @ViewBuilder content: () -> FieldContent) -> some View {
    VStack(alignment: .leading, spacing: 8) {
        Text(title)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(nativeOnboardingTextPrimary)

        content()
            .font(.system(size: 16, weight: .regular, design: .monospaced))
            .padding(.horizontal, 18)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                    .fill(Color.white.opacity(0.95))
                    .overlay(
                        RoundedRectangle(cornerRadius: nativeOnboardingControlRadius, style: .continuous)
                            .strokeBorder(Color(red: 0.33, green: 0.85, blue: 0.55), lineWidth: 1.5)
                    )
            )
    }
}

@MainActor
@ViewBuilder
private func nativeChannelSecretHelp(_ text: String) -> some View {
    HStack(spacing: 8) {
        Image(systemName: "key.fill")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color(red: 0.24, green: 0.41, blue: 0.95))
        Text(text)
            .font(.system(size: 14, weight: .regular))
            .foregroundStyle(nativeOnboardingTextSecondary)
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

private struct NativeOnboardingTutorialSheet: View {
    let title: String
    let subtitle: String
    let fallbackTitle: String
    let fallbackBody: String
    let closeLabel: String
    let urlString: String?
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.white)
                    Text(subtitle)
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(Color.white.opacity(0.92))
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                        .background(Circle().fill(Color.white.opacity(0.18)))
                }
                .buttonStyle(.plain)
            }
            .padding(32)
            .background(
                LinearGradient(
                    colors: [Color(red: 0.18, green: 0.39, blue: 0.96), Color(red: 0.34, green: 0.22, blue: 0.95)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )

            VStack(spacing: 24) {
                Group {
                    if let urlString, let url = URL(string: urlString) {
                        NativeOnboardingVideoWebView(url: url)
                            .frame(minHeight: 460)
                    } else {
                        VStack(spacing: 16) {
                            Image(systemName: "play.circle")
                                .font(.system(size: 88, weight: .regular))
                                .foregroundStyle(nativeOnboardingTextSecondary.opacity(0.6))
                            Text(fallbackTitle)
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(nativeOnboardingTextPrimary)
                            Text(fallbackBody)
                                .font(.system(size: 16, weight: .regular))
                                .foregroundStyle(nativeOnboardingTextSecondary)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 520)
                        }
                        .frame(maxWidth: .infinity, minHeight: 460)
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: nativeOnboardingOuterRadius, style: .continuous)
                        .fill(Color(red: 0.97, green: 0.98, blue: 1.0))
                )

                NativeOnboardingActionButton(variant: .accent, action: onClose) {
                    Text(closeLabel)
                        .font(.system(size: 17, weight: .semibold))
                }
            }
            .padding(32)
            .background(Color.white)
        }
        .frame(minWidth: 860, minHeight: 720)
    }
}

private struct NativeOnboardingVideoWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        if nsView.url != url {
            nsView.load(URLRequest(url: url))
        }
    }
}
