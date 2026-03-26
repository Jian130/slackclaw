import SwiftUI

struct NativePermissionsList: View {
    let localeIdentifier: String
    let compact: Bool
    let monitor: NativePermissionMonitor

    @State private var pendingCapability: NativePermissionCapability?
    @State private var monitoring = false

    init(
        localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier(),
        compact: Bool = false,
        monitor: NativePermissionMonitor = .shared
    ) {
        self.localeIdentifier = localeIdentifier
        self.compact = compact
        self.monitor = monitor
    }

    var body: some View {
        let copy = nativePermissionsCopy(localeIdentifier: localeIdentifier)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(nativePermissionMetadata(localeIdentifier: localeIdentifier)) { item in
                NativePermissionRow(
                    metadata: item,
                    status: monitor.status[item.capability] ?? false,
                    isPending: pendingCapability == item.capability,
                    compact: compact,
                    copy: copy
                ) {
                    Task { await handle(item.capability) }
                }
            }

            Button {
                Task { await monitor.refreshNow() }
            } label: {
                Label(copy.refreshButton, systemImage: "arrow.clockwise")
            }
            .buttonStyle(NativeActionButtonStyle(variant: .outline))
            .controlSize(compact ? .small : .regular)
            .font(.footnote)
            .padding(.top, 2)
        }
        .onAppear {
            guard !monitoring else { return }
            monitoring = true
            monitor.register()
        }
        .onDisappear {
            guard monitoring else { return }
            monitoring = false
            monitor.unregister()
        }
    }

    @MainActor
    private func handle(_ capability: NativePermissionCapability) async {
        guard pendingCapability == nil else { return }
        pendingCapability = capability
        defer { pendingCapability = nil }

        _ = await NativePermissionManager.ensure([capability], interactive: true)
        await refreshStatusTransitions()
    }

    @MainActor
    private func refreshStatusTransitions() async {
        await monitor.refreshNow()

        for delay in [300_000_000, 900_000_000, 1_800_000_000] {
            try? await Task.sleep(nanoseconds: UInt64(delay))
            await monitor.refreshNow()
        }
    }
}

struct NativePermissionRow: View {
    let metadata: NativePermissionMetadataItem
    let status: Bool
    let isPending: Bool
    let compact: Bool
    let copy: NativePermissionsCopy
    let action: () -> Void

    var body: some View {
        HStack(spacing: compact ? 10 : 12) {
            ZStack {
                Circle()
                    .fill(status ? Color.green.opacity(0.18) : Color.gray.opacity(0.15))
                    .frame(width: iconSize, height: iconSize)

                Image(systemName: metadata.systemImage)
                    .foregroundStyle(status ? Color.green : Color.secondary)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(metadata.title)
                    .font(.body.weight(.semibold))

                Text(metadata.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)

            VStack(alignment: .trailing, spacing: 4) {
                if status {
                    StatusBadge(copy.grantedLabel, tone: .success, systemImage: "checkmark.circle.fill")
                        .help(copy.grantedLabel)
                } else if isPending {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: compact ? 68 : 78)
                } else {
                    ActionButton(copy.grantButton, variant: .outline, action: action)
                        .controlSize(compact ? .small : .regular)
                        .frame(minWidth: compact ? 68 : 78, alignment: .trailing)
                }

                if status {
                    Text(copy.grantedLabel)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.green)
                } else if isPending {
                    Text(copy.checking)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text(copy.requestAccess)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(minWidth: compact ? 86 : 104, alignment: .trailing)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, compact ? 4 : 6)
    }

    private var iconSize: CGFloat {
        compact ? 28 : 32
    }
}
