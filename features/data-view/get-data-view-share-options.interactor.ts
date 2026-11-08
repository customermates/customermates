import type { GetDataViewShareOptionsRepo } from "./get-data-view-share-options.repo";
import type { DataViewShareOptions } from "./data-view.schema";

import { DataViewShareOptionsSchema } from "./data-view.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@TenantInteractor()
export class GetDataViewShareOptionsInteractor extends AuthenticatedInteractor<void, DataViewShareOptions> {
  constructor(private repo: GetDataViewShareOptionsRepo) {
    super();
  }

  @ValidateOutput(DataViewShareOptionsSchema)
  async invoke(): Promise<{ ok: true; data: DataViewShareOptions }> {
    return { ok: true as const, data: { roles: await this.repo.listShareableRoles() } };
  }
}
