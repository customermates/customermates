import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { ConfigurationChange, ConfigurationPreview } from "./configuration.schema";
import type { PreparedConfiguration } from "./configuration.service";
import type { RecordOperationResult } from "./record-query.schema";
import type { RecordModel, RecordRef } from "./record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { fail, failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ConfigurationChangeSchema } from "./configuration.schema";
import { canConfigureRecords, type RecordConfigurationService } from "./configuration.service";
import { RecordCalculationService, SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { RecordWriteError } from "./record-write.service";
import { configurationInputFields, configurationInputValue } from "./record-configuration-values";
import { RecordOperationResultSchema } from "./record-query.schema";
import { recordRequestHash, recordWriteFailure } from "./mutate-record.interactor";
import { RecordJournal } from "./record-journal";
import { currentRoutineContext } from "@/core/decorators/routine-context";
import { resolveRecordPath } from "./record-relationship-path";

export class RecordConfigurationWriter {
  constructor(
    private records: RecordRepo,
    private calculations: RecordCalculationService,
  ) {}

  withRepository(records: RecordRepo): RecordConfigurationWriter {
    return new RecordConfigurationWriter(records, new RecordCalculationService(records));
  }

  async initializeRecord(
    ref: RecordRef,
    prepared: PreparedConfiguration,
    previous: RecordModel,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<void> {
    const row = await this.records.getRecordCompanyWide(ref);
    if (!row) throw new RecordWriteError(CustomErrorCode.recordNotFound, "not_found");
    for (const field of configurationInputFields(previous, prepared.model).filter(
      (field) => field.typeId === ref.typeId,
    )) {
      const before = previous.fields.find((candidate) => candidate.id === field.id);
      const normalized = configurationInputValue(row, before, field);
      if (
        before &&
        before.behavior.kind !== "input" &&
        before.behavior.kind !== "snapshot" &&
        !before.publishedSummary
      ) {
        const dependencies = await this.calculations.provenance(previous, ref, before.behavior.expression, limit);
        await this.records.setValueDependencies(ref, field.id, dependencies);
      }
      await this.records.setValue(
        ref,
        field.id,
        normalized ? { state: "value", value: normalized } : { state: "missing" },
        prepared.model.revision,
      );
    }
  }

  async apply(
    prepared: PreparedConfiguration,
    previous: RecordModel,
    userId: string,
    currency: string,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<RecordRef[]> {
    if (!prepared.preview.valid) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    if ((await this.records.validateRelationshipCardinality(prepared.model)).length)
      throw new RecordWriteError(CustomErrorCode.recordRelationConflict, "conflict");
    const refs: RecordRef[] = [];
    for (const typeId of prepared.affectedTypeIds) {
      const page = await this.records.getRecordRefsCompanyWide(typeId, undefined, limit + 1);
      refs.push(...page);
      if (refs.length > limit) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    }
    for (const grant of prepared.grants) {
      if (!(await this.records.validRecordRolesCompanyWide(grant.grants.map((entry) => entry.roleId))))
        throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    }

    await this.records.saveModel(prepared.model, userId, prepared.change);
    for (const ref of refs) await this.initializeRecord(ref, prepared, previous, limit);
    for (const grant of prepared.grants) await this.records.setGrants(grant.typeId, grant.grants);
    const recalculated = await this.calculations.recalculate(prepared.model, refs, currency, new Map(), limit);
    if (!recalculated.complete) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    for (const ref of recalculated.changed) await this.records.touch(ref);
    return refs;
  }
}

@AllowInDemoMode
@TenantInteractor()
export class PreviewRecordConfigurationInteractor extends AuthenticatedInteractor<
  ConfigurationChange,
  ConfigurationPreview
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private configurations: RecordConfigurationService,
  ) {
    super();
  }
  @Validate(ConfigurationChangeSchema)
  async invoke(input: ConfigurationChange): Validated<ConfigurationPreview> {
    return runInTransaction(
      async () => {
        try {
          const prepared = await this.configurations.prepare(
            input,
            await this.records.getModel(),
            await this.policy.load(),
          );
          for (const relationId of await this.records.validateRelationshipCardinality(prepared.model)) {
            prepared.preview.issues.push({
              code: "cardinality_conflict",
              relationId,
            });
          }
          prepared.preview.valid = !prepared.preview.issues.length;
          return { ok: true as const, data: prepared.preview };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}

@TenantInteractor()
export class ApplyRecordConfigurationInteractor extends AuthenticatedInteractor<
  ConfigurationChange,
  RecordOperationResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private configurations: RecordConfigurationService,
    private writer: RecordConfigurationWriter,
    private company: { getDetails(): Promise<{ currency: string }> },
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }
  @Validate(ConfigurationChangeSchema)
  async invoke(input: ConfigurationChange): Validated<RecordOperationResult> {
    return runInTransaction(
      async (): Validated<RecordOperationResult> => {
        const policy = await this.policy.load();
        if (!canConfigureRecords(input, policy)) return failAuthorization(CustomErrorCode.permissionDenied);
        const hash = recordRequestHash(input);
        const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
        if (receipt) {
          return receipt.requestHash === hash
            ? {
                ok: true,
                data: RecordOperationResultSchema.parse(receipt.result),
              }
            : failConflict(CustomErrorCode.recordIdempotencyConflict);
        }
        if ((await this.records.getState())?.activeOperationId) return failConflict(CustomErrorCode.recordWritePaused);
        try {
          const current = await this.records.getModel();
          const prepared = await this.configurations.prepare(input, current, policy);
          if (!prepared.preview.valid) return fail(CustomErrorCode.recordConfigurationInvalid);
          let data: RecordOperationResult;
          if (prepared.preview.execution === "background") {
            const operationId = randomUUID();
            await this.records.createOperation({
              id: operationId,
              userId: this.userId,
              kind: "configuration",
              expectedRevision: current.revision,
              request: input,
              stagedSchema: prepared.model,
            });
            await this.records.stageRow(operationId, "context", "cause", {
              kind: "configuration",
              operationId,
              routineDepth: currentRoutineContext()?.causationDepth,
            });
            await this.background.dispatch("record-operation", {
              operationId,
              ownerUserId: this.userId,
            });
            data = {
              status: "pending",
              operationId,
              schemaRevision: current.revision,
            };
          } else {
            const company = await this.company.getDetails();
            const journal = new RecordJournal(this.records, current);
            await this.writer
              .withRepository(journal.repository)
              .apply(prepared, current, this.userId, company.currency);
            await journal.flush(prepared.model, this.userId, input.idempotencyKey, {
              kind: "configuration",
              routineDepth: currentRoutineContext()?.causationDepth,
            });
            data = {
              status: "completed",
              refs: [],
              schemaRevision: prepared.model.revision,
            };
          }
          await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, data);
          return { ok: true, data };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { timeout: 30000 },
    );
  }
}

export const GetModelSchema = z.object({ typeIds: z.array(z.uuid()).max(100).optional() }).strict();
@AllowInDemoMode
@TenantInteractor()
export class GetRecordModelInteractor extends AuthenticatedInteractor<z.infer<typeof GetModelSchema>, RecordModel> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }
  @Validate(GetModelSchema)
  async invoke(input: z.infer<typeof GetModelSchema>): Validated<RecordModel> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const accessible = new Set(
          model.types
            .filter(
              (type) =>
                policy.canManageSchema ||
                policy.canManageRoles ||
                policy.allowed(type.id, "readOwn") ||
                policy.allowed(type.id, "readAll"),
            )
            .map((type) => type.id),
        );
        const types = model.types
          .filter((type) => accessible.has(type.id) && (!input.typeIds || input.typeIds.includes(type.id)))
          .map((type) => ({
            ...type,
            relationshipPaths: type.relationshipPaths?.filter((path) => {
              const steps = resolveRecordPath(type.id, path.path, model);
              return (
                policy.canManageSchema ||
                policy.canManageRoles ||
                (steps && steps.every((step) => accessible.has(step.typeId)))
              );
            }),
          }));
        const ids = new Set(types.map((type) => type.id));
        const pathRelations = new Set(
          types.flatMap(
            (type) => type.relationshipPaths?.flatMap((path) => path.path.map((step) => step.relationId)) ?? [],
          ),
        );
        return {
          ok: true as const,
          data: {
            ...model,
            types,
            fields: model.fields.filter((field) => ids.has(field.typeId)),
            accessPresets: policy.canManageSchema || policy.canManageRoles ? model.accessPresets : [],
            capabilities: model.capabilities.filter((binding) => ids.has(binding.typeId)),
            activityPaths: model.activityPaths.filter(
              (path) =>
                ids.has(path.typeId) &&
                path.path.every((step) => {
                  const relation = model.relationships.find((relation) => relation.id === step.relationId);
                  return relation && accessible.has(relation.sourceTypeId) && accessible.has(relation.targetTypeId);
                }),
            ),
            relationships: model.relationships.filter(
              (relation) =>
                accessible.has(relation.sourceTypeId) &&
                accessible.has(relation.targetTypeId) &&
                (ids.has(relation.sourceTypeId) || ids.has(relation.targetTypeId) || pathRelations.has(relation.id)),
            ),
          },
        };
      },
      { readOnly: true },
    );
  }
}
