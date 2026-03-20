import { Company, Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export abstract class GetCompanyDetailsRepo {
  abstract getDetails(): Promise<Company>;
}

@AllowInDemoMode
@TentantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetCompanyDetailsInteractor {
  constructor(private repo: GetCompanyDetailsRepo) {}

  async invoke(): Promise<Company> {
    return await this.repo.getDetails();
  }
}
