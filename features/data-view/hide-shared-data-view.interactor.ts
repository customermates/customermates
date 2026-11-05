import type { HideSharedDataViewRepo } from "./hide-shared-data-view.repo";
import type { ActiveViewKeyRepo } from "./active-view-key.repo";
import type { HideSharedDataViewData, HideSharedDataViewResult } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { HideSharedDataViewResultSchema, HideSharedDataViewSchema } from "./data-view.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@TenantInteractor()
export class HideSharedDataViewInteractor extends AuthenticatedInteractor<
  HideSharedDataViewData,
  HideSharedDataViewResult
> {
  constructor(
    private repo: HideSharedDataViewRepo,
    private personalization: ActiveViewKeyRepo,
  ) {
    super();
  }

  @Write({ input: HideSharedDataViewSchema, output: HideSharedDataViewResultSchema })
  async invoke({ id, hidden }: HideSharedDataViewData): Validated<HideSharedDataViewResult> {
    const view = await this.repo.findSharedWithMeOrNull(id);
    if (!view) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    await this.repo.setSharedHidden(id, hidden);
    if (hidden) await this.personalization.upsertP13n({ p13nId: view.surfaceKey, activeViewKey: ALL_VIEW_KEY });

    return { ok: true as const, data: { id, hidden } };
  }
}
