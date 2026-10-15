import type { z } from "zod";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { MutateRecordInteractor } from "@/features/records/mutate-record.interactor";
import type { WorkspaceSetupRecord } from "./workspace-setup.schema";

import { createHash } from "node:crypto";

import { setupIdempotencyKey } from "@/features/workspace-setup/setup-references";

const DELETE_BATCH = 100;

export type SetupCleanupOutcome = { ok: true; removed: number } | { ok: false; error: z.ZodError };

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export class WorkspaceSetupCleanupService {
  constructor(
    private records: Pick<RecordRepo, "getModel" | "getRecordsCompanyWide">,
    private mutate: Pick<MutateRecordInteractor, "invoke">,
  ) {}

  async removeRecords(setup: WorkspaceSetupRecord, refs: RecordRef[], label: string): Promise<SetupCleanupOutcome> {
    const live = (await this.records.getRecordsCompanyWide(refs)).filter((record) => !record.deletedAt);
    const model = await this.records.getModel();
    let removed = 0;
    for (let start = 0; start < live.length; start += DELETE_BATCH) {
      const targets = live.slice(start, start + DELETE_BATCH).map((record) => ({
        ref: { typeId: record.typeId, recordId: record.id },
        expectedVersion: record.version,
      }));
      const result = await this.mutate.invoke({
        expectedRevision: model.revision,
        idempotencyKey: setupIdempotencyKey(setup.id, `${label}:${digest(targets)}`),
        mutation: { action: "deleteMany", targets },
      });
      if (!result.ok) return { ok: false, error: result.error };
      removed += targets.length;
    }
    return { ok: true, removed };
  }
}
