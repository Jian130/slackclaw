import Foundation
import SlackClawProtocol

enum NativeConfigurationChannelPrimaryAction: Equatable {
    case edit
    case continueSetup
}

struct NativeConfigurationChannelActionState: Equatable {
    var primaryAction: NativeConfigurationChannelPrimaryAction
    var showApproveAction: Bool
}

enum NativeConfigurationChannelSheetAction: Equatable {
    case save
    case prepare
    case login
    case approvePairing
}

func configurationChannelActionState(
    entry: ConfiguredChannelEntry,
    capability: ChannelCapability?
) -> NativeConfigurationChannelActionState {
    NativeConfigurationChannelActionState(
        primaryAction: (entry.pairingRequired || (capability?.supportsLogin == true && entry.status != "completed")) ? .continueSetup : .edit,
        showApproveAction: capability?.supportsPairing == true
    )
}

func buildConfigurationChannelRequest(
    channelId: SupportedChannelId,
    entryId: String?,
    editableValues: [String: String],
    action: NativeConfigurationChannelSheetAction,
    pairingCode: String = ""
) -> SaveChannelEntryRequest {
    var values = editableValues

    if action == .approvePairing {
        values["code"] = pairingCode.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    return SaveChannelEntryRequest(
        channelId: channelId.rawValue,
        entryId: entryId,
        values: values,
        action: {
            switch action {
            case .save:
                return "save"
            case .prepare:
                return "prepare"
            case .login:
                return "login"
            case .approvePairing:
                return "approve-pairing"
            }
        }()
    )
}

func shouldCloseNativeConfigurationChannelSheetAfterAction(
    action: NativeConfigurationChannelSheetAction,
    channelId: SupportedChannelId,
    hasSession: Bool
) -> Bool {
    if hasSession {
        return false
    }

    if action == .approvePairing {
        return true
    }

    if action == .save && channelId != .whatsapp && channelId != .wechat {
        return true
    }

    return false
}
