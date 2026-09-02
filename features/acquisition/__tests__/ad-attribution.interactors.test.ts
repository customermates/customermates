import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import { ExpireAdAttributionInteractor } from "@/ee/lifecycle/expire-ad-attribution.interactor";
import { WithdrawAdAttributionInteractor } from "../withdraw-ad-attribution.interactor";

describe("narrow Google Ads attribution interactors", () => {
  const owner = createMockUser();
  const routeGuard = { resolveAccountState: vi.fn() };
  const repo = {
    clearAdAttributionForUser: vi.fn(),
    expireAdAttributionUnscoped: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    routeGuard.resolveAccountState.mockResolvedValue({
      state: "allowed",
      user: owner,
    });
    repo.clearAdAttributionForUser.mockResolvedValue(true);
    repo.expireAdAttributionUnscoped.mockResolvedValue(2);
  });

  it("clears only the authenticated user's attribution", async () => {
    await expect(new WithdrawAdAttributionInteractor(routeGuard as never, repo).invoke()).resolves.toBe(true);
    expect(repo.clearAdAttributionForUser).toHaveBeenCalledWith({
      userId: owner.id,
    });
  });

  it("does nothing without an authenticated user", async () => {
    routeGuard.resolveAccountState.mockResolvedValue({
      state: "unregistered",
      user: null,
    });
    await expect(new WithdrawAdAttributionInteractor(routeGuard as never, repo).invoke()).resolves.toBe(false);
    expect(repo.clearAdAttributionForUser).not.toHaveBeenCalled();
  });

  it("delegates bounded expiry without changing account state", async () => {
    const now = new Date("2026-11-29T10:00:00.000Z");
    await expect(new ExpireAdAttributionInteractor(repo).invoke(now)).resolves.toBe(2);
    expect(repo.expireAdAttributionUnscoped).toHaveBeenCalledWith(now);
  });
});
