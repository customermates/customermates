import type { AutomationRunStatus, AutomationTriggerKind, Prisma, Status } from "@/generated/prisma";
import type { RuleRecordTrigger } from "./automation-record-trigger";
import type { AutomationRunCursor } from "./automation-run-cursor";

export type StoredAutomationRule = {
  id: string;
  companyId: string;
  ownerUserId: string | null;
  name: string;
  enabled: boolean;
  triggerKind: AutomationTriggerKind;
  typeId: string | null;
  trigger: Prisma.JsonValue;
  conditions: Prisma.JsonValue;
  effects: Prisma.JsonValue;
  disabledReason: string | null;
  lastRunAt: Date | null;
  lastRunStatus: AutomationRunStatus | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; firstName: string; lastName: string; avatarUrl: string | null; status: Status } | null;
};

export type StoredAutomationRuleRun = {
  id: string;
  companyId: string;
  ruleId: string;
  occurrenceKey: string;
  status: AutomationRunStatus;
  triggerKind: AutomationTriggerKind;
  typeId: string | null;
  recordId: string | null;
  payload: Prisma.JsonValue;
  outcome: Prisma.JsonValue;
  error: string | null;
  depth: number;
  scheduledFor: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export type AutomationRuleWrite = {
  id?: string;
  name: string;
  enabled: boolean;
  ownerUserId: string;
  triggerKind: AutomationTriggerKind;
  typeId: string | null;
  trigger: Prisma.InputJsonValue;
  conditions: Prisma.InputJsonValue;
  effects: Prisma.InputJsonValue;
};

export type AutomationRunAdmission = {
  companyId: string;
  ruleId: string;
  occurrenceKey: string;
  triggerKind: AutomationTriggerKind;
  typeId: string | null;
  recordId: string | null;
  payload: Prisma.InputJsonValue | null;
  depth: number;
  scheduledFor: Date;
};

export type AutomationRunSettlement = {
  runId: string;
  companyId: string;
  ruleId: string;
  status: Extract<AutomationRunStatus, "applied" | "skipped" | "failed">;
  outcome: Prisma.InputJsonValue;
  error: string | null;
  now: Date;
};

export type StaleAutomationRuleRun = { id: string; companyId: string; createdAt: Date };

export type AutomationDateCandidate = { recordId: string; kind: "date" | "dateTime"; fieldValue: string };

export type AutomationOutboundWebhook = { id: string; enabled: boolean; events: string[] };

export abstract class AutomationRuleRepo {
  abstract findRules(args: {
    typeId?: string;
    ownerUserId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: StoredAutomationRule[]; total: number }>;
  abstract findRule(id: string): Promise<StoredAutomationRule | null>;
  abstract saveRule(data: AutomationRuleWrite, recordTrigger: RuleRecordTrigger | null): Promise<StoredAutomationRule>;
  abstract setEnabled(
    id: string,
    enabled: boolean,
    disabledReason: string | null,
  ): Promise<StoredAutomationRule | null>;
  abstract deleteRule(id: string): Promise<boolean>;
  abstract countActiveRules(excludeId?: string): Promise<number>;
  abstract findRuns(args: {
    ruleId: string;
    cursor: AutomationRunCursor | null;
    limit: number;
  }): Promise<StoredAutomationRuleRun[]>;
  abstract countRunsSince(ruleIds: string[], since: Date): Promise<Map<string, number>>;

  abstract findEnabledRulesUnscoped(args: {
    companyId: string;
    ids?: string[];
    triggerKind?: AutomationTriggerKind;
  }): Promise<StoredAutomationRule[]>;
  abstract getLabelsCompanyWide(companyId: string, ids: string[]): Promise<Array<{ id: string; name: string }>>;
  abstract admitRunUnscoped(admission: AutomationRunAdmission): Promise<string | null>;
  abstract findRunUnscoped(
    companyId: string,
    runId: string,
  ): Promise<{ run: StoredAutomationRuleRun; rule: StoredAutomationRule | null } | null>;
  abstract claimRunUnscoped(runId: string, companyId: string, now: Date, staleBefore: Date): Promise<boolean>;
  abstract settleRunUnscoped(settlement: AutomationRunSettlement): Promise<void>;
  abstract findStaleRunsUnscoped(
    queuedBefore: Date,
    runningBefore: Date,
    limits: { companies: number; perCompany: number },
  ): Promise<StaleAutomationRuleRun[]>;
  abstract findDateRulesUnscoped(args: { afterId?: string; limit: number }): Promise<StoredAutomationRule[]>;
  abstract findDateCandidatesCompanyWide(args: {
    companyId: string;
    typeId: string;
    fieldId: string;
    from: Date;
    to: Date;
    afterRecordId?: string;
    limit: number;
  }): Promise<AutomationDateCandidate[]>;
  abstract findOccurrencesCompanyWide(companyId: string, ruleId: string, keys: string[]): Promise<Set<string>>;
  abstract deleteRunsBeforeUnscoped(before: Date, limit: number): Promise<number>;
  abstract disableRuleUnscoped(companyId: string, ruleId: string, reason: string): Promise<void>;
  abstract disableOwnerRulesUnscoped(companyId: string, ownerUserId: string, reason: string): Promise<number>;
  abstract syncRulesToPlanLimitCompanyWide(limit: number | null): Promise<{ paused: number; resumed: number }>;
  abstract canUserAccessConnectedAccountUnscoped(
    companyId: string,
    userId: string,
    connectedAccountId: string,
  ): Promise<boolean>;
  abstract findOutboundWebhookUnscoped(companyId: string, webhookId: string): Promise<AutomationOutboundWebhook | null>;
}
