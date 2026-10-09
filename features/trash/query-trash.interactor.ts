import type { RecordRepo } from "@/features/records/record.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { QueryTrashSchema, type QueryTrashData, type TrashPage } from "./trash.schema";
import { trashVisibility } from "./trash-handlers";
import { trashDaysLeft } from "./trash-retention";

@AllowInDemoMode
@TenantInteractor()
export class QueryTrashInteractor extends AuthenticatedInteractor<QueryTrashData, TrashPage> {
  constructor(
    private trash: TrashRepo,
    private records: RecordRepo,
    private handlers: TrashKindHandler[],
  ) {
    super();
  }

  @Validate(QueryTrashSchema)
  async invoke(input: QueryTrashData): Validated<TrashPage> {
    return runInTransaction(
      async () => {
        const [model, visibility] = await Promise.all([this.records.getModel(), trashVisibility(this.handlers)]);
        const page = await this.trash.list({ ...input, visibility });
        const deletedBy = await this.trash.deletedBy(
          page.items.flatMap((item) => (item.deletedById ? [item.deletedById] : [])),
        );
        return {
          ok: true as const,
          data: {
            total: page.total,
            items: page.items.map((item) => {
              const type = model.types.find((candidate) => candidate.id === item.typeId);
              return {
                id: item.id,
                kind: item.kind,
                targetId: item.targetId,
                typeId: item.typeId,
                surfaceKey: item.surfaceKey,
                label: item.label,
                listLabel: type?.pluralLabel ?? null,
                icon: type?.icon ?? null,
                color: type?.color ?? null,
                deletedBy: item.deletedById ? (deletedBy.get(item.deletedById) ?? null) : null,
                deletedAt: item.deletedAt.toISOString(),
                expiresAt: item.expiresAt.toISOString(),
                daysLeft: trashDaysLeft(item.expiresAt),
                batchId: item.batchId,
              };
            }),
          },
        };
      },
      { readOnly: true },
    );
  }
}
