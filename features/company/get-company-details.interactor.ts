import { z } from "zod";
import { Resource, Action, CountryCode, Currency, SalesType } from "@/generated/prisma";

import type { Company } from "@/generated/prisma";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const CompanyDtoSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  country: z.enum(CountryCode),
  currency: z.enum(Currency),
  street: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  vatNumber: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  salesType: z.enum(SalesType).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export abstract class GetCompanyDetailsRepo {
  abstract getDetails(): Promise<Company>;
}

@AllowInDemoMode
@TentantInteractor({ resource: Resource.company, action: Action.readOwn })
export class GetCompanyDetailsInteractor extends BaseInteractor<void, Company> {
  constructor(private repo: GetCompanyDetailsRepo) {
    super();
  }

  @ValidateOutput(CompanyDtoSchema)
  async invoke(): Promise<{ ok: true; data: Company }> {
    return { ok: true as const, data: await this.repo.getDetails() };
  }
}
