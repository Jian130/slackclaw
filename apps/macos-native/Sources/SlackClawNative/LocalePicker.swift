import SwiftUI

struct NativeLocalePicker: View {
    let selected: NativeOnboardingLocaleOption
    let options: [NativeOnboardingLocaleOption]
    let fillsWidth: Bool
    let onSelect: (String) -> Void

    init(
        selected: NativeOnboardingLocaleOption,
        options: [NativeOnboardingLocaleOption],
        fillsWidth: Bool = false,
        onSelect: @escaping (String) -> Void
    ) {
        self.selected = selected
        self.options = options
        self.fillsWidth = fillsWidth
        self.onSelect = onSelect
    }

    var body: some View {
        Menu {
            ForEach(options) { option in
                Button("\(option.flag) \(option.label)") {
                    onSelect(option.id)
                }
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "globe")
                    .font(.system(size: 18, weight: .semibold))
                Text("\(selected.flag) \(selected.label)")
                    .font(.system(size: 18, weight: .medium))
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: NativeUI.iconCornerRadius, style: .continuous)
                    .fill(Color.white.opacity(0.88))
                    .overlay(
                        RoundedRectangle(cornerRadius: NativeUI.iconCornerRadius, style: .continuous)
                            .strokeBorder(Color.black.opacity(0.08))
                )
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .menuStyle(.borderlessButton)
        .fixedSize(horizontal: !fillsWidth, vertical: true)
    }
}
