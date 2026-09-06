import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { PersonalizationStateWrite } from "./data-view-row-mapping";
import type { SaveDataViewStateData, SaveDataViewStateResult } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { writePersonalizationState } from "./data-view-row-mapping";
import { SaveDataViewStateResultSchema, SaveDataViewStateSchema } from "./data-view.schema";

export abstract class DataViewStateWriteRepo {
  abstract updateOwnedState(args: { id: string; surfaceKey: string; state: DataViewState }): Promise<boolean>;
}

export abstract class AllTabStateRepo {
  abstract upsertP13n(data: PersonalizationStateWrite & { p13nId: string }): Promise<unknown>;
}

@TenantInteractor()
export class SaveDataViewStateInteractor extends AuthenticatedInteractor<
  SaveDataViewStateData,
  SaveDataViewStateResult
> {
  constructor(
    private views: DataViewStateWriteRepo,
    private personalization: AllTabStateRepo,
  ) {
    super();
  }

  @Validate(SaveDataViewStateSchema)
  @Transaction
  @ValidateOutput(SaveDataViewStateResultSchema)
  async invoke({ surfaceKey, viewKey, state }: SaveDataViewStateData): Validated<SaveDataViewStateResult> {
    if (viewKey === ALL_VIEW_KEY) {
      await this.personalization.upsertP13n({ p13nId: surfaceKey, ...writePersonalizationState(state) });

      return { ok: true as const, data: { viewKey } };
    }

    const updated = await this.views.updateOwnedState({ id: viewKey, surfaceKey, state });

    if (!updated) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewKey"]);

    return { ok: true as const, data: { viewKey } };
  }
}
