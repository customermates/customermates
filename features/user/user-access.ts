import type { PermissionService, ScopedResource } from "@/core/base/permission.service";
import type { Prisma } from "@/generated/prisma";

import { Resource } from "@/generated/prisma";

const users: ScopedResource<Prisma.UserWhereInput> = {
  resource: Resource.users,
  ownWhere: (userId) => ({ id: userId }),
};

export function userAccessWhere(permissions: PermissionService): Prisma.UserWhereInput {
  return permissions.accessWhere(users);
}
