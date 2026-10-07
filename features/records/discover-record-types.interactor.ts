import { z } from "zod";
import { CHIP_COLORS } from "@/constants/chip-colors";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const DiscoverRecordTypesSchema = z
  .object({
    typeIds: z.array(z.uuid()).max(100).optional(),
    search: z.string().trim().max(200).optional(),
    includeEmbedded: z.boolean().default(false),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export const DiscoveredRecordTypesSchema = z
  .object({
    schemaRevision: z.number().int(),
    canManageSchema: z.boolean(),
    canPublishSummary: z.boolean().optional(),
    total: z.number().int(),
    types: z.array(
      z
        .object({
          id: z.uuid(),
          label: z.string(),
          pluralLabel: z.string(),
          description: z.string(),
          icon: z.string(),
          color: z.enum(CHIP_COLORS).optional(),
          embedded: z.boolean(),
          fieldCount: z.number().int(),
          recordCount: z.number().int().nonnegative().nullable(),
          permittedActions: z.array(z.enum(["create", "readOwn", "readAll", "update", "delete"])),
        })
        .strict(),
    ),
  })
  .strict();

export type DiscoveredRecordTypes = z.infer<typeof DiscoveredRecordTypesSchema>;

@AllowInDemoMode
@TenantInteractor()
export class DiscoverRecordTypesInteractor extends AuthenticatedInteractor<
  z.infer<typeof DiscoverRecordTypesSchema>,
  z.infer<typeof DiscoveredRecordTypesSchema>
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }
  @Validate(DiscoverRecordTypesSchema)
  async invoke(
    input: z.infer<typeof DiscoverRecordTypesSchema>,
  ): Validated<z.infer<typeof DiscoveredRecordTypesSchema>> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const search = input.search?.toLocaleLowerCase();
        const types = model.types.filter(
          (type) =>
            !type.archived &&
            (!input.typeIds || input.typeIds.includes(type.id)) &&
            (input.includeEmbedded || !type.embedded) &&
            (policy.canManageSchema || policy.canManageRoles || policy.canReadType(type.id)) &&
            (!search ||
              [type.label, type.pluralLabel, type.description].some((label) =>
                label.toLocaleLowerCase().includes(search),
              )),
        );
        const page = types.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
        const readable = page
          .filter((type) => policy.allowed(type.id, "readOwn") || policy.allowed(type.id, "readAll"))
          .map((type) => type.id);
        const counts = new Map(
          (await this.records.countReadableRecordsByType(policy.access(readable))).map((row) => [
            row.typeId,
            row.count,
          ]),
        );
        return {
          ok: true as const,
          data: {
            schemaRevision: model.revision,
            canManageSchema: policy.canManageSchema,
            canPublishSummary: policy.isAdmin,
            total: types.length,
            types: page.map((type) => ({
              id: type.id,
              label: type.label,
              pluralLabel: type.pluralLabel,
              description: type.description,
              icon: type.icon,
              ...(type.color ? { color: type.color } : {}),
              embedded: type.embedded,
              fieldCount: model.fields.filter((field) => field.typeId === type.id && !field.archived).length,
              recordCount: readable.includes(type.id) ? (counts.get(type.id) ?? 0) : null,
              permittedActions: (["create", "readOwn", "readAll", "update", "delete"] as const).filter((action) =>
                policy.allowed(type.id, action),
              ),
            })),
          },
        };
      },
      { readOnly: true },
    );
  }
}
