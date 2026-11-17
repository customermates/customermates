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

import { getTenantUser } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { HandOverPublicEndpointsService } from "../hand-over-public-endpoints.service";
import { LeaveInactiveWorkspaceInteractor } from "../leave-inactive-workspace.interactor";
import { WorkspaceDepartureService } from "../workspace-departure.service";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const EMAIL = "ben@example.com";
const adminRole = createMockUser().role;
const memberRole = adminRole ? { ...adminRole, isSystemRole: false } : null;

function membershipWith(status: Status, role = memberRole) {
  return createMockUser({ id: "member-1", companyId: COMPANY_ID, email: EMAIL, status, role });
}

describe("LeaveInactiveWorkspaceInteractor", () => {
  const order: string[] = [];
  let membership: ReturnType<typeof membershipWith> | null;
  let admins: string[];
  let authService: {
    getInteractiveSession: ReturnType<typeof vi.fn>;
    revokeMembershipCredentials: ReturnType<typeof vi.fn>;
  };
  let memberships: {
    findMembershipUnscoped: ReturnType<typeof vi.fn>;
    findAuthUserCompanyIdUnscoped: ReturnType<typeof vi.fn>;
    listWorkspaceMembershipsUnscoped: ReturnType<typeof vi.fn>;
    setLastUsedCompanyUnscoped: ReturnType<typeof vi.fn>;
    listActiveAdminIdsUnscoped: ReturnType<typeof vi.fn>;
  };
  let repo: {
    findMemberCompanyWide: ReturnType<typeof vi.fn>;
    strandsLastPlatformOperatorCompanyWide: ReturnType<typeof vi.fn>;
    leaveCompanyWide: ReturnType<typeof vi.fn>;
  };
  let roleRepo: { hasAnotherActiveSystemRoleUser: ReturnType<typeof vi.fn> };
  let events: { publish: ReturnType<typeof vi.fn> };
  let channels: { findOwnedConnectedAccountIdsCompanyWide: ReturnType<typeof vi.fn> };
  let channelRemoval: { deleteForBillingOrThrow: ReturnType<typeof vi.fn> };
  let forms: { reassignCreatorUnscoped: ReturnType<typeof vi.fn> };
  let webhooks: { reassignCreatorUnscoped: ReturnType<typeof vi.fn> };
  let releaseRoutines: { invoke: ReturnType<typeof vi.fn> };
  let subscriptions: { updateSubscriptionQuantityOrThrow: ReturnType<typeof vi.fn> };

  function interactor() {
    const departure = new WorkspaceDepartureService(
      authService as never,
      memberships as never,
      events as never,
      subscriptions as never,
      {
        getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: SubscriptionPlan.pro, lemonSqueezyId: "ls-1" }),
      } as never,
      { countActiveUsers: vi.fn().mockResolvedValue(1) } as never,
      releaseRoutines as never,
      channels as never,
      channelRemoval as never,
      new HandOverPublicEndpointsService(forms as never, webhooks as never),
      { revokeOfMember: () => Promise.resolve(0) },
    );
    return new LeaveInactiveWorkspaceInteractor(
      authService as never,
      memberships as never,
      repo as never,
      roleRepo as never,
      departure,
    );
  }

  function expectNothingWritten() {
    expect(repo.leaveCompanyWide).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
    expect(channelRemoval.deleteForBillingOrThrow).not.toHaveBeenCalled();
    expect(forms.reassignCreatorUnscoped).not.toHaveBeenCalled();
    expect(memberships.setLastUsedCompanyUnscoped).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    membership = membershipWith(Status.inactive);
    admins = ["admin-1", "admin-2"];
    authService = {
      getInteractiveSession: vi.fn().mockResolvedValue({ user: { id: "login-1", email: EMAIL } }),
      revokeMembershipCredentials: vi.fn(() => {
        order.push("revoked");
        return Promise.resolve(0);
      }),
    };
    memberships = {
      findMembershipUnscoped: vi.fn((email: string, companyId: string) =>
        Promise.resolve(email === EMAIL && companyId === COMPANY_ID ? membership : null),
      ),
      findAuthUserCompanyIdUnscoped: vi.fn().mockResolvedValue(COMPANY_ID),
      listWorkspaceMembershipsUnscoped: vi.fn().mockResolvedValue([
        { companyId: COMPANY_ID, status: Status.inactive },
        { companyId: OTHER_COMPANY_ID, status: Status.active },
      ]),
      setLastUsedCompanyUnscoped: vi.fn(),
      listActiveAdminIdsUnscoped: vi.fn(() => Promise.resolve(admins)),
    };
    repo = {
      findMemberCompanyWide: vi.fn(() => Promise.resolve({ ...getTenantUser(), leftAt: null })),
      strandsLastPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false),
      leaveCompanyWide: vi.fn(() => {
        order.push(`left in ${getTenantUser().companyId}`);
        membership = null;
        return Promise.resolve(true);
      }),
    };
    roleRepo = { hasAnotherActiveSystemRoleUser: vi.fn().mockResolvedValue(true) };
    events = { publish: vi.fn().mockResolvedValue(undefined) };
    channels = { findOwnedConnectedAccountIdsCompanyWide: vi.fn().mockResolvedValue(["account-1"]) };
    channelRemoval = {
      deleteForBillingOrThrow: vi.fn((accountId: string) => {
        order.push(`disconnected ${accountId}`);
        return Promise.resolve();
      }),
    };
    forms = { reassignCreatorUnscoped: vi.fn().mockResolvedValue(1) };
    webhooks = { reassignCreatorUnscoped: vi.fn().mockResolvedValue(1) };
    releaseRoutines = { invoke: vi.fn().mockResolvedValue({ blocked: 0, disabled: 0 }) };
    subscriptions = { updateSubscriptionQuantityOrThrow: vi.fn() };
  });

  it("ends an inactive membership from the session alone, without an active workspace", async () => {
    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result).toEqual({ ok: true, data: { companyId: COMPANY_ID } });
    expect(memberships.findMembershipUnscoped).toHaveBeenCalledExactlyOnceWith(EMAIL, COMPANY_ID);
    expect(repo.findMemberCompanyWide).toHaveBeenCalledExactlyOnceWith({ id: "member-1" });
    expect(repo.leaveCompanyWide).toHaveBeenCalledExactlyOnceWith("member-1");
    expect(order).toEqual([`left in ${COMPANY_ID}`, "revoked", "disconnected account-1"]);
  });

  it("runs the same departure as a normal leave: credentials, channels, endpoints and the last used workspace", async () => {
    await interactor().invoke({ companyId: COMPANY_ID });

    expect(authService.revokeMembershipCredentials).toHaveBeenCalledExactlyOnceWith("login-1", COMPANY_ID);
    expect(channels.findOwnedConnectedAccountIdsCompanyWide).toHaveBeenCalledWith("member-1");
    expect(channelRemoval.deleteForBillingOrThrow).toHaveBeenCalledExactlyOnceWith("account-1", "ownerInactive");
    const handOver = { companyId: COMPANY_ID, fromUserIds: ["member-1"], toUserId: "admin-1" };
    expect(forms.reassignCreatorUnscoped).toHaveBeenCalledExactlyOnceWith(handOver);
    expect(webhooks.reassignCreatorUnscoped).toHaveBeenCalledExactlyOnceWith(handOver);
    expect(memberships.setLastUsedCompanyUnscoped).toHaveBeenCalledExactlyOnceWith("login-1", OTHER_COMPANY_ID);
  });

  it("leaves the login without a last used workspace when the inactive one was its only workspace", async () => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([]);

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result.ok).toBe(true);
    expect(memberships.setLastUsedCompanyUnscoped).toHaveBeenCalledExactlyOnceWith("login-1", null);
  });

  it("frees no seat and releases no routine, because the member was inactive already", async () => {
    await interactor().invoke({ companyId: COMPANY_ID });

    expect(releaseRoutines.invoke).not.toHaveBeenCalled();
    expect(subscriptions.updateSubscriptionQuantityOrThrow).not.toHaveBeenCalled();
  });

  it("writes the departure into the workspace's activity, without a status change", async () => {
    await interactor().invoke({ companyId: COMPANY_ID });

    expect(events.publish).toHaveBeenCalledExactlyOnceWith("user.updated", {
      entityId: "member-1",
      payload: { changes: { leftAt: { previous: null, current: expect.any(String) } } },
    });
  });

  it.each([
    ["active", Status.active],
    ["waiting for approval", Status.pendingAuthorization],
  ])("refuses a membership that is %s as a changed workspace and leaves it alone", async (_case, status) => {
    membership = membershipWith(status);

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceChanged]);
    expect(repo.findMemberCompanyWide).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("refuses without a session", async () => {
    authService.getInteractiveSession.mockResolvedValue(null);

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.permissionDenied]);
    expect(memberships.findMembershipUnscoped).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("looks the membership up by the session's own email, so another login cannot end it", async () => {
    authService.getInteractiveSession.mockResolvedValue({ user: { id: "login-2", email: "someone@example.com" } });

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceNotFound]);
    expect(memberships.findMembershipUnscoped).toHaveBeenCalledExactlyOnceWith("someone@example.com", COMPANY_ID);
    expectNothingWritten();
  });

  it("answers not found for a workspace the login does not belong to", async () => {
    const result = await interactor().invoke({ companyId: OTHER_COMPANY_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceNotFound]);
    expectNothingWritten();
  });

  it("rejects an id that is not a workspace id before reading anything", async () => {
    const result = await interactor().invoke({ companyId: "not-a-uuid" });

    expect(result.ok).toBe(false);
    expect(authService.getInteractiveSession).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("leaves once: a repeated call finds no membership and changes nothing more", async () => {
    const leaver = interactor();

    expect(await leaver.invoke({ companyId: COMPANY_ID })).toMatchObject({ ok: true });
    const repeated = await leaver.invoke({ companyId: COMPANY_ID });

    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(interactorFailureCodes(repeated.error)).toEqual([CustomErrorCode.workspaceNotFound]);
    expect(repo.leaveCompanyWide).toHaveBeenCalledTimes(1);
    expect(authService.revokeMembershipCredentials).toHaveBeenCalledTimes(1);
    expect(forms.reassignCreatorUnscoped).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["reactivated", { status: Status.active, leftAt: null }],
    ["already left", { status: Status.inactive, leftAt: new Date("2026-11-17T08:00:00.000Z") }],
  ])("refuses as a changed workspace when the membership is %s by the time the lock is held", async (_case, row) => {
    repo.findMemberCompanyWide.mockResolvedValue({ ...membershipWith(Status.inactive), ...row });

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceChanged]);
    expectNothingWritten();
  });

  it("does not complete a departure when another request ended the membership first", async () => {
    repo.leaveCompanyWide.mockResolvedValue(false);

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceChanged]);
    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
    expect(forms.reassignCreatorUnscoped).not.toHaveBeenCalled();
  });

  it("lets an inactive admin leave although no other admin is active, because the last-admin rule protects active admins", async () => {
    membership = membershipWith(Status.inactive, adminRole);
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);
    admins = [];

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(result).toEqual({ ok: true, data: { companyId: COMPANY_ID } });
    expect(roleRepo.hasAnotherActiveSystemRoleUser).not.toHaveBeenCalled();
    expect(forms.reassignCreatorUnscoped).not.toHaveBeenCalled();
  });

  it("judges the platform operator rule on the membership re-read under the workspace lock", async () => {
    repo.strandsLastPlatformOperatorCompanyWide.mockResolvedValue(true);

    const result = await interactor().invoke({ companyId: COMPANY_ID });

    expect(repo.strandsLastPlatformOperatorCompanyWide).toHaveBeenCalledExactlyOnceWith("member-1");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceMemberPlatformOperator]);
    expectNothingWritten();
  });

  it("reports a channel the provider could not disconnect and still leaves", async () => {
    const failure = new Error("provider unavailable");
    channelRemoval.deleteForBillingOrThrow.mockRejectedValueOnce(failure);

    await expect(interactor().invoke({ companyId: COMPANY_ID })).resolves.toMatchObject({ ok: true });

    expect(sentry.captureException).toHaveBeenCalledWith(failure, { tags: { kind: "workspace-departure-channel" } });
  });
});
