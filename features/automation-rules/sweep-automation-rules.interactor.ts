import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AutomationRuleRepo, StoredAutomationRule } from "./automation-rule.repo";
import type { DiscardAutomationRuleRunInteractor } from "./discard-automation-rule-run.interactor";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { dateReachedCandidateWindow } from "./automation-date";
import { dueDateOccurrences } from "./automation-occurrence";
import { AUTOMATION_DATE_LOOKBACK_DAYS, AutomationTriggerSchema } from "./automation-rule.schema";

const RULE_PAGE = 500;
const CANDIDATE_PAGE = 2000;
const STALE_BATCH_LIMIT = 100;
const STALE_QUEUED_MS = 2 * 60 * 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

@SystemInteractor
export class SweepAutomationRulesInteractor {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
    private readonly discard: Pick<DiscardAutomationRuleRunInteractor, "invoke">,
    private readonly pages = { rules: RULE_PAGE, candidates: CANDIDATE_PAGE },
  ) {}

  async invoke(now = new Date()): Promise<{ automationRulesAdmitted: number; automationRunsRedispatched: number }> {
    const admitted = await this.admitDateRules(now);
    const redispatched = await this.redispatchStale(now);
    return { automationRulesAdmitted: admitted, automationRunsRedispatched: redispatched };
  }

  private async admitDateRules(now: Date): Promise<number> {
    let admitted = 0;
    let afterId: string | undefined;
    for (;;) {
      const rules = await this.repo.findDateRulesUnscoped({ afterId, limit: this.pages.rules });
      for (const rule of rules) admitted += await this.admitDateRule(rule, now);
      if (rules.length < this.pages.rules) return admitted;
      afterId = rules.at(-1)?.id;
    }
  }

  private async admitDateRule(rule: StoredAutomationRule, now: Date): Promise<number> {
    const trigger = AutomationTriggerSchema.safeParse(rule.trigger);
    if (!rule.ownerUserId || !trigger.success || trigger.data.kind !== "dateReached") return 0;
    const dateTrigger = trigger.data;
    const window = dateReachedCandidateWindow(dateTrigger, now, AUTOMATION_DATE_LOOKBACK_DAYS);
    let admitted = 0;
    let afterRecordId: string | undefined;
    for (;;) {
      const candidates = await this.repo.findDateCandidatesCompanyWide({
        companyId: rule.companyId,
        typeId: dateTrigger.typeId,
        fieldId: dateTrigger.fieldId,
        from: window.from,
        to: window.to,
        afterRecordId,
        limit: this.pages.candidates,
      });
      const due = dueDateOccurrences(dateTrigger, candidates, now);
      const existing = await this.repo.findOccurrencesCompanyWide(
        rule.companyId,
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
          recordId: item.recordId,
          payload: { chain: [], fireAt: item.fireAt.toISOString(), fieldValue: item.fieldValue },
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
      if (candidates.length < this.pages.candidates) return admitted;
      afterRecordId = candidates.at(-1)?.recordId;
    }
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
