import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidateWidgetIdsInteractor } from "@/core/validation/validators/validate-widget-ids.interactor";
import type { TrashRepo } from "@/features/trash/trash.repo";
import type { DeleteWidgetRepo } from "./delete-widget.repo";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteWidgetData = Data<typeof Schema>;

const DeleteWidgetResultSchema = z.object({ id: z.uuid(), trashBatchId: z.uuid() });
export type DeleteWidgetResult = Data<typeof DeleteWidgetResultSchema>;

@TenantInteractor()
export class DeleteWidgetInteractor extends AuthenticatedInteractor<DeleteWidgetData, DeleteWidgetResult> {
  constructor(
    private repo: DeleteWidgetRepo,
    private validator: ValidateWidgetIdsInteractor,
    private trash: TrashRepo,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: DeleteWidgetResultSchema,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: DeleteWidgetData): Validated<DeleteWidgetResult> {
    const widget = await this.repo.trashWidget(data.id);
    if (!widget) return failNotFound(CustomErrorCode.widgetNotFound, ["id"]);
    const trashBatchId = randomUUID();
    await this.trash.add([
      {
        id: randomUUID(),
        kind: "widget",
        targetId: data.id,
        typeId: null,
        ownerUserId: this.userId,
        label: widget.name,
        deletedById: this.userId,
        batchId: trashBatchId,
      },
    ]);
    return { ok: true as const, data: { id: data.id, trashBatchId } };
  }
}
