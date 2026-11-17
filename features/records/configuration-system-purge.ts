import { unwindFailure } from "@/core/validation/failure-unwind";
import { randomUUID } from "node:crypto";

import type { RecordRepo } from "./record.repo";
import type { ConfigurationChange, ConfigurationPreview, DeletionReference } from "./configuration.schema";
import type { RecordModel } from "./record-model.schema";
import type { RecordConfigurationService } from "./configuration.service";
import type { RecordConfigurationWriter } from "./record-configuration-writer";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { TrashItem, TrashRepo } from "@/features/trash/trash.repo";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { TrashPurgeBlockedError } from "@/features/trash/trash-purge-blocked";
import { purgeOperationIdOf } from "@/features/trash/trash-purge-marker";
import { RECORD_SYSTEM_ACTOR } from "./record-system-actor";
import { RecordJournal } from "./record-journal";
import { systemRecordAccess } from "./system-record-access";

const SETTLED_OPERATION_STATES = ["completed", "cancelled", "failed"];

function inTrash(model: RecordModel, reference: DeletionReference): boolean {
  const typeArchived = (typeId: string) => model.types.find((type) => type.id === typeId)?.archived ?? false;
  if (reference.kind === "type") return typeArchived(reference.id);
  if (reference.kind === "field") {
    const field = model.fields.find((candidate) => candidate.id === reference.id);
    return Boolean(field && (field.archived || typeArchived(field.typeId)));
  }
  if (reference.kind === "relationship")
    return model.relationships.find((relation) => relation.id === reference.id)?.archived ?? false;
  return false;
}

function purgeBlocked(preview: ConfigurationPreview, model: RecordModel): TrashPurgeBlockedError {
  const blockers = preview.deletion?.blockers ?? [];
  const reasons = [...new Set([...preview.issues.map((issue) => issue.code), ...blockers.map(({ reason }) => reason)])];
  const waitsForTrash =
    preview.issues.length === 0 && blockers.length > 0 && blockers.every(({ source }) => inTrash(model, source));
  const failure = unwindFailure(CustomErrorCode.recordConfigurationInvalid);
  return new TrashPurgeBlockedError(failure.message, reasons, waitsForTrash, { cause: failure.cause });
}

export class ConfigurationSystemPurge {
  constructor(
    private records: RecordRepo,
    private configurations: RecordConfigurationService,
    private writer: RecordConfigurationWriter,
    private trash: Pick<TrashRepo, "markPurgePending">,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async deletePermanently(item: TrashItem, change: ConfigurationChange, companyId: string): Promise<void> {
    const pendingId = purgeOperationIdOf(item.payload);
    if (pendingId) {
      const operation = await this.records.getOperation(pendingId);
      if (operation && !SETTLED_OPERATION_STATES.includes(operation.state)) return;
    }
    const activeOperationId = (await this.records.getState())?.activeOperationId;
    if (activeOperationId) {
      if ((await this.records.getOperation(activeOperationId))?.userId === RECORD_SYSTEM_ACTOR) return;
      throw unwindFailure(CustomErrorCode.recordWritePaused, "conflict");
    }
    const current = await this.records.getModel();
    const prepared = await this.configurations.prepare(
      change,
      current,
      await systemRecordAccess(this.records, companyId),
    );
    if (!prepared.preview.valid) throw purgeBlocked(prepared.preview, current);
    if (prepared.preview.execution === "background") {
      const operationId = randomUUID();
      await this.records.createOperation({
        id: operationId,
        userId: RECORD_SYSTEM_ACTOR,
        kind: "configuration",
        expectedRevision: current.revision,
        request: change,
        stagedSchema: prepared.model,
      });
      await this.records.stageRow(operationId, "context", "cause", { kind: "system", operationId });
      await this.trash.markPurgePending(item.id, operationId);
      await this.background.dispatch("record-operation", { operationId, system: { companyId } });
      return;
    }
    const journal = new RecordJournal(this.records, current);
    await this.writer.withRepository(journal.repository).apply(prepared, current, null);
    await journal.flush(prepared.model, null, change.idempotencyKey, { kind: "system" });
  }
}
