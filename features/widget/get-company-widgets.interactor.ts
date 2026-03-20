import { UserAccessor } from "@/core/base/user-accessor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export type CompanyWidget = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export abstract class GetCompanyWidgetsRepo {
  abstract getCompanyWidgets(): Promise<CompanyWidget[]>;
}

@AllowInDemoMode
@TentantInteractor()
export class GetCompanyWidgetsInteractor extends UserAccessor {
  constructor(private repo: GetCompanyWidgetsRepo) {
    super();
  }

  async invoke(): Promise<{
    widgets: CompanyWidget[];
  }> {
    return { widgets: await this.repo.getCompanyWidgets() };
  }
}
