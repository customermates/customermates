import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { PublicFormSettings } from "./public-form-dto";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormRepo } from "./public-form.repo";
import type { GetPublicFormEditorData, PublicFormEditor } from "./public-form.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { rolePermits } from "@/core/base/permission.service";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { Action, Resource } from "@/generated/prisma";

import { formFieldOptions, formPeopleLists } from "./public-form-config-validation";
import { readPublicFormUsage, toPublicFormDto } from "./public-form-dto";
import { GetPublicFormEditorSchema, PublicFormEditorSchema } from "./public-form.schema";

@TenantInteractor()
export class GetPublicFormEditorInteractor extends AuthenticatedInteractor<GetPublicFormEditorData, PublicFormEditor> {
  constructor(
    private repo: PublicFormRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private quota: PublicFormQuota,
    private settings: PublicFormSettings,
  ) {
    super();
  }

  @Validate(GetPublicFormEditorSchema)
  @ValidateOutput(PublicFormEditorSchema)
  async invoke(data: GetPublicFormEditorData): Validated<PublicFormEditor> {
    const [model, policy, workspaceAllows] = await Promise.all([
      this.records.getModel(),
      this.policy.load(),
      this.repo.publicLinksAllowed(),
    ]);
    const type = model.types.find((entry) => entry.id === data.typeId && !entry.archived);
    if (!type || !policy.actor || !policy.canReadType(type.id))
      return failNotFound(CustomErrorCode.recordTypeNotFound, ["typeId"]);

    const permitted =
      rolePermits(this.user.role, Resource.publicLinks, Action.create) && policy.allowed(type.id, "create");
    if (!permitted || !workspaceAllows) {
      return {
        ok: true as const,
        data: {
          typeLabel: type.label,
          form: null,
          fields: [],
          peopleLists: [],
          allowed: false,
          reason: !workspaceAllows ? ("workspaceDisabled" as const) : ("permissionDenied" as const),
        },
      };
    }

    const stored = await this.repo.findFormOfType(type.id);
    const usage = await readPublicFormUsage(this.repo, this.quota, this.settings.now?.() ?? new Date());
    return {
      ok: true as const,
      data: {
        typeLabel: type.label,
        form: stored ? toPublicFormDto(stored, usage, this.settings) : null,
        fields: formFieldOptions(model, type.id),
        peopleLists: formPeopleLists(model, type.id),
        allowed: true,
        reason: null,
      },
    };
  }
}
