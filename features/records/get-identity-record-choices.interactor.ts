import { RecordRefSchema } from "./record-model.schema";
import { presetId } from "./crm-preset";
import { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordIdentityReference } from "./record-identity-reference.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { identityReference } from "./record-identity-reader";
import { recordWriteFailure } from "./mutate-record.interactor";

export const IdentityRecordChoicesSchema = z
  .object({
    search: z.string().trim().max(200).default(""),
    refs: z
      .array(z.union([RecordRefSchema, z.uuid()]))
      .max(100)
      .optional(),
  })
  .strict();
export type IdentityRecordCreateChoice = { typeId: string; label: string; nameFieldIds: string[] };
export type IdentityRecordChoices = {
  records: RecordIdentityReference[];
  createTypes: IdentityRecordCreateChoice[];
  schemaRevision: number;
  canManage: boolean;
};

@AllowInDemoMode
@TenantInteractor()
export class GetIdentityRecordChoicesInteractor extends AuthenticatedInteractor<
  z.infer<typeof IdentityRecordChoicesSchema>,
  IdentityRecordChoices
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(IdentityRecordChoicesSchema)
  async invoke(input: z.infer<typeof IdentityRecordChoicesSchema>): Validated<IdentityRecordChoices> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const bindings = model.capabilities.filter(
          (binding) =>
            binding.kind === "channels" &&
            binding.enabled !== false &&
            model.types.some((type) => type.id === binding.typeId && !type.archived),
        );
        const typeIds = bindings.map((binding) => binding.typeId);
        try {
          const rows = typeIds.length
            ? await this.records.searchRecords(
                input.refs
                  ? {
                      refs: input.refs
                        .map((ref) =>
                          typeof ref === "string"
                            ? { typeId: presetId(this.companyId, "contact"), recordId: ref }
                            : ref,
                        )
                        .filter((ref) => typeIds.includes(ref.typeId)),
                    }
                  : { search: { searchTerm: input.search, typeIds, limit: 10, cursor: null } },
                model,
                policy.access(typeIds),
              )
            : [];
          const createTypes = bindings.flatMap((binding) => {
            const type = model.types.find((type) => type.id === binding.typeId);
            if (
              !type ||
              !policy.allowed(type.id, "create") ||
              (!policy.allowed(type.id, "readAll") && !policy.allowed(type.id, "readOwn"))
            )
              return [];
            const fields = model.fields.filter((field) => field.typeId === type.id && !field.archived);
            const primary = fields.find((field) => field.id === type.primaryFieldId);
            const named =
              primary?.behavior.kind === "input"
                ? [primary]
                : ["firstName", "lastName"].flatMap((role) => {
                    const id = binding.fields.find((field) => field.role === role)?.fieldId;
                    const field = fields.find((field) => field.id === id && field.behavior.kind === "input");
                    return field ? [field] : [];
                  });
            if (
              !named.length ||
              named.some((field) => field.valueType !== "text") ||
              fields.some(
                (field) =>
                  field.required &&
                  field.behavior.kind === "input" &&
                  !field.behavior.defaultValue &&
                  !named.some((name) => name.id === field.id),
              )
            )
              return [];
            return [{ typeId: type.id, label: type.label, nameFieldIds: named.map((field) => field.id) }];
          });
          return {
            ok: true,
            data: {
              records: rows
                .slice(0, 10)
                .map((row) => identityReference(row, model, policy.allowed(row.typeId, "update"))),
              createTypes,
              schemaRevision: model.revision,
              canManage:
                createTypes.length > 0 ||
                typeIds.some(
                  (typeId) =>
                    policy.allowed(typeId, "update") &&
                    (policy.allowed(typeId, "readAll") || policy.allowed(typeId, "readOwn")),
                ),
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
