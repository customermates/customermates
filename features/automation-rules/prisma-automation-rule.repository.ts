import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma";
import type { PlanRulePauseRepo } from "@/ee/subscription/plan-rule-pause.repo";
import type { RecordEventSubscriptionRepo } from "@/features/records/record-event-subscription.repo";
import type { RuleRecordTrigger } from "./automation-record-trigger";
import type { AutomationRunCursor } from "./automation-run-cursor";
import type {
  AutomationDateCandidate,
  AutomationOutboundWebhook,
  AutomationRuleWrite,
  AutomationRunAdmission,
  AutomationRunSettlement,
  StoredAutomationRule,
  StoredAutomationRuleRun,
} from "./automation-rule.repo";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRuleLabelRepo } from "./automation-rule-label.repo";

import { AutomationRunStatus, Status } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { accessibleConnectedAccountWhere } from "@/ee/messaging/messaging-access";
import {
  AUTOMATION_DISABLED_REASON_OWNER_INACTIVE,
  AUTOMATION_DISABLED_REASON_PLAN_PAUSED,
} from "./automation-disabled-reason";

const RULE_SELECT = {
  id: true,
  companyId: true,
  ownerUserId: true,
  name: true,
  enabled: true,
  triggerKind: true,
  typeId: true,
  trigger: true,
  conditions: true,
  effects: true,
  disabledReason: true,
  lastRunAt: true,
  lastRunStatus: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, status: true } },
} as const;

const RUN_SELECT = {
  id: true,
  companyId: true,
  ruleId: true,
  occurrenceKey: true,
  status: true,
  triggerKind: true,
  typeId: true,
  recordId: true,
  payload: true,
  outcome: true,
  error: true,
  depth: true,
  scheduledFor: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
} as const;

function candidateWhere(
  companyId: string,
  args: { typeId: string; fieldId: string; from: Date; to: Date },
): Prisma.RecordValueWhereInput {
  return {
    companyId,
    typeId: args.typeId,
    fieldId: args.fieldId,
    state: "value",
    instantValue: { gte: args.from, lte: args.to },
    record: { deletedAt: null },
  };
}

function candidateOf(row: { recordId: string; lexicalValue: string | null; instantValue: Date | null }) {
  return { recordId: row.recordId, fieldValue: row.lexicalValue ?? row.instantValue?.toISOString() ?? "" };
}

