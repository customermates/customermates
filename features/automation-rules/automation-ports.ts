import type { CalculatedValue, RecordModelView, RecordRef } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { NotifyMembersInput } from "@/features/notifications/notification.schema";
import type { AutomationDateCandidate } from "./automation-rule.repo";
import type { AgentRuntimeKind } from "./automation-rule.schema";

export type AutomationRecordView = {
  ref: RecordRef;
  version: number;
  name: string;
  assignedUserIds: string[];
  values: Map<string, CalculatedValue>;
};

export type AutomationMutationResult =
  | { ok: true; refs: RecordRef[] }
  | { ok: false; message: string; versionChanged?: boolean; alreadyApplied?: boolean };

export type AutomationRecordPort = {
  model(): Promise<RecordModelView>;
  read(ref: RecordRef): Promise<AutomationRecordView | null>;
  mutate(input: { idempotencyKey: string; mutation: RecordMutation }): Promise<AutomationMutationResult>;
};

export type AutomationDateCandidateQuery = {
  companyId: string;
  userId: string;
  typeId: string;
  fieldId: string;
  from: Date;
  to: Date;
  afterRecordId?: string;
  limit: number;
};

export type AutomationDateCandidateReader = {
  readable(query: AutomationDateCandidateQuery): Promise<AutomationDateCandidate[]>;
};

export type AutomationRecipientAccess = "name" | "record" | "none";

export type AutomationRecipientAccessPort = {
  recordAccess(input: {
    companyId: string;
    ref: RecordRef;
    userIds: readonly string[];
  }): Promise<Map<string, AutomationRecipientAccess>>;
};

export type AutomationPlanAllowance = { limit: number | null; price: string };

export type AutomationPlanLimits = {
  activeRuleAllowance(): Promise<AutomationPlanAllowance>;
};

export type AutomationNotifyPort = {
  notify(input: NotifyMembersInput): Promise<{ created: number }>;
};

export type AutomationAgentJobInput = {
  companyId: string;
  runId: string;
  idempotencyKey: string;
  ownerUserId: string;
  runtime: AgentRuntimeKind;
  prompt: string;
  promptUntrusted: boolean;
  model: string | null;
  runnerId: string | null;
  recordRef: RecordRef | null;
};

export type AutomationAgentPort = {
  enqueue(input: AutomationAgentJobInput): Promise<{ ok: true; jobId: string } | { ok: false; reason: string }>;
};

export type AutomationAgentJobQueue = {
  cancelQueuedForRuleUnscoped(args: { companyId: string; ruleId: string; now: Date }): Promise<number>;
};
