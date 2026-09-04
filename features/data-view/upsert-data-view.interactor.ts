import type { DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { DataViewVisibility as DataViewVisibilityType } from "@/generated/prisma";
import type { DataViewOverrideWriteRepo } from "./apply-data-view-override.interactor";
import type { ActiveViewKeyRepo } from "./select-data-view.interactor";
import type { UpsertDataViewData } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { DataViewVisibility } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DataViewDtoSchema } from "@/core/data-view/data-view-state.schema";
import { isShareableSurface } from "@/core/data-view/data-view-keys";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { UpsertDataViewSchema } from "./data-view.schema";

export abstract class UpsertDataViewRepo {
  abstract findOwnedOrNull(id: string): Promise<DataViewDto | null>;
  abstract nextPosition(surfaceKey: string): Promise<number>;
  abstract createView(args: {
    surfaceKey: string;
    name: string;
    visibility: DataViewVisibilityType;
    position: number;
    state: DataViewState;
  }): Promise<DataViewDto>;
  abstract updateOwned(args: {
    id: string;
    name?: string;
    visibility?: DataViewVisibilityType;
    position?: number;
    state?: DataViewState;
  }): Promise<DataViewDto | null>;
}

@TenantInteractor()
export class UpsertDataViewInteractor extends AuthenticatedInteractor<UpsertDataViewData, DataViewDto> {
  constructor(
    private repo: UpsertDataViewRepo,
    private overrides: DataViewOverrideWriteRepo,
    private personalization: ActiveViewKeyRepo,
  ) {
    super();
  }

  @Validate(UpsertDataViewSchema)
  @Transaction
  @ValidateOutput(DataViewDtoSchema)
  async invoke(data: UpsertDataViewData): Validated<DataViewDto> {
    const view = data.id ? await this.updateExisting(data) : await this.createNew(data);

    if (!view) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    return { ok: true as const, data: view };
  }

  private async updateExisting(data: UpsertDataViewData) {
    const id = data.id as string;
    const owned = await this.repo.findOwnedOrNull(id);
    if (!owned || owned.surfaceKey !== data.surfaceKey) return null;

    const updated = await this.repo.updateOwned({
      id,
      name: data.name,
      visibility: isShareableSurface(owned.surfaceKey) ? data.visibility : DataViewVisibility.private,
      position: data.position,
      state: data.state,
    });
    if (!updated) return null;

    if (data.commitFromOverride) await this.overrides.deleteOverride({ surfaceKey: data.surfaceKey, viewKey: id });

    if (data.fromViewKey && data.fromViewKey !== id)
      await this.overrides.deleteOverride({ surfaceKey: data.surfaceKey, viewKey: data.fromViewKey });

    return updated;
  }

  private async createNew(data: UpsertDataViewData) {
    const visibility = isShareableSurface(data.surfaceKey)
      ? (data.visibility ?? DataViewVisibility.private)
      : DataViewVisibility.private;
    const position = data.position ?? (await this.repo.nextPosition(data.surfaceKey));

    const created = await this.repo.createView({
      surfaceKey: data.surfaceKey,
      name: data.name,
      visibility,
      position,
      state: data.state,
    });

    if (data.fromViewKey) {
      await this.overrides.deleteOverride({ surfaceKey: data.surfaceKey, viewKey: data.fromViewKey });
      await this.personalization.upsertP13n({ p13nId: data.surfaceKey, activeViewKey: created.id });
    }

    return created;
  }
}
