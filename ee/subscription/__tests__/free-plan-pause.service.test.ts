import { describe, expect, it, vi } from "vitest";

import type { FreePlanMember, FreePlanMemberRepo } from "../free-plan-member.repo";
import type { PlanInviteRepo } from "../plan-invite.repo";
import type { PlanRoutinePauseRepo } from "../plan-routine-pause.repo";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import {
  chooseFreePlanKeepers,
  chooseFreePlanRevival,
  FreePlanPauseService,
  freePlanTransition,
} from "../free-plan-pause.service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-07T12:00:00.000Z");
const DAY_MS = 86_400_000;

function member(id: string, overrides: Partial<FreePlanMember> = {}): FreePlanMember {
  return {
    id,
    email: `${id}@example.test`,
    firstName: id,
    lastName: "Example",
    status: Status.active,
    isAdmin: false,
    createdAt: new Date(`2026-10-0${id.length}T00:00:00.000Z`),
    pausedByPlanAt: null,
    ...overrides,
  };
}

function subscription(
  status: SubscriptionStatus,
  trialEndOffsetDays: number | null = -1,
  plan: SubscriptionPlan = SubscriptionPlan.pro,
) {
  return {
    status,
    plan,
    trialEndDate: trialEndOffsetDays === null ? null : new Date(NOW.getTime() + trialEndOffsetDays * DAY_MS),
    currentPeriodEnd: null,
  };
}

function setup(sub: ReturnType<typeof subscription>, members: FreePlanMember[], ownerEmails: string[] = []) {
  const fns = {
    findPlanSubscriptionUnscoped: vi.fn().mockResolvedValue(sub),
    listMembersUnscoped: vi.fn().mockResolvedValue(members),
    findOwnerEmailsUnscoped: vi.fn().mockResolvedValue(ownerEmails),
    pauseMembersForPlanUnscoped: vi.fn(({ userIds }: { userIds: string[] }) => Promise.resolve(userIds.length)),
    resumeMembersForPlanUnscoped: vi.fn().mockResolvedValue(2),
    reviveMemberForPlanUnscoped: vi.fn().mockResolvedValue(1),
    endPendingJoinRequestsUnscoped: vi.fn().mockResolvedValue(0),
    countActiveMembersUnscoped: vi.fn().mockResolvedValue(3),
    deleteInviteTokensUnscoped: vi.fn().mockResolvedValue(1),
    pauseRoutinesForPlanCompanyWide: vi.fn().mockResolvedValue(2),
    resumeRoutinesForPlanCompanyWide: vi.fn().mockResolvedValue(2),
  };
  const repo = fns as unknown as FreePlanMemberRepo;
  const invites = fns as unknown as PlanInviteRepo;
  const routines = fns as unknown as PlanRoutinePauseRepo;
  const seatQuantity = vi.fn().mockResolvedValue(undefined);
  const service = new FreePlanPauseService(repo, invites, () => routines, "cloud", seatQuantity);
  return { repo, fns, seatQuantity, service };
}

describe("choosing who keeps the Free seat", () => {
  it("keeps an admin first: the creator or billing contact among admins, then the earliest admin, then members", () => {
    const members = [
      member("a", { isAdmin: true }),
      member("bb"),
      member("ccc", { email: "Owner@Example.test", isAdmin: true }),
      member("dddd", { email: "billing@example.test", isAdmin: true }),
    ];

    expect(chooseFreePlanKeepers(members, ["owner@example.test", "billing@example.test"])).toEqual(["ccc"]);
    expect(chooseFreePlanKeepers(members, ["gone@example.test", "billing@example.test"])).toEqual(["dddd"]);
    expect(chooseFreePlanKeepers(members, [])).toEqual(["a"]);
    expect(chooseFreePlanKeepers([member("a"), member("bb")], [])).toEqual(["a"]);
  });

  it("prefers any admin over a creator who is no longer an admin, so the kept person can upgrade", () => {
    const members = [member("a", { email: "owner@example.test" }), member("bb", { isAdmin: true }), member("ccc")];

    expect(chooseFreePlanKeepers(members, ["owner@example.test"])).toEqual(["bb"]);
    expect(
      chooseFreePlanKeepers([member("a", { email: "owner@example.test" }), member("bb")], ["owner@example.test"]),
    ).toEqual(["a"]);
  });

  it("ignores inactive and pending members and keeps a workspace that already fits", () => {
    const members = [
      member("a", { status: Status.inactive, email: "owner@example.test" }),
      member("bb", { status: Status.pendingAuthorization }),
      member("ccc"),
    ];

    expect(chooseFreePlanKeepers(members, ["owner@example.test"])).toEqual(["ccc"]);
  });
});

