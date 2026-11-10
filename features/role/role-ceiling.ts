import type { Action } from "@/generated/prisma";
import type { RecordAccessPolicy } from "@/features/records/record-access";

type Policy = Pick<Awaited<ReturnType<RecordAccessPolicy["load"]>>, "isAdmin" | "allowed" | "allowedSystem">;

export type CeilingRole = {
  isSystemRole?: boolean;
  permissions: ReadonlyArray<{ resource: string; action: Action }>;
  recordGrants?: ReadonlyArray<{ typeId: string; actions: readonly Action[] }>;
};

function covered(has: (action: Action) => boolean, action: Action) {
  return has(action) || (action === "readOwn" && has("readAll"));
}

export function roleExceedsCaller(policy: Policy, role: CeilingRole, previous?: CeilingRole | null): boolean {
  if (policy.isAdmin) return false;
  if (role.isSystemRole) return true;
  const permissionHeld = (resource: string, action: Action) =>
    covered(
      (next) =>
        previous?.permissions.some((permission) => permission.resource === resource && permission.action === next) ??
        false,
      action,
    );
  const grantHeld = (typeId: string, action: Action) =>
    covered(
      (next) =>
        previous?.recordGrants?.some((grant) => grant.typeId === typeId && grant.actions.includes(next)) ?? false,
      action,
    );
  return (
    role.permissions.some(
      ({ resource, action }) =>
        !permissionHeld(resource, action) && !covered((next) => policy.allowedSystem(resource, next), action),
    ) ||
    (role.recordGrants ?? []).some(({ typeId, actions }) =>
      actions.some((action) => !grantHeld(typeId, action) && !covered((next) => policy.allowed(typeId, next), action)),
    )
  );
}
