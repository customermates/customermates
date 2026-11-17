import type { EventLog } from "@/generated/prisma";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventAdmission } from "@/features/event/event-admission";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type { StoredAutomationRule } from "./automation-rule.repo";
import type { AutomationRuleRepo } from "./automation-rule.repo";

import { RecordEventPayloadSchema } from "@/features/records/record-event.schema";
import { mayTriggerAutomationRule } from "./automation-context";
import { describeAutomationEvent, triggerMatchesEvent } from "./automation-event";
import { eventOccurrenceKey } from "./automation-occurrence";
import { AutomationTriggerSchema } from "./automation-rule.schema";

type Occurrence = {
  typeId: string | null;
  recordId: string | null;
  occurrenceKey: string;
  chain: string[];
  routineDepth?: number;
};

export class AutomationRuleAdmission implements EventAdmission {
  constructor(
    private readonly rules: AutomationRuleRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
    private readonly reader: RecordRecipientReader,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async admit(event: EventLog): Promise<void> {
    if (event.subjectKind === "record") return this.admitRecordEvent(event);
    const descriptor = describeAutomationEvent(event);
    if (!descriptor) return;
    const rules = await this.rules.findEnabledRulesUnscoped({
      companyId: event.companyId,
      triggerKind: descriptor.triggerKind,
    });
    for (const rule of rules) {
      const trigger = AutomationTriggerSchema.safeParse(rule.trigger);
      if (!rule.ownerUserId || !trigger.success || !triggerMatchesEvent(trigger.data, descriptor)) continue;
      if (
        descriptor.connectedAccountId &&
        !(await this.rules.canUserAccessConnectedAccountUnscoped(
          event.companyId,
          rule.ownerUserId,
          descriptor.connectedAccountId,
        ))
      )
        continue;
      await this.start(event, rule, rule.ownerUserId, { ...descriptor, chain: [] });
    }
  }

  private async admitRecordEvent(event: EventLog): Promise<void> {
    const matches = await this.reader.findEventMatches(event, "rule");
    if (!matches.length) return;
    const { ref, cause } = RecordEventPayloadSchema.parse(event.payload);
    const chain = cause.ruleChain ?? [];
    const rules = await this.rules.findEnabledRulesUnscoped({
      companyId: event.companyId,
      ids: matches.map((match) => match.subscriptionId),
    });
    const byId = new Map(rules.map((rule) => [rule.id, rule]));
    for (const match of matches) {
      const rule = byId.get(match.subscriptionId);
      if (
        !rule?.ownerUserId ||
        rule.ownerUserId !== match.subscription.ownerUserId ||
        match.subscriptionRevision !== match.subscription.revision ||
        !mayTriggerAutomationRule(rule.id, chain)
      )
        continue;
      const envelope = await this.reader.readEvent({
        companyId: event.companyId,
        userId: rule.ownerUserId,
        eventId: event.id,
        subscriptionId: rule.id,
      });
      if (envelope) {
        await this.start(event, rule, rule.ownerUserId, {
          typeId: ref.typeId,
          recordId: ref.recordId,
          occurrenceKey: eventOccurrenceKey(event.id),
          chain,
          routineDepth: cause.routineDepth,
        });
      }
    }
  }

  private async start(
    event: EventLog,
    rule: StoredAutomationRule,
    ownerUserId: string,
    occurrence: Occurrence,
  ): Promise<void> {
    const runId = await this.rules.admitRunUnscoped({
      companyId: event.companyId,
      ruleId: rule.id,
      occurrenceKey: occurrence.occurrenceKey,
      triggerKind: rule.triggerKind,
      typeId: occurrence.typeId,
      recordId: occurrence.recordId,
      payload: {
        chain: occurrence.chain,
        eventId: event.id,
        event: event.kind,
        ...(occurrence.routineDepth === undefined ? {} : { routineDepth: occurrence.routineDepth }),
      },
      depth: occurrence.chain.length,
      scheduledFor: this.clock(),
    });
    if (runId)
      await this.background.dispatch("run-automation-rule", { runId, companyId: event.companyId, ownerUserId });
  }
}
