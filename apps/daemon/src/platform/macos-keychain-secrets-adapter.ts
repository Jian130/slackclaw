import { spawn } from "node:child_process";

import { logDevelopmentCommand } from "../services/logger.js";
import { NoopSecretsAdapter, type SecretsAdapter } from "./secrets-adapter.js";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SecretsCommandRunner = (args: string[]) => Promise<CommandResult>;

function unavailable(result: CommandResult): boolean {
  return result.code === 127 || /command not found|not found|enoent|no such file/i.test(result.stderr);
}

function missingSecret(result: CommandResult): boolean {
  return /could not be found|could not find|item not found|the specified item could not be found/i.test(result.stderr);
}

async function runSecurityCommand(args: string[]): Promise<CommandResult> {
  logDevelopmentCommand("exec", "security", args);

  return await new Promise<CommandResult>((resolve) => {
    const child = spawn("security", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        code: 127,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

export class MacOSKeychainSecretsAdapter implements SecretsAdapter {
  constructor(
    private readonly serviceName = "ai.chillclaw.desktop",
    private readonly runner: SecretsCommandRunner = runSecurityCommand
  ) {}

  async get(name: string): Promise<string | undefined> {
    const result = await this.runner(["find-generic-password", "-a", name, "-s", this.serviceName, "-w"]);

    if (result.code === 0) {
      return result.stdout.trim();
    }

    if (unavailable(result) || missingSecret(result)) {
      return undefined;
    }

    throw new Error(result.stderr || result.stdout || `ChillClaw could not read the secret ${name} from the macOS keychain.`);
  }

  async set(name: string, value: string): Promise<void> {
    const result = await this.runner(["add-generic-password", "-U", "-a", name, "-s", this.serviceName, "-w", value]);

    if (result.code === 0 || unavailable(result)) {
      return;
    }

    throw new Error(result.stderr || result.stdout || `ChillClaw could not save the secret ${name} into the macOS keychain.`);
  }

  async delete(name: string): Promise<void> {
    const result = await this.runner(["delete-generic-password", "-a", name, "-s", this.serviceName]);

    if (result.code === 0 || unavailable(result) || missingSecret(result)) {
      return;
    }

    throw new Error(result.stderr || result.stdout || `ChillClaw could not delete the secret ${name} from the macOS keychain.`);
  }
}

export function createDefaultSecretsAdapter(): SecretsAdapter {
  if (process.platform !== "darwin") {
    return new NoopSecretsAdapter();
  }

  return new MacOSKeychainSecretsAdapter();
}
