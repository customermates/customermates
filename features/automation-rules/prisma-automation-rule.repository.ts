import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma";
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

import { AutomationRunStatus } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { accessibleConnectedAccountWhere } from "@/ee/messaging/messaging-access";

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

export class PrismaAutomationRuleRepo extends TenantRepository implements AutomationRuleRepo {
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

  async saveRule(data: AutomationRuleWrite): Promise<StoredAutomationRule> {
    const { id, ...fields } = data;
    if (id) {
      await this.prisma.automationRule.updateMany({
        where: { id, companyId: this.companyId },
        data: { ...fields, disabledReason: fields.enabled ? null : undefined },
      });
      const updated = await this.findRule(id);
      if (!updated) throw new Error("Automation rule disappeared during an update");
      return updated;
    }
    return this.prisma.automationRule.create({
      data: { ...fields, companyId: this.companyId },
      select: RULE_SELECT,
    });
  }

  async setEnabled(id: string, enabled: boolean, disabledReason: string | null) {
    const result = await this.prisma.automationRule.updateMany({
      where: { id, companyId: this.companyId },
      data: { enabled, disabledReason: enabled ? null : disabledReason },
    });
    return result.count === 1 ? this.findRule(id) : null;
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await this.prisma.automationRule.deleteMany({ where: { id, companyId: this.companyId } });
    return result.count === 1;
  }

  countActiveRules(excludeId?: string): Promise<number> {
    return this.prisma.automationRule.count({
      where: { companyId: this.companyId, enabled: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  }

  async findRuns(args: { ruleId: string; page: number; pageSize: number }) {
    const where = { companyId: this.companyId, ruleId: args.ruleId };
    const [items, total] = await Promise.all([
      this.prisma.automationRuleRun.findMany({
        where,
        select: RUN_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
      }),
      this.prisma.automationRuleRun.count({ where }),
    ]);
    return { items, total };
  }

  async findOccurrences(ruleId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.automationRuleRun.findMany({
      where: { companyId: this.companyId, ruleId, occurrenceKey: { in: keys } },
      select: { occurrenceKey: true },
    });
    return new Set(rows.map((row) => row.occurrenceKey));
  }

  async findDateCandidates(args: { typeId: string; fieldId: string; from: Date; to: Date; limit: number }) {
    const where = candidateWhere(this.companyId, args);
    const [rows, total] = await Promise.all([
      this.prisma.recordValue.findMany({
        where,
        select: { recordId: true, lexicalValue: true, instantValue: true },
        orderBy: [{ instantValue: "asc" }, { recordId: "asc" }],
        take: args.limit,
      }),
      this.prisma.recordValue.count({ where }),
    ]);
    return { items: rows.map(candidateOf), total };
  }

  @BypassTenantGuard
  findEventRulesUnscoped(args: {
    companyId: string;
    triggerKinds: StoredAutomationRule["triggerKind"][];
    typeId: string | null;
    includeUntyped: boolean;
  }): Promise<StoredAutomationRule[]> {
    const typed = args.typeId ? [{ typeId: args.typeId }] : [];
    const untyped = args.includeUntyped ? [{ typeId: null }] : [];
    if (typed.length + untyped.length === 0) return Promise.resolve([]);
    return this.prisma.automationRule.findMany({
      where: {
        companyId: args.companyId,
        enabled: true,
        triggerKind: { in: args.triggerKinds },
        OR: [...typed, ...untyped],
      },
      select: RULE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
  findDateRulesUnscoped(limit: number): Promise<StoredAutomationRule[]> {
    return this.prisma.automationRule.findMany({
      where: { enabled: true, triggerKind: "dateReached" },
      select: RULE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
  }

  @BypassTenantGuard
  async findDateCandidatesUnscoped(args: {
    companyId: string;
    typeId: string;
    fieldId: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<AutomationDateCandidate[]> {
    const rows = await this.prisma.recordValue.findMany({
      where: candidateWhere(args.companyId, args),
      select: { recordId: true, lexicalValue: true, instantValue: true },
      orderBy: [{ instantValue: "asc" }, { recordId: "asc" }],
      take: args.limit,
    });
    return rows.map(candidateOf);
  }

  @BypassTenantGuard
  async findOccurrencesUnscoped(ruleId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.prisma.automationRuleRun.findMany({
      where: { ruleId, occurrenceKey: { in: keys } },
      select: { occurrenceKey: true },
    });
    return new Set(rows.map((row) => row.occurrenceKey));
  }

  @BypassTenantGuard
  async disableRuleUnscoped(companyId: string, ruleId: string, reason: string): Promise<void> {
    await this.prisma.automationRule.updateMany({
      where: { id: ruleId, companyId },
      data: { enabled: false, disabledReason: reason },
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
      select: { id: true, url: true, secret: true, headers: true, bodyTemplate: true, enabled: true },
    });
  }
}
