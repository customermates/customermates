import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ env: { APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted" } }));

vi.mock("@/env", () => ({ env: mocks.env }));

import { startsWithTrial } from "../workspace-trial-policy";

function repo(hasCreated: boolean, hasConsumed = false) {
  return {
    hasConsumedTrialUnscoped: vi.fn().mockResolvedValue(hasConsumed),
    hasCreatedWorkspaceUnscoped: vi.fn().mockResolvedValue(hasCreated),
  };
}

describe("startsWithTrial", () => {
  beforeEach(() => {
    mocks.env.APP_MODE = "cloud";
  });

  it("grants the cloud trial to the first workspace a login creates", async () => {
    const creator = repo(false);

    await expect(startsWithTrial("login-1", creator)).resolves.toBe(true);
    expect(creator.hasCreatedWorkspaceUnscoped).toHaveBeenCalledWith("login-1");
  });

  it("starts every later cloud workspace of the same login without a trial", async () => {
    await expect(startsWithTrial("login-1", repo(true))).resolves.toBe(false);
  });

  it("refuses the trial to a login that consumed it on a workspace it has since deleted", async () => {
    const creator = repo(false, true);

    await expect(startsWithTrial("login-1", creator)).resolves.toBe(false);
    expect(creator.hasConsumedTrialUnscoped).toHaveBeenCalledWith("login-1");
  });

  it.each(["self-hosted", "demo"] as const)("does not consult workspace history in %s mode", async (mode) => {
    mocks.env.APP_MODE = mode;
    const creator = repo(true);

    await expect(startsWithTrial("login-1", creator)).resolves.toBe(true);
    expect(creator.hasCreatedWorkspaceUnscoped).not.toHaveBeenCalled();
    expect(creator.hasConsumedTrialUnscoped).not.toHaveBeenCalled();
  });
});
