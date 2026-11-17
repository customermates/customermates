import { afterEach, describe, expect, it, vi } from "vitest";

import { runnerDockerCommand, runnerNpxCommand } from "../agent-runner-commands";
import { AGENT_RUNNER_REFRESH_MS, startAgentRunnerRefresh } from "../agent-runner-refresh";
import { AGENT_RUNNER_BADGE_VARIANTS, agentRunnerStatus } from "../agent-runner-status";

const TOKEN = `cmr_${"a".repeat(43)}`;
const URL = "https://app.customermates.com";

describe("the install commands", () => {
  it("builds the one-line npx command with the token in the environment, not as an argument", () => {
    const command = runnerNpxCommand(URL, TOKEN);

    expect(command).toBe(`CUSTOMERMATES_RUNNER_TOKEN=${TOKEN} npx customermates-runner --url ${URL}`);
    expect(command).not.toContain("--token");
  });

  it("builds the Docker command with the same values in the environment and both login mounts", () => {
    const command = runnerDockerCommand(URL, TOKEN);

    expect(command).toContain(`-e CUSTOMERMATES_URL=${URL}`);
    expect(command).toContain(`-e CUSTOMERMATES_RUNNER_TOKEN=${TOKEN}`);
    expect(command).toContain('-v "$HOME/.claude:/home/node/.claude"');
    expect(command).toContain('-v "$HOME/.claude.json:/home/node/.claude.json"');
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

describe("keeping the list current", () => {
  afterEach(() => vi.useRealTimers());

  it("reloads the runners every 30 seconds while the page is visible, and stops when asked", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let visible = true;

    const stop = startAgentRunnerRefresh(refresh, () => visible);
    vi.advanceTimersByTime(AGENT_RUNNER_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    visible = false;
    vi.advanceTimersByTime(AGENT_RUNNER_REFRESH_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(1);

    visible = true;
    vi.advanceTimersByTime(AGENT_RUNNER_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(AGENT_RUNNER_REFRESH_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(AGENT_RUNNER_REFRESH_MS).toBe(30_000);
  });
});
