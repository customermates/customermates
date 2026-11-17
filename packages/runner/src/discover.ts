import type { ClientName, FoundClient } from "./types.js";

import { execFile } from "node:child_process";

import { CLIENT_NAMES } from "./types.js";

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
  if (!firstLine) return null;
  return (VERSION_PATTERN.exec(firstLine)?.[0] ?? firstLine).slice(0, VERSION_MAX_LENGTH);
}

export const probeVersion: VersionProbe = (binary) =>
  new Promise((resolve) => {
    execFile(binary, ["--version"], { timeout: VERSION_TIMEOUT_MS }, (error, stdout) => {
      resolve(error ? null : versionFromOutput(String(stdout)));
    });
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

export function chooseClient(found: readonly FoundClient[], wanted: ClientName | null): FoundClient | null {
  return wanted ? (found.find((client) => client.name === wanted) ?? null) : (found[0] ?? null);
}
