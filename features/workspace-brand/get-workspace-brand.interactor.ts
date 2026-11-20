import type { Validated } from "@/core/validation/validation.utils";
import type { WorkspaceBrandRepo } from "./workspace-brand.repo";
import type { WorkspaceBrand } from "./workspace-brand.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { NO_BRAND, WorkspaceBrandSchema, publicBrand } from "./workspace-brand.schema";

@TenantInteractor()
export class GetWorkspaceBrandInteractor extends AuthenticatedInteractor<void, WorkspaceBrand> {
  constructor(private readonly repo: Pick<WorkspaceBrandRepo, "find">) {
    super();
  }

  @ValidateOutput(WorkspaceBrandSchema)
  async invoke(): Validated<WorkspaceBrand> {
    return { ok: true as const, data: publicBrand(await this.repo.find()) ?? NO_BRAND };
  }
}
