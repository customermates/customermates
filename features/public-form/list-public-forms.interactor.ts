import type { Validated } from "@/core/validation/validation.utils";
import type { PublicFormSettings } from "./public-form-dto";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormRepo } from "./public-form.repo";
import type { ListPublicFormsData, PublicFormListResult } from "./public-form.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Resource } from "@/generated/prisma";

import { readPublicFormUsage, toPublicFormDto } from "./public-form-dto";
import { ListPublicFormsSchema, PublicFormListResultSchema } from "./public-form.schema";

@TenantInteractor({ resource: Resource.publicLinks, manage: "create" })
export class ListPublicFormsInteractor extends AuthenticatedInteractor<ListPublicFormsData, PublicFormListResult> {
  constructor(
    private repo: PublicFormRepo,
    private quota: PublicFormQuota,
    private settings: PublicFormSettings,
  ) {
    super();
  }

  @Validate(ListPublicFormsSchema)
  @ValidateOutput(PublicFormListResultSchema)
  async invoke(data: ListPublicFormsData): Validated<PublicFormListResult> {
    const [forms, usage] = await Promise.all([
      this.repo.listForms(data.typeId),
      readPublicFormUsage(this.repo, this.quota, this.settings.now?.() ?? new Date()),
    ]);
    const items = forms.flatMap((form) => toPublicFormDto(form, usage, this.settings) ?? []);
    return { ok: true as const, data: { items } };
  }
}
