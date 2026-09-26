import type { DeleteDataViewData, DeleteDataViewResult } from "./data-view.schema";
import type { DataViewDto } from "@/core/data-view/data-view-state.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DeleteDataViewResultSchema, DeleteDataViewSchema } from "./data-view.schema";

export abstract class DeleteDataViewRepo {
  abstract findOwnedOrNull(id: string): Promise<DataViewDto | null>;
  abstract deleteOwned(id: string): Promise<boolean>;
}

export abstract class DeleteDataViewSelectionRepo {
  abstract clearActiveViewKeyIfMatches(data: { p13nId: string; expectedActiveViewKey: string }): Promise<boolean>;
}

@TenantInteractor()
export class DeleteDataViewInteractor extends AuthenticatedInteractor<DeleteDataViewData, DeleteDataViewResult> {
  constructor(
    private repo: DeleteDataViewRepo,
    private selection: DeleteDataViewSelectionRepo,
  ) {
    super();
  }

  @Enforce(DeleteDataViewSchema)
  @Transaction
  @ValidateOutput(DeleteDataViewResultSchema)
  async invoke({ id }: DeleteDataViewData): Validated<DeleteDataViewResult> {
    const view = await this.repo.findOwnedOrNull(id);
    if (!view) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    const deleted = await this.repo.deleteOwned(id);

    if (!deleted) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    await this.selection.clearActiveViewKeyIfMatches({
      p13nId: view.surfaceKey,
      expectedActiveViewKey: id,
    });

    return { ok: true as const, data: { id } };
  }
}
