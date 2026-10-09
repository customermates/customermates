import { recordInvariant } from "./record-invariant";

import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";

import { UserAccessor } from "@/core/base/user-accessor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordRefSchema } from "./record-model.schema";
import { ConfigurationChangeSchema } from "./configuration.schema";
import type { RecordConfigurationService } from "./configuration.service";
import { RecordConfigurationWriter } from "./record-configuration-writer";
import { MutateRecordSchema } from "./record-query.schema";
import { RecordWriteError, RecordWriteService } from "./record-write.service";
import { RecordCalculationService, calculationSources, recordKey } from "./record-calculation.service";
import { CalculationBudgetExceeded } from "./calculation-budget-exceeded";
import { createRecordStagingRepo } from "./record-staging.repository";
import { validateRecordModel } from "./record-model-validation";
import { deterministicId } from "./crm-preset";
import { RecordJournal } from "./record-journal";
import { RecordEventPayloadSchema } from "./record-event.schema";
import { DeletionCursorSchema, RecordDeletionStaging } from "./record-deletion-staging";
import { RecordTrashService } from "./record-trash.service";
import type { RecordModel } from "./record-model.schema";
import { RestoreSummarySchema } from "./record-query.schema";

const CursorSchema = z.union([
  z.object({
    phase: z.enum(["source", "values", "calculations", "events", "publish"]),
    index: z.number().int().nonnegative(),
    afterId: z.string().optional(),
  }),
  DeletionCursorSchema,
]);
const SourcesSchema = z.object({
  refs: z.array(RecordRefSchema),
  captures: z.array(z.object({ ref: RecordRefSchema, fieldIds: z.array(z.uuid()) })),
  affectedTypeIds: z.array(z.uuid()),
});
const RestoreRequestSchema = z.object({ itemIds: z.array(z.uuid()), idempotencyKey: z.string() });
const RestoreCursorSchema = z.object({ phase: z.literal("restore"), index: z.number().int().nonnegative() });
const BACKGROUND_FANOUT_LIMIT = 1000000;
const BATCH_SIZE = 50;
const RESTORE_BATCH_SIZE = 20;

