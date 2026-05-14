import type { CustomColumnDto } from "./custom-column.schema";

import { CustomColumnDtoSchema } from "./custom-column.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetCustomColumnsRepo {
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetCustomColumnsInteractor extends AuthenticatedInteractor<void, CustomColumnDto[]> {
  constructor(private repo: GetCustomColumnsRepo) {
    super();
  }

  @ValidateOutput(CustomColumnDtoSchema)
  async invoke(): Promise<{ ok: true; data: CustomColumnDto[] }> {
    return { ok: true as const, data: await this.repo.getCustomColumns() };
  }
}
