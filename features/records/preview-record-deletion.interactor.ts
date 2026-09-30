import { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordWriteService } from "./record-write.service";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordRefSchema } from "./record-model.schema";
import { calculationSources, recordKey } from "./record-calculation.service";
import { recordWriteFailure } from "./mutate-record.interactor";

export const PreviewRecordDeletionSchema = z
  .object({
    ref: RecordRefSchema,
    expectedRevision: z.number().int().nonnegative(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export type PreviewRecordDeletionInput = z.infer<typeof PreviewRecordDeletionSchema>;
export const RecordDeletionPreviewSchema = z
  .object({
    ref: RecordRefSchema,
    schemaRevision: z.number().int(),
    recordVersion: z.number().int(),
    impactHash: z.string(),
    removedRecords: z.array(z.object({ typeId: z.uuid(), label: z.string(), count: z.number().int() }).strict()),
    removedLinks: z.number().int().nullable(),
    calculations: z.array(z.object({ typeId: z.uuid(), fieldId: z.uuid(), label: z.string() }).strict()),
  })
  .strict();
export type RecordDeletionPreview = z.infer<typeof RecordDeletionPreviewSchema>;

@AllowInDemoMode
@TenantInteractor()
export class PreviewRecordDeletionInteractor extends AuthenticatedInteractor<
  PreviewRecordDeletionInput,
  RecordDeletionPreview
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private writer: RecordWriteService,
  ) {
    super();
  }

  @Validate(PreviewRecordDeletionSchema)
  async invoke(input: PreviewRecordDeletionInput): Validated<RecordDeletionPreview> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (model.revision !== input.expectedRevision) return failConflict(CustomErrorCode.recordSchemaChanged);
        try {
          const plan = await this.writer.planDeletion(
            { action: "delete", ref: input.ref, expectedVersion: input.expectedVersion },
            model,
            policy,
            5000,
          );
          const visible = new Set(plan.deleted.keys());
          const candidates = [...plan.affected].filter(([key]) => !visible.has(key)).map(([, ref]) => ref);
          for (let index = 0; index < candidates.length; index += 100) {
            for (const row of await this.records.getRecordsCompanyWide(candidates.slice(index, index + 100)))
              if (await policy.canRead(row)) visible.add(recordKey({ typeId: row.typeId, recordId: row.id }));
          }
          const changedTypes = new Set([...plan.affected.values()].map((ref) => ref.typeId));
          const calculations = new Map<string, RecordDeletionPreview["calculations"][number]>();
          let expanded = true;
          while (expanded) {
            expanded = false;
            for (const field of model.fields) {
              if (
                field.archived ||
                field.behavior.kind === "input" ||
                field.behavior.kind === "snapshot" ||
                calculations.has(field.id)
              )
                continue;
              if (
                !changedTypes.has(field.typeId) &&
                !calculationSources(field.behavior.expression, field.typeId, model).some((source) =>
                  changedTypes.has(source.typeId),
                )
              )
                continue;
              calculations.set(field.id, { typeId: field.typeId, fieldId: field.id, label: field.label });
              changedTypes.add(field.typeId);
              expanded = true;
            }
          }
          return {
            ok: true as const,
            data: {
              ref: input.ref,
              schemaRevision: model.revision,
              recordVersion: input.expectedVersion,
              impactHash: plan.impactHash,
              removedRecords: model.types.flatMap((type) => {
                const count = [...plan.deleted.values()].filter((row) => row.typeId === type.id).length;
                return count ? [{ typeId: type.id, label: type.pluralLabel, count }] : [];
              }),
              removedLinks: visible.size === plan.affected.size ? plan.links.size : null,
              calculations: [...calculations.values()].filter(
                (field) => policy.allowed(field.typeId, "readAll") || policy.allowed(field.typeId, "readOwn"),
              ),
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true, timeout: 20000 },
    );
  }
}
