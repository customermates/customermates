import type { RecordRepo } from "./record.repo";
import type { ConfigurationChange } from "./configuration.schema";
import type { RecordConfigurationService } from "./configuration.service";
import type { RecordConfigurationWriter } from "./record-configuration-writer";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordAccessForActor } from "./record-access";
import { RECORD_SYSTEM_SCHEMA_ACTOR } from "./record-configuration-writer";
import { RecordJournal } from "./record-journal";
import { RecordWriteError } from "./record-write-error";

export class ConfigurationSystemPurge {
  constructor(
    private records: RecordRepo,
    private configurations: RecordConfigurationService,
    private writer: RecordConfigurationWriter,
  ) {}

  async deletePermanently(change: ConfigurationChange, companyId: string): Promise<void> {
    if ((await this.records.getState())?.activeOperationId)
      throw new RecordWriteError(CustomErrorCode.recordWritePaused, "conflict");
    const [current, grants] = await Promise.all([this.records.getModel(), this.records.getGrants()]);
    const policy = recordAccessForActor({
      actor: {
        id: RECORD_SYSTEM_SCHEMA_ACTOR,
        status: "active",
        role: { id: RECORD_SYSTEM_SCHEMA_ACTOR, companyId, isSystemRole: true, permissions: [] },
      },
      grants,
      model: current,
      records: this.records,
      companyId,
      userId: RECORD_SYSTEM_SCHEMA_ACTOR,
    });
    const prepared = await this.configurations.prepare(change, current, policy);
    if (!prepared.preview.valid) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    if (prepared.preview.execution === "background")
      throw new RecordWriteError(CustomErrorCode.recordCalculationBudget, "conflict");
    const journal = new RecordJournal(this.records, current);
    await this.writer.withRepository(journal.repository).apply(prepared, current, null);
    await journal.flush(prepared.model, null, change.idempotencyKey, { kind: "system" });
  }
}
