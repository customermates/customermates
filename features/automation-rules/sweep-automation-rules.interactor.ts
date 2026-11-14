import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { DiscardAutomationRuleRunInteractor } from "./discard-automation-rule-run.interactor";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { dateReachedCandidateWindow, dateReachedFireAt, isDateReachedDue } from "./automation-date";
import { dateOccurrenceKey } from "./automation-occurrence";
import { AUTOMATION_DATE_LOOKBACK_DAYS, AutomationTriggerSchema } from "./automation-rule.schema";

const RULE_BATCH_LIMIT = 500;
const CANDIDATE_LIMIT = 2000;
const STALE_BATCH_LIMIT = 100;
const STALE_QUEUED_MS = 2 * 60 * 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

@SystemInteractor
export class SweepAutomationRulesInteractor {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
    private readonly discard: Pick<DiscardAutomationRuleRunInteractor, "invoke">,
  ) {}

  async invoke(now = new Date()): Promise<{ automationRulesAdmitted: number; automationRunsRedispatched: number }> {
    const admitted = await this.admitDateRules(now);
    const redispatched = await this.redispatchStale(now);
    return { automationRulesAdmitted: admitted, automationRunsRedispatched: redispatched };
  }

  private async admitDateRules(now: Date): Promise<number> {
    let admitted = 0;
    for (const rule of await this.repo.findDateRulesUnscoped(RULE_BATCH_LIMIT)) {
      const trigger = AutomationTriggerSchema.safeParse(rule.trigger);
      if (!rule.ownerUserId || !trigger.success || trigger.data.kind !== "dateReached") continue;
      const dateTrigger = trigger.data;
      const window = dateReachedCandidateWindow(dateTrigger, now, AUTOMATION_DATE_LOOKBACK_DAYS);
      const candidates = await this.repo.findDateCandidatesUnscoped({
        companyId: rule.companyId,
        typeId: dateTrigger.typeId,
        fieldId: dateTrigger.fieldId,
        from: window.from,
        to: window.to,
        limit: CANDIDATE_LIMIT,
      });
      const due = candidates.flatMap((candidate) => {
        const fireAt = dateReachedFireAt(dateTrigger, {
          kind: DAY_ONLY.test(candidate.fieldValue) ? "date" : "dateTime",
          value: candidate.fieldValue,
        });
        if (!fireAt || !isDateReachedDue(fireAt, now, AUTOMATION_DATE_LOOKBACK_DAYS)) return [];
        return [{ candidate, fireAt, key: dateOccurrenceKey(dateTrigger, candidate.recordId, candidate.fieldValue) }];
      });
      const existing = await this.repo.findOccurrencesUnscoped(
        rule.id,
        due.map((item) => item.key),
      );
      for (const item of due) {
        if (existing.has(item.key)) continue;
        const runId = await this.repo.admitRunUnscoped({
          companyId: rule.companyId,
          ruleId: rule.id,
          occurrenceKey: item.key,
          triggerKind: rule.triggerKind,
          typeId: dateTrigger.typeId,
          recordId: item.candidate.recordId,
          payload: { chain: [], fireAt: item.fireAt.toISOString(), fieldValue: item.candidate.fieldValue },
          depth: 0,
          scheduledFor: item.fireAt,
        });
        if (!runId) continue;
        admitted += 1;
        await this.background.dispatch("run-automation-rule", {
          runId,
          companyId: rule.companyId,
          ownerUserId: rule.ownerUserId,
        });
      }
    }
    return admitted;
  }

  private async redispatchStale(now: Date): Promise<number> {
    const stale = await this.repo.findStaleRunsUnscoped(
      new Date(now.getTime() - STALE_QUEUED_MS),
      new Date(now.getTime() - STALE_RUNNING_MS),
      STALE_BATCH_LIMIT,
    );
    let redispatched = 0;
    for (const run of stale) {
      const found = await this.repo.findRunUnscoped(run.companyId, run.id);
      const ownerUserId = found?.rule?.ownerUserId;
      if (!ownerUserId) {
        await this.discard.invoke({ runId: run.id, companyId: run.companyId, reason: "ownerMissing" });
        continue;
      }
      redispatched += 1;
      await this.background.dispatch("run-automation-rule", { runId: run.id, companyId: run.companyId, ownerUserId });
    }
    return redispatched;
  }
}
