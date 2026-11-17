import type { ChildProcess } from "node:child_process";

import { spawn } from "node:child_process";

export type KillTree = (child: ChildProcess, signal: NodeJS.Signals) => void;

export function ownsProcessGroup(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "win32";
}

export const killProcessTree: KillTree = (child, signal) => {
  const { pid } = child;
  if (pid === undefined) {
    child.kill(signal);
    return;
  }
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.once("error", () => child.kill(signal));
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
};
