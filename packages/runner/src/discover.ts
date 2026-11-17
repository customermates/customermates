import type { ClientName, FoundClient } from "./types.js";

import { execFile } from "node:child_process";

import { CLIENT_NAMES } from "./types.js";
import { commandPlan } from "./windows-command.js";

export type VersionProbe = (binary: string) => Promise<string | null>;

const VERSION_TIMEOUT_MS = 10_000;
const VERSION_PATTERN = /\d+\.\d+\.\d+[\w.+-]*/u;
const VERSION_MAX_LENGTH = 60;

export function binaryFor(name: ClientName, env: Record<string, string | undefined>): string {
  return env[`CUSTOMERMATES_RUNNER_${name.toUpperCase()}_BIN`] || name;
}

export function versionFromOutput(output: string): string | null {
  const firstLine = output
    .split("\n")
    .find((line) => line.trim() !== "")
    ?.trim();
  return firstLine ? (VERSION_PATTERN.exec(firstLine)?.[0].slice(0, VERSION_MAX_LENGTH) ?? null) : null;
}

export const probeVersion: VersionProbe = (binary) =>
  new Promise((resolve) => {
    const plan = commandPlan(binary, ["--version"], process.env);
    execFile(
      plan.command,
      plan.args,
      { timeout: VERSION_TIMEOUT_MS, windowsHide: true, windowsVerbatimArguments: plan.verbatim },
      (error, stdout) => {
        resolve(error ? null : versionFromOutput(String(stdout)));
      },
    );
  });

export async function discoverClients(
  env: Record<string, string | undefined>,
  probe: VersionProbe = probeVersion,
): Promise<FoundClient[]> {
  const found = await Promise.all(
    CLIENT_NAMES.map(async (name) => {
      const binary = binaryFor(name, env);
      const version = await probe(binary);
      return version ? ({ name, version, binary } satisfies FoundClient) : null;
    }),
  );
  return found.filter((client): client is FoundClient => client !== null);
}

export function usableClients(found: readonly FoundClient[], wanted: ClientName | null): FoundClient[] {
  return wanted ? found.filter((client) => client.name === wanted) : [...found];
}

export function chooseClient(found: readonly FoundClient[], wanted: ClientName | null): FoundClient | null {
  return usableClients(found, wanted)[0] ?? null;
}
