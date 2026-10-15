import { recordInvariant } from "./record-invariant";

import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";

import { UserAccessor } from "@/core/base/user-accessor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failureUnwindCause, unwindFailure } from "@/core/validation/failure-unwind";
import { RecordRefSchema } from "./record-model.schema";
import { ConfigurationChangeSchema } from "./configuration.schema";
import type { RecordConfigurationService } from "./configuration.service";
import type { RecordConfigurationWriter } from "./record-configuration-writer";
import { purgeTrashOfDeletedLists } from "./record-configuration-writer";
import { MutateRecordSchema } from "./record-query.schema";
import type { RecordWriteService } from "./record-write.service";
import type { RecordCalculationService } from "./record-calculation.service";
import { calculationSources, recordKey } from "./record-calculation.service";
import { createRecordStagingRepo } from "./record-staging.repository";
import { validateRecordModel } from "./record-model-validation";
import { deterministicId } from "./crm-preset";
import { RecordJournal } from "./record-journal";
import { RecordEventPayloadSchema } from "./record-event.schema";
import { DeletionCursorSchema, RecordDeletionStaging } from "./record-deletion-staging";
import type { RecordTrashService } from "./record-trash.service";
import { droppedLinksOf } from "./record-trash.service";
import { configurationTrashBatchId } from "./configuration-trash-batch";
import type { RecordModel } from "./record-model.schema";
import type { WebhookPauseNotifier } from "@/features/webhook/webhook-pause-notifier";
import { RestoreSummarySchema } from "./record-query.schema";
import { RECORD_SYSTEM_ACTOR } from "./record-system-actor";
import { systemRecordAccess } from "./system-record-access";

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
const RestoreCursorSchema = z.object({
  phase: z.literal("restore"),
  index: z.number().int().nonnegative(),
  started: z.boolean(),
  pass: z.number().int().nonnegative().default(0),
  restoredBeforePass: z.number().int().optional(),
});

const BACKGROUND_FANOUT_LIMIT = 1000000;

function progress(operation: { processed: number; total: number }, units: number) {
  const processed = operation.processed + units;
  return { processed, total: Math.max(operation.total, processed) };
}
const BATCH_SIZE = 50;
const RESTORE_PAGE_SIZE = 200;

