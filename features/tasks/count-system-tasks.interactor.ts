import { z } from "zod";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class CountSystemTasksRepo {
  abstract getSystemTasksCount(): Promise<number>;
}

@AllowInDemoMode
@TentantInteractor()
export class CountSystemTasksInteractor extends BaseInteractor<void, number> {
  constructor(private repo: CountSystemTasksRepo) {
    super();
  }

  @ValidateOutput(z.number())
  async invoke(): Promise<{ ok: true; data: number }> {
    return { ok: true as const, data: await this.repo.getSystemTasksCount() };
  }
}
