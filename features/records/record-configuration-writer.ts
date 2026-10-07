import type { RecordRepo } from "./record.repo";
import type { PreparedConfiguration } from "./configuration.service";
import type { RecordModel, RecordRef } from "./record-model.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordCalculationService, SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { RecordWriteError } from "./record-write.service";
import { configurationInputFields, configurationInputValue } from "./record-configuration-values";

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
    if (prepared.deletion) await this.records.deleteDefinitions(prepared.deletion);
    for (const ref of refs) await this.initializeRecord(ref, prepared, previous, limit);
    for (const grant of prepared.grants) await this.records.setGrants(grant.typeId, grant.grants);
    const recalculated = await this.calculations.recalculate(prepared.model, refs, currency, new Map(), limit);
    if (!recalculated.complete) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    for (const ref of recalculated.changed) await this.records.touch(ref);
    return refs;
  }
}