export class RecordOperationService extends UserAccessor {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private configurations: RecordConfigurationService,
    private webhooks: WebhookPauseNotifier,
    private calculations: RecordCalculationService,
    private writes: RecordWriteService,
    private writer: RecordConfigurationWriter,
    private trash: RecordTrashService,
    private systemCompanyId?: string,
  ) {
    super();
  }

  private get operator(): { companyId: string; userId: string; eventActorId: string | null } {
    return this.systemCompanyId === undefined
      ? { companyId: this.companyId, userId: this.userId, eventActorId: this.userId }
      : { companyId: this.systemCompanyId, userId: RECORD_SYSTEM_ACTOR, eventActorId: null };
  }

  private loadPolicy() {
    return this.systemCompanyId === undefined
      ? this.policy.load()
      : systemRecordAccess(this.records, this.systemCompanyId);
  }

  async advance(operationId: string): Promise<{ done: boolean }> {
    try {
      return await runInTransaction(
        async () => {
          const operator = this.operator;
          const operation = await this.records.getOperation(operationId);
          if (!operation || operation.userId !== operator.userId)
            throw unwindFailure(CustomErrorCode.recordNotFound, "not_found");
          if (["completed", "cancelled", "failed"].includes(operation.state)) return { done: true };
          if (this.systemCompanyId !== undefined && operation.kind !== "configuration")
            throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
          const policy = await this.loadPolicy();
          if (!policy.actor) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
          const state = await this.records.getState();
          if (state?.activeOperationId !== operationId || state.revision !== operation.expectedRevision)
            throw unwindFailure(CustomErrorCode.recordSchemaChanged, "conflict");
          const current = await this.records.getModel();
          if (operation.kind === "restore") return await this.advanceRestore(operation, current, policy);
          const staging = createRecordStagingRepo(this.records, operationId, operator.companyId);
          const journal = new RecordJournal(staging, current, BACKGROUND_FANOUT_LIMIT, {
            base: this.records,
            operationId,
          });
          const staged = journal.repository;
          const calculations = this.calculations.withRepository(staged);
          const prepared =
            operation.kind === "configuration"
              ? await this.configurations.prepare(ConfigurationChangeSchema.parse(operation.request), current, policy)
              : null;
          if (prepared && !prepared.preview.valid) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
          const cursor = CursorSchema.parse(operation.cursor ?? { phase: "source", index: 0 });
          await this.records.updateOperation(operationId, {
            state: "staging",
            leaseUntil: new Date(Date.now() + 60000),
          });

          if (cursor.phase === "source") {
            if (prepared) {
              if ((await this.records.validateRelationshipCardinality(prepared.model)).length)
                throw unwindFailure(CustomErrorCode.recordRelationConflict, "conflict");
              for (const grant of prepared.grants) {
                if (!(await this.records.validRecordRolesCompanyWide(grant.grants.map((entry) => entry.roleId))))
                  throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
              }
              await staged.saveModel(prepared.model, operator.userId, prepared.change);
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
              const writer = this.writes.withRepository(staged);
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
                createRecordId: deterministicId(operator.companyId, `operation:${operationId}:record`),
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
              throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
            const result = await new RecordDeletionStaging(
              this.records,
              journal,
              operationId,
              BATCH_SIZE,
              BACKGROUND_FANOUT_LIMIT,
              { companyId: operator.companyId, actorId: operator.userId },
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
              ...progress(operation, result.processed),
            });
            return { done: false };
          }
          const sources = SourcesSchema.parse(await this.records.getStageRow(operationId, "sources", "affected"));
          if (cursor.phase === "values") {
            if (!prepared) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
            const typeId = prepared.affectedTypeIds[cursor.index];
            if (!typeId) {
              await this.records.updateOperation(operationId, {
                cursor: { phase: "calculations", index: 0 },
              });
              return { done: false };
            }
            const total =
              operation.total ||
              operation.processed +
                (await this.remainingUnits(
                  staged,
                  prepared.affectedTypeIds.slice(cursor.index),
                  this.calculatedFields(model, sources.affectedTypeIds),
                ));
            const refs = await staged.getRecordRefsCompanyWide(typeId, cursor.afterId, BATCH_SIZE, {
              includeTrash: true,
            });
            const writer = this.writer.withRepository(staged);
            for (const ref of refs) await writer.initializeRecord(ref, prepared, current, BACKGROUND_FANOUT_LIMIT);
            await journal.persist();
            await this.records.updateOperation(operationId, {
              ...progress({ ...operation, total }, refs.length),
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
            const fields = this.calculatedFields(model, sources.affectedTypeIds);
            const field = fields[cursor.index];
            if (!field) {
              await this.records.updateOperation(operationId, {
                cursor: { phase: "events", index: 0 },
              });
              return { done: false };
            }
            const total =
              operation.total ||
              operation.processed + (await this.remainingUnits(staged, [], fields.slice(cursor.index)));
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
              ...progress({ ...operation, total }, refs.length),
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
              operator.eventActorId,
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
            await this.records.saveModel(prepared.model, operator.userId, prepared.change);
            if (prepared.deletion) {
              await purgeTrashOfDeletedLists(this.records, prepared, operator.eventActorId);
              await this.records.deleteDefinitions(prepared.deletion);
            }
            const { pausedWebhookIds } = await this.records.applyConsumerCleanups(prepared.cleanups);
            await this.webhooks.notify(pausedWebhookIds);
            for (const grant of prepared.grants) await this.records.setGrants(grant.typeId, grant.grants);
          } else {
            const mutation = MutateRecordSchema.parse(operation.request).mutation;
            await this.writes.validateAccess(mutation, policy);
            if (mutation.action === "delete" || mutation.action === "deleteMany") {
              const typeIds = current.types.filter((type) => policy.allowed(type.id, "delete")).map((type) => type.id);
              if (!(await this.records.validateStagedDeletionAccess(operationId, policy.access(typeIds))))
                throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
            }
          }
          await this.records.publishStage(operationId, model.revision);
          const deletion = prepared ? null : MutateRecordSchema.parse(operation.request).mutation;
          const trashed = deletion?.action === "delete" || deletion?.action === "deleteMany";
          const permanent = trashed && Boolean(deletion.permanent);
          if (permanent) {
            const items = await this.records.getRecordTrashItemsCompanyWide({ batchId: operationId });
            const request = z.object({ idempotencyKey: z.string() }).parse(operation.request);
            await this.trash.purge(
              items.map((item) => item.id),
              model,
              operator.eventActorId,
              request.idempotencyKey,
              { kind: "mutation", operationId },
            );
          }
          await this.records.updateOperation(operationId, {
            state: "completed",
            total: operation.processed,
            result: {
              status: "completed",
              refs: [],
              schemaRevision: model.revision,
              ...(prepared?.preview.deletion?.cleaned.length
                ? { deletionCleaned: prepared.preview.deletion.cleaned }
                : {}),
              ...(trashed && !permanent ? { trashBatchId: operationId } : {}),
              ...(prepared?.change.deletions?.length
                ? {
                    trashBatchId: configurationTrashBatchId(
                      operator.companyId,
                      z.object({ idempotencyKey: z.string() }).parse(operation.request).idempotencyKey,
                    ),
                  }
                : {}),
            },
            leaseUntil: null,
          });
          await this.records.clearOperationLock(operationId);
          return { done: true };
        },
        { timeout: 60000, companyId: this.systemCompanyId },
      );
    } catch (error) {
      const cause = failureUnwindCause(error);
      if (!cause) throw error;
      await this.fail(operationId, cause.code);
      return { done: true };
    }
  }

  private calculatedFields(model: RecordModel, typeIds: string[]) {
    const validation = validateRecordModel(model);
    if (validation.issues.length) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
    return validation.calculationOrder
      .map((id) => recordInvariant(model.fields.find((field) => field.id === id)))
      .filter((field) => typeIds.includes(field.typeId));
  }

  private async remainingUnits(
    records: RecordRepo,
    valueTypeIds: string[],
    fields: Array<{ typeId: string }>,
  ): Promise<number> {
    const counts = new Map<string, number>();
    const count = async (typeId: string) => {
      const known = counts.get(typeId);
      if (known !== undefined) return known;
      const counted = await records.countRecordsCompanyWide([typeId]);
      counts.set(typeId, counted);
      return counted;
    };
    let units = 0;
    for (const typeId of valueTypeIds) units += await count(typeId);
    for (const field of fields) units += await count(field.typeId);
    return units;
  }

  private async advanceRestore(
    operation: NonNullable<Awaited<ReturnType<RecordRepo["getOperation"]>>>,
    model: RecordModel,
    policy: Awaited<ReturnType<RecordAccessPolicy["load"]>>,
  ): Promise<{ done: boolean }> {
    const request = RestoreRequestSchema.parse(operation.request);
    const cursor = RestoreCursorSchema.parse(operation.cursor ?? { phase: "restore", index: 0, started: false });
    const summary = RestoreSummarySchema.parse(
      (await this.records.getStageRow(operation.id, "restore", "summary")) ?? {
        restoredItemIds: [],
        blocked: [],
        restoredRecords: 0,
        droppedLinks: 0,
      },
    );
    const queue = z
      .array(z.uuid())
      .parse((await this.records.getStageRow(operation.id, "restore", "queue")) ?? request.itemIds);
    const itemId = queue[cursor.index];
    if (!itemId) {
      const retry = summary.blocked.filter((blocker) => blocker.reason === "parentDeleted");
      const progressed = summary.restoredItemIds.length > (cursor.restoredBeforePass ?? -1);
      if (retry.length && progressed && cursor.pass < 5) {
        await this.records.stageRow(operation.id, "restore", "summary", {
          ...summary,
          blocked: summary.blocked.filter((blocker) => blocker.reason !== "parentDeleted"),
        });
        await this.records.stageRow(
          operation.id,
          "restore",
          "queue",
          retry.map((blocker) => blocker.itemId),
        );
        await this.records.updateOperation(operation.id, {
          cursor: {
            phase: "restore",
            index: 0,
            started: false,
            pass: cursor.pass + 1,
            restoredBeforePass: summary.restoredItemIds.length,
          },
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
    const service = this.trash;
    const [item] = await this.records.getRecordTrashItemsCompanyWide({ ids: [itemId] });
    const blocker = item && !cursor.started ? await service.accessible(item, model, policy) : null;
    const next = { ...cursor, index: cursor.index + 1, started: false };
    if (!item || blocker) {
      await this.records.stageRow(operation.id, "restore", "summary", {
        ...summary,
        blocked: blocker ? [...summary.blocked, blocker] : summary.blocked,
      });
      await this.records.updateOperation(operation.id, { cursor: next, leaseUntil: new Date(Date.now() + 60000) });
      return { done: false };
    }
    if (!cursor.started) await service.keepSubListRowsWithTheirParents(item.id, model, this.records);
    const refs = await this.records.getTrashedRecordRefsCompanyWide([item.id], RESTORE_PAGE_SIZE);
    const journal = new RecordJournal(this.records, model, BACKGROUND_FANOUT_LIMIT);
    const droppedLinks = await service.restoreRecords(refs, model, journal, BACKGROUND_FANOUT_LIMIT);
    await journal.flush(model, this.userId, request.idempotencyKey, { kind: "mutation", operationId: operation.id });
    const finished = refs.length < RESTORE_PAGE_SIZE;
    if (finished) await this.records.removeTrashItems([item.id]);
    await this.records.stageRow(operation.id, "restore", "summary", {
      ...summary,
      restoredItemIds: finished ? [...summary.restoredItemIds, item.id] : summary.restoredItemIds,
      restoredRecords: summary.restoredRecords + refs.length,
      droppedLinks: summary.droppedLinks + droppedLinks + (finished ? droppedLinksOf(item) : 0),
    });
    await this.records.updateOperation(operation.id, {
      state: "staging",
      cursor: finished ? next : { ...cursor, started: true },
      processed: operation.processed + refs.length,
      leaseUntil: new Date(Date.now() + 60000),
    });
    return { done: false };
  }

  async fail(operationId: string, errorCode: CustomErrorCode): Promise<void> {
    await runInTransaction(
      async () => {
        const operation = await this.records.getOperation(operationId);
        if (
          !operation ||
          operation.userId !== this.operator.userId ||
          ["completed", "cancelled", "failed"].includes(operation.state)
        )
          return;
        await this.records.updateOperation(operationId, {
          state: "failed",
          errorCode,
          leaseUntil: null,
        });
        await this.records.clearOperationLock(operationId);
      },
      { companyId: this.systemCompanyId },
    );
  }
}
