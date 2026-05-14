import { CompanyWidgetsResultSchema } from "./widget.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

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
@TenantInteractor()
export class GetCompanyWidgetsInteractor extends AuthenticatedInteractor<void, { widgets: CompanyWidget[] }> {
  constructor(private repo: GetCompanyWidgetsRepo) {
    super();
  }

  @ValidateOutput(CompanyWidgetsResultSchema)
  async invoke(): Promise<{ ok: true; data: { widgets: CompanyWidget[] } }> {
    return { ok: true as const, data: { widgets: await this.repo.getCompanyWidgets() } };
  }
}
