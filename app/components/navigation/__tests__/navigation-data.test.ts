import { describe, expect, it, vi } from "vitest";

import { ACCOUNT_STATES } from "@/features/auth/account-state";
import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";

import { loadNavigationData, type NavigationDataLoaders } from "../navigation-data";

function loaders(): NavigationDataLoaders {
  return {
    company: vi.fn().mockResolvedValue({
      company: { id: "company-1" },
      terminology: [],
    }),
    subscription: vi.fn().mockResolvedValue({
      status: "active",
      plan: "pro",
      quantity: 1,
      activeUsers: 1,
      trialEndDate: null,
      currentPeriodEnd: null,
      customerPortalUrl: null,
      hasActiveSubscription: true,
    }),
    systemTaskCount: vi.fn().mockResolvedValue(2),
    unreadThreadCount: vi.fn().mockResolvedValue(3),
    channelsNeedingActionCount: vi.fn().mockResolvedValue(4),
  } as unknown as NavigationDataLoaders;
}

describe("loadNavigationData", () => {
  it.each(ACCOUNT_STATES.filter((state) => state !== "allowed"))(
    "does not call protected shell loaders for %s",
    async (state) => {
      const deps = loaders();

      expect(await loadNavigationData(state, deps)).toEqual({
        company: null,
        terminology: [],
        subscription: null,
        trialDaysLeft: null,
        systemTaskCount: 0,
        unreadThreadCount: 0,
        channelsNeedingActionCount: 0,
      });
      expect(Object.values(deps).every((loader) => vi.mocked(loader).mock.calls.length === 0)).toBe(true);
    },
  );

  it("loads the full shell only for an allowed account", async () => {
    const deps = loaders();

    const result = await loadNavigationData("allowed", deps);

    expect(result).toMatchObject({
      company: { id: "company-1" },
      subscription: { status: "active", plan: "pro" },
      systemTaskCount: 2,
      unreadThreadCount: 3,
      channelsNeedingActionCount: 4,
    });
    expect(Object.values(deps).every((loader) => vi.mocked(loader).mock.calls.length === 1)).toBe(true);
  });

  it("keeps navigation available to an allowed Wiki reader without Inbox permissions", async () => {
    const deps = loaders();
    vi.mocked(deps.channelsNeedingActionCount).mockRejectedValue(
      new ForbiddenError("Access denied. Required permissions: readAll on inboxMessages OR readOwn on inboxMessages"),
    );

    await expect(loadNavigationData("allowed", deps)).resolves.toMatchObject({
      company: { id: "company-1" },
      systemTaskCount: 2,
      unreadThreadCount: 3,
      channelsNeedingActionCount: 0,
    });
  });

  it.each([
    new ForbiddenError("Inactive", AppErrorCode.inactiveUser),
    new AuthError(),
    new Error("Database unavailable"),
  ])("does not hide other Inbox badge loader failures: %s", async (error) => {
    const deps = loaders();
    vi.mocked(deps.channelsNeedingActionCount).mockRejectedValue(error);

    await expect(loadNavigationData("allowed", deps)).rejects.toBe(error);
  });

  it("does not suppress permission failures from required navigation data", async () => {
    const deps = loaders();
    const error = new ForbiddenError("Company permission denied");
    vi.mocked(deps.company).mockRejectedValue(error);

    await expect(loadNavigationData("allowed", deps)).rejects.toBe(error);
  });
});
