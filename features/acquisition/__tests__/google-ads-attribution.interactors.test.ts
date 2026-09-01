import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import { ExpireGoogleAdsClickIdsInteractor } from "@/ee/lifecycle/expire-google-ads-click-ids.interactor";
import { WithdrawGoogleAdsAttributionInteractor } from "../withdraw-google-ads-attribution.interactor";

describe("narrow Google Ads attribution interactors", () => {
  const owner = createMockUser();
  const routeGuard = { resolveAccountState: vi.fn() };
  const repo = {
    clearGoogleAdsAttributionForUser: vi.fn(),
    expireGoogleAdsClickIdsUnscoped: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    routeGuard.resolveAccountState.mockResolvedValue({
      state: "allowed",
      user: owner,
    });
    repo.clearGoogleAdsAttributionForUser.mockResolvedValue(true);
    repo.expireGoogleAdsClickIdsUnscoped.mockResolvedValue(2);
  });

  it("clears only the authenticated user's attribution", async () => {
    await expect(new WithdrawGoogleAdsAttributionInteractor(routeGuard as never, repo).invoke()).resolves.toBe(true);
    expect(repo.clearGoogleAdsAttributionForUser).toHaveBeenCalledWith({
      userId: owner.id,
    });
  });

  it("does nothing without an authenticated user", async () => {
    routeGuard.resolveAccountState.mockResolvedValue({
      state: "unregistered",
      user: null,
    });
    await expect(new WithdrawGoogleAdsAttributionInteractor(routeGuard as never, repo).invoke()).resolves.toBe(false);
    expect(repo.clearGoogleAdsAttributionForUser).not.toHaveBeenCalled();
  });

  it("delegates bounded expiry without changing account state", async () => {
    const now = new Date("2026-11-29T10:00:00.000Z");
    await expect(new ExpireGoogleAdsClickIdsInteractor(repo).invoke(now)).resolves.toBe(2);
    expect(repo.expireGoogleAdsClickIdsUnscoped).toHaveBeenCalledWith(now);
  });
});
