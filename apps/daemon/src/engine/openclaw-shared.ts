export const GATEWAY_APPLY_REQUIRED_MESSAGE =
  "The change was saved. Apply pending changes from Gateway Manager to make it live.";

export function appendGatewayApplyMessage(message: string): string {
  const trimmed = message.trim();

  if (!trimmed) {
    return GATEWAY_APPLY_REQUIRED_MESSAGE;
  }

  if (trimmed.includes("Gateway Manager") || trimmed.includes("gateway")) {
    return trimmed;
  }

  return `${trimmed} ${GATEWAY_APPLY_REQUIRED_MESSAGE}`;
}

export function summarizePendingGatewayApply(changeCount = 1): string {
  return changeCount > 1
    ? "SlackClaw has staged engine configuration changes that still need to be applied through Gateway Manager."
    : "SlackClaw has a staged engine change that still needs to be applied through Gateway Manager.";
}
