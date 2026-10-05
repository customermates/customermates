import type { PermissionService } from "@/core/base/permission.service";
import type { Prisma } from "@/generated/prisma";

import { Resource } from "@/generated/prisma";

export function routineAccessWhere(permissions: PermissionService): Prisma.RoutineWhereInput {
  const { companyId } = permissions;
  switch (permissions.readScope(Resource.routines)) {
    case "all":
      return { companyId };
    case "own":
      return { companyId, ownerUserId: permissions.userId };
    case "none":
      return { id: { in: [] }, companyId };
  }
}
