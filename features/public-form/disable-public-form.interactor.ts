import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { PublicFormSettings } from "./public-form-dto";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormRepo } from "./public-form.repo";
import type { DisablePublicFormData, DisabledPublicFormDto } from "./public-form.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Resource } from "@/generated/prisma";

import { readPublicFormUsage, toDisabledPublicFormDto } from "./public-form-dto";
import { DisablePublicFormSchema, DisabledPublicFormDtoSchema } from "./public-form.schema";

@TenantInteractor({ resource: Resource.publicLinks, manage: "create" })
export class DisablePublicFormInteractor extends AuthenticatedInteractor<DisablePublicFormData, DisabledPublicFormDto> {
  constructor(
    private repo: PublicFormRepo,
    private policy: RecordAccessPolicy,
    private quota: PublicFormQuota,
    private settings: PublicFormSettings,
  ) {
    super();
  }

  @Write({ input: DisablePublicFormSchema, output: DisabledPublicFormDtoSchema })
  async invoke(data: DisablePublicFormData): Validated<DisabledPublicFormDto> {
    const [existing, policy] = await Promise.all([this.repo.findForm(data.id), this.policy.load()]);
    if (!existing) return failNotFound(CustomErrorCode.publicFormNotFound, ["id"]);
    if (!policy.actor || !policy.allowed(existing.typeId, "create"))
      return failAuthorization(CustomErrorCode.permissionDenied, ["id"]);
    const saved = existing.enabled ? await this.repo.updateForm(data.id, { enabled: false }) : existing;
    const usage = await readPublicFormUsage(this.repo, this.quota, this.settings.now?.() ?? new Date());
    return { ok: true as const, data: toDisabledPublicFormDto(saved, usage, this.settings) };
  }
}
