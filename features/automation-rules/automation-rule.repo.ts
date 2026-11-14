import type { AutomationRunStatus, AutomationTriggerKind, Prisma, Status } from "@/generated/prisma";

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

export type AutomationDateCandidate = { recordId: string; fieldValue: string };

export type AutomationOutboundWebhook = {
  id: string;
  url: string;
  secret: string | null;
  headers: Prisma.JsonValue;
  bodyTemplate: string | null;
  enabled: boolean;
};

export abstract class AutomationRuleRepo {
  abstract findRules(args: {
    typeId?: string;
    ownerUserId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: StoredAutomationRule[]; total: number }>;
  abstract findRule(id: string): Promise<StoredAutomationRule | null>;
  abstract saveRule(data: AutomationRuleWrite): Promise<StoredAutomationRule>;
  abstract setEnabled(
    id: string,
    enabled: boolean,
    disabledReason: string | null,
  ): Promise<StoredAutomationRule | null>;
  abstract deleteRule(id: string): Promise<boolean>;
  abstract countActiveRules(excludeId?: string): Promise<number>;
  abstract findRuns(args: {
    ruleId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: StoredAutomationRuleRun[]; total: number }>;
  abstract findOccurrences(ruleId: string, keys: string[]): Promise<Set<string>>;
  abstract findDateCandidates(args: {
    typeId: string;
    fieldId: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<{ items: AutomationDateCandidate[]; total: number }>;

  abstract findEventRulesUnscoped(args: {
    companyId: string;
    triggerKinds: AutomationTriggerKind[];
    typeId: string | null;
    includeUntyped: boolean;
  }): Promise<StoredAutomationRule[]>;
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
    limit: number,
  ): Promise<{ id: string; companyId: string }[]>;
  abstract findDateRulesUnscoped(limit: number): Promise<StoredAutomationRule[]>;
  abstract findDateCandidatesUnscoped(args: {
    companyId: string;
    typeId: string;
    fieldId: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<AutomationDateCandidate[]>;
  abstract findOccurrencesUnscoped(ruleId: string, keys: string[]): Promise<Set<string>>;
  abstract disableRuleUnscoped(companyId: string, ruleId: string, reason: string): Promise<void>;
  abstract disableOwnerRulesUnscoped(companyId: string, ownerUserId: string, reason: string): Promise<number>;
  abstract canUserAccessConnectedAccountUnscoped(
    companyId: string,
    userId: string,
    connectedAccountId: string,
  ): Promise<boolean>;
  abstract findOutboundWebhookUnscoped(companyId: string, webhookId: string): Promise<AutomationOutboundWebhook | null>;
}
