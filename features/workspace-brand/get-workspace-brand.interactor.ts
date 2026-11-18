import type { Validated } from "@/core/validation/validation.utils";
import type { WorkspaceBrandRepo } from "./workspace-brand.repo";
import type { WorkspaceBrand } from "./workspace-brand.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { WorkspaceBrandSchema, publicBrand } from "./workspace-brand.schema";

@TenantInteractor()
export class GetWorkspaceBrandInteractor extends AuthenticatedInteractor<void, WorkspaceBrand> {
  constructor(private readonly repo: Pick<WorkspaceBrandRepo, "find">) {
    super();
  }

  @ValidateOutput(WorkspaceBrandSchema)
  async invoke(): Validated<WorkspaceBrand> {
    const brand = publicBrand(await this.repo.find());
    return { ok: true as const, data: brand ?? { accentColor: null, logoUrl: null } };
  }
}
