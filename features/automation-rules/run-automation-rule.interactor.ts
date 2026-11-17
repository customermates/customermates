import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { RecordModelView, RecordRef } from "@/features/records/record-model.schema";
import type { AutomationEffectRunner } from "./automation-effect-runner";
import type { AutomationRecordPort, AutomationRecordView } from "./automation-ports";
import type { AutomationRuleRepo, StoredAutomationRule, StoredAutomationRuleRun } from "./automation-rule.repo";
import type { AutomationEffectOutcome, AutomationTrigger } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleCanRead } from "@/core/base/permission.service";
import { runInCausation } from "@/core/decorators/causation-context";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

import { evaluateConditions } from "./automation-conditions";
import { extendAutomationChain } from "./automation-context";
import { automationModelIssues } from "./automation-model-validation";
import { currentDateValue } from "./automation-occurrence";
import { ruleConditionPlan } from "./automation-record-trigger";
import {
  AutomationConditionSchema,
  AutomationEffectOutcomeSchema,
  AutomationEffectSchema,
  AutomationTriggerSchema,
  automationTimeZone,
} from "./automation-rule.schema";

export const AUTOMATION_RUN_STALE_MS = 10 * 60 * 1000;

const Schema = z.object({ runId: z.uuid() }).strict();
type RunAutomationRuleData = z.infer<typeof Schema>;

const RunPayloadSchema = z.looseObject({
  chain: z.array(z.uuid()).max(5).default([]),
  routineDepth: z.number().int().nonnegative().optional(),
  fieldValue: z.string().optional(),
  subscriptionRevision: z.number().int().optional(),
});

const RunProgressSchema = z.looseObject({ effects: z.array(AutomationEffectOutcomeSchema) });

function admittedDateChanged(
  trigger: AutomationTrigger,
  model: RecordModelView,
  record: AutomationRecordView,
  admitted: string | undefined,
): boolean {
  if (trigger.kind !== "dateReached" || admitted === undefined) return false;
  const field = model.fields.find((item) => item.id === trigger.fieldId);
  const kind = field?.valueType === "dateTime" ? "dateTime" : "date";
  return currentDateValue(kind, record.values.get(trigger.fieldId)) !== admitted;
}

type RunStatus = "applied" | "skipped" | "failed";
type RunAutomationRuleOutcome = { status: RunStatus | "missing" | "notClaimed" };

type Settlement = { status: RunStatus; effects?: AutomationEffectOutcome[]; error?: string | null; reason?: string };

function parseRule(rule: StoredAutomationRule) {
  const trigger = AutomationTriggerSchema.safeParse(rule.trigger);
  const conditions = z.array(AutomationConditionSchema).safeParse(rule.conditions);
  const effects = z.array(AutomationEffectSchema).safeParse(rule.effects);
  if (!trigger.success || !conditions.success || !effects.success) return null;
  return { trigger: trigger.data, conditions: conditions.data, effects: effects.data };
}

@TenantInteractor()
export class RunAutomationRuleInteractor extends AuthenticatedInteractor<
  RunAutomationRuleData,
  RunAutomationRuleOutcome
> {
  constructor(
    private readonly repo: AutomationRuleRepo,
    private readonly runner: AutomationEffectRunner,
    private readonly records: AutomationRecordPort,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Validate(Schema)
  async invoke({ runId }: RunAutomationRuleData): Validated<RunAutomationRuleOutcome> {
    const now = this.clock();
    const companyId = this.user.companyId;
    const found = await this.repo.findRunUnscoped(companyId, runId);
    if (!found) return { ok: true as const, data: { status: "missing" } };
    const staleBefore = new Date(now.getTime() - AUTOMATION_RUN_STALE_MS);
    if (!(await this.repo.claimRunUnscoped(runId, companyId, now, staleBefore)))
      return { ok: true as const, data: { status: "notClaimed" } };
    const progress = RunProgressSchema.safeParse(found.run.outcome);
    const done = progress.success ? progress.data.effects : null;
    const settlement = await this.execute(found.run, found.rule, done, now);
    await this.repo.settleRunUnscoped({
      runId,
      companyId,
      ruleId: found.run.ruleId,
      status: settlement.status,
      outcome: {
        effects: settlement.effects ?? done ?? [],
        ...(settlement.reason ? { reason: settlement.reason } : {}),
      },
      error: settlement.error ?? null,
      now: this.clock(),
    });
    return { ok: true as const, data: { status: settlement.status } };
  }

  private async execute(
    run: StoredAutomationRuleRun,
    rule: StoredAutomationRule | null,
    done: AutomationEffectOutcome[] | null,
    now: Date,
  ): Promise<Settlement> {
    if (!rule || !rule.enabled) return { status: "skipped", reason: "ruleDisabled" };
    if (rule.ownerUserId !== this.user.id) return { status: "skipped", reason: "ownerChanged" };
    if (!roleCanRead(this.user.role, Resource.routines)) return { status: "skipped", reason: "ownerNotPermitted" };
    const companyId = this.user.companyId;
    const {
      chain: parentChain,
      routineDepth,
      fieldValue,
      subscriptionRevision,
    } = RunPayloadSchema.parse(run.payload ?? {});
    if (
      subscriptionRevision !== undefined &&
      (await this.repo.findSubscriptionRevisionUnscoped(companyId, rule.id)) !== subscriptionRevision
    )
      return { status: "skipped", reason: "ruleChanged" };
    const definition = parseRule(rule);
    if (!definition) return { status: "failed", error: "ruleInvalid" };
    const recordRef: RecordRef | null =
      run.typeId && run.recordId ? { typeId: run.typeId, recordId: run.recordId } : null;
    const timeZone = automationTimeZone(definition.trigger);
    const model = await this.records.model();
    if (automationModelIssues(definition, model).length > 0) return { status: "failed", error: "ruleInvalid" };
    if (!done) {
      if (recordRef) {
        const record = await this.records.read(recordRef);
        if (!record) return { status: "skipped", reason: "recordUnavailable" };
        if (admittedDateChanged(definition.trigger, model, record, fieldValue))
          return { status: "skipped", reason: "dateChanged" };
        const { residual } = ruleConditionPlan(definition.trigger, definition.conditions, model);
        if (!evaluateConditions(residual, record.values, { now, timeZone }))
          return { status: "skipped", reason: "conditionsNotMet" };
      }
      await this.repo.saveRunProgressUnscoped(companyId, run.id, { effects: [] });
    }
    const { outcomes, failure } = await runInCausation(
      {
        ruleChain: extendAutomationChain(parentChain, rule.id),
        ...(routineDepth === undefined ? {} : { routineDepth }),
      },
      () =>
        this.runner.run(
          definition.effects,
          {
            companyId,
            runId: run.id,
            rule: { id: rule.id, name: rule.name, ownerUserId: this.user.id, trigger: definition.trigger },
            recordRef,
            now,
            admittedAt: run.createdAt,
          },
          {
            done: done ?? [],
            save: (effects) => this.repo.saveRunProgressUnscoped(companyId, run.id, { effects }),
          },
        ),
    );
    return failure === null
      ? { status: "applied", effects: outcomes }
      : { status: "failed", effects: outcomes, error: failure };
  }
}
