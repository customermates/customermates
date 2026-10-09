import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { CommandCatalogRepo } from "./command-catalog.repo";
import type { CommandCatalog } from "./command-catalog.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { CommandCatalogSchema } from "./command-catalog.schema";

@AllowInDemoMode
@TenantInteractor()
export class GetCommandCatalogInteractor extends AuthenticatedInteractor<void, CommandCatalog> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private catalog: CommandCatalogRepo,
  ) {
    super();
  }

  @ValidateOutput(CommandCatalogSchema)
  async invoke(): Validated<CommandCatalog> {
    return runInTransaction(
      async () => {
        const [model, policy, views] = await Promise.all([
          this.records.getModel(),
          this.policy.load(),
          this.catalog.listRecordViewNames(),
        ]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const navigable = new Set(
          model.types
            .filter((type) => !type.archived && !type.embedded && type.navigationVisible && policy.canReadType(type.id))
            .map((type) => type.id),
        );
        return {
          ok: true as const,
          data: {
            schemaRevision: model.revision,
            views: views.filter((view) => navigable.has(view.typeId)),
            fields: policy.canManageSchema
              ? model.fields
                  .filter((field) => !field.archived && navigable.has(field.typeId))
                  .map((field) => ({ typeId: field.typeId, id: field.id, label: field.label }))
              : [],
          },
        };
      },
      { readOnly: true },
    );
  }
}
