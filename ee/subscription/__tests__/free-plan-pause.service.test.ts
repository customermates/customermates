import { describe, expect, it, vi } from "vitest";

import type { FreePlanMember, FreePlanMemberRepo } from "../free-plan-member.repo";
import type { PlanInviteRepo } from "../plan-invite.repo";
import type { PlanRoutinePauseRepo } from "../plan-routine-pause.repo";
import type { PlanRulePauseRepo } from "../plan-rule-pause.repo";

import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { HandOverPublicEndpointsService } from "@/features/workspace/hand-over-public-endpoints.service";

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
    syncRulesToPlanLimitCompanyWide: vi.fn().mockResolvedValue({ paused: 4, resumed: 1 }),
  };
  const repo = fns as unknown as FreePlanMemberRepo;
  const invites = fns as unknown as PlanInviteRepo;
  const routines = fns as unknown as PlanRoutinePauseRepo;
  const rules = fns as unknown as PlanRulePauseRepo;
  const seatQuantity = vi.fn().mockResolvedValue(undefined);
  const forms = { reassignCreatorUnscoped: vi.fn().mockResolvedValue(1) };
  const webhooks = { reassignCreatorUnscoped: vi.fn().mockResolvedValue(2) };
  const service = new FreePlanPauseService(
    repo,
    invites,
    () => routines,
    () => rules,
    new HandOverPublicEndpointsService(forms, webhooks),
    "cloud",
    seatQuantity,
  );
  return { repo, fns, seatQuantity, service, forms, webhooks };
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
      rulesPaused: 4,
      rulesResumed: 1,
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

  it("hands the forms and incoming webhooks of paused members to the kept admin", async () => {
    const members = [
      member("a", { isAdmin: true }),
      member("bb"),
      member("ccc", { email: "owner@example.test", isAdmin: true }),
    ];
    const { forms, webhooks, service } = setup(subscription(SubscriptionStatus.trial, -1), members, [
      "owner@example.test",
    ]);

    await service.syncUnscoped(COMPANY, NOW);

    const expected = { companyId: COMPANY, fromUserIds: ["a", "bb"], toUserId: "ccc" };
    expect(forms.reassignCreatorUnscoped).toHaveBeenCalledExactlyOnceWith(expected);
    expect(webhooks.reassignCreatorUnscoped).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it("hands nothing over when nobody is paused or on a paid plan", async () => {
    const small = setup(subscription(SubscriptionStatus.trial, -1), [member("a", { isAdmin: true })]);
    await small.service.syncUnscoped(COMPANY, NOW);
    const paid = setup(subscription(SubscriptionStatus.active, -30, SubscriptionPlan.starter), []);
    await paid.service.syncUnscoped(COMPANY, NOW);

    for (const run of [small, paid]) {
      expect(run.forms.reassignCreatorUnscoped).not.toHaveBeenCalled();
      expect(run.webhooks.reassignCreatorUnscoped).not.toHaveBeenCalled();
    }
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

  it("keeps the active rules within what the plan allows", async () => {
    const rules = (subscriptionOverride: ReturnType<typeof subscription>) => {
      const { fns, service } = setup(subscriptionOverride, []);
      return { fns, sync: () => service.syncUnscoped(COMPANY, NOW) };
    };
    const free = rules(subscription(SubscriptionStatus.expired, -30));
    await free.sync();
    expect(free.fns.syncRulesToPlanLimitCompanyWide).toHaveBeenCalledExactlyOnceWith(3);
    const starter = rules(subscription(SubscriptionStatus.active, -30, SubscriptionPlan.starter));
    await starter.sync();
    expect(starter.fns.syncRulesToPlanLimitCompanyWide).toHaveBeenCalledExactlyOnceWith(20);
    const pro = rules(subscription(SubscriptionStatus.active, -30, SubscriptionPlan.pro));
    await pro.sync();
    expect(pro.fns.syncRulesToPlanLimitCompanyWide).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("leaves the rules alone while a payment failed", async () => {
    const { fns, service } = setup(subscription(SubscriptionStatus.pastDue, -30), []);

    expect(await service.syncUnscoped(COMPANY, NOW)).toMatchObject({ rulesPaused: 0, rulesResumed: 0 });
    expect(fns.syncRulesToPlanLimitCompanyWide).not.toHaveBeenCalled();
  });

  it("changes nothing on self-hosted installs", async () => {
    const { repo, fns } = setup(subscription(SubscriptionStatus.trial, -1), [member("a"), member("bb")]);
    const service = new FreePlanPauseService(
      repo,
      { deleteInviteTokensUnscoped: vi.fn() },
      () => ({ pauseRoutinesForPlanCompanyWide: vi.fn(), resumeRoutinesForPlanCompanyWide: vi.fn() }),
      () => ({ syncRulesToPlanLimitCompanyWide: vi.fn() }),
      { invoke: vi.fn() },
      "self-hosted",
    );

    expect(await service.syncUnscoped(COMPANY, NOW)).toEqual({
      paused: 0,
      resumed: 0,
      routinesPaused: 0,
      routinesResumed: 0,
      rulesPaused: 0,
      rulesResumed: 0,
    });
    expect(fns.findPlanSubscriptionUnscoped).not.toHaveBeenCalled();
  });
});
