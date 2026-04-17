export type DaemonTimeoutCode =
  | "COMMAND_TIMEOUT"
  | "DOWNLOAD_TIMEOUT"
  | "GATEWAY_TIMEOUT";

export class DaemonTimeoutError extends Error {
  readonly timedOut = true;

  constructor(
    readonly code: DaemonTimeoutCode,
    message: string,
    readonly timeoutMs: number,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "DaemonTimeoutError";
  }
}

export function isDaemonTimeoutError(error: unknown): error is DaemonTimeoutError {
  return error instanceof DaemonTimeoutError || Boolean((error as Partial<DaemonTimeoutError> | undefined)?.timedOut);
}
