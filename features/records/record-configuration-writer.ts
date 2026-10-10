import type { RecordRepo } from "./record.repo";
import type { PreparedConfiguration } from "./configuration.service";
import type { RecordModel, RecordRef } from "./record-model.schema";
import type { WebhookPauseNotifier } from "@/features/webhook/webhook-pause-notifier";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordCalculationService, SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { RecordWriteError } from "./record-write.service";
import { configurationInputFields, configurationInputValue } from "./record-configuration-values";
import { RecordTrashService } from "./record-trash.service";

export async function purgeTrashOfDeletedLists(records: RecordRepo, prepared: PreparedConfiguration, userId: string) {
  if (!prepared.deletion?.typeIds.length) return;
  const items = await records.getRecordTrashItemsCompanyWide({ typeIds: prepared.deletion.typeIds });
  await new RecordTrashService(records).purge(
    items.map((item) => item.id),
    prepared.model,
    userId,
    prepared.change.causeId,
    { kind: "configuration" },
  );
}

export class RecordConfigurationWriter {
  constructor(
    private records: RecordRepo,
    private calculations: RecordCalculationService,
    private webhooks: WebhookPauseNotifier,
  ) {}

  withRepository(records: RecordRepo): RecordConfigurationWriter {
    return new RecordConfigurationWriter(records, new RecordCalculationService(records), this.webhooks);
  }

  async initializeRecord(
    ref: RecordRef,
    prepared: PreparedConfiguration,
    previous: RecordModel,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<{ trashed: boolean }> {
    const row = await this.records.getRecordCompanyWide(ref, { includeTrash: true });
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
    return { trashed: row.deletedAt !== null };
  }

  async apply(
    prepared: PreparedConfiguration,
    previous: RecordModel,
    userId: string,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<RecordRef[]> {
    if (!prepared.preview.valid) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    if ((await this.records.validateRelationshipCardinality(prepared.model)).length)
      throw new RecordWriteError(CustomErrorCode.recordRelationConflict, "conflict");
    const refs: RecordRef[] = [];
    for (const typeId of prepared.affectedTypeIds) {
      const page = await this.records.getRecordRefsCompanyWide(typeId, undefined, limit + 1, { includeTrash: true });
      refs.push(...page);
      if (refs.length > limit) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    }
    for (const grant of prepared.grants) {
      if (!(await this.records.validRecordRolesCompanyWide(grant.grants.map((entry) => entry.roleId))))
        throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    }

    await this.records.saveModel(prepared.model, userId, prepared.change);
    if (prepared.deletion) {
      await purgeTrashOfDeletedLists(this.records, prepared, userId);
      await this.records.deleteDefinitions(prepared.deletion);
    }
    const { pausedWebhookIds } = await this.records.applyConsumerCleanups(prepared.cleanups);
    await this.webhooks.notify(pausedWebhookIds);
    const live: RecordRef[] = [];
    for (const ref of refs) if (!(await this.initializeRecord(ref, prepared, previous, limit)).trashed) live.push(ref);
    for (const grant of prepared.grants) await this.records.setGrants(grant.typeId, grant.grants);
    const recalculated = await this.calculations.recalculate(prepared.model, live, new Map(), limit);
    if (!recalculated.complete) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    for (const ref of recalculated.changed) await this.records.touch(ref);
    return refs;
  }
}