describe("reviving a Free workspace without an active member", () => {
  it("picks the best-ranked inactive member only when nobody is active", () => {
    const inactive = [
      member("a", { status: Status.inactive }),
      member("bb", { status: Status.inactive, isAdmin: true }),
      member("ccc", { status: Status.pendingAuthorization, isAdmin: true }),
    ];

    expect(chooseFreePlanRevival(inactive, [])).toBe("bb");
    expect(chooseFreePlanRevival([...inactive, member("dddd")], [])).toBeNull();
    expect(chooseFreePlanRevival([member("a", { status: Status.pendingAuthorization })], [])).toBeNull();
  });

  it("gives an expired former customer's workspace one admin back on Free", async () => {
    const members = [
      member("a", { status: Status.inactive }),
      member("bb", { status: Status.inactive, isAdmin: true, email: "owner@example.test" }),
    ];
    const { fns, service } = setup(subscription(SubscriptionStatus.expired, -60), members, ["owner@example.test"]);

    expect(await service.syncUnscoped(COMPANY, NOW)).toMatchObject({ paused: 0, resumed: 1 });
    expect(fns.reviveMemberForPlanUnscoped).toHaveBeenCalledWith({ companyId: COMPANY, userId: "bb" });
  });
});

describe("Free plan transitions", () => {
  it("pauses on Free, resumes on a usable plan and leaves failed payments alone", () => {
    expect(freePlanTransition(subscription(SubscriptionStatus.trial, -1), NOW)).toBe("pause");
    expect(freePlanTransition(subscription(SubscriptionStatus.expired, -30), NOW)).toBe("pause");
    expect(freePlanTransition(subscription(SubscriptionStatus.active, -30, SubscriptionPlan.starter), NOW)).toBe(
      "resume",
    );
    expect(freePlanTransition(subscription(SubscriptionStatus.pastDue, -30), NOW)).toBeNull();
    expect(freePlanTransition(subscription(SubscriptionStatus.expired, null), NOW)).toBeNull();
    expect(freePlanTransition(null, NOW)).toBeNull();
  });

  it("pauses everyone but the owner, cancels invitations and join requests, and pauses routines", async () => {
    const members = [
      member("a", { isAdmin: true }),
      member("bb"),
      member("ccc", { email: "owner@example.test", isAdmin: true }),
    ];
    const { fns, seatQuantity, service } = setup(subscription(SubscriptionStatus.trial, -1), members, [
      "owner@example.test",
    ]);

    expect(await service.syncUnscoped(COMPANY, NOW)).toEqual({
      paused: 2,
      resumed: 0,
      routinesPaused: 2,
      routinesResumed: 0,
    });
    expect(fns.pauseMembersForPlanUnscoped).toHaveBeenCalledWith({
      companyId: COMPANY,
      userIds: ["a", "bb"],
      now: NOW,
      noticeSent: false,
    });
    expect(fns.endPendingJoinRequestsUnscoped).toHaveBeenCalledWith(COMPANY, NOW);
    expect(fns.deleteInviteTokensUnscoped).toHaveBeenCalledWith(COMPANY);
    expect(fns.pauseRoutinesForPlanCompanyWide).toHaveBeenCalledWith(NOW);
    expect(fns.resumeMembersForPlanUnscoped).not.toHaveBeenCalled();
    expect(seatQuantity).not.toHaveBeenCalled();
  });

  it("brings every plan-paused member and routine back on a paid plan and syncs the paid seats", async () => {
    const { fns, seatQuantity, service } = setup(
      subscription(SubscriptionStatus.active, -30, SubscriptionPlan.starter),
      [],
    );

    expect(await service.syncUnscoped(COMPANY, NOW)).toMatchObject({ resumed: 2, routinesResumed: 2 });
    expect(fns.resumeMembersForPlanUnscoped).toHaveBeenCalledWith({ companyId: COMPANY });
    expect(fns.resumeRoutinesForPlanCompanyWide).toHaveBeenCalledWith(NOW);
    expect(seatQuantity).toHaveBeenCalledWith(COMPANY, 3);
    expect(fns.pauseMembersForPlanUnscoped).not.toHaveBeenCalled();
  });

  it("changes nothing on self-hosted installs", async () => {
    const { repo, fns } = setup(subscription(SubscriptionStatus.trial, -1), [member("a"), member("bb")]);
    const service = new FreePlanPauseService(
      repo,
      { deleteInviteTokensUnscoped: vi.fn() },
      () => ({ pauseRoutinesForPlanCompanyWide: vi.fn(), resumeRoutinesForPlanCompanyWide: vi.fn() }),
      "self-hosted",
    );

    expect(await service.syncUnscoped(COMPANY, NOW)).toEqual({
      paused: 0,
      resumed: 0,
      routinesPaused: 0,
      routinesResumed: 0,
    });
    expect(fns.findPlanSubscriptionUnscoped).not.toHaveBeenCalled();
  });
});
