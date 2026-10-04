import type { GetCompanySettingsRepo } from "./get-company-settings.repo";
import { Action, Currency, Resource } from "@/generated/prisma";
import { z } from "zod";
import type { Company } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const OutputSchema = z.object({ id: z.string(), currency: z.enum(Currency), createdAt: z.date(), updatedAt: z.date() });
export type CompanySettings = Company;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetCompanySettingsInteractor extends AuthenticatedInteractor<void, CompanySettings> {
  constructor(private repo: GetCompanySettingsRepo) {
    super();
  }
  @ValidateOutput(OutputSchema)
  async invoke(): Promise<{ ok: true; data: CompanySettings }> {
    return { ok: true, data: await this.repo.getDetails() };
  }
}
