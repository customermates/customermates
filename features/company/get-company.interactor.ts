import type { GetCompanyRepo } from "./get-company.repo";
import { Resource } from "@/generated/prisma";
import { z } from "zod";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const CompanySchema = z.object({ id: z.string(), createdAt: z.date(), updatedAt: z.date() });
export type CompanyDto = z.infer<typeof CompanySchema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, read: true })
export class GetCompanyInteractor extends AuthenticatedInteractor<void, CompanyDto> {
  constructor(private repo: GetCompanyRepo) {
    super();
  }
  @ValidateOutput(CompanySchema)
  async invoke(): Promise<{ ok: true; data: CompanyDto }> {
    return { ok: true, data: await this.repo.findCompanyOrThrow() };
  }
}
