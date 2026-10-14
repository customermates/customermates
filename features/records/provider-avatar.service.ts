import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DeferredWebhookError } from "@/core/errors/app-errors";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import { channelClass } from "@/ee/messaging/provider";
import { identityLookupValue } from "@/ee/messaging/identity-lookup";
import type { MessagingProvider } from "@/generated/prisma";
import type { RecordRepo } from "./record.repo";
import type { ProviderAvatarRecordRepo } from "./provider-avatar-record.repo";
import type { RecordModel, RecordRef } from "./record-model.schema";
import { RecordRefSchema } from "./record-model.schema";
import { RecordJournal } from "./record-journal";
import type { RecordCalculationService } from "./record-calculation.service";
import { calculationSources, isCalculationBudgetExceeded, recordKey } from "./record-calculation.service";
import { createRecordStagingRepo } from "./record-staging.repository";
import { decodeRecordValue } from "./record-storage";
import { validateRecordModel } from "./record-model-validation";
import { recordChannelsTypeIds, recordProviderAvatarEnabled } from "./record-channels";

const ACTOR = "system:messaging";
const KIND = "provider-avatar";
const LIMIT = 1000000;
const BATCH = 50;
const RequestSchema = z.union([
  z
    .object({
      targets: z
        .array(z.object({ ref: RecordRefSchema, fieldId: z.uuid() }).strict())
        .min(1)
        .max(1000),
      pictureUrl: z.url(),
      affectedTypeIds: z.array(z.uuid()),
    })
    .strict(),
  z
    .object({
      identityId: z.uuid(),
      pictureUrl: z.url(),
      affectedTypeIds: z.array(z.uuid()),
    })
    .strict(),
]);
const CursorSchema = z
  .object({
    phase: z.enum(["sources", "calculations", "events", "publish"]),
    index: z.number().int().nonnegative(),
    afterId: z.string().optional(),
    afterRef: RecordRefSchema.optional(),
    affectedTypeIds: z.array(z.uuid()).optional(),
  })
  .strict();

function affectedTypes(model: RecordModel, ref: RecordRef) {
  const types = new Set([ref.typeId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const field of model.fields) {
      if (
        !types.has(field.typeId) &&
        field.behavior.kind !== "input" &&
        calculationSources(field.behavior.expression, field.typeId, model).some((source) => types.has(source.typeId))
      ) {
        types.add(field.typeId);
        expanded = true;
      }
    }
  }
  return [...types];
}

function avatarSourceTypeIds(model: RecordModel): string[] {
  return [
    ...new Set(
      recordChannelsTypeIds(model).filter(
        (typeId) =>
          recordProviderAvatarEnabled(model, typeId) &&
          model.capabilities.some((avatar) => {
            if (avatar.kind !== "avatar" || avatar.typeId !== typeId) return false;
            const fieldId = avatar.fields.find((item) => item.role === "image")?.fieldId;
            return model.fields.some(
              (field) =>
                field.id === fieldId &&
                field.typeId === typeId &&
                !field.archived &&
                field.valueType === "url" &&
                field.behavior.kind === "input",
            );
          }),
      ),
    ),
  ];
}

type AvatarCandidate = { ref: RecordRef; fieldId: string; hasValue: boolean };

async function replaceableAvatars(
  records: ProviderAvatarRecordRepo,
  companyId: string,
  candidates: AvatarCandidate[],
): Promise<AvatarCandidate[]> {
  const writers = await records.getLastFieldWritersUnscoped(
    companyId,
    candidates.filter((candidate) => candidate.hasValue),
  );
  return candidates.filter((candidate) => {
    if (!candidate.hasValue) return true;
    const writer = writers.get(`${candidate.ref.typeId}:${candidate.ref.recordId}:${candidate.fieldId}`);
    return writer === undefined || writer === ACTOR;
  });
}

export class ProviderAvatarService {
  constructor(
    private records: RecordRepo & ProviderAvatarRecordRepo,
    private companyId: string,
    private background: Pick<BackgroundTaskService, "dispatch">,
    private calculations: RecordCalculationService,
  ) {}

