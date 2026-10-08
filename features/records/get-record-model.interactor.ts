import type { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordModelView } from "./record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { liveRecordModel } from "./record-model-snapshot";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { resolveRecordPath } from "./record-relationship-path";
import { visibleFormulaFields } from "./record-formula-visibility";
import { GetModelSchema } from "./configure-records.interactor";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordModelInteractor extends AuthenticatedInteractor<z.infer<typeof GetModelSchema>, RecordModelView> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }
  @Validate(GetModelSchema)
  async invoke(input: z.infer<typeof GetModelSchema>): Validated<RecordModelView> {
    return runInTransaction(
      async () => {
        const [stored, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        const model = liveRecordModel(stored);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const accessible = new Set(
          model.types
            .filter((type) => policy.canManageSchema || policy.canManageRoles || policy.canReadType(type.id))
            .map((type) => type.id),
        );
        const types = model.types
          .filter((type) => accessible.has(type.id) && (!input.typeIds || input.typeIds.includes(type.id)))
          .map((type) => ({
            ...type,
            relationshipPaths: (type.relationshipPaths ?? []).filter((path) => {
              const steps = resolveRecordPath(type.id, path.path, model);
              return (
                policy.canManageSchema ||
                policy.canManageRoles ||
                (steps && steps.every((step) => accessible.has(step.typeId)))
              );
            }),
          }));
        const ids = new Set(types.map((type) => type.id));
        const pathRelations = new Set(
          types.flatMap(
            (type) => type.relationshipPaths?.flatMap((path) => path.path.map((step) => step.relationId)) ?? [],
          ),
        );
        return {
          ok: true as const,
          data: {
            ...model,
            types,
            fields: visibleFormulaFields(
              model.fields.filter((field) => ids.has(field.typeId)),
              model,
              policy,
            ),
            accessPresets: policy.canManageSchema || policy.canManageRoles ? model.accessPresets : [],
            capabilities: model.capabilities.filter((binding) => ids.has(binding.typeId)),
            relationships: model.relationships.filter(
              (relation) =>
                accessible.has(relation.sourceTypeId) &&
                accessible.has(relation.targetTypeId) &&
                (ids.has(relation.sourceTypeId) || ids.has(relation.targetTypeId) || pathRelations.has(relation.id)),
            ),
          },
        };
      },
      { readOnly: true },
    );
  }
}
