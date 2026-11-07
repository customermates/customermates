import type { ShareDataViewRepo } from "./share-data-view.repo";
import type { DataViewPolicy } from "./data-view-policy";
import type { ShareDataViewData } from "./data-view.schema";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { validateDataViewAccess } from "./data-view-policy";
import { ShareDataViewSchema } from "./data-view.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { DataViewChipDtoSchema } from "@/core/data-view/data-view-state.schema";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@TenantInteractor()
export class ShareDataViewInteractor extends AuthenticatedInteractor<ShareDataViewData, DataViewChipDto> {
  constructor(
    private repo: ShareDataViewRepo,
    private policy?: DataViewPolicy,
  ) {
    super();
  }

  @Write({ input: ShareDataViewSchema, output: DataViewChipDtoSchema })
  async invoke({ id, visibility, roleIds }: ShareDataViewData): Validated<DataViewChipDto> {
    const owned = await this.repo.findOwnedOrNull(id);
    if (!owned) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    const invalid = await validateDataViewAccess(this.policy, owned.surfaceKey);
    if (invalid) return fail(invalid);

    const roles = visibility === "roles" ? [...new Set(roleIds)] : [];
    if (roles.length > 0 && (await this.repo.countCompanyRoles(roles)) !== roles.length)
      return failNotFound(CustomErrorCode.roleNotFound, ["roleIds"]);

    const shared = await this.repo.shareOwned({ id, visibility, roleIds: roles });
    if (!shared) return failNotFound(CustomErrorCode.dataViewNotFound, ["id"]);

    return { ok: true as const, data: shared };
  }
}
