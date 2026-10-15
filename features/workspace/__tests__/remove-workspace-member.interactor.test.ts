import type { RemovableWorkspaceMember } from "../remove-workspace-member.repo";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status, SubscriptionPlan } from "@/generated/prisma";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
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
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { unwindFailure } from "@/core/validation/failure-unwind";
import { RemoveWorkspaceMemberInteractor } from "../remove-workspace-member.interactor";
import { WorkspaceDepartureService } from "../workspace-departure.service";

const COMPANY_ID = "company-1";
const admin = createMockUser({ id: "11111111-1111-4111-8111-111111111111", companyId: COMPANY_ID });
const baseRole = createMockUser().role;
if (!baseRole) throw new Error("The mock user has no role.");
const memberRole = { ...baseRole, id: "member-role", name: "Member", isSystemRole: false };

function memberRow(overrides: Partial<RemovableWorkspaceMember> = {}): RemovableWorkspaceMember {
  return {
    ...createMockUser({
      id: "22222222-2222-4222-8222-222222222222",
      companyId: COMPANY_ID,
      email: "nora@example.com",
      firstName: "Nora",
      lastName: "Second",
      roleId: memberRole.id,
      role: memberRole,
    }),
    leftAt: null,
    ...overrides,
  };
}

describe("RemoveWorkspaceMemberInteractor", () => {
  const order: string[] = [];
  let member: RemovableWorkspaceMember;
  let repo: {
    findMemberCompanyWide: ReturnType<typeof vi.fn>;
    isPlatformOperatorCompanyWide: ReturnType<typeof vi.fn>;
    leaveCompanyWide: ReturnType<typeof vi.fn>;
  };
  let roleRepo: { hasAnotherActiveSystemRoleUser: ReturnType<typeof vi.fn> };
  let memberships: {
    findLoginIdUnscoped: ReturnType<typeof vi.fn>;
    findAuthUserCompanyIdUnscoped: ReturnType<typeof vi.fn>;
    listWorkspaceMembershipsUnscoped: ReturnType<typeof vi.fn>;
    setLastUsedCompanyUnscoped: ReturnType<typeof vi.fn>;
  };
  let authService: { revokeMembershipCredentials: ReturnType<typeof vi.fn> };
  let events: { publish: ReturnType<typeof vi.fn> };
  let subscriptionService: { updateSubscriptionQuantityOrThrow: ReturnType<typeof vi.fn> };
  let routines: { invoke: ReturnType<typeof vi.fn> };
  let channelRemoval: { deleteForBillingOrThrow: ReturnType<typeof vi.fn> };

  function interactor() {
    const departure = new WorkspaceDepartureService(
      authService as never,
      memberships as never,
      events as never,
      subscriptionService as never,
      {
        getSubscriptionOrThrow: vi.fn().mockResolvedValue({ plan: SubscriptionPlan.pro, lemonSqueezyId: "ls-1" }),
      } as never,
      { countActiveUsers: vi.fn().mockResolvedValue(3) } as never,
      routines as never,
      { findOwnedConnectedAccountIdsCompanyWide: vi.fn().mockResolvedValue(["mailbox-1"]) } as never,
      channelRemoval as never,
    );
    return new RemoveWorkspaceMemberInteractor(repo as never, roleRepo as never, memberships as never, departure);
  }

  function track<T>(label: string, value?: T) {
    return vi.fn(() => {
      order.push(label);
      return Promise.resolve(value);
    });
  }

  function removeAs(actor = admin, data: { userId?: string; email?: string } = { userId: member.id }) {
    return runWithTenant(actor, () => interactor().invoke(data));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    member = memberRow();
    repo = {
      findMemberCompanyWide: vi.fn(() => Promise.resolve(member)),
      isPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false),
      leaveCompanyWide: track("left"),
    };
    roleRepo = { hasAnotherActiveSystemRoleUser: vi.fn().mockResolvedValue(true) };
    memberships = {
      findLoginIdUnscoped: vi.fn().mockResolvedValue("login-nora"),
      findAuthUserCompanyIdUnscoped: vi.fn().mockResolvedValue(COMPANY_ID),
      listWorkspaceMembershipsUnscoped: vi.fn().mockResolvedValue([
        { companyId: COMPANY_ID, status: Status.inactive },
        { companyId: "pending-company", status: Status.pendingAuthorization },
        { companyId: "own-company", status: Status.active },
      ]),
      setLastUsedCompanyUnscoped: track("moved"),
    };
    authService = { revokeMembershipCredentials: track("revoked", 2) };
    events = { publish: track("announced") };
    subscriptionService = { updateSubscriptionQuantityOrThrow: track("seats") };
    routines = { invoke: track("routines", { blocked: 0, disabled: 1 }) };
    channelRemoval = { deleteForBillingOrThrow: track("disconnected") };
  });

  it("removes an active member and ends every access the login had to this workspace", async () => {
    const result = await removeAs();

    expect(result).toEqual({
      ok: true,
      data: { userId: member.id, email: "nora@example.com", previousStatus: Status.active },
    });
    expect(order).toEqual(["left", "announced", "revoked", "disconnected", "moved", "routines", "seats"]);
    expect(repo.leaveCompanyWide).toHaveBeenCalledWith(member.id);
    expect(events.publish).toHaveBeenCalledWith("user.updated", {
      entityId: member.id,
      payload: { changes: { status: { previous: Status.active, current: Status.inactive } } },
    });
    expect(authService.revokeMembershipCredentials).toHaveBeenCalledWith("login-nora", COMPANY_ID);
    expect(channelRemoval.deleteForBillingOrThrow).toHaveBeenCalledWith("mailbox-1", "ownerInactive");
    expect(memberships.setLastUsedCompanyUnscoped).toHaveBeenCalledWith("login-nora", "own-company");
    expect(routines.invoke).toHaveBeenCalledWith({ companyId: COMPANY_ID, ownerUserId: member.id });
    expect(subscriptionService.updateSubscriptionQuantityOrThrow).toHaveBeenCalledWith("ls-1", 3);
  });

  it("declines a pending request without touching seats or routines", async () => {
    member = memberRow({ status: Status.pendingAuthorization, roleId: null, role: null });

    const result = await removeAs(admin, { email: "nora@example.com" });

    expect(result).toMatchObject({ ok: true, data: { previousStatus: Status.pendingAuthorization } });
    expect(repo.findMemberCompanyWide).toHaveBeenCalledWith({ email: "nora@example.com" });
    expect(events.publish).toHaveBeenCalledWith("user.updated", {
      entityId: member.id,
      payload: { changes: { status: { previous: Status.pendingAuthorization, current: Status.inactive } } },
    });
    expect(authService.revokeMembershipCredentials).toHaveBeenCalledWith("login-nora", COMPANY_ID);
    expect(routines.invoke).not.toHaveBeenCalled();
    expect(subscriptionService.updateSubscriptionQuantityOrThrow).not.toHaveBeenCalled();
  });

  it("removes an inactive member without announcing a status change", async () => {
    member = memberRow({ status: Status.inactive });

    expect(await removeAs()).toMatchObject({ ok: true, data: { previousStatus: Status.inactive } });

    expect(order).toEqual(["left", "revoked", "disconnected", "moved"]);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("keeps the last used workspace of a login that is somewhere else and skips a member without a login", async () => {
    memberships.findAuthUserCompanyIdUnscoped.mockResolvedValue("own-company");
    expect(await removeAs()).toMatchObject({ ok: true });
    expect(memberships.setLastUsedCompanyUnscoped).not.toHaveBeenCalled();

    vi.clearAllMocks();
    memberships.findLoginIdUnscoped.mockResolvedValue(null);
    expect(await removeAs()).toMatchObject({ ok: true });
    expect(repo.leaveCompanyWide).toHaveBeenCalledTimes(1);
    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
    expect(memberships.setLastUsedCompanyUnscoped).not.toHaveBeenCalled();
  });

  it.each([
    ["the actor's own membership", () => memberRow({ id: admin.id }), CustomErrorCode.workspaceMemberRemoveSelf],
    ["a member who already left", () => memberRow({ leftAt: new Date() }), CustomErrorCode.workspaceMemberLeft],
  ])("refuses to remove %s and changes nothing", async (_label, row, code) => {
    member = row();

    const result = await removeAs(admin, { userId: member.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([code]);
    expect(order).toEqual([]);
  });

  it("refuses to remove a platform operator", async () => {
    repo.isPlatformOperatorCompanyWide.mockResolvedValue(true);

    const result = await removeAs();

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.workspaceMemberPlatformOperator]);
    expect(order).toEqual([]);
  });

  it("refuses to remove the last active admin, but removes an inactive admin", async () => {
    const manager = createMockUserWithPermissions([{ resource: "users", action: "update" }]);
    member = memberRow({ role: { ...memberRole, isSystemRole: true } });
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);

    const refused = await removeAs({ ...manager, id: "33333333-3333-4333-8333-333333333333", companyId: COMPANY_ID });

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(interactorFailureCodes(refused.error)).toEqual([CustomErrorCode.workspaceMemberLastAdmin]);
    expect(order).toEqual([]);

    member = memberRow({ status: Status.inactive, role: { ...memberRole, isSystemRole: true } });
    expect(await removeAs()).toMatchObject({ ok: true });
  });

  it("needs a member reference that matches", async () => {
    const missing = await removeAs(admin, {});
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(interactorFailureCodes(missing.error)).toEqual([CustomErrorCode.memberReferenceRequired]);

    const mismatch = await removeAs(admin, { userId: member.id, email: "someone@example.com" });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(interactorFailureCodes(mismatch.error)).toEqual([CustomErrorCode.userNotFound]);

    repo.findMemberCompanyWide.mockResolvedValue(null);
    const unknown = await removeAs();
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(interactorFailureCodes(unknown.error)).toEqual([CustomErrorCode.userNotFound]);
    expect(order).toEqual([]);
  });

  it("returns a failed announcement as the result and leaves credentials and channels alone", async () => {
    events.publish.mockRejectedValue(unwindFailure(CustomErrorCode.recordWritePaused, "conflict"));

    const result = await removeAs();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureCodes(result.error)).toEqual([CustomErrorCode.recordWritePaused]);
    expect(authService.revokeMembershipCredentials).not.toHaveBeenCalled();
    expect(channelRemoval.deleteForBillingOrThrow).not.toHaveBeenCalled();
  });

  it("is only available to roles that can edit members", async () => {
    const reader = createMockUserWithPermissions([{ resource: "users", action: "readAll" }]);

    await expect(removeAs({ ...reader, companyId: COMPANY_ID })).rejects.toThrow(/update on users/);
    expect(order).toEqual([]);
  });
});