export class RecordOperationService extends UserAccessor {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private configurations: RecordConfigurationService,
  ) {
    super();
  }

  async advance(operationId: string): Promise<{ done: boolean }> {
    try {
      return await runInTransaction(
        async () => {
          const operation = await this.records.getOperation(operationId);
          if (!operation || operation.userId !== this.userId)
            throw new RecordWriteError(CustomErrorCode.recordNotFound, "not_found");
          if (["completed", "cancelled", "failed"].includes(operation.state)) return { done: true };
          const policy = await this.policy.load();
          if (!policy.actor) throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
          const state = await this.records.getState();
          if (state?.activeOperationId !== operationId || state.revision !== operation.expectedRevision)
            throw new RecordWriteError(CustomErrorCode.recordSchemaChanged, "conflict");
          const current = await this.records.getModel();
          if (operation.kind === "restore") return await this.advanceRestore(operation, current, policy);
          const staging = createRecordStagingRepo(this.records, operationId, this.companyId);
          const journal = new RecordJournal(staging, current, BACKGROUND_FANOUT_LIMIT, {
            base: this.records,
            operationId,
          });
          const staged = journal.repository;
          const calculations = new RecordCalculationService(staged);
          const prepared =
            operation.kind === "configuration"
              ? await this.configurations.prepare(ConfigurationChangeSchema.parse(operation.request), current, policy)
              : null;
          if (prepared && !prepared.preview.valid)
            throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
          const cursor = CursorSchema.parse(operation.cursor ?? { phase: "source", index: 0 });
          await this.records.updateOperation(operationId, {
            state: "staging",
            leaseUntil: new Date(Date.now() + 60000),
          });

          if (cursor.phase === "source") {
            if (prepared) {
              if ((await this.records.validateRelationshipCardinality(prepared.model)).length)
                throw new RecordWriteError(CustomErrorCode.recordRelationConflict, "conflict");
              for (const grant of prepared.grants) {
                if (!(await this.records.validRecordRolesCompanyWide(grant.grants.map((entry) => entry.roleId))))
                  throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
              }
              await staged.saveModel(prepared.model, this.userId, prepared.change);
              await this.records.stageRow(operationId, "sources", "affected", {
                refs: [],
                captures: [],
                affectedTypeIds: prepared.affectedTypeIds,
              });
              await this.records.updateOperation(operationId, {
                cursor: { phase: "values", index: 0 },
              });
            } else {
              const request = MutateRecordSchema.parse(operation.request);
              const writer = new RecordWriteService(staged, this.policy, calculations);
              if (request.mutation.action === "delete" || request.mutation.action === "deleteMany") {
                await writer.validateAccess(request.mutation, policy);
                const refs =
                  request.mutation.action === "delete"
                    ? [request.mutation.ref]
                    : request.mutation.targets.map((target) => target.ref);
                for (const ref of refs) await this.records.queueDeletionRef(operationId, ref, recordKey(ref));
                await this.records.updateOperation(operationId, { cursor: { phase: "deletePlan", index: 0 } });
                return { done: false };
              }
              const result = await writer.apply(request.mutation, current, policy, BACKGROUND_FANOUT_LIMIT, {
                skipCalculations: true,
                createRecordId: deterministicId(this.companyId, `operation:${operationId}:record`),
              });
              const typeIds = new Set(result.refs.map((ref) => ref.typeId));
              let expanded = true;
              while (expanded) {
                expanded = false;
                for (const field of current.fields) {
                  if (
                    !typeIds.has(field.typeId) &&
                    field.behavior.kind !== "input" &&
                    calculationSources(field.behavior.expression, field.typeId, current).some((source) =>
                      typeIds.has(source.typeId),
                    )
                  ) {
                    typeIds.add(field.typeId);
                    expanded = true;
                  }
                }
              }
              await this.records.stageRow(operationId, "sources", "affected", {
                refs: result.refs,
                captures: result.captures,
                affectedTypeIds: [...typeIds],
              });
              await this.records.updateOperation(operationId, {
                cursor: { phase: "calculations", index: 0 },
              });
            }
            await journal.persist();
            return { done: false };
          }

          const model = await staged.getModel();
          const deletionCursor = DeletionCursorSchema.safeParse(cursor);
          if (deletionCursor.success) {
            const mutation = MutateRecordSchema.parse(operation.request).mutation;
            if (mutation.action !== "delete" && mutation.action !== "deleteMany")
              throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
            const result = await new RecordDeletionStaging(
              this.records,
              journal,
              operationId,
              BATCH_SIZE,
              BACKGROUND_FANOUT_LIMIT,
              { companyId: this.companyId, actorId: this.userId },
            ).advance(deletionCursor.data, mutation, model, policy);
            if (result.affectedTypeIds) {
              const typeIds = new Set(result.affectedTypeIds);
              let expanded = true;
              while (expanded) {
                expanded = false;
                for (const field of model.fields) {
                  if (
                    !typeIds.has(field.typeId) &&
                    field.behavior.kind !== "input" &&
                    calculationSources(field.behavior.expression, field.typeId, model).some((source) =>
                      typeIds.has(source.typeId),
                    )
                  ) {
                    typeIds.add(field.typeId);
                    expanded = true;
                  }
                }
              }
              await this.records.stageRow(operationId, "sources", "affected", {
                refs: [],
                captures: [],
                affectedTypeIds: [...typeIds],
              });
            }
            await journal.persist();
            await this.records.updateOperation(operationId, {
              cursor: result.cursor,
              processed: operation.processed + result.processed,
            });
            return { done: false };
          }
          const sources = SourcesSchema.parse(await this.records.getStageRow(operationId, "sources", "affected"));
          if (cursor.phase === "values") {
            if (!prepared) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
            const typeId = prepared.affectedTypeIds[cursor.index];
            if (!typeId) {
              await this.records.updateOperation(operationId, {
                cursor: { phase: "calculations", index: 0 },
              });
              return { done: false };
            }
            const refs = await staged.getRecordRefsCompanyWide(typeId, cursor.afterId, BATCH_SIZE, {
              includeTrash: true,
            });
            const writer = new RecordConfigurationWriter(staged, calculations);
            for (const ref of refs) await writer.initializeRecord(ref, prepared, current, BACKGROUND_FANOUT_LIMIT);
            await journal.persist();
            await this.records.updateOperation(operationId, {
              processed: operation.processed + refs.length,
              cursor:
                refs.length === BATCH_SIZE
                  ? {
                      ...cursor,
                      afterId: recordInvariant(refs.at(-1)).recordId,
                    }
                  : { phase: "values", index: cursor.index + 1 },
            });
            return { done: false };
          }
          if (cursor.phase === "calculations") {
            const validation = validateRecordModel(model);
            if (validation.issues.length) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
            const fields = validation.calculationOrder
              .map((id) => recordInvariant(model.fields.find((field) => field.id === id)))
              .filter((field) => sources.affectedTypeIds.includes(field.typeId));
            const field = fields[cursor.index];
            if (!field) {
              await this.records.updateOperation(operationId, {
                cursor: { phase: "events", index: 0 },
              });
              return { done: false };
            }
            const refs = await staged.getRecordRefsCompanyWide(field.typeId, cursor.afterId, BATCH_SIZE);
            for (const ref of refs) {
              if (
                field.behavior.kind === "snapshot" &&
                !sources.captures.some(
                  (capture) => recordKey(capture.ref) === recordKey(ref) && capture.fieldIds.includes(field.id),
                )
              )
                continue;
              await calculations.calculateField(model, ref, field.id, BACKGROUND_FANOUT_LIMIT);
            }
            await journal.persist();
            await this.records.updateOperation(operationId, {
              processed: operation.processed + refs.length,
              cursor:
                refs.length === BATCH_SIZE
                  ? {
                      ...cursor,
                      afterId: recordInvariant(refs.at(-1)).recordId,
                    }
                  : { phase: "calculations", index: cursor.index + 1 },
            });
            return { done: false };
          }

          if (cursor.phase === "events") {
            const cause = RecordEventPayloadSchema.shape.cause.parse(
              (await this.records.getStageRow(operationId, "context", "cause")) ?? {
                kind: operation.kind,
                operationId,
              },
            );
            const request = z.object({ idempotencyKey: z.string() }).parse(operation.request);
            const page = await journal.flushPage(
              model,
              this.userId,
              request.idempotencyKey,
              cause,
              cursor.afterId,
              BATCH_SIZE,
            );
            await this.records.updateOperation(operationId, {
              cursor:
                page.count === BATCH_SIZE
                  ? { phase: "events", index: cursor.index + 1, afterId: page.afterKey }
                  : { phase: "publish", index: 0 },
            });
            return { done: false };
          }

          if (prepared) {
            await this.records.saveModel(prepared.model, this.userId, prepared.change);
            if (prepared.deletion) await this.records.deleteDefinitions(prepared.deletion);
            await this.records.applyConsumerCleanups(prepared.cleanups);
            for (const grant of prepared.grants) await this.records.setGrants(grant.typeId, grant.grants);
          } else {
            const mutation = MutateRecordSchema.parse(operation.request).mutation;
            await new RecordWriteService(
              this.records,
              this.policy,
              new RecordCalculationService(this.records),
            ).validateAccess(mutation, policy);
            if (mutation.action === "delete" || mutation.action === "deleteMany") {
              const typeIds = current.types.filter((type) => policy.allowed(type.id, "delete")).map((type) => type.id);
              if (!(await this.records.validateStagedDeletionAccess(operationId, policy.access(typeIds))))
                throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
            }
          }
          await this.records.publishStage(operationId, model.revision);
          const deletion = prepared ? null : MutateRecordSchema.parse(operation.request).mutation;
          const trashed = deletion?.action === "delete" || deletion?.action === "deleteMany";
          const permanent = trashed && Boolean(deletion.permanent);
          if (permanent) {
            const items = await this.records.getRecordTrashItemsCompanyWide({ batchId: operationId });
            const request = z.object({ idempotencyKey: z.string() }).parse(operation.request);
            await new RecordTrashService(this.records).purge(
              items.map((item) => item.id),
              model,
              this.userId,
              request.idempotencyKey,
              { kind: "mutation", operationId },
            );
          }
          await this.records.updateOperation(operationId, {
            state: "completed",
            result: {
              status: "completed",
              refs: [],
              schemaRevision: model.revision,
              ...(trashed && !permanent ? { trashBatchId: operationId } : {}),
            },
            leaseUntil: null,
          });
          await this.records.clearOperationLock(operationId);
          return { done: true };
        },
        { timeout: 60000 },
      );
    } catch (error) {
      if (!(error instanceof RecordWriteError) && !(error instanceof CalculationBudgetExceeded)) throw error;
      await this.fail(
        operationId,
        error instanceof RecordWriteError ? error.code : CustomErrorCode.recordCalculationBudget,
      );
      return { done: true };
    }
  }

  private async advanceRestore(
    operation: NonNullable<Awaited<ReturnType<RecordRepo["getOperation"]>>>,
    model: RecordModel,
    policy: Awaited<ReturnType<RecordAccessPolicy["load"]>>,
  ): Promise<{ done: boolean }> {
    const request = RestoreRequestSchema.parse(operation.request);
    const cursor = RestoreCursorSchema.parse(operation.cursor ?? { phase: "restore", index: 0 });
    const summary = RestoreSummarySchema.parse(
      (await this.records.getStageRow(operation.id, "restore", "summary")) ?? {
        restoredItemIds: [],
        blocked: [],
        restoredRecords: 0,
        droppedLinks: 0,
      },
    );
    const batch = request.itemIds.slice(cursor.index, cursor.index + RESTORE_BATCH_SIZE);
    if (batch.length) {
      const journal = new RecordJournal(this.records, model, BACKGROUND_FANOUT_LIMIT);
      const items = await this.records.getRecordTrashItemsCompanyWide({ ids: batch });
      const result = await new RecordTrashService(this.records).restore(
        items,
        model,
        policy,
        journal,
        BACKGROUND_FANOUT_LIMIT,
      );
      await journal.flush(model, this.userId, request.idempotencyKey, { kind: "mutation", operationId: operation.id });
      await this.records.stageRow(operation.id, "restore", "summary", {
        restoredItemIds: [...summary.restoredItemIds, ...result.restoredItemIds],
        blocked: [...summary.blocked, ...result.blocked],
        restoredRecords: summary.restoredRecords + result.restoredRecords,
        droppedLinks: summary.droppedLinks + result.droppedLinks,
      });
      await this.records.updateOperation(operation.id, {
        state: "staging",
        cursor: { phase: "restore", index: cursor.index + batch.length },
        processed: cursor.index + batch.length,
        total: request.itemIds.length,
        leaseUntil: new Date(Date.now() + 60000),
      });
      return { done: false };
    }
    await this.records.updateOperation(operation.id, {
      state: "completed",
      result: { status: "completed", refs: [], schemaRevision: model.revision, restore: summary },
      leaseUntil: null,
    });
    await this.records.clearOperationLock(operation.id);
    return { done: true };
  }

  async fail(operationId: string, errorCode: string): Promise<void> {
    await runInTransaction(async () => {
      const operation = await this.records.getOperation(operationId);
      if (
        !operation ||
        operation.userId !== this.userId ||
        ["completed", "cancelled", "failed"].includes(operation.state)
      )
        return;
      await this.records.updateOperation(operationId, {
        state: "failed",
        errorCode,
        leaseUntil: null,
      });
      await this.records.clearOperationLock(operationId);
    });
  }
}
