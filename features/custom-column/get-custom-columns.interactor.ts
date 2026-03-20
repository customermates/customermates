import { CustomColumnDto } from "./custom-column.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class GetCustomColumnsRepo {
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TentantInteractor()
export class GetCustomColumnsInteractor {
  constructor(private repo: GetCustomColumnsRepo) {}

  async invoke(): Promise<CustomColumnDto[]> {
    return await this.repo.getCustomColumns();
  }
}
