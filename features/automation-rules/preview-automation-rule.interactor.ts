import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationRecordPort } from "./automation-ports";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRulePreview, PreviewAutomationRuleData } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { evaluateConditions } from "./automation-conditions";
import { dateReachedCandidateWindow, dateReachedFireAt, isDateReachedDue } from "./automation-date";
import { automationModelIssues } from "./automation-model-validation";
import { dateOccurrenceKey } from "./automation-occurrence";
import {
  AUTOMATION_DATE_LOOKBACK_DAYS,
  AutomationConditionSchema,
  AutomationEffectSchema,
  AutomationRulePreviewSchema,
  AutomationTriggerSchema,
  PreviewAutomationRuleSchema,
} from "./automation-rule.schema";

const CANDIDATE_LIMIT = 200;
const SAMPLE_LIMIT = 50;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class PreviewAutomationRuleInteractor extends AuthenticatedInteractor<
  PreviewAutomationRuleData,
  AutomationRulePreview
> {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly records: AutomationRecordPort,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Validate(PreviewAutomationRuleSchema)
  @ValidateOutput(AutomationRulePreviewSchema)
  async invoke(data: PreviewAutomationRuleData): Validated<AutomationRulePreview> {
    const stored = data.id ? await this.repo.findRule(data.id) : null;
    if (data.id && !stored) return failNotFound(CustomErrorCode.automationRuleNotFound, ["id"]);
    const trigger = AutomationTriggerSchema.safeParse(data.rule?.trigger ?? stored?.trigger);
    if (!trigger.success) return fail(CustomErrorCode.automationRuleInvalid, ["trigger"]);
    const conditions = z
      .array(AutomationConditionSchema)
      .parse(data.rule?.conditions ?? (stored ? stored.conditions : []));
    const effects = z.array(AutomationEffectSchema).catch([]).parse(stored?.effects ?? []);
    const modelIssue = automationModelIssues({ trigger: trigger.data, conditions, effects }, await this.records.model())[0];
    if (modelIssue) return fail(CustomErrorCode.automationRuleInvalid, modelIssue.split("."));
    if (trigger.data.kind !== "dateReached")
      return { ok: true as const, data: { supported: false, total: 0, recordIds: [], alreadyFired: 0 } };

    const dateTrigger = trigger.data;
    const now = this.clock();
    const window = dateReachedCandidateWindow(dateTrigger, now, AUTOMATION_DATE_LOOKBACK_DAYS);
    const { items } = await this.repo.findDateCandidates({
      typeId: dateTrigger.typeId,
      fieldId: dateTrigger.fieldId,
      from: window.from,
      to: window.to,
      limit: CANDIDATE_LIMIT,
    });
    const due = items.flatMap((candidate) => {
      const fireAt = dateReachedFireAt(dateTrigger, {
        kind: DAY_ONLY.test(candidate.fieldValue) ? "date" : "dateTime",
        value: candidate.fieldValue,
      });
      return fireAt && isDateReachedDue(fireAt, now, AUTOMATION_DATE_LOOKBACK_DAYS)
        ? [{ recordId: candidate.recordId, key: dateOccurrenceKey(dateTrigger, candidate.recordId, candidate.fieldValue) }]
        : [];
    });
    const fired = stored ? await this.repo.findOccurrences(stored.id, due.map((item) => item.key)) : new Set<string>();
    const open = due.filter((item) => !fired.has(item.key));
    const matching: string[] = [];
    for (const item of open) {
      if (conditions.length === 0) {
        matching.push(item.recordId);
        continue;
      }
      const record = await this.records.read({ typeId: dateTrigger.typeId, recordId: item.recordId });
      if (record && evaluateConditions(conditions, record.values, { now, timeZone: dateTrigger.timezone }))
        matching.push(item.recordId);
    }
    return {
      ok: true as const,
      data: {
        supported: true,
        total: matching.length,
        recordIds: matching.slice(0, SAMPLE_LIMIT),
        alreadyFired: due.length - open.length,
      },
    };
  }
}
