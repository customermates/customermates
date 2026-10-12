import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordDto } from "@/features/records/record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { ExportRecordsInput } from "./export-records.interactor";

import { getTranslations } from "next-intl/server";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { recordWriteFailure } from "@/features/records/mutate-record.interactor";
import { withMemberUsers } from "@/features/records/query-records.interactor";

import { collectRecordExport, ExportRecordsSchema } from "./export-records.interactor";
import { recordWorkbookRelationships, recordWorkbookSheets, writeRecordWorkbook } from "./record-workbook";

export const RECORD_WORKBOOK_LINK_NAMES = 200;
const SUMMARY_BATCH = 250;

export type RecordWorkbookExport = { typeId: string; fileName: string; rowCount: number; workbook: Buffer };

function fileStem(label: string): string {
  return (
    label
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "records"
  );
}

@AllowInDemoMode
@TenantInteractor()
export class ExportRecordWorkbookInteractor extends AuthenticatedInteractor<ExportRecordsInput, RecordWorkbookExport> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(ExportRecordsSchema)
  async invoke(input: ExportRecordsInput): Validated<RecordWorkbookExport> {
    const [collected, t] = await Promise.all([
      runInTransaction(
        async () => {
          const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
          const exported = await collectRecordExport(this.records, policy, model, input);
          if (!exported.ok) return exported;
          const access = policy.access(model.types.filter((type) => !type.archived).map((type) => type.id));
          const summaries = new Map<string, RecordDto["relationships"]>();
          for (const typeId of new Set(exported.data.records.map((record) => record.ref.typeId))) {
            const selections = recordWorkbookRelationships(model, typeId, policy.canReadType).map(
              ({ relation, direction }) => ({ relationId: relation.id, direction, limit: RECORD_WORKBOOK_LINK_NAMES }),
            );
            if (!selections.length) continue;
            const ids = exported.data.records
              .filter((record) => record.ref.typeId === typeId)
              .map((record) => record.ref.recordId);
            for (let offset = 0; offset < ids.length; offset += SUMMARY_BATCH) {
              const batch = await this.records.relationshipSummaries(
                typeId,
                ids.slice(offset, offset + SUMMARY_BATCH),
                selections,
                model,
                access,
              );
              for (const [recordId, value] of batch) summaries.set(recordId, value);
            }
          }
          const records = await withMemberUsers(
            exported.data.records.map((record) => ({
              ...record,
              relationships: summaries.get(record.ref.recordId) ?? [],
            })),
            this.records,
            policy.memberScope,
          );
          return { ok: true as const, data: { model, records, typeId: exported.data.typeId, policy } };
        },
        { readOnly: true, timeout: 120_000 },
      ).catch(recordWriteFailure),
      getTranslations(),
    ]);
    if (!collected.ok) return collected;
    const { model, records, typeId, policy } = collected.data;
    const sheets = recordWorkbookSheets(
      model,
      typeId,
      records,
      {
        assignedTo: t("RecordModel.assignedTo"),
        createdAt: t("RecordModel.createdAt"),
        updatedAt: t("RecordModel.updatedAt"),
        rangeStart: t("RecordModel.rangeStart"),
        rangeEnd: t("RecordModel.rangeEnd"),
        recordId: t("RecordModel.recordId"),
      },
      policy.canReadType,
    );
    const type = model.types.find((candidate) => candidate.id === typeId);
    return {
      ok: true,
      data: {
        typeId,
        fileName: `${fileStem(type?.pluralLabel ?? "records")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        rowCount: records.length,
        workbook: await writeRecordWorkbook(sheets),
      },
    };
  }
}
