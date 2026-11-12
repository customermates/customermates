import type { EventLog } from "@/generated/prisma";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventAdmission } from "@/features/event/event-admission";
import type { AutomationRuleRepo } from "./automation-rule.repo";

import { describeAutomationEvent, triggerMatchesEvent } from "./automation-event";
import { mayTriggerAutomationRule } from "./automation-context";
import { AutomationTriggerSchema } from "./automation-rule.schema";

export class AutomationRuleAdmission implements EventAdmission {
  constructor(
    private readonly rules: AutomationRuleRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async admit(event: EventLog): Promise<void> {
    const descriptor = describeAutomationEvent(event);
    if (!descriptor) return;
    const rules = await this.rules.findEventRulesUnscoped({
      companyId: event.companyId,
      triggerKinds: descriptor.triggerKinds,
      typeId: descriptor.typeId,
      includeUntyped: descriptor.includeUntyped,
    });
    for (const rule of rules) {
      if (!rule.ownerUserId || !mayTriggerAutomationRule(rule.id, descriptor.chain)) continue;
      const trigger = AutomationTriggerSchema.safeParse(rule.trigger);
      if (!trigger.success || !triggerMatchesEvent(trigger.data, descriptor)) continue;
      if (
        descriptor.connectedAccountId &&
        !(await this.rules.canUserAccessConnectedAccountUnscoped(
          event.companyId,
          rule.ownerUserId,
          descriptor.connectedAccountId,
        ))
      )
        continue;
      const runId = await this.rules.admitRunUnscoped({
        companyId: event.companyId,
        ruleId: rule.id,
        occurrenceKey: descriptor.occurrenceKey,
        triggerKind: rule.triggerKind,
        typeId: descriptor.typeId,
        recordId: descriptor.recordId,
        payload: { chain: descriptor.chain, eventId: event.id, event: event.kind },
        depth: descriptor.chain.length,
        scheduledFor: this.clock(),
      });
      if (runId) {
        await this.background.dispatch("run-automation-rule", {
          runId,
          companyId: event.companyId,
          ownerUserId: rule.ownerUserId,
        });
      }
    }
  }
}