export class PrismaAutomationRuleRepo
  extends TenantRepository
  implements AutomationRuleRepo, AutomationRuleLabelRepo, PlanRulePauseRepo
{
  constructor(
    private readonly subscriptions: RecordEventSubscriptionRepo,
    private readonly scopedCompanyId?: string,
  ) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  async findRules(args: { typeId?: string; ownerUserId?: string; page: number; pageSize: number }) {
    const where: Prisma.AutomationRuleWhereInput = {
      companyId: this.companyId,
      ...(args.typeId ? { typeId: args.typeId } : {}),
      ...(args.ownerUserId ? { ownerUserId: args.ownerUserId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.automationRule.findMany({
        where,
        select: RULE_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
      }),
      this.prisma.automationRule.count({ where }),
    ]);
    return { items, total };
  }

  findRule(id: string): Promise<StoredAutomationRule | null> {
    return this.prisma.automationRule.findFirst({ where: { id, companyId: this.companyId }, select: RULE_SELECT });
  }

  async saveRule(data: AutomationRuleWrite, recordTrigger: RuleRecordTrigger | null): Promise<StoredAutomationRule> {
    const { id, ...fields } = data;
    let saved: StoredAutomationRule | null;
    if (id) {
      await this.prisma.automationRule.updateMany({
        where: { id, companyId: this.companyId },
        data: { ...fields, disabledReason: fields.enabled ? null : undefined },
      });
      saved = await this.findRule(id);
    } else {
      saved = await this.prisma.automationRule.create({
        data: { ...fields, companyId: this.companyId },
        select: RULE_SELECT,
      });
    }
    if (!saved) throw new Error("Automation rule disappeared during an update");
    if (recordTrigger) {
      await this.subscriptions.save(
        {
          id: saved.id,
          kind: "rule",
          ownerUserId: data.ownerUserId,
          ...recordTrigger,
          sources: null,
          enabled: data.enabled,
        },
        id ? "update" : "create",
      );
    } else await this.subscriptions.remove(saved.id);
    return saved;
  }

  async setEnabled(id: string, enabled: boolean, disabledReason: string | null) {
    const result = await this.prisma.automationRule.updateMany({
      where: { id, companyId: this.companyId },
      data: { enabled, disabledReason: enabled ? null : disabledReason },
    });
    if (result.count !== 1) return null;
    if (enabled) await this.subscriptions.resume(id);
    else await this.subscriptions.pause(id);
    return this.findRule(id);
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await this.prisma.automationRule.deleteMany({ where: { id, companyId: this.companyId } });
    await this.subscriptions.remove(id);
    return result.count === 1;
  }

  countActiveRules(excludeId?: string): Promise<number> {
    return this.prisma.automationRule.count({
      where: { companyId: this.companyId, enabled: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  }

  findRuns(args: { ruleId: string; cursor: AutomationRunCursor | null; limit: number }) {
    const { cursor } = args;
    return this.prisma.automationRuleRun.findMany({
      where: {
        companyId: this.companyId,
        ruleId: args.ruleId,
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {}),
      },
      select: RUN_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: args.limit,
    });
  }

  async countRunsSince(ruleIds: string[], since: Date): Promise<Map<string, number>> {
    if (ruleIds.length === 0) return new Map();
    const rows = await this.prisma.automationRuleRun.groupBy({
      by: ["ruleId"],
      where: { companyId: this.companyId, ruleId: { in: ruleIds }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.ruleId, row._count._all]));
  }

  @BypassTenantGuard
  findEnabledRulesUnscoped(args: {
    companyId: string;
    ids?: string[];
    triggerKind?: StoredAutomationRule["triggerKind"];
  }): Promise<StoredAutomationRule[]> {
    return this.prisma.automationRule.findMany({
      where: {
        companyId: args.companyId,
        enabled: true,
        ...(args.ids ? { id: { in: args.ids } } : {}),
        ...(args.triggerKind ? { triggerKind: args.triggerKind } : {}),
      },
      select: RULE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  @BypassTenantGuard
  getLabelsCompanyWide(companyId: string, ids: string[]) {
    return this.prisma.automationRule.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, name: true },
    });
  }

  @BypassTenantGuard
  async admitRunUnscoped(admission: AutomationRunAdmission): Promise<string | null> {
    const id = randomUUID();
    const { payload, ...fields } = admission;
    const result = await this.prisma.automationRuleRun.createMany({
      data: [{ id, ...fields, ...(payload === null ? {} : { payload }) }],
      skipDuplicates: true,
    });
    return result.count === 1 ? id : null;
  }

  @BypassTenantGuard
  async findRunUnscoped(companyId: string, runId: string) {
    const run = await this.prisma.automationRuleRun.findFirst({
      where: { id: runId, companyId },
      select: RUN_SELECT,
    });
    if (!run) return null;
    const rule = await this.prisma.automationRule.findFirst({
      where: { id: run.ruleId, companyId },
      select: RULE_SELECT,
    });
    return { run: run satisfies StoredAutomationRuleRun, rule };
  }

  @BypassTenantGuard
  async claimRunUnscoped(runId: string, companyId: string, now: Date, staleBefore: Date): Promise<boolean> {
    const result = await this.prisma.automationRuleRun.updateMany({
      where: {
        id: runId,
        companyId,
        OR: [
          { status: AutomationRunStatus.queued },
          { status: AutomationRunStatus.running, startedAt: { lt: staleBefore } },
        ],
      },
      data: { status: AutomationRunStatus.running, startedAt: now },
    });
    return result.count === 1;
  }

  @BypassTenantGuard
  async settleRunUnscoped(settlement: AutomationRunSettlement): Promise<void> {
    await this.prisma.automationRuleRun.updateMany({
      where: { id: settlement.runId, companyId: settlement.companyId, status: AutomationRunStatus.running },
      data: {
        status: settlement.status,
        outcome: settlement.outcome,
        error: settlement.error,
        finishedAt: settlement.now,
      },
    });
    await this.prisma.automationRule.updateMany({
      where: { id: settlement.ruleId, companyId: settlement.companyId },
      data: { lastRunAt: settlement.now, lastRunStatus: settlement.status },
    });
  }

  @BypassTenantGuard
  async findStaleRunsUnscoped(queuedBefore: Date, runningBefore: Date, limit: number) {
    return this.prisma.automationRuleRun.findMany({
      where: {
        OR: [
          { status: AutomationRunStatus.queued, createdAt: { lt: queuedBefore } },
          { status: AutomationRunStatus.running, startedAt: { lt: runningBefore } },
        ],
      },
      select: { id: true, companyId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
  }

  @BypassTenantGuard
  findDateRulesUnscoped(args: { afterId?: string; limit: number }): Promise<StoredAutomationRule[]> {
    return this.prisma.automationRule.findMany({
      where: { enabled: true, triggerKind: "dateReached", ...(args.afterId ? { id: { gt: args.afterId } } : {}) },
      select: RULE_SELECT,
      orderBy: { id: "asc" },
      take: args.limit,
    });
  }

  @BypassTenantGuard
  async findDateCandidatesCompanyWide(args: {
    companyId: string;
    typeId: string;
    fieldId: string;
    from: Date;
    to: Date;
    afterRecordId?: string;
    limit: number;
  }): Promise<AutomationDateCandidate[]> {
    const rows = await this.prisma.recordValue.findMany({
      where: {
        ...candidateWhere(args.companyId, args),
        ...(args.afterRecordId ? { recordId: { gt: args.afterRecordId } } : {}),
      },
      select: { recordId: true, lexicalValue: true, instantValue: true },
      orderBy: { recordId: "asc" },
      take: args.limit,
    });
    return rows.map(candidateOf);
  }

  @BypassTenantGuard
  async findOccurrencesCompanyWide(companyId: string, ruleId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.automationRuleRun.findMany({
      where: { companyId, ruleId, occurrenceKey: { in: keys } },
      select: { occurrenceKey: true },
    });
    return new Set(rows.map((row) => row.occurrenceKey));
  }

  @BypassTenantGuard
  async deleteRunsBeforeUnscoped(before: Date, limit: number): Promise<number> {
    const expired = await this.prisma.automationRuleRun.findMany({
      where: {
        createdAt: { lt: before },
        status: { in: [AutomationRunStatus.applied, AutomationRunStatus.skipped, AutomationRunStatus.failed] },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    const { count } = await this.prisma.automationRuleRun.deleteMany({
      where: { id: { in: expired.map((run) => run.id) } },
    });
    return count;
  }

  @BypassTenantGuard
  async disableRuleUnscoped(companyId: string, ruleId: string, reason: string): Promise<void> {
    const pausedByPlan =
      reason === AUTOMATION_DISABLED_REASON_OWNER_INACTIVE &&
      (await this.prisma.automationRule.count({
        where: { id: ruleId, companyId, owner: { pausedByPlanAt: { not: null } } },
      })) > 0;
    await this.prisma.automationRule.updateMany({
      where: { id: ruleId, companyId, enabled: true },
      data: { enabled: false, disabledReason: pausedByPlan ? AUTOMATION_DISABLED_REASON_PLAN_PAUSED : reason },
    });
  }

  @BypassTenantGuard
  async disableOwnerRulesUnscoped(companyId: string, ownerUserId: string, reason: string): Promise<number> {
    const result = await this.prisma.automationRule.updateMany({
      where: { companyId, ownerUserId, enabled: true },
      data: { enabled: false, disabledReason: reason },
    });
    return result.count;
  }

  @BypassTenantGuard
  async syncRulesToPlanLimitCompanyWide(limit: number | null): Promise<{ paused: number; resumed: number }> {
    const companyId = this.companyId;
    return this.withCompanyTransaction(companyId, async () => {
      const oldestFirst = [{ createdAt: "asc" as const }, { id: "asc" as const }];
      const enabled = await this.prisma.automationRule.findMany({
        where: { companyId, enabled: true },
        select: { id: true, owner: { select: { status: true } } },
        orderBy: oldestFirst,
      });
      const kept = new Set(
        enabled
          .filter((rule) => rule.owner?.status === Status.active)
          .slice(0, limit ?? undefined)
          .map((rule) => rule.id),
      );
      const excess = limit === null ? [] : enabled.filter((rule) => !kept.has(rule.id)).map((rule) => rule.id);
      if (excess.length) {
        await this.prisma.automationRule.updateMany({
          where: { companyId, id: { in: excess } },
          data: { enabled: false, disabledReason: AUTOMATION_DISABLED_REASON_PLAN_PAUSED },
        });
        for (const id of excess) await this.subscriptions.pause(id);
      }
      const room = limit === null ? undefined : Math.max(0, limit - kept.size);
      const resumable =
        room === 0
          ? []
          : await this.prisma.automationRule.findMany({
              where: {
                companyId,
                enabled: false,
                disabledReason: AUTOMATION_DISABLED_REASON_PLAN_PAUSED,
                owner: { status: Status.active },
              },
              select: { id: true },
              orderBy: oldestFirst,
              take: room,
            });
      const resumedIds = resumable.map((rule) => rule.id);
      if (resumedIds.length) {
        await this.prisma.automationRule.updateMany({
          where: { companyId, id: { in: resumedIds } },
          data: { enabled: true, disabledReason: null },
        });
        for (const id of resumedIds) await this.subscriptions.resume(id);
      }
      return { paused: excess.length, resumed: resumedIds.length };
    });
  }

  @BypassTenantGuard
  async canUserAccessConnectedAccountUnscoped(
    companyId: string,
    userId: string,
    connectedAccountId: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.connectedAccount.count({
        where: { id: connectedAccountId, ...accessibleConnectedAccountWhere(companyId, userId) },
      })) > 0
    );
  }

  @BypassTenantGuard
  async findOutboundWebhookUnscoped(companyId: string, webhookId: string): Promise<AutomationOutboundWebhook | null> {
    return this.prisma.webhook.findFirst({
      where: { id: webhookId, companyId },
      select: { id: true, enabled: true, events: true },
    });
  }
}