  synchronize(provider: MessagingProvider, identifier: string | null, pictureUrl: string | null | undefined) {
    return runInTransaction(
      async () => {
        const value = identityLookupValue(provider, identifier);
        if (!value || !pictureUrl || !z.url().safeParse(pictureUrl).success) return;
        const model = await this.records.getModelUnscoped(this.companyId);
        const identity = (
          await this.records.getIdentityChannelsUnscoped(this.companyId, [
            { channelClass: channelClass(provider), value },
          ])
        )[0];
        if (!identity) return;
        const sourceTypeIds = avatarSourceTypeIds(model);
        if (!sourceTypeIds.length) return;
        const refs = await this.records.getIdentityOwnerRefsPageUnscoped(
          this.companyId,
          identity.id,
          undefined,
          1001,
          sourceTypeIds,
        );
        if (!refs.length) return;
        if (refs.length > 1000) {
          if ((await this.records.getStateUnscoped(this.companyId))?.activeOperationId)
            throw new DeferredWebhookError("CRM avatar enrichment waits for the workspace change to complete");
          const operationId = randomUUID();
          const request = RequestSchema.parse({
            identityId: identity.id,
            pictureUrl,
            affectedTypeIds: [],
          });
          await this.records.createOperationUnscoped(this.companyId, {
            id: operationId,
            userId: ACTOR,
            kind: KIND,
            expectedRevision: model.revision,
            request,
          });
          await this.records.updateOperationUnscoped(this.companyId, operationId, {
            cursor: { phase: "sources", index: 0 },
          });
          await this.background.dispatch("provider-avatar-operation", {
            companyId: this.companyId,
            operationId,
          });
          return;
        }
        const candidates: AvatarCandidate[] = [];
        for (const ref of refs) {
          if (
            !model.types.some((type) => type.id === ref.typeId && !type.archived) ||
            !recordProviderAvatarEnabled(model, ref.typeId)
          )
            continue;
          const binding = model.capabilities.find(
            (binding) => binding.kind === "avatar" && binding.typeId === ref.typeId,
          );
          const field = model.fields.find(
            (field) => field.id === binding?.fields.find((field) => field.role === "image")?.fieldId && !field.archived,
          );
          if (!field || field.behavior.kind !== "input") continue;
          const record = await this.records.getRecordUnscoped(this.companyId, ref);
          if (!record || record.protectedKind) continue;
          const previous = decodeRecordValue(
            record.values.find((value) => value.fieldId === field.id),
            field,
          );
          if (previous.state !== "value" || previous.value.kind !== "text" || previous.value.value !== pictureUrl)
            candidates.push({ ref, fieldId: field.id, hasValue: previous.state === "value" });
        }
        const targets = (await replaceableAvatars(this.records, this.companyId, candidates)).map(
          ({ ref, fieldId }) => ({
            ref,
            fieldId,
          }),
        );
        if (!targets.length) return;
        if ((await this.records.getStateUnscoped(this.companyId))?.activeOperationId)
          throw new DeferredWebhookError("CRM avatar enrichment waits for the workspace change to complete");
        const operationId = randomUUID();
        const request = RequestSchema.parse({
          targets,
          pictureUrl,
          affectedTypeIds: [...new Set(targets.flatMap((target) => affectedTypes(model, target.ref)))],
        });
        await this.records.createOperationUnscoped(this.companyId, {
          id: operationId,
          userId: ACTOR,
          kind: KIND,
          expectedRevision: model.revision,
          request,
        });
        const journal = new RecordJournal(
          createRecordStagingRepo(this.records, operationId, this.companyId),
          model,
          LIMIT,
          { base: this.records, operationId },
        );
        for (const target of targets) {
          await journal.repository.setValue(
            target.ref,
            target.fieldId,
            { state: "value", value: { kind: "text", value: pictureUrl } },
            model.revision,
          );
          await journal.repository.touch(target.ref);
        }
        const calculated = await this.calculations.withRepository(journal.repository).recalculate(
          model,
          targets.map((target) => target.ref),
        );
        await journal.persist();
        if (!calculated.complete) {
          await this.records.updateOperationUnscoped(this.companyId, operationId, {
            cursor: { phase: "calculations", index: 0 },
          });
          await this.background.dispatch("provider-avatar-operation", {
            companyId: this.companyId,
            operationId,
          });
          return;
        }
        for (const ref of new Map(calculated.changed.map((ref) => [recordKey(ref), ref])).values())
          if (!targets.some((target) => recordKey(target.ref) === recordKey(ref))) await journal.repository.touch(ref);
        await journal.persist();
        await this.flush(journal, model, operationId);
        await this.publish(operationId, model);
      },
      { companyId: this.companyId, timeout: 60000 },
    );
  }

