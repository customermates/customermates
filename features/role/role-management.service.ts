import type { RecordRevisionChange } from "@/features/records/record-revision.schema";
import { z } from "zod";
import type { UpsertRoleRepo } from "./upsert-role.repo";
import type { DeleteRoleRepo } from "./delete-role.repo";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordConfigurationService } from "@/features/records/configuration.service";
import type { RecordConfigurationWriter } from "@/features/records/record-configuration-writer";
import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { EventService } from "@/features/event/event.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { UpsertRoleData, DeleteRoleData, RoleMutationResult, RoleEditorContext } from "./role-management.schema";
import { RoleMutationResultSchema } from "./role-management.schema";
import { RolePermissionsDtoSchema } from "./role.schema";
import { UserAccessor } from "@/core/base/user-accessor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "@/features/records/record-write.service";
import { recordRequestHash, recordWriteFailure } from "@/features/records/mutate-record.interactor";
import { DomainEvent } from "@/features/event/domain-events";
import { calculateChanges } from "@/core/utils/calculate-changes";

const storedResult = RoleMutationResultSchema.extend({
  role: RolePermissionsDtoSchema.extend({ createdAt: z.coerce.date(), updatedAt: z.coerce.date() }),
});

export class RoleManagementService extends UserAccessor {
  constructor(
    private roles: UpsertRoleRepo & DeleteRoleRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private configurations: RecordConfigurationService,
    private writer: RecordConfigurationWriter,
    private events: EventService,
  ) {
    super();
  }

