import type { PermissionService } from "@/core/base/permission.service";
import type { Prisma } from "@/generated/prisma";

import { Resource } from "@/generated/prisma";

export function userAccessWhere(permissions: PermissionService): Prisma.UserWhereInput {
  const { companyId } = permissions;
  switch (permissions.readScope(Resource.users)) {
    case "all":
      return { companyId };
    case "own":
      return { id: permissions.userId, companyId };
    case "none":
      return { id: { in: [] }, companyId };
  }
}
