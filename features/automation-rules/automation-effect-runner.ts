import type { RecordFieldAssignmentSchema, RecordModelView, RecordRef } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { z } from "zod";
import type {
  AutomationNotifyPort,
  AutomationRecordPort,
  AutomationRecordView,
  AutomationWebhookPort,
} from "./automation-ports";
import type { AutomationEffect, AutomationEffectOutcome, AutomationTrigger } from "./automation-rule.schema";

import { localDay, shiftDay } from "./automation-date";
import { renderAutomationTemplate } from "./automation-template";

type FieldAssignment = z.infer<typeof RecordFieldAssignmentSchema>;

export type AutomationEffectContext = {
  companyId: string;
  runId: string;
  rule: { id: string; name: string; ownerUserId: string; trigger: AutomationTrigger };
  recordRef: RecordRef | null;
  now: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function recordHref(ref: RecordRef | null): string | null {
  return ref ? `/records/${ref.typeId}/${ref.recordId}` : null;
}

function triggerTimeZone(trigger: AutomationTrigger): string {
  return trigger.kind === "dateReached" ? trigger.timezone : "UTC";
}

function dueAssignment(
  model: RecordModelView,
  typeId: string,
  due: { fieldId: string; offsetDays: number },
  context: AutomationEffectContext,
): FieldAssignment | null {
  const field = model.fields.find((item) => item.id === due.fieldId && item.typeId === typeId);
  if (!field) return null;
  if (field.valueType === "dateTime") {
    return {
      fieldId: due.fieldId,
      value: { kind: "dateTime", value: new Date(context.now.getTime() + due.offsetDays * DAY_MS).toISOString() },
    };
  }
  const day = shiftDay(localDay(context.now, triggerTimeZone(context.rule.trigger)), due.offsetDays);
  return { fieldId: due.fieldId, value: { kind: "date", value: day } };
}

export class AutomationEffectRunner {
  constructor(
    private readonly records: AutomationRecordPort,
    private readonly notifications: AutomationNotifyPort,
    private readonly webhooks: AutomationWebhookPort,
  ) {}

  async run(
    effects: readonly AutomationEffect[],
    context: AutomationEffectContext,
  ): Promise<{ outcomes: AutomationEffectOutcome[]; failure: string | null }> {
    const outcomes: AutomationEffectOutcome[] = [];
    let failure: string | null = null;
    for (const [index, effect] of effects.entries()) {
      if (failure) {
        outcomes.push({ kind: effect.kind, status: "skipped", detail: "previousEffectFailed" });
        continue;
      }
      const outcome = await this.apply(effect, index, context).catch(
        (): AutomationEffectOutcome => ({ kind: effect.kind, status: "failed", detail: "unexpectedError" }),
      );
      outcomes.push(outcome);
      if (outcome.status === "failed") failure = outcome.detail ?? "failed";
    }
    return { outcomes, failure };
  }

  private apply(effect: AutomationEffect, index: number, context: AutomationEffectContext) {
    switch (effect.kind) {
      case "setField":
        return this.setField(effect, index, context);
      case "createRecord":
        return this.createRecord(effect, index, context);
      case "notify":
        return this.notify(effect, index, context);
      case "callWebhook":
        return this.callWebhook(effect, context);
    }
  }

  private async setField(
    effect: Extract<AutomationEffect, { kind: "setField" }>,
    index: number,
    context: AutomationEffectContext,
  ): Promise<AutomationEffectOutcome> {
    const kind = effect.kind;
    const record = context.recordRef ? await this.records.read(context.recordRef) : null;
    if (!record || !context.recordRef) return { kind, status: "skipped", detail: "recordMissing" };
    const mutation: RecordMutation = {
      action: "update",
      ref: context.recordRef,
      expectedVersion: record.version,
      fields: effect.fields,
    };
    const result = await this.records.mutate({ idempotencyKey: `rule:${context.runId}:${index}`, mutation });
    if (!result.ok) return { kind, status: "failed", detail: result.message.slice(0, 300) };
    return { kind, status: "applied", recordRef: context.recordRef };
  }

  private async createRecord(
    effect: Extract<AutomationEffect, { kind: "createRecord" }>,
    index: number,
    context: AutomationEffectContext,
  ): Promise<AutomationEffectOutcome> {
    const kind = effect.kind;
    const trigger = context.recordRef ? await this.records.read(context.recordRef) : null;
    if (effect.link && !trigger) return { kind, status: "skipped", detail: "recordMissing" };
    const model = await this.records.model();
    const template = { record: trigger ? { name: trigger.name } : undefined, rule: { name: context.rule.name } };
    const fields: FieldAssignment[] = [...effect.fields];
    if (effect.title) {
      fields.push({
        fieldId: effect.title.fieldId,
        value: { kind: "text", value: renderAutomationTemplate(effect.title.text, template).slice(0, 200) },
      });
    }
    if (effect.due) {
      const assignment = dueAssignment(model, effect.typeId, effect.due, context);
      if (assignment) fields.push(assignment);
    }
    const assignedUserIds = [
      ...new Set([...effect.assignedUserIds, ...(effect.assignToRuleOwner ? [context.rule.ownerUserId] : [])]),
    ];
    const mutation: RecordMutation = {
      action: "create",
      typeId: effect.typeId,
      fields,
      ...(assignedUserIds.length ? { assignedUserIds } : {}),
      ...(effect.link && context.recordRef
        ? {
            links: [
              { relationId: effect.link.relationId, direction: effect.link.direction, record: context.recordRef },
            ],
          }
        : {}),
    };
    const result = await this.records.mutate({ idempotencyKey: `rule:${context.runId}:${index}`, mutation });
    if (!result.ok) return { kind, status: "failed", detail: result.message.slice(0, 300) };
    return { kind, status: "applied", ...(result.refs[0] ? { recordRef: result.refs[0] } : {}) };
  }

  private async notify(
    effect: Extract<AutomationEffect, { kind: "notify" }>,
    index: number,
    context: AutomationEffectContext,
  ): Promise<AutomationEffectOutcome> {
    const kind = effect.kind;
    let record: AutomationRecordView | null = null;
    if (
      context.recordRef &&
      (effect.recipients.assignees || /\{\{\s*record\./.test(`${effect.title}${effect.body ?? ""}`))
    )
      record = await this.records.read(context.recordRef);
    const recipients = new Set<string>(effect.recipients.userIds);
    if (effect.recipients.ruleOwner) recipients.add(context.rule.ownerUserId);
    if (effect.recipients.assignees) for (const userId of record?.assignedUserIds ?? []) recipients.add(userId);
    if (recipients.size === 0) return { kind, status: "skipped", detail: "noRecipients" };
    const template = { record: record ? { name: record.name } : undefined, rule: { name: context.rule.name } };
    const { created } = await this.notifications.notify({
      companyId: context.companyId,
      recipients: [...recipients],
      kind: effect.notificationKind,
      title: renderAutomationTemplate(effect.title, template).slice(0, 200),
      body: effect.body ? renderAutomationTemplate(effect.body, template).slice(0, 1000) : null,
      href: recordHref(context.recordRef),
      sourceRuleId: context.rule.id,
      dedupeKey: `rule:${context.runId}:${index}`,
    });
    return { kind, status: "applied", detail: String(created) };
  }

  private async callWebhook(
    effect: Extract<AutomationEffect, { kind: "callWebhook" }>,
    context: AutomationEffectContext,
  ): Promise<AutomationEffectOutcome> {
    const kind = effect.kind;
    const result = await this.webhooks.send({
      companyId: context.companyId,
      webhookId: effect.webhookId,
      deliveryId: `rule-${context.runId}`,
      payload: {
        event: "automation.rule.fired",
        ruleId: context.rule.id,
        ruleName: context.rule.name,
        runId: context.runId,
        trigger: context.rule.trigger.kind,
        firedAt: context.now.toISOString(),
        record: context.recordRef,
      },
    });
    if (result.sent) return { kind, status: "applied", detail: String(result.statusCode ?? "") };
    if (result.reason) return { kind, status: "skipped", detail: `webhook:${result.reason}` };
    return { kind, status: "failed", detail: `webhookStatus:${result.statusCode ?? "none"}` };
  }
}
