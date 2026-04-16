import { CompanyWidgetsResultSchema } from "./widget.schema";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
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
@TentantInteractor()
export class GetCompanyWidgetsInteractor extends BaseInteractor<void, { widgets: CompanyWidget[] }> {
  constructor(private repo: GetCompanyWidgetsRepo) {
    super();
  }

  @ValidateOutput(CompanyWidgetsResultSchema)
  async invoke(): Promise<{ ok: true; data: { widgets: CompanyWidget[] } }> {
    return { ok: true as const, data: { widgets: await this.repo.getCompanyWidgets() } };
  }
}
