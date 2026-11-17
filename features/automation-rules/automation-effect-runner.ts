import type { RecordFieldAssignmentSchema, RecordModelView, RecordRef } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { z } from "zod";
import type { EventService } from "@/features/event/event.service";
import type {
  AutomationAgentJobInput,
  AutomationAgentPort,
  AutomationNotifyPort,
  AutomationRecipientAccess,
  AutomationRecipientAccessPort,
  AutomationRecordPort,
  AutomationRecordView,
} from "./automation-ports";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationEffect, AutomationEffectOutcome, AutomationTrigger } from "./automation-rule.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { localDay, shiftDay } from "./automation-date";
import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";
import { automationTimeZone } from "./automation-rule.schema";
import { renderAutomationAgentPrompt, renderAutomationTemplate } from "./automation-template";

type FieldAssignment = z.infer<typeof RecordFieldAssignmentSchema>;

const SET_FIELD_ATTEMPTS = 3;

export type AutomationEffectContext = {
  companyId: string;
  runId: string;
  rule: { id: string; name: string; ownerUserId: string; trigger: AutomationTrigger };
  recordRef: RecordRef | null;
  now: Date;
  admittedAt: Date;
};

export type AutomationEffectProgress = {
  done: readonly AutomationEffectOutcome[];
  save(outcomes: AutomationEffectOutcome[]): Promise<unknown>;
};

const NO_PROGRESS: AutomationEffectProgress = { done: [], save: () => Promise.resolve() };

const DAY_MS = 24 * 60 * 60 * 1000;

function settledOutcomes(
  effects: readonly AutomationEffect[],
  done: readonly AutomationEffectOutcome[],
): AutomationEffectOutcome[] {
  const settled: AutomationEffectOutcome[] = [];
  for (const [index, outcome] of done.entries()) {
    if (outcome.status === "failed" || effects[index]?.kind !== outcome.kind) break;
    settled.push(outcome);
  }
  return settled;
}

function recordHref(ref: RecordRef | null): string | null {
  return ref ? `/records/${ref.typeId}/${ref.recordId}` : null;
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
      value: {
        kind: "dateTime",
        value: new Date(context.admittedAt.getTime() + due.offsetDays * DAY_MS).toISOString(),
      },
    };
  }
  const day = shiftDay(localDay(context.admittedAt, automationTimeZone(context.rule.trigger)), due.offsetDays);
  return { fieldId: due.fieldId, value: { kind: "date", value: day } };
}

export class AutomationEffectRunner {
  constructor(
    private readonly records: AutomationRecordPort,
    private readonly notifications: AutomationNotifyPort,
    private readonly events: Pick<EventService, "publish">,
    private readonly webhooks: Pick<AutomationRuleRepo, "findOutboundWebhookUnscoped">,
    private readonly agents: AutomationAgentPort | null = null,
    private readonly recipientAccess: AutomationRecipientAccessPort | null = null,
  ) {}

  async run(
    effects: readonly AutomationEffect[],
    context: AutomationEffectContext,
    progress: AutomationEffectProgress = NO_PROGRESS,
  ): Promise<{ outcomes: AutomationEffectOutcome[]; failure: string | null }> {
    const outcomes = settledOutcomes(effects, progress.done);
    let failure: string | null = null;
    for (const [index, effect] of effects.entries()) {
      if (index < outcomes.length) continue;
      if (failure) {
        outcomes.push({ kind: effect.kind, status: "skipped", detail: "previousEffectFailed" });
        continue;
      }
      const settled = [...outcomes];
      const outcome = await this.apply(effect, index, context, (claimed) => progress.save([...settled, claimed])).catch(
        (): AutomationEffectOutcome => ({ kind: effect.kind, status: "failed", detail: "unexpectedError" }),
      );
      outcomes.push(outcome);
      if (outcome.status === "failed") failure = outcome.detail ?? "failed";
      await progress.save([...outcomes]);
    }
    return { outcomes, failure };
  }

  private apply(
    effect: AutomationEffect,
    index: number,
    context: AutomationEffectContext,
    claim: (outcome: AutomationEffectOutcome) => Promise<unknown>,
  ) {
    switch (effect.kind) {
      case "setField":
        return this.setField(effect, index, context);
      case "createRecord":
        return this.createRecord(effect, index, context);
      case "notify":
        return this.notify(effect, index, context);
      case "callWebhook":
        return this.callWebhook(effect, context, claim);
      case "agent":
        return this.agent(effect, index, context);
    }
  }

