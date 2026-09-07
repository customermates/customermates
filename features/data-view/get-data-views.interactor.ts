import type { DataViewDto } from "@/core/data-view/data-view-state.schema";
import type { GetDataViewsData } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DataViewDtoSchema } from "@/core/data-view/data-view-state.schema";
import { GetDataViewsSchema } from "./data-view.schema";

export abstract class GetDataViewsRepo {
  abstract listDataViews(surfaceKey: string): Promise<DataViewDto[]>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetDataViewsInteractor extends AuthenticatedInteractor<GetDataViewsData, DataViewDto[]> {
  constructor(private repo: GetDataViewsRepo) {
    super();
  }

  @Enforce(GetDataViewsSchema)
  @ValidateOutput(DataViewDtoSchema)
  async invoke({ surfaceKey }: GetDataViewsData): Validated<DataViewDto[]> {
    return { ok: true as const, data: await this.repo.listDataViews(surfaceKey) };
  }
}
