import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mocks = vi.hoisted(() => ({ env: { APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted" } }));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { GetTrialEligibilityInteractor } from "../get-trial-eligibility.interactor";

describe("GetTrialEligibilityInteractor", () => {
  const authService = { getInteractiveSession: vi.fn() };
  const repo = { hasConsumedTrialUnscoped: vi.fn(), hasCreatedWorkspaceUnscoped: vi.fn() };

  function eligibility() {
    return new GetTrialEligibilityInteractor(authService as never, repo as never).invoke();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.APP_MODE = "cloud";
    authService.getInteractiveSession.mockResolvedValue({ user: { id: "login-1" }, session: { id: "s" } });
    repo.hasConsumedTrialUnscoped.mockResolvedValue(false);
    repo.hasCreatedWorkspaceUnscoped.mockResolvedValue(false);
  });

  it("offers the trial to a login that never had one", async () => {
    await expect(eligibility()).resolves.toEqual({ ok: true, data: { eligible: true } });
    expect(repo.hasConsumedTrialUnscoped).toHaveBeenCalledWith("login-1");
  });

  it("withholds the trial from a login that already used it, even after deleting that workspace", async () => {
    repo.hasConsumedTrialUnscoped.mockResolvedValue(true);

    await expect(eligibility()).resolves.toEqual({ ok: true, data: { eligible: false } });
  });

  it("withholds the trial without a session", async () => {
    authService.getInteractiveSession.mockResolvedValue(null);

    await expect(eligibility()).resolves.toEqual({ ok: true, data: { eligible: false } });
  });
});
