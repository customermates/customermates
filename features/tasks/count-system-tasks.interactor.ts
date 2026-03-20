import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class CountSystemTasksRepo {
  abstract getSystemTasksCount(): Promise<number>;
}

@AllowInDemoMode
@TentantInteractor()
export class CountSystemTasksInteractor {
  constructor(private repo: CountSystemTasksRepo) {}

  async invoke(): Promise<number> {
    return await this.repo.getSystemTasksCount();
  }
}
