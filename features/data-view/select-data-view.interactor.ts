import type { SelectDataViewData, SelectDataViewResult } from "./data-view.schema";
import type { DataViewDto } from "@/core/data-view/data-view-state.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { SelectDataViewResultSchema, SelectDataViewSchema } from "./data-view.schema";

export abstract class ActiveViewKeyRepo {
  abstract upsertP13n(data: { p13nId: string; activeViewKey: string }): Promise<unknown>;
}

export abstract class SelectDataViewRepo {
  abstract findOwnedOrNull(id: string): Promise<DataViewDto | null>;
}

@TenantInteractor()
export class SelectDataViewInteractor extends AuthenticatedInteractor<SelectDataViewData, SelectDataViewResult> {
  constructor(
    private views: SelectDataViewRepo,
    private personalization: ActiveViewKeyRepo,
  ) {
    super();
  }

  @Write({ input: SelectDataViewSchema, output: SelectDataViewResultSchema })
  async invoke({ surfaceKey, viewKey }: SelectDataViewData): Validated<SelectDataViewResult> {
    if (viewKey !== ALL_VIEW_KEY) {
      const view = await this.views.findOwnedOrNull(viewKey);
      if (!view || view.surfaceKey !== surfaceKey) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewKey"]);
    }

    await this.personalization.upsertP13n({ p13nId: surfaceKey, activeViewKey: viewKey });

    return { ok: true as const, data: { activeViewKey: viewKey } };
  }
}
