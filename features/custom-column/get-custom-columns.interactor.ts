import type { CustomColumnDto } from "./custom-column.schema";

import { CustomColumnDtoSchema } from "./custom-column.schema";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetCustomColumnsRepo {
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TentantInteractor()
export class GetCustomColumnsInteractor extends BaseInteractor<void, CustomColumnDto[]> {
  constructor(private repo: GetCustomColumnsRepo) {
    super();
  }

  @ValidateOutput(CustomColumnDtoSchema)
  async invoke(): Promise<{ ok: true; data: CustomColumnDto[] }> {
    return { ok: true as const, data: await this.repo.getCustomColumns() };
  }
}
