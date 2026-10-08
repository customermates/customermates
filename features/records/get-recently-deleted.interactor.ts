import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ConfigurationTargetSchema } from "./configuration.schema";
import { deletionReference, targetKey } from "./configuration-lifecycle";

export const RecentlyDeletedSchema = z
  .object({
    schemaRevision: z.number().int(),
    items: z.array(
      z
        .object({
          target: ConfigurationTargetSchema,
          label: z.string(),
          typeId: z.uuid().nullable(),
          typeLabel: z.string().nullable(),
          deletedAt: z.string().nullable(),
          deletedBy: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type RecentlyDeleted = z.infer<typeof RecentlyDeletedSchema>;

export const ReadRecentlyDeletedSchema = z.object({}).strict();

@AllowInDemoMode
@TenantInteractor()
export class GetRecentlyDeletedInteractor extends AuthenticatedInteractor<
  z.infer<typeof ReadRecentlyDeletedSchema>,
  RecentlyDeleted
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(ReadRecentlyDeletedSchema)
  async invoke(_input: z.infer<typeof ReadRecentlyDeletedSchema>): Validated<RecentlyDeleted> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor || !policy.canManageSchema) return failAuthorization(CustomErrorCode.permissionDenied);
        const deletions = await this.records.getConfigurationDeletions();
        const archivedTypes = new Set(model.types.filter((type) => type.archived).map((type) => type.id));
        const deletedNow = (target: { kind: string; id: string }) =>
          (target.kind === "type" ? model.types : target.kind === "field" ? model.fields : model.relationships).some(
            (item) => item.id === target.id && item.archived,
          ) ||
          model.capabilities.some(
            (binding) => target.kind === "channels" && binding.id === target.id && binding.enabled === false,
          );
        const hiddenSince = new Map<string, number>();
        for (const deletion of deletions.values()) {
          if (!deletedNow(deletion.target)) continue;
          for (const key of deletion.cascade.map(targetKey))
            hiddenSince.set(key, Math.max(hiddenSince.get(key) ?? 0, deletion.deletedAt.getTime()));
        }
        const cascaded = new Set(
          [...hiddenSince].flatMap(([key, since]) =>
            (deletions.get(key)?.deletedAt.getTime() ?? 0) <= since ? [key] : [],
          ),
        );
        const targets = [
          ...model.types.filter((type) => type.archived).map((type) => ({ kind: "type" as const, id: type.id })),
          ...model.fields
            .filter((field) => field.archived && !archivedTypes.has(field.typeId))
            .map((field) => ({ kind: "field" as const, id: field.id })),
          ...model.relationships
            .filter((relation) => relation.archived)
            .map((relation) => ({ kind: "relationship" as const, id: relation.id })),
          ...model.capabilities
            .filter(
              (binding) =>
                binding.kind === "channels" && binding.enabled === false && !archivedTypes.has(binding.typeId),
            )
            .map((binding) => ({ kind: "channels" as const, id: binding.id })),
        ].filter((target) => !cascaded.has(targetKey(target)));
        const records = targets.map((target) => deletions.get(targetKey(target)));
        const names = await this.records.getUserNamesCompanyWide(
          records.flatMap((record) => (record ? [record.actorId] : [])),
        );
        const items = targets
          .map((target, index) => {
            const reference = deletionReference(model, target);
            const record = records[index];
            return {
              target,
              label: reference.label,
              typeId: target.kind === "type" ? null : (reference.typeId ?? null),
              typeLabel:
                target.kind === "type"
                  ? null
                  : (model.types.find((type) => type.id === reference.typeId)?.pluralLabel ?? null),
              deletedAt: record?.deletedAt.toISOString() ?? null,
              deletedBy: record ? (names.get(record.actorId) ?? null) : null,
            };
          })
          .sort((left, right) => ((right.deletedAt ?? "") > (left.deletedAt ?? "") ? 1 : -1));
        return { ok: true as const, data: { schemaRevision: model.revision, items } };
      },
      { readOnly: true },
    );
  }
}
