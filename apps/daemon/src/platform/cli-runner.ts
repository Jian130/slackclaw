import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  signal?: NodeJS.Signals;
  stdout: string;
  stderr: string;
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
  }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    options?.beforeSpawn?.(command, args);
    const child = spawn(command, args, {
      env: options?.env
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin.end(options?.input);

    child.on("error", (error) => {
      void options?.onSpawnError?.(error);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      const result: CommandResult = {
        code: code ?? 1,
        signal: signal ?? undefined,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

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

    child.on("exit", (code) => {
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
