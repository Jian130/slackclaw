import { spawn } from "node:child_process";

import { DaemonTimeoutError } from "./timeout-errors.js";

export interface CommandResult {
  code: number;
  signal?: NodeJS.Signals;
  stdout: string;
  stderr: string;
}

export class CommandTimeoutError extends DaemonTimeoutError {
  readonly stdout: string;
  readonly stderr: string;
  readonly signal?: NodeJS.Signals;

  constructor(params: {
    command: string;
    args: string[];
    timeoutMs: number;
    stdout: string;
    stderr: string;
    signal?: NodeJS.Signals;
  }) {
    super(
      "COMMAND_TIMEOUT",
      `${params.command} ${params.args.join(" ")} timed out after ${params.timeoutMs}ms.`,
      params.timeoutMs,
      {
        command: params.command,
        args: params.args,
        signal: params.signal
      }
    );
    this.stdout = params.stdout.trim();
    this.stderr = params.stderr.trim();
    this.signal = params.signal;
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options?: {
    allowFailure?: boolean;
    env?: NodeJS.ProcessEnv;
    input?: string;
    beforeSpawn?: (command: string, args: string[]) => void;
    onSpawnError?: (error: unknown) => void | Promise<void>;
    timeoutMs?: number;
    killTimeoutMs?: number;
  }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    options?.beforeSpawn?.(command, args);
    const child = spawn(command, args, {
      env: options?.env
    });

    let stdout = "";
    let stderr = "";
    let timeout: NodeJS.Timeout | undefined;
    let forceKillTimeout: NodeJS.Timeout | undefined;
    let timedOut = false;

    const clearTimers = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
        forceKillTimeout = undefined;
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin.end(options?.input);

    if (options?.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // Best-effort termination. The close/error handler below settles the promise.
        }

        forceKillTimeout = setTimeout(() => {
          if (child.exitCode === null) {
            try {
              child.kill("SIGKILL");
            } catch {
              // Best-effort forced termination.
            }
          }
        }, options.killTimeoutMs ?? 5_000);
      }, options.timeoutMs);
    }

    child.on("error", (error) => {
      clearTimers();
      void options?.onSpawnError?.(error);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimers();
      const result: CommandResult = {
        code: code ?? 1,
        signal: signal ?? undefined,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (timedOut && options?.timeoutMs) {
        reject(new CommandTimeoutError({
          command,
          args,
          timeoutMs: options.timeoutMs,
          stdout,
          stderr,
          signal: signal ?? undefined
        }));
        return;
      }

      if (!options?.allowFailure && result.code !== 0) {
        reject(new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`));
        return;
      }

      resolve(result);
    });
  });
}

export async function resolveCommandFromPath(
  command: string,
  options?: {
    env?: NodeJS.ProcessEnv;
  }
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`], {
      stdio: ["ignore", "pipe", "ignore"],
      env: options?.env
    });

    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("close", (code) => {
      const resolved = stdout.trim();
      resolve(code === 0 && resolved.startsWith("/") ? resolved : undefined);
    });

    child.on("error", () => resolve(undefined));
  });
}

export async function probeCommand(
  command: string,
  args: string[] = ["--version"],
  options?: {
    env?: NodeJS.ProcessEnv;
  }
): Promise<boolean> {
  try {
    const result = await runCommand(command, args, {
      allowFailure: true,
      env: options?.env
    });
    return result.code === 0;
  } catch {
    return false;
  }
}
