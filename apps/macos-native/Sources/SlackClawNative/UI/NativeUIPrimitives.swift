import SwiftUI
import SlackClawProtocol

struct SurfaceCard<Content: View>: View {
    let title: String?
    let subtitle: String?
    let tone: SurfaceCardTone
    let padding: CGFloat
    let spacing: CGFloat
    @ViewBuilder let content: Content

    init(
        title: String? = nil,
        subtitle: String? = nil,
        tone: SurfaceCardTone = .standard,
        padding: CGFloat = 20,
        spacing: CGFloat = 12,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.tone = tone
        self.padding = padding
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        let palette = nativeSurfacePalette(tone)

        return VStack(alignment: .leading, spacing: spacing) {
            if title != nil || subtitle != nil {
                VStack(alignment: .leading, spacing: 6) {
                    if let title {
                        Text(title)
                            .font(.title3)
                            .fontWeight(.semibold)
                    }
                    if let subtitle {
                        Text(subtitle)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            content
        }
        .padding(padding)
        .background(
            RoundedRectangle(cornerRadius: NativeUI.cardCornerRadius, style: .continuous)
                .fill(palette.fill)
                .shadow(color: palette.shadowColor, radius: palette.shadowRadius, x: 0, y: palette.shadowY)
        )
        .overlay(
            RoundedRectangle(cornerRadius: NativeUI.cardCornerRadius, style: .continuous)
                .stroke(palette.stroke, lineWidth: 1)
        )
    }
}

struct StatusBadge: View {
    let label: String
    let tone: NativeStatusTone
    let systemImage: String?

    init(_ label: String, tone: NativeStatusTone, systemImage: String? = nil) {
        self.label = label
        self.tone = tone
        self.systemImage = systemImage
    }

    var body: some View {
        BadgeChrome(label: label, systemImage: systemImage, palette: nativeBadgePalette(.status(tone)))
    }
}

struct TagBadge: View {
    let label: String
    let tone: NativeTagTone
    let systemImage: String?

    init(_ label: String, tone: NativeTagTone, systemImage: String? = nil) {
        self.label = label
        self.tone = tone
        self.systemImage = systemImage
    }

    var body: some View {
        BadgeChrome(label: label, systemImage: systemImage, palette: nativeBadgePalette(.tag(tone)))
    }
}

private struct BadgeChrome: View {
    let label: String
    let systemImage: String?
    let palette: NativeBadgePalette

    var body: some View {
        Group {
            if let systemImage {
                Label(label, systemImage: systemImage)
            } else {
                Text(label)
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(palette.background, in: Capsule())
        .foregroundStyle(palette.foreground)
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let detail: String
    let tone: SurfaceCardTone

    init(title: String, value: String, detail: String, tone: SurfaceCardTone = .standard) {
        self.title = title
        self.value = value
        self.detail = detail
        self.tone = tone
    }

    var body: some View {
        SurfaceCard(tone: tone) {
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
            .frame(maxWidth: .infinity, minHeight: nativeDashboardMetricCardMinHeight, alignment: .topLeading)
        }
    }
}

struct InfoBanner<Accessory: View>: View {
    let title: String
    let description: String
    let icon: String
    let accent: NativeInfoBannerAccent
    @ViewBuilder let accessory: Accessory

    init(
        title: String,
        description: String,
        icon: String = "sparkles",
        accent: NativeInfoBannerAccent = .blue,
        @ViewBuilder accessory: () -> Accessory = { EmptyView() }
    ) {
        self.title = title
        self.description = description
        self.icon = icon
        self.accent = accent
        self.accessory = accessory()
    }

    var body: some View {
        let accentColor = nativeBannerAccentColor(accent)

        return SurfaceCard(tone: .accent, padding: 24, spacing: 18) {
            HStack(alignment: .top, spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: NativeUI.cardCornerRadius, style: .continuous)
                        .fill(accentColor.opacity(0.12))
                    Image(systemName: icon)
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundStyle(accentColor)
                }
                .frame(width: 96, height: 132)

                VStack(alignment: .leading, spacing: 14) {
                    Text(title)
                        .font(.system(size: 24, weight: .bold))
                    Text(description)
                        .font(.system(size: 18))
                        .foregroundStyle(.secondary)
                    accessory
                }

                Spacer(minLength: 0)
            }
        }
    }
}

struct ProgressBar: View {
    let value: Double
    let label: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let label {
                Text(label)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: min(max(value, 0), 1))
                .tint(.blue)
        }
    }
}

struct AvatarView: View {
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

struct LoadingState: View {
    let title: String
    let description: String?

    init(title: String = "Loading", description: String? = nil) {
        self.title = title
        self.description = description
    }

    var body: some View {
        SurfaceCard(tone: .muted) {
            HStack(spacing: 16) {
                ProgressView()
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(.headline)
                    if let description {
                        Text(description)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct EmptyState: View {
    let title: String
    let description: String
    let symbol: String

    init(title: String, description: String, symbol: String = "tray") {
        self.title = title
        self.description = description
        self.symbol = symbol
    }

    var body: some View {
        SurfaceCard(tone: .muted) {
            VStack(alignment: .leading, spacing: 10) {
                Label(title, systemImage: symbol)
                    .font(.headline)
                Text(description)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct ErrorState: View {
    let title: String
    let description: String

    var body: some View {
        SurfaceCard(tone: .danger) {
            VStack(alignment: .leading, spacing: 10) {
                Label(title, systemImage: "exclamationmark.triangle.fill")
                    .font(.headline)
                    .foregroundStyle(.red)
                Text(description)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct SettingRow<Trailing: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder let trailing: Trailing

    init(title: String, subtitle: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                if let subtitle {
                    Text(subtitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            trailing
        }
    }
}

struct ActionButton: View {
    let title: String
    let systemImage: String?
    let variant: ActionButtonVariant
    let isBusy: Bool
    let isDisabled: Bool
    let fullWidth: Bool
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String? = nil,
        variant: ActionButtonVariant = .primary,
        isBusy: Bool = false,
        isDisabled: Bool = false,
        fullWidth: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.variant = variant
        self.isBusy = isBusy
        self.isDisabled = isDisabled
        self.fullWidth = fullWidth
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
            }
            .frame(maxWidth: fullWidth ? .infinity : nil)
        }
        .buttonStyle(NativeActionButtonStyle(variant: variant))
        .disabled(isDisabled || isBusy)
    }
}

struct NativeActionButtonStyle: ButtonStyle {
    let variant: ActionButtonVariant

    func makeBody(configuration: Configuration) -> some View {
        let palette = palette(for: variant)

        return configuration.label
            .font(.system(size: 15, weight: .semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(palette.background.opacity(configuration.isPressed ? palette.pressedOpacity : 1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(palette.stroke, lineWidth: palette.stroke == .clear ? 0 : 1)
            )
            .foregroundStyle(palette.foreground)
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }

    private func palette(for variant: ActionButtonVariant) -> (background: Color, foreground: Color, stroke: Color, pressedOpacity: Double) {
        switch variant {
        case .primary:
            return (.blue, .white, .clear, 0.88)
        case .secondary:
            return (Color.primary.opacity(0.08), .primary, .clear, 0.78)
        case .outline:
            return (.white, .primary, Color(red: 0.84, green: 0.88, blue: 0.94), 0.94)
        case .ghost:
            return (.clear, .blue, .clear, 0.12)
        case .destructive:
            return (.red, .white, .clear, 0.88)
        }
    }
}
