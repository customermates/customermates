import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { CalculatedValue } from "./record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { CalculationExpressionSchema } from "./record-model.schema";
import { calculationSources, type RecordCalculationService } from "./record-calculation.service";
import { decodeRecordValue } from "./record-storage";

export const CALCULATION_PREVIEW_EXAMPLES = 5;

export const PreviewCalculationSchema = z
  .object({
    typeId: z.uuid(),
    expression: CalculationExpressionSchema,
    recordId: z.uuid().optional(),
  })
  .strict();
export type PreviewCalculationInput = z.infer<typeof PreviewCalculationSchema>;

export type CalculationPreview = {
  examples: Array<{ recordId: string; title: string | null }>;
  recordId: string | null;
  value: CalculatedValue | null;
};

@AllowInDemoMode
@TenantInteractor()
export class PreviewCalculationInteractor extends AuthenticatedInteractor<PreviewCalculationInput, CalculationPreview> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private calculations: RecordCalculationService,
  ) {
    super();
  }

  @Validate(PreviewCalculationSchema)
  async invoke(input: PreviewCalculationInput): Validated<CalculationPreview> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor || !(policy.isAdmin || policy.canManageSchema))
          return failAuthorization(CustomErrorCode.permissionDenied);
        const type = model.types.find((candidate) => candidate.id === input.typeId && !candidate.archived);
        if (!type) return failNotFound(CustomErrorCode.recordTypeNotFound);
        const readsFully = (typeId: string) => policy.isAdmin || policy.readScope(typeId) === "all";
        const involved = [
          type.id,
          ...calculationSources(input.expression, type.id, model).map((source) => source.typeId),
        ];
        if (!involved.every(readsFully)) {
          return {
            ok: true,
            data: {
              examples: [],
              recordId: null,
              value: { state: "restricted" },
            },
          };
        }
        const refs = await this.records.getRecordRefsCompanyWide(type.id, undefined, CALCULATION_PREVIEW_EXAMPLES);
        const title = model.fields.find((field) => field.id === type.primaryFieldId);
        const rows = await this.records.getRecordsCompanyWide(refs);
        const examples = refs.map((ref) => {
          const stored = rows.find((row) => row.id === ref.recordId);
          const value = title
            ? decodeRecordValue(
                stored?.values.find((value) => value.fieldId === title.id),
                title,
              )
            : null;
          return {
            recordId: ref.recordId,
            title: value?.state === "value" && value.value.kind === "text" ? value.value.value : null,
          };
        });
        const ref = refs.find((candidate) => candidate.recordId === input.recordId) ?? refs[0];
        if (!ref) return { ok: true, data: { examples, recordId: null, value: null } };
        const value = await this.calculations.evaluate(model, ref, input.expression);
        return { ok: true, data: { examples, recordId: ref.recordId, value } };
      },
      { readOnly: true },
    );
  }
}
