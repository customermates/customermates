import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status, SubscriptionPlan } from "@/generated/prisma";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));

vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: <T>(work: () => Promise<T>) => work(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { LeaveWorkspaceInteractor } from "../leave-workspace.interactor";
import { WorkspaceDepartureService } from "../workspace-departure.service";

const adminRole = createMockUser().role;
const member = createMockUser({
  id: "member-1",
  companyId: "company-1",
  email: "ben@example.com",
  status: Status.active,
  role: adminRole ? { ...adminRole, isSystemRole: false } : null,
});

describe("LeaveWorkspaceInteractor", () => {
  const order: string[] = [];
  let channels: { findOwnedConnectedAccountIdsCompanyWide: ReturnType<typeof vi.fn> };
  let channelRemoval: { deleteForBillingOrThrow: ReturnType<typeof vi.fn> };
  let repo: { isPlatformOperatorCompanyWide: ReturnType<typeof vi.fn>; leaveCompanyWide: ReturnType<typeof vi.fn> };
  let roleRepo: { hasAnotherActiveSystemRoleUser: ReturnType<typeof vi.fn> };
  let events: { publish: ReturnType<typeof vi.fn> };
  let authService: {
    getInteractiveSession: ReturnType<typeof vi.fn>;
    revokeMembershipCredentials: ReturnType<typeof vi.fn>;
  };

  function interactor() {
    const departure = new WorkspaceDepartureService(
      authService as never,
      {
        findAuthUserCompanyIdUnscoped: vi.fn().mockResolvedValue("company-2"),
        listWorkspaceMembershipsUnscoped: vi.fn().mockResolvedValue([]),
        setLastUsedCompanyUnscoped: vi.fn(),
      } as never,
      events as never,
      { updateSubscriptionQuantityOrThrow: vi.fn() } as never,
      {
        getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: SubscriptionPlan.pro, lemonSqueezyId: null }),
      } as never,
      { countActiveUsers: vi.fn().mockResolvedValue(1) } as never,
      { invoke: vi.fn().mockResolvedValue({ blocked: 0, disabled: 0 }) } as never,
      channels as never,
      channelRemoval as never,
    );
    return new LeaveWorkspaceInteractor(authService as never, repo as never, roleRepo as never, departure);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    authService = {
      getInteractiveSession: vi.fn().mockResolvedValue({ user: { id: "login-1", email: member.email } }),
      revokeMembershipCredentials: vi.fn(() => {
        order.push("revoked");
        return Promise.resolve(0);
      }),
    };
    repo = {
      isPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false),
      leaveCompanyWide: vi.fn(() => {
        order.push("left");
        return Promise.resolve();
      }),
    };
    roleRepo = { hasAnotherActiveSystemRoleUser: vi.fn().mockResolvedValue(true) };
    events = {
      publish: vi.fn(() => {
        order.push("announced");
        return Promise.resolve();
      }),
    };
    channels = { findOwnedConnectedAccountIdsCompanyWide: vi.fn().mockResolvedValue(["account-1", "account-2"]) };
    channelRemoval = {
      deleteForBillingOrThrow: vi.fn((accountId: string) => {
        order.push(`disconnected ${accountId}`);
        return Promise.resolve();
      }),
    };
  });

  it("disconnects the leaver's own channels in the workspace right after leaving", async () => {
    const result = await runWithTenant(member, () => interactor().invoke());

    expect(result).toEqual({ ok: true, data: { companyId: "company-1" } });
    expect(channels.findOwnedConnectedAccountIdsCompanyWide).toHaveBeenCalledWith("member-1");
    expect(channelRemoval.deleteForBillingOrThrow.mock.calls).toEqual([
      ["account-1", "ownerInactive"],
      ["account-2", "ownerInactive"],
    ]);
    expect(order).toEqual(["left", "announced", "revoked", "disconnected account-1", "disconnected account-2"]);
    expect(events.publish).toHaveBeenCalledWith("user.updated", {
      entityId: "member-1",
      payload: { changes: { status: { previous: Status.active, current: Status.inactive } } },
    });
  });

  it("still leaves and reports a channel the provider could not disconnect, leaving it to the daily cleanup", async () => {
    const failure = new Error("provider unavailable");
    channelRemoval.deleteForBillingOrThrow.mockRejectedValueOnce(failure);

    await expect(runWithTenant(member, () => interactor().invoke())).resolves.toMatchObject({ ok: true });

    expect(channelRemoval.deleteForBillingOrThrow).toHaveBeenCalledTimes(2);
    expect(sentry.captureException).toHaveBeenCalledWith(failure, { tags: { kind: "workspace-departure-channel" } });
  });

  it("keeps every channel when leaving is refused", async () => {
    const lastAdmin = createMockUser({ ...member, role: adminRole });
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);

    const result = await runWithTenant(lastAdmin, () => interactor().invoke());

    expect(result.ok).toBe(false);
    expect(channels.findOwnedConnectedAccountIdsCompanyWide).not.toHaveBeenCalled();
    expect(channelRemoval.deleteForBillingOrThrow).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
