import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";

export type DiskCommandRunner = (command: string, args: string[]) => Promise<string>;

export async function resolveDiskProbePath(targetPath: string): Promise<string> {
  let candidate = targetPath;

  for (;;) {
    try {
      await stat(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      const parent = dirname(candidate);
      if (parent === candidate) {
        return candidate;
      }
      candidate = parent;
    }
  }
}

export function availableBytesFromDfOutput(output: string): number {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("df did not return disk usage.");
  }

  const fields = lines[lines.length - 1]?.trim().split(/\s+/u) ?? [];
  const availableKb = Number(fields[3]);
  if (!Number.isFinite(availableKb) || availableKb < 0) {
    throw new Error("df did not return available disk space.");
  }

  return availableKb * 1024;
}

export async function getAvailableDiskBytes(
  targetPath: string,
  options?: { runCommand?: DiskCommandRunner }
): Promise<number> {
  const probePath = await resolveDiskProbePath(targetPath);
  const output = await (options?.runCommand ?? runCommand)("df", ["-Pk", probePath]);
  return availableBytesFromDfOutput(output);
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(new Error(stderr.trim() || error.message));
        return;
      }

      resolvePromise(stdout);
    });
  });
}
