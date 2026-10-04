import type { AllTabStateRepo } from "./all-tab-state.repo";
import type { DataViewStateWriteRepo } from "./data-view-state-write.repo";
import type { DataViewPolicy } from "./data-view-policy";
import { validateDataViewAccess } from "./data-view-policy";
import type { SaveDataViewStateData, SaveDataViewStateResult } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { readPersonalizationState, writePersonalizationState } from "./data-view-row-mapping";
import { SaveDataViewStateResultSchema, SaveDataViewStateSchema } from "./data-view.schema";

@TenantInteractor()
export class SaveDataViewStateInteractor extends AuthenticatedInteractor<
  SaveDataViewStateData,
  SaveDataViewStateResult
> {
  constructor(
    private views: DataViewStateWriteRepo,
    private personalization: AllTabStateRepo,
    private policy?: DataViewPolicy,
  ) {
    super();
  }

  @Validate(SaveDataViewStateSchema)
  @Transaction
  @ValidateOutput(SaveDataViewStateResultSchema)
  async invoke({ surfaceKey, viewKey, state }: SaveDataViewStateData): Validated<SaveDataViewStateResult> {
    const invalid = await validateDataViewAccess(this.policy, surfaceKey, state);
    if (invalid) return fail(invalid);

    if (viewKey === ALL_VIEW_KEY) {
      const persisted = await this.personalization.upsertP13n({
        p13nId: surfaceKey,
        ...writePersonalizationState(state),
      });

      return {
        ok: true as const,
        data: { viewKey, state: readPersonalizationState(persisted) },
      };
    }

    const updated = await this.views.updateOwnedState({
      id: viewKey,
      surfaceKey,
      state,
    });

    if (!updated) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewKey"]);

    return { ok: true as const, data: { viewKey } };
  }
}
