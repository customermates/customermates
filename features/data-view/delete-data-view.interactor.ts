import type { DeleteDataViewSelectionRepo } from "./delete-data-view-selection.repo";
import type { DeleteDataViewRepo } from "./delete-data-view.repo";
import type { DataViewPolicy } from "./data-view-policy";
import { validateDataViewAccess } from "./data-view-policy";
import type { DeleteDataViewData, DeleteDataViewResult } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DeleteDataViewResultSchema, DeleteDataViewSchema } from "./data-view.schema";

@TenantInteractor()
export class DeleteDataViewInteractor extends AuthenticatedInteractor<DeleteDataViewData, DeleteDataViewResult> {
  constructor(
    private repo: DeleteDataViewRepo,
    private selection: DeleteDataViewSelectionRepo,
    private policy?: DataViewPolicy,
  ) {
    super();
  }

  @Enforce(DeleteDataViewSchema)
  @Transaction
  @ValidateOutput(DeleteDataViewResultSchema)
  async invoke({ id }: DeleteDataViewData): Validated<DeleteDataViewResult> {
    const view = await this.repo.findOwnedOrNull(id);
    if (!view) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    const invalid = await validateDataViewAccess(this.policy, view.surfaceKey);
    if (invalid) return fail(invalid);

    const deleted = await this.repo.deleteOwned(id);

    if (!deleted) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    await this.selection.clearActiveViewKeyIfMatches({
      p13nId: view.surfaceKey,
      expectedActiveViewKey: id,
    });

    return { ok: true as const, data: { id } };
  }
}