  async advance(operationId: string): Promise<{ done: boolean }> {
    try {
      return await runInTransaction(
        async () => {
          const operation = await this.records.getOperationUnscoped(this.companyId, operationId);
          if (!operation || operation.kind !== KIND || operation.userId !== ACTOR)
            throw new Error("Invalid avatar operation");
          if (["completed", "cancelled", "failed"].includes(operation.state)) return { done: true };
          const state = await this.records.getStateUnscoped(this.companyId);
          if (state?.activeOperationId !== operationId || state.revision !== operation.expectedRevision)
            throw new Error("Avatar operation revision changed");
          const model = await this.records.getModelUnscoped(this.companyId);
          const request = RequestSchema.parse(operation.request);
          for (const target of "targets" in request ? request.targets : []) {
            const binding = model.capabilities.find(
              (binding) => binding.kind === "avatar" && binding.typeId === target.ref.typeId,
            );
            const field = model.fields.find((field) => field.id === target.fieldId && !field.archived);
            if (
              !field ||
              field.behavior.kind !== "input" ||
              !binding?.fields.some((binding) => binding.role === "image" && binding.fieldId === field.id) ||
              !recordProviderAvatarEnabled(model, target.ref.typeId)
            )
              throw new Error("Avatar operation binding changed");
          }
          const validation = validateRecordModel(model);
          if (validation.issues.length) throw new Error("Avatar operation model is invalid");
          const cursor = CursorSchema.parse(operation.cursor);
          await this.records.updateOperationUnscoped(this.companyId, operationId, {
            state: "staging",
            leaseUntil: new Date(Date.now() + 60000),
          });
          const journal = new RecordJournal(
            createRecordStagingRepo(this.records, operationId, this.companyId),
            model,
            LIMIT,
            { base: this.records, operationId },
          );
          if (cursor.phase === "sources") {
            if (!("identityId" in request)) throw new Error("Invalid avatar source cursor");
            const affectedTypeIds = new Set(cursor.affectedTypeIds ?? request.affectedTypeIds);
            const refs = await this.records.getIdentityOwnerRefsPageUnscoped(
              this.companyId,
              request.identityId,
              cursor.afterRef,
              BATCH,
              avatarSourceTypeIds(model),
            );
            const candidates: AvatarCandidate[] = [];
            for (const ref of refs) {
              if (
                !model.types.some((type) => type.id === ref.typeId && !type.archived) ||
                !recordProviderAvatarEnabled(model, ref.typeId)
              )
                continue;
              const binding = model.capabilities.find(
                (binding) => binding.kind === "avatar" && binding.typeId === ref.typeId,
              );
              const field = model.fields.find(
                (field) =>
                  field.id === binding?.fields.find((item) => item.role === "image")?.fieldId && !field.archived,
              );
              if (!field || field.behavior.kind !== "input") continue;
              const record = await this.records.getRecordUnscoped(this.companyId, ref);
              if (!record || record.protectedKind) continue;
              const previous = decodeRecordValue(
                record.values.find((value) => value.fieldId === field.id),
                field,
              );
              if (
                previous.state === "value" &&
                previous.value.kind === "text" &&
                previous.value.value === request.pictureUrl
              )
                continue;
              candidates.push({ ref, fieldId: field.id, hasValue: previous.state === "value" });
            }
            for (const { ref, fieldId } of await replaceableAvatars(this.records, this.companyId, candidates)) {
              await journal.repository.setValue(
                ref,
                fieldId,
                {
                  state: "value",
                  value: { kind: "text", value: request.pictureUrl },
                },
                model.revision,
              );
              await journal.repository.touch(ref);
              for (const typeId of affectedTypes(model, ref)) affectedTypeIds.add(typeId);
            }
            await journal.persist();
            if (refs.length < BATCH && affectedTypeIds.size === 0) {
              await this.records.updateOperationUnscoped(this.companyId, operationId, {
                state: "completed",
                processed: operation.processed + refs.length,
                result: { status: "completed", refs: [], schemaRevision: model.revision },
                leaseUntil: null,
              });
              await this.records.clearOperationLockUnscoped(this.companyId, operationId);
              return { done: true };
            }
            await this.records.updateOperationUnscoped(this.companyId, operationId, {
              processed: operation.processed + refs.length,
              cursor:
                refs.length === BATCH
                  ? {
                      phase: "sources",
                      index: cursor.index + 1,
                      afterRef: refs.at(-1),
                      affectedTypeIds: [...affectedTypeIds],
                    }
                  : { phase: "calculations", index: 0, affectedTypeIds: [...affectedTypeIds] },
            });
            return { done: false };
          }
          if (cursor.phase === "calculations") {
            const affectedTypeIds =
              "identityId" in request ? (cursor.affectedTypeIds ?? request.affectedTypeIds) : request.affectedTypeIds;
            const fieldId = validation.calculationOrder.filter((id) =>
              model.fields.some((field) => field.id === id && affectedTypeIds.includes(field.typeId)),
            )[cursor.index];
            const field = model.fields.find((field) => field.id === fieldId);
            if (!field) {
              await this.records.updateOperationUnscoped(this.companyId, operationId, {
                cursor: { phase: "events", index: 0 },
              });
              return { done: false };
            }
            const refs = await journal.repository.getRecordRefsCompanyWide(field.typeId, cursor.afterId, BATCH);
            if (field.behavior.kind !== "snapshot") {
              const calculator = this.calculations.withRepository(journal.repository);
              for (const ref of refs) await calculator.calculateField(model, ref, field.id, LIMIT);
            }
            await journal.persist();
            await this.records.updateOperationUnscoped(this.companyId, operationId, {
              processed: operation.processed + refs.length,
              cursor:
                refs.length === BATCH
                  ? { ...cursor, afterId: refs.at(-1)?.recordId }
                  : {
                      phase: "calculations",
                      index: cursor.index + 1,
                      ...(cursor.affectedTypeIds ? { affectedTypeIds: cursor.affectedTypeIds } : {}),
                    },
            });
            return { done: false };
          }
          if (cursor.phase === "events") {
            const page = await journal.flushPage(
              model,
              ACTOR,
              operationId,
              { kind: "system", operationId },
              cursor.afterId,
              BATCH,
            );
            await this.records.updateOperationUnscoped(this.companyId, operationId, {
              cursor: page.count === BATCH ? { ...cursor, afterId: page.afterKey } : { phase: "publish", index: 0 },
            });
            return { done: false };
          }
          await this.publish(operationId, model);
          return { done: true };
        },
        { companyId: this.companyId, timeout: 60000 },
      );
    } catch (error) {
      if (isCalculationBudgetExceeded(error)) {
        await this.fail(operationId, "recordCalculationBudget");
        return { done: true };
      }
      throw error;
    }
  }

