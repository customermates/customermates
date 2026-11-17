import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { AutomationRuleRepo, StaleAutomationRuleRun, StoredAutomationRule } from "./automation-rule.repo";
import type { DiscardAutomationRuleRunInteractor } from "./discard-automation-rule-run.interactor";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { captureException } from "@/core/observability/server";

import { dateReachedCandidateWindow } from "./automation-date";
import { dueDateOccurrences } from "./automation-occurrence";
import { AUTOMATION_DATE_LOOKBACK_DAYS, AutomationTriggerSchema } from "./automation-rule.schema";
import { AUTOMATION_RUN_STALE_MS } from "./run-automation-rule.interactor";

const RULE_PAGE = 500;
const CANDIDATE_PAGE = 2000;
const STALE_COMPANY_LIMIT = 50;
const STALE_RUNS_PER_COMPANY = 20;
const STALE_QUEUED_MS = 2 * 60 * 1000;

export const AUTOMATION_RUN_GIVE_UP_MS = 30 * 60 * 1000;
export const AUTOMATION_RUN_ABANDONED_ERROR = "runAbandoned";

type SweepFailure = { companyId: string; ruleId?: string; runId?: string };

type SweepResult = {
  automationRulesAdmitted: number;
  automationRunsRedispatched: number;
  automationRunsAbandoned: number;
};

@SystemInteractor
export class SweepAutomationRulesInteractor {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
    private readonly discard: Pick<DiscardAutomationRuleRunInteractor, "invoke">,
    private readonly pages = { rules: RULE_PAGE, candidates: CANDIDATE_PAGE },
    private readonly report: (error: unknown, failure: SweepFailure) => void = (error, failure) =>
      captureException(error, { tags: { kind: "automation-rule-sweep", ...failure } }),
  ) {}

  async invoke(now = new Date()): Promise<SweepResult> {
    const admitted = await this.admitDateRules(now);
    const stale = await this.recoverStale(now);
    return {
      automationRulesAdmitted: admitted,
      automationRunsRedispatched: stale.redispatched,
      automationRunsAbandoned: stale.abandoned,
    };
  }

  private async admitDateRules(now: Date): Promise<number> {
    let admitted = 0;
    let afterId: string | undefined;
    for (;;) {
      const rules = await this.repo.findDateRulesUnscoped({ afterId, limit: this.pages.rules });
      for (const rule of rules) {
        try {
          admitted += await this.admitDateRule(rule, now);
        } catch (error) {
          this.report(error, { companyId: rule.companyId, ruleId: rule.id });
        }
      }
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

  private async recoverStale(now: Date): Promise<{ redispatched: number; abandoned: number }> {
    const stale = await this.repo.findStaleRunsUnscoped(
      new Date(now.getTime() - STALE_QUEUED_MS),
      new Date(now.getTime() - AUTOMATION_RUN_STALE_MS),
      { companies: STALE_COMPANY_LIMIT, perCompany: STALE_RUNS_PER_COMPANY },
    );
    let redispatched = 0;
    let abandoned = 0;
    for (const run of stale) {
      try {
        const outcome = await this.recoverRun(run, now);
        if (outcome === "redispatched") redispatched += 1;
        if (outcome === "abandoned") abandoned += 1;
      } catch (error) {
        this.report(error, { companyId: run.companyId, runId: run.id });
      }
    }
    return { redispatched, abandoned };
  }

  private async recoverRun(run: StaleAutomationRuleRun, now: Date): Promise<"redispatched" | "abandoned" | "left"> {
    const found = await this.repo.findRunUnscoped(run.companyId, run.id);
    if (!found) return "left";
    if (now.getTime() - run.createdAt.getTime() > AUTOMATION_RUN_GIVE_UP_MS) {
      const staleBefore = new Date(now.getTime() - AUTOMATION_RUN_STALE_MS);
      if (!(await this.repo.claimRunUnscoped(run.id, run.companyId, now, staleBefore))) return "left";
      await this.repo.settleRunUnscoped({
        runId: run.id,
        companyId: run.companyId,
        ruleId: found.run.ruleId,
        status: "failed",
        outcome: { effects: [] },
        error: AUTOMATION_RUN_ABANDONED_ERROR,
        now,
      });
      return "abandoned";
    }
    const ownerUserId = found.rule?.ownerUserId;
    if (!ownerUserId) {
      await this.discard.invoke({ runId: run.id, companyId: run.companyId, reason: "ownerMissing" });
      return "left";
    }
    await this.background.dispatch("run-automation-rule", { runId: run.id, companyId: run.companyId, ownerUserId });
    return "redispatched";
  }
}
