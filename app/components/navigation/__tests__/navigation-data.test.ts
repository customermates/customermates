import { describe, expect, it, vi } from "vitest";

import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { ACCOUNT_STATES, type AccountState } from "@/features/auth/account-state";

import { loadNavigationData, type NavigationDataLoaders } from "../navigation-data";

const WORKSPACE: WorkspaceSummary = {
  companyId: "company-1",
  name: "Acme",
  status: "active",
  roleName: "Admin",
  isAdmin: true,
  isCurrent: true,
  activeMemberCount: 3,
  subscription: null,
  joinedAt: new Date("2026-01-01T00:00:00Z"),
};

const MEMBERSHIP_STATES: AccountState[] = ["inactive", "pending", "onboarding", "legal", "subscription"];
const NON_MEMBER_STATES = ACCOUNT_STATES.filter((state) => state !== "allowed" && !MEMBERSHIP_STATES.includes(state));

function loaders(): NavigationDataLoaders {
  return {
    records: vi.fn().mockResolvedValue({ companyId: "company-1", schemaRevision: 1, canManageSchema: true, types: [] }),
    sidebarLayout: vi.fn().mockResolvedValue(null),
    keyboardPreferences: vi.fn().mockResolvedValue({ singleKeyShortcuts: false }),
    subscription: vi.fn().mockResolvedValue({
      status: "active",
      plan: "pro",
      quantity: 1,
      activeUsers: 1,
      trialEndDate: null,
      currentPeriodEnd: null,
      hasBillingPortal: false,
      hasActiveSubscription: true,
    }),
    systemTaskCount: vi.fn().mockResolvedValue(2),
    unreadThreadCount: vi.fn().mockResolvedValue(3),
    channelsNeedingActionCount: vi.fn().mockResolvedValue(4),
    workspaces: vi.fn().mockResolvedValue([WORKSPACE]),
  } as unknown as NavigationDataLoaders;
}

const EMPTY_SHELL = {
  records: null,
  sidebarLayout: null,
  keyboardPreferences: null,
  subscription: null,
  trialDaysLeft: null,
  systemTaskCount: 0,
  unreadThreadCount: 0,
  channelsNeedingActionCount: 0,
};

describe("loadNavigationData", () => {
  it.each(NON_MEMBER_STATES)("does not call any shell loader for %s", async (state) => {
    const deps = loaders();

    expect(await loadNavigationData(state, deps)).toEqual({ ...EMPTY_SHELL, workspaces: [] });
    expect(Object.values(deps).every((loader) => vi.mocked(loader).mock.calls.length === 0)).toBe(true);
  });

  it.each(MEMBERSHIP_STATES)("loads only the workspace list for a restricted %s membership", async (state) => {
    const deps = loaders();

    expect(await loadNavigationData(state, deps)).toEqual({ ...EMPTY_SHELL, workspaces: [WORKSPACE] });
    expect(deps.workspaces).toHaveBeenCalledTimes(1);
    expect(
      Object.entries(deps)
        .filter(([name]) => name !== "workspaces")
        .every(([, loader]) => vi.mocked(loader).mock.calls.length === 0),
    ).toBe(true);
  });

  it("loads the full shell only for an allowed account", async () => {
    const deps = loaders();

    const result = await loadNavigationData("allowed", deps);

    expect(result).toMatchObject({
      subscription: { status: "active", plan: "pro" },
      keyboardPreferences: { singleKeyShortcuts: false },
      systemTaskCount: 2,
      unreadThreadCount: 3,
      channelsNeedingActionCount: 4,
      workspaces: [WORKSPACE],
    });
    expect(Object.values(deps).every((loader) => vi.mocked(loader).mock.calls.length === 1)).toBe(true);
  });
});
