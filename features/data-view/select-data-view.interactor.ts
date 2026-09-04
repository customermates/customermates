import type { SelectDataViewData, SelectDataViewResult } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { SelectDataViewResultSchema, SelectDataViewSchema } from "./data-view.schema";

export abstract class ActiveViewKeyRepo {
  abstract upsertP13n(data: { p13nId: string; activeViewKey: string }): Promise<unknown>;
}

@TenantInteractor()
export class SelectDataViewInteractor extends AuthenticatedInteractor<SelectDataViewData, SelectDataViewResult> {
  constructor(private repo: ActiveViewKeyRepo) {
    super();
  }

  @Enforce(SelectDataViewSchema)
  @ValidateOutput(SelectDataViewResultSchema)
  async invoke({ surfaceKey, viewKey }: SelectDataViewData): Validated<SelectDataViewResult> {
    await this.repo.upsertP13n({ p13nId: surfaceKey, activeViewKey: viewKey });

    return { ok: true as const, data: { activeViewKey: viewKey } };
  }
}