  private async agent(
    effect: Extract<AutomationEffect, { kind: "agent" }>,
    index: number,
    context: AutomationEffectContext,
  ): Promise<AutomationEffectOutcome> {
    if (!this.agents) return { kind: effect.kind, status: "failed", detail: "agentRuntimeUnavailable" };
    const record = context.recordRef ? await this.records.read(context.recordRef) : null;
    const { prompt, recordValues } = renderAutomationAgentPrompt(
      effect.prompt,
      { record: record ?? undefined, rule: context.rule },
      untrustedText,
    );
    const request: AutomationAgentJobInput = {
      companyId: context.companyId,
      runId: context.runId,
      idempotencyKey: `rule:${context.runId}:${index}`,
      ownerUserId: context.rule.ownerUserId,
      runtime: effect.runtime,
      prompt,
      promptUntrusted:
        recordValues > 0 || ["messageReceived", "formSubmitted", "webhookReceived"].includes(context.rule.trigger.kind),
      model: effect.model ?? null,
      runnerId: effect.runnerId ?? null,
      recordRef: context.recordRef,
    };
    const queued = await this.agents.enqueue(request);
    if (!queued.ok) return { kind: effect.kind, status: "failed", detail: queued.reason };
    return {
      kind: effect.kind,
      status: "applied",
      detail: queued.jobId,
      ...(context.recordRef ? { recordRef: context.recordRef } : {}),
    };
  }

  private async setField(
    effect: Extract<AutomationEffect, { kind: "setField" }>,
    index: number,
    context: AutomationEffectContext,
  ): Promise<AutomationEffectOutcome> {
    const kind = effect.kind;
    const recordRef = context.recordRef;
    if (!recordRef) return { kind, status: "skipped", detail: "recordMissing" };
    for (let attempt = 1; ; attempt += 1) {
      const record = await this.records.read(recordRef);
      if (!record) return { kind, status: "skipped", detail: "recordMissing" };
      const mutation: RecordMutation = {
        action: "update",
        ref: recordRef,
        expectedVersion: record.version,
        fields: effect.fields,
      };
      const result = await this.records.mutate({ idempotencyKey: `rule:${context.runId}:${index}`, mutation });
      if (result.ok || result.alreadyApplied) return { kind, status: "applied", recordRef };
      if (!result.versionChanged || attempt >= SET_FIELD_ATTEMPTS)
        return { kind, status: "failed", detail: result.message.slice(0, 300) };
    }
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
    if (!result.ok) {
      if (result.alreadyApplied) return { kind, status: "applied" };
      return { kind, status: "failed", detail: result.message.slice(0, 300) };
    }
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
    const groups = await this.recipientGroups([...recipients], context);
    let total = 0;
    for (const [access, userIds] of groups) {
      const named = access === "name" && record ? { name: record.name } : undefined;
      const template = { record: named, rule: { name: context.rule.name } };
      const title = renderAutomationTemplate(effect.title, template).trim().slice(0, 200);
      const { created } = await this.notifications.notify({
        companyId: context.companyId,
        recipients: userIds,
        kind: effect.notificationKind,
        title: title || context.rule.name.slice(0, 200),
        body: effect.body ? renderAutomationTemplate(effect.body, template).slice(0, 1000) : null,
        href: access === "none" ? null : recordHref(context.recordRef),
        sourceRuleId: context.rule.id,
        dedupeKey: `rule:${context.runId}:${index}`,
      });
      total += created;
    }
    return { kind, status: "applied", detail: String(total) };
  }

  private async recipientGroups(
    userIds: string[],
    context: AutomationEffectContext,
  ): Promise<Map<AutomationRecipientAccess, string[]>> {
    const ref = context.recordRef;
    if (!ref) return new Map<AutomationRecipientAccess, string[]>([["name", userIds]]);
    const others = userIds.filter((userId) => userId !== context.rule.ownerUserId);
    const known =
      others.length && this.recipientAccess
        ? await this.recipientAccess.recordAccess({ companyId: context.companyId, ref, userIds: others })
        : new Map<string, AutomationRecipientAccess>();
    const groups = new Map<AutomationRecipientAccess, string[]>();
    for (const userId of userIds) {
      const access = userId === context.rule.ownerUserId ? "name" : (known.get(userId) ?? "none");
      groups.set(access, [...(groups.get(access) ?? []), userId]);
    }
    return groups;
  }

  private async callWebhook(
    effect: Extract<AutomationEffect, { kind: "callWebhook" }>,
    context: AutomationEffectContext,
    claim: (outcome: AutomationEffectOutcome) => Promise<unknown>,
  ): Promise<AutomationEffectOutcome> {
    const kind = effect.kind;
    const webhook = await this.webhooks.findOutboundWebhookUnscoped(context.companyId, effect.webhookId);
    if (!webhook) return { kind, status: "skipped", detail: "webhook:missing" };
    if (!webhook.enabled) return { kind, status: "skipped", detail: "webhook:disabled" };
    if (!webhook.events.includes(DomainEvent.AUTOMATION_RULE_FIRED))
      return { kind, status: "skipped", detail: "webhook:notSubscribed" };
    await claim({ kind, status: "applied" });
    await this.events.publish(DomainEvent.AUTOMATION_RULE_FIRED, {
      entityId: context.rule.id,
      payload: {
        webhookId: webhook.id,
        ruleId: context.rule.id,
        ruleName: context.rule.name,
        runId: context.runId,
        trigger: context.rule.trigger.kind,
        firedAt: context.now.toISOString(),
        record: context.recordRef,
      },
    });
    return { kind, status: "applied" };
  }
}
