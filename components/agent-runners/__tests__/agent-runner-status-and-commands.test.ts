import { describe, expect, it } from "vitest";

import { runnerDockerCommand, runnerNpxCommand } from "../agent-runner-commands";
import { AGENT_RUNNER_BADGE_VARIANTS, agentRunnerStatus } from "../agent-runner-status";

const TOKEN = `cmr_${"a".repeat(43)}`;
const URL = "https://app.customermates.com";

describe("the install commands", () => {
  it("builds the one-line npx command with the token and the address", () => {
    expect(runnerNpxCommand(URL, TOKEN)).toBe(`npx customermates-runner --token ${TOKEN} --url ${URL}`);
  });

  it("builds the Docker command with the same values in the environment and the login folder mounted", () => {
    const command = runnerDockerCommand(URL, TOKEN);

    expect(command).toContain(`-e CUSTOMERMATES_URL=${URL}`);
    expect(command).toContain(`-e CUSTOMERMATES_RUNNER_TOKEN=${TOKEN}`);
    expect(command).toContain('-v "$HOME/.claude:/home/node/.claude"');
    expect(command.endsWith("ghcr.io/customermates/runner")).toBe(true);
    expect(command).not.toContain("\n");
  });
});

describe("the status of a runner", () => {
  const seen = "2026-11-17T09:00:00.000Z";

  it.each([
    [{ online: true, revokedAt: null, lastSeenAt: seen }, "online", "success"],
    [{ online: false, revokedAt: null, lastSeenAt: seen }, "offline", "warning"],
    [{ online: false, revokedAt: null, lastSeenAt: null }, "neverSeen", "secondary"],
    [{ online: false, revokedAt: seen, lastSeenAt: seen }, "revoked", "destructive"],
    [{ online: true, revokedAt: seen, lastSeenAt: seen }, "revoked", "destructive"],
  ] as const)("reads %j as %s", (runner, status, variant) => {
    expect(agentRunnerStatus(runner)).toBe(status);
    expect(AGENT_RUNNER_BADGE_VARIANTS[status]).toBe(variant);
  });
});
