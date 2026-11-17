import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status, SubscriptionPlan } from "@/generated/prisma";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));

vi.mock("@/core/observability/server", () => sentry);
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: <T>(work: () => Promise<T>) => work(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { getTenantUser, runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { HandOverPublicEndpointsService } from "../hand-over-public-endpoints.service";
import { LeaveWorkspaceInteractor } from "../leave-workspace.interactor";
import { WorkspaceDepartureService } from "../workspace-departure.service";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const adminRole = createMockUser().role;
const member = createMockUser({
  id: "member-1",
  companyId: COMPANY_ID,
  email: "ben@example.com",
  status: Status.active,
  role: adminRole ? { ...adminRole, isSystemRole: false } : null,
});

describe("LeaveWorkspaceInteractor", () => {
  const order: string[] = [];
  let channels: { findOwnedConnectedAccountIdsCompanyWide: ReturnType<typeof vi.fn> };
  let channelRemoval: { deleteForBillingOrThrow: ReturnType<typeof vi.fn> };
  let forms: { reassignCreatorUnscoped: ReturnType<typeof vi.fn> };
  let webhooks: { reassignCreatorUnscoped: ReturnType<typeof vi.fn> };
  let admins: string[];
  let repo: {
    findMemberCompanyWide: ReturnType<typeof vi.fn>;
    strandsLastPlatformOperatorCompanyWide: ReturnType<typeof vi.fn>;
    leaveCompanyWide: ReturnType<typeof vi.fn>;
  };
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
        listActiveAdminIdsUnscoped: vi.fn(() => Promise.resolve(admins)),
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
      new HandOverPublicEndpointsService(forms as never, webhooks as never),
      runners,
      { releasePlanPausedOwnerRulesUnscoped: () => Promise.resolve(0) },
    );
    return new LeaveWorkspaceInteractor(authService as never, repo as never, roleRepo as never, departure);
  }

  const runnerRevocations: Array<{ companyId: string; userId: string }> = [];
  const runners = {
    revokeOfMember: (args: { companyId: string; userId: string; at: Date }) => {
      order.push("runners revoked");
      runnerRevocations.push({ companyId: args.companyId, userId: args.userId });
      return Promise.resolve(1);
    },
  };

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
      findMemberCompanyWide: vi.fn(() => Promise.resolve({ ...getTenantUser(), leftAt: null })),
      strandsLastPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false),
      leaveCompanyWide: vi.fn(() => {
        order.push("left");
        return Promise.resolve(true);
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
    forms = { reassignCreatorUnscoped: vi.fn().mockResolvedValue(1) };
    webhooks = { reassignCreatorUnscoped: vi.fn().mockResolvedValue(1) };
    admins = ["admin-1", "admin-2"];
  });

  it("hands the leaver's forms and incoming webhooks to the oldest remaining admin so their endpoints keep working", async () => {
    const result = await runWithTenant(member, () => interactor().invoke({ companyId: COMPANY_ID }));

    expect(result).toEqual({ ok: true, data: { companyId: COMPANY_ID } });
    const handOver = { companyId: COMPANY_ID, fromUserIds: ["member-1"], toUserId: "admin-1" };
    expect(forms.reassignCreatorUnscoped).toHaveBeenCalledExactlyOnceWith(handOver);
    expect(webhooks.reassignCreatorUnscoped).toHaveBeenCalledExactlyOnceWith(handOver);
  });

  it("does not hand anything over when leaving is refused", async () => {
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);

    const result = await runWithTenant(createMockUser({ ...member, role: adminRole }), () =>
      interactor().invoke({ companyId: COMPANY_ID }),
    );

    expect(result.ok).toBe(false);
    expect(forms.reassignCreatorUnscoped).not.toHaveBeenCalled();
    expect(webhooks.reassignCreatorUnscoped).not.toHaveBeenCalled();
  });

  it("disconnects the leaver's own channels in the workspace right after leaving", async () => {
    const result = await runWithTenant(member, () => interactor().invoke({ companyId: COMPANY_ID }));

    expect(result).toEqual({ ok: true, data: { companyId: COMPANY_ID } });
    expect(channels.findOwnedConnectedAccountIdsCompanyWide).toHaveBeenCalledWith("member-1");
    expect(channelRemoval.deleteForBillingOrThrow.mock.calls).toEqual([
      ["account-1", "ownerInactive"],
      ["account-2", "ownerInactive"],
    ]);
    expect(order).toEqual([
      "left",
      "announced",
      "revoked",
      "runners revoked",
      "disconnected account-1",
      "disconnected account-2",
    ]);
    expect(runnerRevocations.at(-1)).toEqual({ companyId: COMPANY_ID, userId: "member-1" });
    expect(events.publish).toHaveBeenCalledWith("user.updated", {
      entityId: "member-1",
      payload: {
        changes: {
          leftAt: { previous: null, current: expect.any(String) },
          status: { previous: Status.active, current: Status.inactive },
        },
      },
    });
  });

  it("still leaves and reports a channel the provider could not disconnect, leaving it to the daily cleanup", async () => {
    const failure = new Error("provider unavailable");
    channelRemoval.deleteForBillingOrThrow.mockRejectedValueOnce(failure);

    await expect(runWithTenant(member, () => interactor().invoke({ companyId: COMPANY_ID }))).resolves.toMatchObject({
      ok: true,
    });

    expect(channelRemoval.deleteForBillingOrThrow).toHaveBeenCalledTimes(2);
    expect(sentry.captureException).toHaveBeenCalledWith(failure, { tags: { kind: "workspace-departure-channel" } });
  });

  it("keeps every channel when leaving is refused", async () => {
    const lastAdmin = createMockUser({ ...member, role: adminRole });
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);

    const result = await runWithTenant(lastAdmin, () => interactor().invoke({ companyId: COMPANY_ID }));

    expect(result.ok).toBe(false);
    expect(channels.findOwnedConnectedAccountIdsCompanyWide).not.toHaveBeenCalled();
    expect(channelRemoval.deleteForBillingOrThrow).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("refuses to leave when the page shows another workspace than the session's", async () => {
    const otherWorkspace = "00000000-0000-4000-8000-000000000002";

    const result = await runWithTenant(member, () => interactor().invoke({ companyId: otherWorkspace }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceChanged]);

    expect(repo.leaveCompanyWide).not.toHaveBeenCalled();
    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("judges the last-admin rule on the membership re-read under the workspace lock", async () => {
    repo.findMemberCompanyWide.mockResolvedValue({ ...member, role: adminRole, leftAt: null });
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);

    const result = await runWithTenant(member, () => interactor().invoke({ companyId: COMPANY_ID }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceLastAdmin]);
    expect(repo.leaveCompanyWide).not.toHaveBeenCalled();
  });

  it.each([
    ["already left", { status: Status.active, leftAt: new Date("2026-10-18T08:00:00.000Z") }],
    ["no longer active", { status: Status.inactive, leftAt: null }],
  ])("refuses as a changed workspace when the membership is %s by the time the lock is held", async (_case, row) => {
    repo.findMemberCompanyWide.mockResolvedValue({ ...member, ...row });

    const result = await runWithTenant(member, () => interactor().invoke({ companyId: COMPANY_ID }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceChanged]);
    expect(repo.leaveCompanyWide).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
  });

  it("does not complete a departure when another request marked the membership left first", async () => {
    repo.leaveCompanyWide.mockResolvedValue(false);

    const result = await runWithTenant(member, () => interactor().invoke({ companyId: COMPANY_ID }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceChanged]);
    expect(events.publish).not.toHaveBeenCalled();
    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
  });
});
