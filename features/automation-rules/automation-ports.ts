import type { CalculatedValue, RecordModelView, RecordRef } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { NotifyMembersInput } from "@/features/notifications/notification.schema";

export type AutomationRecordView = {
  ref: RecordRef;
  version: number;
  name: string;
  assignedUserIds: string[];
  values: Map<string, CalculatedValue>;
};

export type AutomationMutationResult = { ok: true; refs: RecordRef[] } | { ok: false; message: string };

export type AutomationRecordPort = {
  model(): Promise<RecordModelView>;
  read(ref: RecordRef): Promise<AutomationRecordView | null>;
  mutate(input: { idempotencyKey: string; mutation: RecordMutation }): Promise<AutomationMutationResult>;
};

export type AutomationPlanAllowance = { limit: number | null; price: string };

export type AutomationPlanLimits = {
  activeRuleAllowance(): Promise<AutomationPlanAllowance>;
};

export type AutomationNotifyPort = {
  notify(input: NotifyMembersInput): Promise<{ created: number }>;
};

export type AutomationWebhookResult = {
  sent: boolean;
  reason?: "missing" | "disabled" | "plan";
  statusCode?: number | null;
};

export type AutomationWebhookPort = {
  send(input: {
    companyId: string;
    webhookId: string;
    deliveryId: string;
    payload: Record<string, unknown>;
  }): Promise<AutomationWebhookResult>;
};
