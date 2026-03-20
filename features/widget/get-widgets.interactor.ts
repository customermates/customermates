import { ExtendedWidget } from "./widget.types";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class GetWidgetsRepo {
  abstract getWidgets(): Promise<ExtendedWidget[]>;
}

@AllowInDemoMode
@TentantInteractor()
export class GetWidgetsInteractor {
  constructor(private repo: GetWidgetsRepo) {}

  async invoke(): Promise<ExtendedWidget[]> {
    return await this.repo.getWidgets();
  }
}
