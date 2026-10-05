import type { Action, RecordTypeGrant } from "@/generated/prisma";
import type { RecordActor, RecordActorRepo, RecordRepo, StoredRecord } from "./record.repo";
import type { RecordAccessMap, RecordReadScope } from "./record-query.schema";

import type { RecordModel } from "./record-model.schema";

import { rolePermits, roleReadScope } from "@/core/base/permission.service";
import { UserAccessor } from "@/core/base/user-accessor";

export class RecordAccessPolicy extends UserAccessor {
  constructor(
    private actors: RecordActorRepo,
    private records: RecordRepo,
  ) {
    super();
  }

  async load() {
    const [actor, grants, model] = await Promise.all([
      this.actors.getCurrentRecordActorCompanyWide(),
      this.records.getGrants(),
      this.records.getModel(),
    ]);
    return recordAccessForActor({
      actor,
      grants,
      model,
      records: this.records,
      companyId: this.companyId,
      userId: this.userId,
    });
  }

  async validAssignees(actor: RecordActor | null, ids: string[], canAssignOthers: boolean): Promise<boolean> {
    if (!actor || (!canAssignOthers && ids.some((id) => id !== actor.id))) return false;
    return (await this.actors.findRecordAssigneesCompanyWide([...new Set(ids)])).length === new Set(ids).size;
  }
}

export function recordAccessForActor({
  actor,
  grants,
  model,
  records,
  companyId,
  userId,
}: {
  actor: RecordActor | null;
  grants: RecordTypeGrant[];
  model: RecordModel;
  records: Pick<RecordRepo, "linkedRecordsCompanyWide" | "getRecordCompanyWide">;
  companyId: string;
  userId: string;
}) {
  const valid = actor?.id === userId && actor.status === "active" && actor.role?.companyId === companyId;
  const role = valid ? actor.role : null;
  const isAdmin = role?.isSystemRole === true;
  const activeTypeIds = new Set(model.types.filter((type) => !type.archived).map((type) => type.id));
  const parentOf = (typeId: string) =>
    model.relationships.find(
      (relation) =>
        relation.id === model.types.find((type) => type.id === typeId)?.parentRelationshipId && !relation.archived,
    );
  const allowed = (typeId: string, action: Action, depth = 0): boolean => {
    if (isAdmin) return true;
    if (depth > 12) return false;
    const parent = parentOf(typeId);
    if (parent) {
      return allowed(
        parent.targetTypeId,
        ["create", "update", "delete"].includes(action) ? "update" : action,
        depth + 1,
      );
    }
    return Boolean(
      role &&
        grants.some(
          (grant) =>
            grant.companyId === companyId &&
            grant.typeId === typeId &&
            grant.roleId === role.id &&
            grant.actions.includes(action),
        ),
    );
  };
  const scopeFor = (typeId: string, depth = 0): RecordReadScope => {
    if (depth > 12 || !activeTypeIds.has(typeId)) return { userId: userId, access: "none" };
    const access = allowed(typeId, "readAll") ? "all" : allowed(typeId, "readOwn") ? "own" : "none";
    const parent = !isAdmin && parentOf(typeId);
    return {
      userId: userId,
      access,
      ...(parent
        ? {
            parent: {
              relationId: parent.id,
              typeId: parent.targetTypeId,
              scope: scopeFor(parent.targetTypeId, depth + 1),
            },
          }
        : {}),
    };
  };
  const canRead = async (record: StoredRecord, depth = 0): Promise<boolean> => {
    if (depth > 12 || !valid || record.companyId !== companyId || !activeTypeIds.has(record.typeId)) return false;
    if (isAdmin) return true;
    const parent = parentOf(record.typeId);
    if (parent) {
      const refs = await records.linkedRecordsCompanyWide(
        { typeId: record.typeId, recordId: record.id },
        parent.id,
        "outgoing",
        1,
      );
      const row = refs[0] ? await records.getRecordCompanyWide(refs[0]) : null;
      return row !== null && canRead(row, depth + 1);
    }
    return (
      allowed(record.typeId, "readAll") ||
      (allowed(record.typeId, "readOwn") && record.assignments.some((assignment) => assignment.userId === userId))
    );
  };
  const resourceAllowed = (resource: string, action: Action) => rolePermits(role, resource, action);
  return {
    actor: valid ? actor : null,
    isAdmin,
    allowed,
    allowedSystem: resourceAllowed,
    canManageSchema: resourceAllowed("dataModel", "update"),
    canAssignOthers: resourceAllowed("users", "readAll"),
    memberScope: { userId: userId, access: roleReadScope(role, "users") } as RecordReadScope,
    canManageRoles: resourceAllowed("users", "create") && resourceAllowed("users", "update"),
    access: (typeIds: string[]): RecordAccessMap => new Map(typeIds.map((typeId) => [typeId, scopeFor(typeId)])),
    canRead,
  };
}
