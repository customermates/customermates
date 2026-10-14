import type { RecordRepo } from "./record.repo";
import { compareRecordKey } from "./record-json";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordNavigation } from "./record-navigation.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordNavigationInteractor extends AuthenticatedInteractor<void, RecordNavigation> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  async invoke(): Validated<RecordNavigation> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        return {
          ok: true,
          data: {
            companyId: this.companyId,
            schemaRevision: model.revision,
            canManageSchema: policy.canManageSchema,
            types: model.types
              .filter(
                (type) => !type.archived && !type.embedded && type.navigationVisible && policy.canReadType(type.id),
              )
              .sort((a, b) => a.position - b.position || compareRecordKey(a.id, b.id))
              .map((type) => ({
                id: type.id,
                label: type.label,
                pluralLabel: type.pluralLabel,
                icon: type.icon,
                canCreate: policy.allowed(type.id, "create"),
                hasAuthorizationTasks: model.capabilities.some(
                  (binding) => binding.typeId === type.id && binding.kind === "membershipAuthorization",
                ),
              })),
          },
        };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