  read(id?: string, typeIds?: string[]): Validated<RoleEditorContext> {
    return runInTransaction(
      async () => {
        try {
          const policy = await this.policy.load();
          if (
            !policy.actor ||
            !(policy.canManageRoles || policy.canReadSystem("users") || policy.allowedSystem("users", "create"))
          )
            throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
          const model = await this.records.getModel();
          if (typeIds?.some((id) => !model.types.some((type) => type.id === id && !type.embedded)))
            throw new RecordWriteError(CustomErrorCode.recordTypeNotFound, "not_found");
          const role = id ? await this.roles.findRoleById(id) : null;
          if (id && !role) throw new RecordWriteError(CustomErrorCode.roleNotFound, "not_found");
          const mutable = !role || (!role.isSystemRole && role.id !== policy.actor.role?.id);
          const usedByPreset = model.accessPresets.some((preset) => preset.grants.some((grant) => grant.roleId === id));
          return {
            ok: true as const,
            data: {
              schemaRevision: model.revision,
              role:
                role && typeIds
                  ? { ...role, recordGrants: role.recordGrants?.filter((grant) => typeIds.includes(grant.typeId)) }
                  : role,
              canEdit: mutable && policy.allowedSystem("users", role ? "update" : "create"),
              canDelete: Boolean(
                role &&
                  mutable &&
                  policy.allowedSystem("users", "delete") &&
                  !usedByPreset &&
                  !(await this.roles.hasUsersAssigned(role.id)),
              ),
              types: model.types
                .filter((type) => !type.embedded && (!typeIds || typeIds.includes(type.id)))
                .map((type) => ({ id: type.id, label: type.pluralLabel, archived: type.archived })),
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }

  upsert(input: UpsertRoleData): Validated<RoleMutationResult> {
    return runInTransaction(
      async (): Validated<RoleMutationResult> => {
        try {
          const policy = await this.policy.load();
          if (!policy.actor || !policy.allowedSystem("users", input.id ? "update" : "create"))
            throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
          const hash = recordRequestHash({ kind: "roleUpsert", input });
          const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
          if (receipt) {
            if (receipt.requestHash !== hash)
              throw new RecordWriteError(CustomErrorCode.recordIdempotencyConflict, "conflict");
            return { ok: true, data: storedResult.parse(receipt.result) };
          }
          const model = await this.currentModel(input.expectedRevision);
          const previous = input.id ? await this.roles.findRoleById(input.id) : null;
          if (input.id && !previous) throw new RecordWriteError(CustomErrorCode.roleNotFound, "not_found");
          if (input.id === policy.actor.role?.id)
            throw new RecordWriteError(CustomErrorCode.roleSelfEditForbidden, "authorization");
          if (previous?.isSystemRole) throw new RecordWriteError(CustomErrorCode.roleSystemImmutable, "conflict");
          if (
            input.recordGrants.some((grant) => !model.types.some((type) => type.id === grant.typeId && !type.embedded))
          )
            throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
          const saved = await this.roles.upsertRoleOrThrow(input);
          const currentGrants = await this.records.getGrants();
          const operations: ConfigurationChange["operations"] = [];
          for (const { typeId, actions } of input.recordGrants) {
            const before =
              currentGrants.find((grant) => grant.typeId === typeId && grant.roleId === saved.id)?.actions ?? [];
            if ([...actions].sort().join() === [...before].sort().join()) continue;
            operations.push({
              operation: "setTypeGrants",
              typeId,
              grants: [
                ...currentGrants
                  .filter((grant) => grant.typeId === typeId && grant.roleId !== saved.id)
                  .map(({ roleId, actions }) => ({ roleId, actions })),
                ...(actions.length ? [{ roleId: saved.id, actions }] : []),
              ],
            });
          }
          const change: RecordRevisionChange = {
            version: 1,
            source: { kind: "role", roleId: saved.id, action: previous ? "update" : "create" },
            causeId: input.idempotencyKey,
            expectedRevision: model.revision,
            references: [],
            grants: [],
          };
          if (operations.length) {
            const prepared = await this.configurations.prepare(
              { expectedRevision: model.revision, idempotencyKey: input.idempotencyKey, operations },
              model,
              policy,
            );
            prepared.change.source = change.source;
            await this.writer.apply(prepared, model, this.userId, await this.records.getWorkspaceCurrencyOrThrow());
          } else await this.records.saveModel({ ...model, revision: model.revision + 1 }, this.userId, change);
          const role = await this.roles.getRoleByIdOrThrow(saved.id);
          if (previous) {
            await this.events.publish(DomainEvent.ROLE_UPDATED, {
              entityId: role.id,
              payload: { role, changes: calculateChanges(previous, role) },
            });
          } else await this.events.publish(DomainEvent.ROLE_CREATED, { entityId: role.id, payload: role });
          const data = { role, schemaRevision: model.revision + 1 };
          await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, data);
          return { ok: true, data };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { timeout: 30000 },
    );
  }

  delete(input: DeleteRoleData): Validated<string> {
    return runInTransaction(
      async (): Validated<string> => {
        try {
          const policy = await this.policy.load();
          if (!policy.actor || !policy.allowedSystem("users", "delete"))
            throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
          const hash = recordRequestHash({ kind: "roleDelete", input });
          const receipt = await this.records.receipt(input.idempotencyKey, this.userId);
          if (receipt) {
            if (receipt.requestHash !== hash)
              throw new RecordWriteError(CustomErrorCode.recordIdempotencyConflict, "conflict");
            return { ok: true, data: z.string().parse(receipt.result) };
          }
          const model = await this.currentModel(input.expectedRevision);
          const role = await this.roles.findRoleById(input.id);
          if (!role) throw new RecordWriteError(CustomErrorCode.roleNotFound, "not_found");
          if (role.id === policy.actor.role?.id)
            throw new RecordWriteError(CustomErrorCode.roleSelfEditForbidden, "authorization");
          if (role.isSystemRole) throw new RecordWriteError(CustomErrorCode.roleSystemImmutable, "conflict");
          if (await this.roles.hasUsersAssigned(role.id))
            throw new RecordWriteError(CustomErrorCode.roleAssignedCannotDelete, "conflict");
          if (model.accessPresets.some((preset) => preset.grants.some((grant) => grant.roleId === role.id)))
            throw new RecordWriteError(CustomErrorCode.roleAccessPresetInUse, "conflict");
          const previousGrants = await this.records.getGrants();
          const typeIds = new Set(
            previousGrants.filter((grant) => grant.roleId === role.id).map((grant) => grant.typeId),
          );
          await this.roles.deleteRoleOrThrow(role.id);
          await this.records.saveModel({ ...model, revision: model.revision + 1 }, this.userId, {
            version: 1,
            source: { kind: "role", roleId: role.id, action: "delete" },
            causeId: input.idempotencyKey,
            expectedRevision: model.revision,
            references: [],
            grants: [...typeIds].map((typeId) => {
              const before = previousGrants
                .filter((grant) => grant.typeId === typeId)
                .map(({ roleId, actions }) => ({ roleId, actions }));
              return { typeId, before, after: before.filter((grant) => grant.roleId !== role.id) };
            }),
          });
          await this.events.publish(DomainEvent.ROLE_DELETED, { entityId: role.id, payload: role });
          await this.records.saveReceipt(input.idempotencyKey, this.userId, hash, role.id);
          return { ok: true, data: role.id };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { timeout: 30000 },
    );
  }

  private async currentModel(expectedRevision: number) {
    if ((await this.records.getState())?.activeOperationId)
      throw new RecordWriteError(CustomErrorCode.recordWritePaused, "conflict");
    const model = await this.records.getModel();
    if (!model.revision) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    if (model.revision !== expectedRevision)
      throw new RecordWriteError(CustomErrorCode.recordSchemaChanged, "conflict");
    return model;
  }
}
