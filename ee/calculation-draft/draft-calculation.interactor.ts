import { z } from "zod";

import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { AgentUsageService, AgentRetrievalCharge } from "@/ee/agent-chat/agent-usage.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { CalculationDraft } from "@/features/records/calculation-draft";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import {
  failAuthorization,
  failNotFound,
  failRateLimit,
  failUnavailable,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { SHIPPED_AGENT_MODEL } from "@/ee/agent-chat/model-catalog";
import { generateStructuredObject, structuredCallWorstCaseMicrocents } from "@/ee/agent-chat/structured-model-call";
import {
  CALCULATION_DRAFT_DESCRIPTION_LIMIT,
  CalculationDraftOutputSchema,
  calculationDraftRequest,
  parseCalculationDraft,
} from "@/features/records/calculation-draft";

export const DraftCalculationSchema = z
  .object({
    typeId: z.uuid(),
    fieldId: z.uuid().optional(),
    description: z.string().trim().min(1).max(CALCULATION_DRAFT_DESCRIPTION_LIMIT),
  })
  .strict();
export type DraftCalculationInput = z.infer<typeof DraftCalculationSchema>;

@TenantInteractor()
export class DraftCalculationInteractor extends AuthenticatedInteractor<
  DraftCalculationInput,
  { draft: CalculationDraft | null }
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private usage: AgentUsageService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(DraftCalculationSchema)
  async invoke(input: DraftCalculationInput): Validated<{ draft: CalculationDraft | null }> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor || !(policy.isAdmin || policy.canManageSchema))
      return failAuthorization(CustomErrorCode.permissionDenied);
    if (!model.types.some((type) => type.id === input.typeId && !type.archived))
      return failNotFound(CustomErrorCode.recordTypeNotFound);
    const request = calculationDraftRequest({ model, ...input });
    const now = new Date();
    const engine = SHIPPED_AGENT_MODEL;
    const grant = await this.usage.prepareRetrieval(this.user.id, now, "calculationDraft");
    const reservation = grant
      ? await this.usage.reserveRetrieval({
          grant,
          worstCaseMicrocents: structuredCallWorstCaseMicrocents(engine, request.system, request.prompt),
          model: engine.modelId,
          now,
        })
      : null;
    if (!reservation) {
      const summary = await this.usage.getUsageSummary(this.user.id, now);
      return summary.blockedReason === "credits_exhausted"
        ? failRateLimit(CustomErrorCode.agentLimitReached)
        : failUnavailable(CustomErrorCode.agentServiceUnavailable);
    }
    let charge: AgentRetrievalCharge | null = {
      model: engine.modelId,
      inputTokens: 0,
      costMicrocents: reservation.reservedMicrocents,
      costSource: "estimated",
    };
    let output: z.infer<typeof CalculationDraftOutputSchema> | null = null;
    try {
      const result = await generateStructuredObject({
        label: "Calculation draft",
        model: engine,
        schema: CalculationDraftOutputSchema,
        system: request.system,
        prompt: request.prompt,
      });
      charge = result.charge;
      output = result.output;
    } finally {
      await this.usage.settleRetrieval({ reservation, charge });
    }
    const draft = output
      ? parseCalculationDraft({ output, aliases: request.aliases, model, typeId: input.typeId, fieldId: input.fieldId })
      : null;
    return { ok: true, data: { draft } };
  }
}
