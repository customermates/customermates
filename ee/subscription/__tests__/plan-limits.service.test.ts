import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));

import type { PlanUsageRepo } from "../plan-usage.repo";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { EMPTY_PLAN_FIT_USAGE } from "@/core/commercial/plan-fit";

import { PlanLimitsService } from "../plan-limits.service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DAY_MS = 86_400_000;

function repo(overrides: Partial<Record<keyof PlanUsageRepo, unknown>> = {}, free = true): PlanUsageRepo {
  return {
    findPlanSubscriptionUnscoped: vi.fn().mockResolvedValue({
      status: free ? SubscriptionStatus.trial : SubscriptionStatus.active,
      plan: SubscriptionPlan.pro,
      trialEndDate: free ? new Date(Date.now() - DAY_MS) : null,
      currentPeriodEnd: null,
    }),
    countSeatsUnscoped: vi.fn().mockResolvedValue(1),
    countPlanPausedMembersUnscoped: vi.fn().mockResolvedValue(2),
    countRecordsUnscoped: vi.fn().mockResolvedValue(248),
    storageUsedBytesUnscoped: vi.fn().mockResolvedValue(1024),
    countApiRequestsOnDayUnscoped: vi.fn().mockResolvedValue(37),
    readFeatureUsageUnscoped: vi.fn().mockResolvedValue({ ...EMPTY_PLAN_FIT_USAGE, members: 3, openDrafts: 2 }),
    ...overrides,
  } as unknown as PlanUsageRepo;
}

describe("plan limits service", () => {
  it("keeps Free to one person and refuses the second, naming Starter and its price", async () => {
    const service = new PlanLimitsService(
      repo({ countSeatsUnscoped: vi.fn().mockResolvedValue(0) }),
      "cloud",
      () => COMPANY,
    );
    const full = new PlanLimitsService(repo(), "cloud", () => COMPANY);

    expect(await service.admitMembers(1)).toBeNull();
    expect(await full.admitMembers(1)).toEqual({ limit: 1, price: "€12" });
  });

  it("counts records once per write and refuses the 251st", async () => {
    const countRecords = vi.fn().mockResolvedValue(248);
    const service = new PlanLimitsService(repo({ countRecordsUnscoped: countRecords }), "cloud", () => COMPANY);

    expect(await service.admitRecords(1)).toBeNull();
    expect(await service.admitRecords(1)).toBeNull();
    expect(await service.admitRecords(1)).toMatchObject({ limit: 250 });
    expect(countRecords).toHaveBeenCalledOnce();
  });

  it("refuses webhooks on Free with the Starter price and stops their delivery", async () => {
    const service = new PlanLimitsService(repo(), "cloud", () => COMPANY);

    expect(await service.admitWebhooks()).toEqual({ price: "€12" });
    expect(await service.deliversWebhooks(COMPANY)).toBe(false);
  });

  it("applies no limit to paid plans, self-hosted installs or the demo", async () => {
    const paid = new PlanLimitsService(repo({}, false), "cloud", () => COMPANY);
    const selfHosted = new PlanLimitsService(repo(), "self-hosted", () => COMPANY);
    const demo = new PlanLimitsService(repo(), "demo", () => COMPANY);

    for (const service of [paid, selfHosted, demo]) {
      expect(await service.admitMembers(10)).toBeNull();
      expect(await service.admitRecords(5_000)).toBeNull();
      expect(await service.admitWebhooks()).toBeNull();
      expect(await service.deliversWebhooks(COMPANY)).toBe(true);
    }
  });

  it("reports the Free usage with paused people for the billing page and skips the counts on paid plans", async () => {
    const free = new PlanLimitsService(repo(), "cloud", () => COMPANY);
    const paidCountRecords = vi.fn();
    const paid = new PlanLimitsService(repo({ countRecordsUnscoped: paidCountRecords }, false), "cloud", () => COMPANY);

    expect(await free.snapshot()).toMatchObject({
      plan: "free",
      limits: {
        maxMembers: 1,
        maxRecords: 250,
        fileStorageBytes: 100 * 1024 ** 2,
        apiRequestsPerMinute: 30,
        apiRequestsPerDay: 200,
      },
      usage: { members: 1, pausedMembers: 2, records: 248, storageBytes: 1024, apiRequestsToday: 37 },
    });
    expect(await paid.snapshot()).toMatchObject({ plan: "pro", limits: null });
    expect(paidCountRecords).not.toHaveBeenCalled();
  });

  it("reads today's API calls from the current UTC day window for this workspace only", async () => {
    const countApiRequests = vi.fn().mockResolvedValue(37);
    const service = new PlanLimitsService(
      repo({ countApiRequestsOnDayUnscoped: countApiRequests }),
      "cloud",
      () => COMPANY,
    );

    await service.snapshot(COMPANY, new Date("2026-11-09T23:59:30.000Z"));

    expect(countApiRequests).toHaveBeenCalledWith(COMPANY, new Date("2026-11-09T00:00:00.000Z"));
  });

  it("shows no more API calls than the day allows, since the calls past the limit were refused", async () => {
    const service = new PlanLimitsService(
      repo({ countApiRequestsOnDayUnscoped: vi.fn().mockResolvedValue(340) }),
      "cloud",
      () => COMPANY,
    );

    expect((await service.snapshot()).usage.apiRequestsToday).toBe(200);
  });

  it("does not count API calls on a paid plan", async () => {
    const countApiRequests = vi.fn();
    const paid = new PlanLimitsService(
      repo({ countApiRequestsOnDayUnscoped: countApiRequests }, false),
      "cloud",
      () => COMPANY,
    );

    expect((await paid.snapshot()).usage.apiRequestsToday).toBe(0);
    expect(countApiRequests).not.toHaveBeenCalled();
  });

  it("reads what the workspace uses for the trial-end card and the picker in the cloud only", async () => {
    const cloud = new PlanLimitsService(repo({}, false), "cloud", () => COMPANY);
    const selfHosted = new PlanLimitsService(repo(), "self-hosted", () => COMPANY);

    expect(await cloud.fit()).toMatchObject({ members: 3, openDrafts: 2 });
    expect(await selfHosted.fit()).toEqual(EMPTY_PLAN_FIT_USAGE);
  });
});
