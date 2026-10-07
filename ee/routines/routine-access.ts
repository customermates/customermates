import type { PermissionService, ScopedResource } from "@/core/base/permission.service";
import type { Prisma } from "@/generated/prisma";

import { Resource } from "@/generated/prisma";

const routines: ScopedResource<Prisma.RoutineWhereInput> = {
  resource: Resource.routines,
  ownWhere: (userId) => ({ ownerUserId: userId }),
};

export function routineAccessWhere(permissions: PermissionService): Prisma.RoutineWhereInput {
  return permissions.accessWhere(routines);
}
