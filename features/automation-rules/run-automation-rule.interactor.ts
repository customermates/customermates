import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { AutomationEffectRunner } from "./automation-effect-runner";
import type { AutomationRecordPort } from "./automation-ports";
import type { AutomationRuleRepo, StoredAutomationRule } from "./automation-rule.repo";
import type { AutomationEffectOutcome } from "./automation-rule.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleCanRead } from "@/core/base/permission.service";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

import { evaluateConditions } from "./automation-conditions";
import { extendAutomationChain, runInAutomationContext } from "./automation-context";
import { AutomationConditionSchema, AutomationEffectSchema, AutomationTriggerSchema } from "./automation-rule.schema";

export const AUTOMATION_RUN_STALE_MS = 10 * 60 * 1000;

const Schema = z.object({ runId: z.uuid() }).strict();
type RunAutomationRuleData = z.infer<typeof Schema>;

const RunPayloadSchema = z.looseObject({ chain: z.array(z.uuid()).max(5).default([]) });

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
export class RunAutomationRuleInteractor extends AuthenticatedInteractor<RunAutomationRuleData, RunAutomationRuleOutcome> {
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
    const settlement = await this.execute(found.run, found.rule, now);
    await this.repo.settleRunUnscoped({
      runId,
      companyId,
      ruleId: found.run.ruleId,
      status: settlement.status,
      outcome: { effects: settlement.effects ?? [], ...(settlement.reason ? { reason: settlement.reason } : {}) },
      error: settlement.error ?? null,
      now: this.clock(),
    });
    return { ok: true as const, data: { status: settlement.status } };
  }

  private async execute(
    run: { id: string; typeId: string | null; recordId: string | null; payload: unknown },
    rule: StoredAutomationRule | null,
    now: Date,
  ): Promise<Settlement> {
    if (!rule || !rule.enabled) return { status: "skipped", reason: "ruleDisabled" };
    if (rule.ownerUserId !== this.user.id) return { status: "skipped", reason: "ownerChanged" };
    if (!roleCanRead(this.user.role, Resource.routines)) return { status: "skipped", reason: "ownerNotPermitted" };
    const definition = parseRule(rule);
    if (!definition) return { status: "failed", error: "ruleInvalid" };
    const recordRef: RecordRef | null =
      run.typeId && run.recordId ? { typeId: run.typeId, recordId: run.recordId } : null;
    const timeZone = definition.trigger.kind === "dateReached" ? definition.trigger.timezone : "UTC";
    if (recordRef) {
      const record = await this.records.read(recordRef);
      if (!record) return { status: "skipped", reason: "recordUnavailable" };
      if (!evaluateConditions(definition.conditions, record.values, { now, timeZone }))
        return { status: "skipped", reason: "conditionsNotMet" };
    }
    const parentChain = RunPayloadSchema.parse(run.payload ?? {}).chain;
    const { outcomes, failure } = await runInAutomationContext(
      { chain: extendAutomationChain(parentChain, rule.id) },
      () =>
        this.runner.run(definition.effects, {
          companyId: this.user.companyId,
          runId: run.id,
          rule: { id: rule.id, name: rule.name, ownerUserId: this.user.id, trigger: definition.trigger },
          recordRef,
          now,
        }),
    );
    return failure === null
      ? { status: "applied", effects: outcomes }
      : { status: "failed", effects: outcomes, error: failure };
  }
}
