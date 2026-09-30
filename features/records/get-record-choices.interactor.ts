import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { QueryRecordsInteractor } from "./query-records.interactor";
import type { CalculatedValue, RecordRef } from "./record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordRefSchema } from "./record-model.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { resolveRecordPath } from "./record-relationship-path";
import type { RecordPathStep } from "./record-relationship-path.schema";

export const RecordChoicesSchema = z
  .object({
    typeId: z.uuid(),
    search: z.string().trim().max(500).optional(),
    page: z.number().int().positive().max(100000).default(1),
    pageSize: z.number().int().positive().max(100).default(25),
    linkedTo: z
      .object({
        ref: RecordRefSchema,
        relationId: z.uuid(),
        direction: z.enum(["outgoing", "incoming"]),
      })
      .strict()
      .optional(),
    throughPath: z.object({ ref: RecordRefSchema, pathId: z.uuid() }).strict().optional(),
  })
  .strict()
  .refine((input) => !(input.linkedTo && input.throughPath), "Choose one relationship source");
export type RecordChoicesInput = z.infer<typeof RecordChoicesSchema>;
export type RecordChoice = { ref: RecordRef; title: CalculatedValue };
export type RecordChoicesResult = {
  records: RecordChoice[];
  total: number;
  page: number;
  pageSize: number;
  schemaRevision: number;
};

@AllowInDemoMode
@TenantInteractor()
export class GetRecordChoicesInteractor extends AuthenticatedInteractor<RecordChoicesInput, RecordChoicesResult> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private query: QueryRecordsInteractor,
  ) {
    super();
  }

  @Validate(RecordChoicesSchema)
  async invoke(input: RecordChoicesInput): Validated<RecordChoicesResult> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        const type = model.types.find((candidate) => candidate.id === input.typeId && !candidate.archived);
        if (!type) return failNotFound(CustomErrorCode.recordTypeNotFound);
        let path: RecordPathStep[] | undefined;
        if (input.throughPath) {
          const source = await this.records.getRecordCompanyWide(input.throughPath.ref);
          const definition = model.types
            .find((type) => type.id === input.throughPath?.ref.typeId && !type.archived)
            ?.relationshipPaths?.find((path) => path.id === input.throughPath?.pathId && !path.archived);
          const steps = definition && resolveRecordPath(input.throughPath.ref.typeId, definition.path, model);
          if (!source || !(await policy.canRead(source)) || !steps || steps.at(-1)?.typeId !== type.id)
            return failNotFound(CustomErrorCode.recordNotFound);
          path = steps.toReversed().map((step) => ({
            relationId: step.relationId,
            direction: step.direction === "outgoing" ? "incoming" : "outgoing",
          }));
        }
        if (input.linkedTo) {
          const source = await this.records.getRecordCompanyWide(input.linkedTo.ref);
          const relation = model.relationships.find(
            (candidate) => candidate.id === input.linkedTo?.relationId && !candidate.archived,
          );
          const outgoing = input.linkedTo.direction === "outgoing";
          if (
            !source ||
            !(await policy.canRead(source)) ||
            !relation ||
            (outgoing ? relation.sourceTypeId : relation.targetTypeId) !== source.typeId ||
            (outgoing ? relation.targetTypeId : relation.sourceTypeId) !== type.id
          )
            return failNotFound(CustomErrorCode.recordNotFound);
        }
        const result = await this.query.invoke(
          RecordQuerySchema.parse({
            typeId: type.id,
            fields: [type.primaryFieldId],
            search: input.search,
            page: input.page,
            pageSize: input.pageSize,
            relatedFilters:
              path && input.throughPath
                ? [{ path, operator: "any", filters: [], recordIds: [input.throughPath.ref.recordId] }]
                : undefined,
            relationships: input.linkedTo
              ? [
                  {
                    relationId: input.linkedTo.relationId,
                    direction: input.linkedTo.direction === "outgoing" ? "incoming" : "outgoing",
                    operator: "any",
                    recordIds: [input.linkedTo.ref.recordId],
                  },
                ]
              : [],
          }),
        );
        if (!result.ok) return result;
        return {
          ok: true as const,
          data: {
            ...result.data,
            records: result.data.records.map((record) => ({
              ref: record.ref,
              title: record.fields.find((field) => field.fieldId === type.primaryFieldId)?.result ?? {
                state: "missing" as const,
              },
            })),
          },
        };
      },
      { readOnly: true },
    );
  }
}
