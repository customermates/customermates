import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordRepo } from "@/features/records/record.repo";
import type { PublicFormAccess } from "./public-form-access";
import type { PublicFormQuota } from "./public-form-quota";
import type { PublicFormReadResult } from "./public-form.schema";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { PUBLIC_FORM_UNAVAILABLE } from "./public-form-access";
import { presentPublicForm } from "./public-form-presentation";
import { renderToken } from "./public-form-render-token";

@AllowInDemoMode
@SystemInteractor
export class ReadPublicFormInteractor {
  constructor(
    private access: PublicFormAccess,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private quota: PublicFormQuota,
  ) {}

  invoke({ token, visitor }: { token: string; visitor?: string | null }): Promise<PublicFormReadResult> {
    return this.access.open(token, visitor, "view", async (form, config): Promise<PublicFormReadResult> => {
      const [model, policy, limits] = await Promise.all([
        this.records.getModel(),
        this.policy.load(),
        this.quota.limits(form.companyId),
      ]);
      if (!policy.actor || !policy.allowed(form.typeId, "create")) return PUBLIC_FORM_UNAVAILABLE;
      if (!model.types.some((type) => type.id === form.typeId && !type.archived)) return PUBLIC_FORM_UNAVAILABLE;
      return {
        status: "available",
        form: presentPublicForm({
          config,
          typeId: form.typeId,
          modelFields: model.fields,
          workspaceName: form.company.name,
          badge: limits.badge,
          renderToken: renderToken(form.id, this.access.now(), this.access.authSecret),
        }),
      };
    });
  }
}
