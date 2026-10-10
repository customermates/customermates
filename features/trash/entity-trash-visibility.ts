import type { Resource } from "@/generated/prisma";
import type { TrashKind } from "./trash.schema";

import { Action, Prisma } from "@/generated/prisma";
import { rolePermits } from "@/core/base/permission.service";
import { UserAccessor } from "@/core/base/user-accessor";

const kindSql = (kind: TrashKind) => Prisma.raw(`'${kind}'`);

export class EntityTrashVisibility extends UserAccessor {
  owned(kind: TrashKind) {
    return (alias: Prisma.Sql) =>
      Promise.resolve(Prisma.sql`(${alias}.kind = ${kindSql(kind)} AND ${alias}."ownerUserId" = ${this.userId})`);
  }

  permitted(kind: TrashKind, resource: Resource) {
    return (alias: Prisma.Sql) =>
      Promise.resolve(
        rolePermits(this.user.role, resource, Action.delete)
          ? Prisma.sql`${alias}.kind = ${kindSql(kind)}`
          : Prisma.sql`FALSE`,
      );
  }

  administered(kind: TrashKind) {
    return (alias: Prisma.Sql) =>
      Promise.resolve(this.user.role?.isSystemRole ? Prisma.sql`${alias}.kind = ${kindSql(kind)}` : Prisma.sql`FALSE`);
  }
}
