import { recordInvariant } from "./record-invariant";
import Decimal from "decimal.js";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordMeasure, RecordMeasureResult } from "./record-measure.schema";
import type { CalculatedValue } from "./record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordMeasureSchema, RecordMeasureResultSchema } from "./record-measure.schema";
import { RecordScalarSchema } from "./record-model.schema";
import { recordMeasureIssue } from "./record-measure-validation";
import { recordWriteFailure } from "./mutate-record.interactor";

@AllowInDemoMode
@TenantInteractor()
export class QueryRecordMeasureInteractor extends AuthenticatedInteractor<RecordMeasure, RecordMeasureResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }
  @Validate(RecordMeasureSchema)
  async invoke(measure: RecordMeasure): Validated<RecordMeasureResult> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        if (
          !model.types.some((type) => type.id === measure.source.typeId && !type.archived) ||
          (!policy.allowed(measure.source.typeId, "readAll") && !policy.allowed(measure.source.typeId, "readOwn"))
        )
          return failNotFound(CustomErrorCode.recordTypeNotFound);
        const issue = recordMeasureIssue(measure, model);
        if (issue) return fail(issue.code, issue.path);
        try {
          const rows = await this.records.measure(
            measure,
            model,
            policy.access(model.types.filter((type) => !type.archived).map((type) => type.id)),
          );
          if (rows.length > measure.groupLimit) return fail(CustomErrorCode.recordCalculationBudget);
          const mapRow = (row: (typeof rows)[number]): RecordMeasureResult["groups"][number] => {
            let label: CalculatedValue = { state: "missing" };
            if (row.groupState === "restricted") label = { state: "restricted" };
            if (row.groupState === "error") label = { state: "error", code: "dependency_error" };
            if (row.groupState === "value") {
              const scalar = RecordScalarSchema.parse(row.groupValue);
              if (scalar.kind === "decimal") scalar.value = new Decimal(scalar.value).toFixed();
              label = { state: "value", value: scalar };
            }
            const result: CalculatedValue =
              row.resultState === "restricted"
                ? { state: "restricted" }
                : row.resultState === "missing"
                  ? { state: "missing" }
                  : row.resultState === "currency_mismatch"
                    ? { state: "error", code: "currency_mismatch" }
                    : row.resultState === "error"
                      ? { state: "error", code: "dependency_error" }
                      : {
                          state: "value",
                          value: {
                            kind: "decimal",
                            value: new Decimal(row.resultValue ?? "0").toFixed(),
                            currency: row.resultCurrency,
                          },
                        };
            return {
              record:
                row.groupRecordId && row.groupTypeId ? { typeId: row.groupTypeId, recordId: row.groupRecordId } : null,
              fieldId: row.groupFieldId,
              label,
              count: row.groupState === "restricted" ? null : row.count,
              result,
            };
          };
          const groups = rows.map(mapRow);
          const emptyGroup = (): RecordMeasureResult["groups"][number] => {
            const value = model.fields.find((field) => field.id === measure.valueFieldId);
            return {
              record: null,
              fieldId: null,
              label: { state: "missing" },
              count: 0,
              result: ["sum", "count"].includes(measure.aggregation)
                ? {
                    state: "value",
                    value: {
                      kind: "decimal",
                      value: "0",
                      currency:
                        measure.aggregation !== "count" && value?.valueType === "currency"
                          ? recordInvariant(value.format?.currency)
                          : null,
                    },
                  }
                : { state: "missing" },
            };
          };
          if (!groups.length && !measure.groupBy) groups.push(emptyGroup());
          const overall = measure.groupBy
            ? ((
                await this.records.measure(
                  { ...measure, groupBy: null },
                  model,
                  policy.access(model.types.filter((type) => !type.archived).map((type) => type.id)),
                )
              ).map(mapRow)[0] ?? emptyGroup())
            : groups[0];
          return {
            ok: true as const,
            data: RecordMeasureResultSchema.parse({
              schemaRevision: model.revision,
              attribution: "full",
              total: { count: overall.count, result: overall.result },
              groups,
            }),
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
