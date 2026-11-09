import type { AppMode } from "@/core/config/environment";
import type { PlanId, PlanUsageLimits } from "@/core/commercial/plan-catalog";
import type { PlanFitUsage } from "@/core/commercial/plan-fit";
import type { PlanUsageRepo } from "./plan-usage.repo";

import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";
import { EMPTY_PLAN_FIT_USAGE } from "@/core/commercial/plan-fit";
import { apiDayWindowStart } from "./api-rate-limit.service";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { effectivePlanId, getEntitlements } from "./entitlements";
import { upgradeOfferValues } from "./plan-upgrade-offer";

export type PlanUsage = {
  members: number;
  pausedMembers: number;
  records: number;
  storageBytes: number;
  apiRequestsToday: number;
};

export type PlanUsageSnapshot = {
  plan: PlanId | null;
  limits: PlanUsageLimits | null;
  usage: PlanUsage;
};

export type PlanLimitRefusal = { limit: number; price: string };

export type PlanFeatureRefusal = { price: string };

type ResolvedPlan = { plan: PlanId | null; limits: PlanUsageLimits | null; webhooks: boolean };

const EMPTY_USAGE: PlanUsage = { members: 0, pausedMembers: 0, records: 0, storageBytes: 0, apiRequestsToday: 0 };

const UNRESTRICTED: ResolvedPlan = { plan: null, limits: null, webhooks: true };

async function refusal(limit: number): Promise<PlanLimitRefusal> {
  return { limit, ...(await upgradeOfferValues(FREE_PLAN_UPGRADE_PLAN)) };
}

export class PlanLimitsService {
  private resolved = new Map<string, Promise<ResolvedPlan>>();
  private recordBudgets = new Map<string, Promise<{ used: number }>>();

  constructor(
    private readonly repo: PlanUsageRepo,
    private readonly appMode: AppMode,
    private readonly tenantCompanyId: () => string = () => getTenantUser().companyId,
  ) {}

  plan(companyId: string = this.tenantCompanyId()): Promise<ResolvedPlan> {
    let resolved = this.resolved.get(companyId);
    if (!resolved) {
      resolved = this.resolve(companyId);
      this.resolved.set(companyId, resolved);
    }
    return resolved;
  }

  async snapshot(companyId: string = this.tenantCompanyId(), now: Date = new Date()): Promise<PlanUsageSnapshot> {
    const { plan, limits } = await this.plan(companyId);
    if (!limits) return { plan, limits, usage: EMPTY_USAGE };
    const [members, pausedMembers, records, storageBytes, apiRequests] = await Promise.all([
      this.repo.countSeatsUnscoped(companyId),
      this.repo.countPlanPausedMembersUnscoped(companyId),
      this.repo.countRecordsUnscoped(companyId),
      this.repo.storageUsedBytesUnscoped(companyId),
      this.repo.countApiRequestsOnDayUnscoped(companyId, apiDayWindowStart(now)),
    ]);
    const apiRequestsToday = Math.min(apiRequests, limits.apiRequestsPerDay);
    return { plan, limits, usage: { members, pausedMembers, records, storageBytes, apiRequestsToday } };
  }

  async fit(companyId: string = this.tenantCompanyId()): Promise<PlanFitUsage> {
    if (this.appMode !== "cloud") return EMPTY_PLAN_FIT_USAGE;
    return this.repo.readFeatureUsageUnscoped(companyId);
  }

  async admitMembers(adding = 1, workspaceId?: string): Promise<PlanLimitRefusal | null> {
    if (this.appMode !== "cloud") return null;
    const companyId = workspaceId ?? this.tenantCompanyId();
    const { limits } = await this.plan(companyId);
    if (!limits) return null;
    const seats = await this.repo.countSeatsUnscoped(companyId);
    return seats + adding > limits.maxMembers ? refusal(limits.maxMembers) : null;
  }

  async admitRecords(adding = 1, workspaceId?: string): Promise<PlanLimitRefusal | null> {
    if (this.appMode !== "cloud") return null;
    const companyId = workspaceId ?? this.tenantCompanyId();
    const { limits } = await this.plan(companyId);
    if (!limits) return null;
    let budget = this.recordBudgets.get(companyId);
    if (!budget) {
      budget = this.repo.countRecordsUnscoped(companyId).then((used) => ({ used }));
      this.recordBudgets.set(companyId, budget);
    }
    const current = await budget;
    if (current.used + adding > limits.maxRecords) return refusal(limits.maxRecords);
    current.used += adding;
    return null;
  }

  async admitWebhooks(workspaceId?: string): Promise<PlanFeatureRefusal | null> {
    if (this.appMode !== "cloud") return null;
    const { webhooks } = await this.plan(workspaceId ?? this.tenantCompanyId());
    return webhooks ? null : upgradeOfferValues(FREE_PLAN_UPGRADE_PLAN);
  }

  async deliversWebhooks(companyId: string): Promise<boolean> {
    if (this.appMode !== "cloud") return true;
    return (await this.plan(companyId)).webhooks;
  }

  private async resolve(companyId: string): Promise<ResolvedPlan> {
    if (this.appMode !== "cloud") return UNRESTRICTED;
    const subscription = await this.repo.findPlanSubscriptionUnscoped(companyId);
    if (!subscription) return UNRESTRICTED;
    const plan = effectivePlanId(subscription);
    const { usageLimits, webhooks } = getEntitlements(plan);
    return { plan, limits: usageLimits, webhooks };
  }
}

export const UNLIMITED_PLAN_LIMITS: Pick<
  PlanLimitsService,
  "admitMembers" | "admitRecords" | "admitWebhooks" | "deliversWebhooks"
> = {
  admitMembers: () => Promise.resolve(null),
  admitRecords: () => Promise.resolve(null),
  admitWebhooks: () => Promise.resolve(null),
  deliversWebhooks: () => Promise.resolve(true),
};
