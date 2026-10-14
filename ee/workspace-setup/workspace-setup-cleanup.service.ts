import type { z } from "zod";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { ApplyRecordConfigurationInteractor } from "@/features/records/configure-records.interactor";
import type { MutateRecordInteractor } from "@/features/records/mutate-record.interactor";
import type { DeleteDataViewInteractor } from "@/features/data-view/delete-data-view.interactor";
import type { DeleteWidgetInteractor } from "@/features/widget/delete-widget.interactor";
import type { DeleteWikiPageInteractor } from "@/features/wiki/delete-wiki-page.interactor";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupRecord } from "./workspace-setup.schema";

import { createHash } from "node:crypto";

import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { setupIdempotencyKey } from "@/features/workspace-setup/setup-references";

const DELETE_BATCH = 100;
const OPERATION_POLL_MS = 2_000;
const OPERATION_WAIT_MS = 4 * 60 * 1_000;
const GONE = new Set<CustomErrorCode>([
  CustomErrorCode.widgetNotFound,
  CustomErrorCode.dataViewNotFound,
  CustomErrorCode.wikiPageNotFound,
  CustomErrorCode.recordNotFound,
]);

export type SetupCleanupOutcome = { ok: true; removed: number } | { ok: false; error: z.ZodError };

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function gone(error: z.ZodError) {
  return interactorFailureCodes(error).some((code) => GONE.has(code));
}

export class WorkspaceSetupCleanupService {
  constructor(
    private repo: Pick<WorkspaceSetupRepo, "wikiPages">,
    private records: Pick<RecordRepo, "getModel" | "getRecordsCompanyWide" | "getOperation">,
    private mutate: Pick<MutateRecordInteractor, "invoke">,
    private configure: Pick<ApplyRecordConfigurationInteractor, "invoke">,
    private deleteWidget: Pick<DeleteWidgetInteractor, "invoke">,
    private deleteView: Pick<DeleteDataViewInteractor, "invoke">,
    private deletePage: Pick<DeleteWikiPageInteractor, "invoke">,
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

  async rollback(setup: WorkspaceSetupRecord): Promise<SetupCleanupOutcome> {
    let removed = 0;
    for (const id of setup.created.widgets) {
      const result = await this.deleteWidget.invoke({ id });
      if (!result.ok && !gone(result.error)) return { ok: false, error: result.error };
      if (result.ok) removed += 1;
    }
    const records = await this.removeRecords(
      setup,
      [...setup.created.sampleRecords, ...setup.created.importedRecords],
      "rollback-records",
    );
    if (!records.ok) return records;
    removed += records.removed;
    for (const id of setup.created.views) {
      const result = await this.deleteView.invoke({ id });
      if (!result.ok && !gone(result.error)) return { ok: false, error: result.error };
      if (result.ok) removed += 1;
    }
    const definitions = await this.removeDefinitions(setup);
    if (!definitions.ok) return definitions;
    removed += definitions.removed;
    for (const page of await this.repo.wikiPages(setup.created.pages)) {
      const result = await this.deletePage.invoke({ id: page.id, expectedUpdatedAt: page.updatedAt });
      if (!result.ok && !gone(result.error)) return { ok: false, error: result.error };
      if (result.ok) removed += 1;
    }
    return { ok: true, removed };
  }

  private async removeDefinitions(setup: WorkspaceSetupRecord): Promise<SetupCleanupOutcome> {
    const model = await this.records.getModel();
    const lists = new Set(
      setup.created.lists.filter((id) => model.types.some((type) => type.id === id && !type.archived)),
    );
    const relationships = setup.created.relationships.filter((id) =>
      model.relationships.some(
        (relation) =>
          relation.id === id &&
          !relation.archived &&
          !lists.has(relation.sourceTypeId) &&
          !lists.has(relation.targetTypeId),
      ),
    );
    const fields = setup.created.fields.filter((id) =>
      model.fields.some((field) => field.id === id && !field.archived && !lists.has(field.typeId)),
    );
    const operations = [
      ...relationships.map((id) => ({ operation: "delete" as const, target: { kind: "relationship" as const, id } })),
      ...fields.map((id) => ({ operation: "delete" as const, target: { kind: "field" as const, id } })),
      ...[...lists].map((id) => ({ operation: "delete" as const, target: { kind: "type" as const, id } })),
    ];
    if (operations.length === 0) return { ok: true, removed: 0 };
    const result = await this.configure.invoke({
      expectedRevision: model.revision,
      idempotencyKey: setupIdempotencyKey(setup.id, `rollback-model:${model.revision}`),
      operations,
    });
    if (!result.ok) return { ok: false, error: result.error };
    if (result.data.status === "pending") {
      const deadline = Date.now() + OPERATION_WAIT_MS;
      for (;;) {
        const operation = await this.records.getOperation(result.data.operationId);
        if (operation?.state === "completed") break;
        if (!operation || operation.state === "failed" || operation.state === "cancelled" || Date.now() > deadline)
          throw new Error("The setup's record model could not be removed.");
        await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_MS));
      }
    }
    return { ok: true, removed: operations.length };
  }
}
