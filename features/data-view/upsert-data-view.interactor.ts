import type { UpsertDataViewRepo } from "./upsert-data-view.repo";
import type { DataViewPolicy } from "./data-view-policy";
import { validateDataViewAccess } from "./data-view-policy";
import type { DataViewDto } from "@/core/data-view/data-view-state.schema";
import type { ActiveViewKeyRepo } from "./active-view-key.repo";
import type { UpsertDataViewData } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DataViewDtoSchema } from "@/core/data-view/data-view-state.schema";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { UpsertDataViewSchema } from "./data-view.schema";

type UpdateDataViewData = Extract<UpsertDataViewData, { id: string }>;
type CreateDataViewData = Exclude<UpsertDataViewData, { id: string }>;

@TenantInteractor()
export class UpsertDataViewInteractor extends AuthenticatedInteractor<UpsertDataViewData, DataViewDto> {
  constructor(
    private repo: UpsertDataViewRepo,
    private personalization: ActiveViewKeyRepo,
    private policy?: DataViewPolicy,
  ) {
    super();
  }

  @Validate(UpsertDataViewSchema)
  @Transaction
  @ValidateOutput(DataViewDtoSchema)
  async invoke(data: UpsertDataViewData): Validated<DataViewDto> {
    const invalid = await validateDataViewAccess(this.policy, data.surfaceKey, data.state);
    if (invalid) return fail(invalid);

    const view = "id" in data ? await this.updateExisting(data) : await this.createNew(data);

    if (!view) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    return { ok: true as const, data: view };
  }

  private async updateExisting(data: UpdateDataViewData) {
    const id = data.id;
    const owned = await this.repo.findOwnedOrNull(id);
    if (!owned || owned.surfaceKey !== data.surfaceKey) return null;

    return this.repo.updateOwned({
      id,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
    });
  }

  private async createNew(data: CreateDataViewData) {
    const position = data.position ?? (await this.repo.nextPosition(data.surfaceKey));

    const created = await this.repo.createView({
      surfaceKey: data.surfaceKey,
      name: data.name,
      position,
      state: data.state,
    });

    await this.personalization.upsertP13n({
      p13nId: data.surfaceKey,
      activeViewKey: created.id,
    });

    return created;
  }
}
