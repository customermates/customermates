import type { Validated } from "@/core/validation/validation.utils";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { GetRecordEditorInteractor, RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import type { TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";
import type { TrashedRecordInfo } from "./trash.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { RecordTrashService } from "@/features/records/record-trash.service";
import { trashVisibility } from "./trash-handlers";
import { trashDaysLeft } from "./trash-retention";

export type TrashedRecordEditor = RecordEditorResult & { trash: TrashedRecordInfo };

@AllowInDemoMode
@TenantInteractor()
export class GetTrashedRecordInteractor extends AuthenticatedInteractor<RecordRef, TrashedRecordEditor> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private editor: GetRecordEditorInteractor,
    private trash: TrashRepo,
    private handlers: TrashKindHandler[],
  ) {
    super();
  }

  @Validate(RecordRefSchema)
  async invoke(ref: RecordRef): Validated<TrashedRecordEditor> {
    return runInTransaction(
      async (): Validated<TrashedRecordEditor> => {
        const record = await this.records.getRecordCompanyWide(ref, { includeTrash: true });
        if (!record?.trashItemId) return failNotFound(CustomErrorCode.recordNotFound);
        const [item] = await this.trash.find({ ids: [record.trashItemId] }, await trashVisibility(this.handlers));
        if (!item) return failNotFound(CustomErrorCode.recordNotFound);
        const editor = await this.editor.read(ref, { includeTrash: true });
        if (!editor.ok) return editor;
        const [model, policy, stored] = await Promise.all([
          this.records.getModel(),
          this.policy.load(),
          this.records.getRecordTrashItemsCompanyWide({ ids: [item.id] }),
        ]);
        const selections = model.relationships.flatMap((relation) =>
          relation.archived
            ? []
            : [
                ...(relation.sourceTypeId === ref.typeId
                  ? [{ relationId: relation.id, direction: "outgoing" as const, limit: 25 }]
                  : []),
                ...(relation.targetTypeId === ref.typeId
                  ? [{ relationId: relation.id, direction: "incoming" as const, limit: 25 }]
                  : []),
              ],
        );
        const relationships = editor.data.record
          ? ((
              await this.records.relationshipSummaries(
                ref.typeId,
                [ref.recordId],
                selections,
                model,
                policy.access(model.types.filter((type) => !type.archived).map((type) => type.id)),
                { includeTrash: true },
              )
            ).get(ref.recordId) ?? [])
          : [];
        const service = new RecordTrashService(this.records);
        const deletedBy = item.deletedById
          ? ((await this.trash.deletedBy([item.deletedById])).get(item.deletedById) ?? null)
          : null;
        return {
          ok: true as const,
          data: {
            ...editor.data,
            record: editor.data.record ? { ...editor.data.record, relationships } : null,
            permittedActions: [],
            systemActions: [],
            trash: {
              itemId: item.id,
              deletedAt: item.deletedAt.toISOString(),
              expiresAt: item.expiresAt.toISOString(),
              daysLeft: trashDaysLeft(item.expiresAt),
              deletedBy,
              canRestore: Boolean(stored[0]) && (await service.accessible(stored[0], model, policy)) === null,
            },
          },
        };
      },
      { readOnly: true },
    );
  }
}