  async fail(operationId: string, errorCode = "recordConfigurationInvalid") {
    await runInTransaction(
      async () => {
        const operation = await this.records.getOperationUnscoped(this.companyId, operationId);
        if (
          !operation ||
          operation.kind !== KIND ||
          operation.userId !== ACTOR ||
          ["completed", "cancelled", "failed"].includes(operation.state)
        )
          return;
        await this.records.updateOperationUnscoped(this.companyId, operationId, {
          state: "failed",
          errorCode,
          leaseUntil: null,
        });
        await this.records.clearOperationLockUnscoped(this.companyId, operationId);
      },
      { companyId: this.companyId },
    );
  }

  private async flush(journal: RecordJournal, model: RecordModel, operationId: string) {
    let afterId: string | undefined;
    while (true) {
      const page = await journal.flushPage(model, ACTOR, operationId, { kind: "system", operationId }, afterId, BATCH);
      if (page.count < BATCH) return;
      afterId = page.afterKey;
    }
  }

  private async publish(operationId: string, model: RecordModel) {
    await this.records.publishStageUnscoped(this.companyId, operationId, model.revision);
    await this.records.updateOperationUnscoped(this.companyId, operationId, {
      state: "completed",
      result: { status: "completed", refs: [], schemaRevision: model.revision },
      leaseUntil: null,
    });
    await this.records.clearOperationLockUnscoped(this.companyId, operationId);
  }
}
