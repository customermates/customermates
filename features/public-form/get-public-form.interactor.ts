import type { Validated } from "@/core/validation/validation.utils";
import type { PublicFormSettings } from "./public-form-dto";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormRepo } from "./public-form.repo";
import type { GetPublicFormData, PublicFormDto } from "./public-form.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Resource } from "@/generated/prisma";

import { readPublicFormUsage, toPublicFormDto } from "./public-form-dto";
import { GetPublicFormSchema, PublicFormDtoSchema } from "./public-form.schema";

@TenantInteractor({ resource: Resource.publicLinks, manage: "create" })
export class GetPublicFormInteractor extends AuthenticatedInteractor<GetPublicFormData, PublicFormDto> {
  constructor(
    private repo: PublicFormRepo,
    private quota: PublicFormQuota,
    private settings: PublicFormSettings,
  ) {
    super();
  }

  @Validate(GetPublicFormSchema)
  @ValidateOutput(PublicFormDtoSchema)
  async invoke(data: GetPublicFormData): Validated<PublicFormDto> {
    const form = await this.repo.findForm(data.id);
    if (!form) return failNotFound(CustomErrorCode.publicFormNotFound, ["id"]);
    const usage = await readPublicFormUsage(this.repo, this.quota, this.settings.now?.() ?? new Date());
    const dto = toPublicFormDto(form, usage, this.settings);
    if (!dto) return failNotFound(CustomErrorCode.publicFormNotFound, ["id"]);
    return { ok: true as const, data: dto };
  }
}
