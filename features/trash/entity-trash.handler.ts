import type { Resource } from "@/generated/prisma";
import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler, TrashKindImpact, TrashKindRestore } from "./trash-kind-handler";
import type { TrashKind, TrashRestoreBlocker } from "./trash.schema";

import { Action, Prisma } from "@/generated/prisma";
import { rolePermits } from "@/core/base/permission.service";
import { UserAccessor } from "@/core/base/user-accessor";

export type TrashableEntityRepo = {
  restoreTrashed(ids: string[]): Promise<string[]>;
  purgeTrashed(ids: string[]): Promise<void>;
};

export type EntityTrashKind = {
  kind: TrashKind;
  restoreOrder: number;
  visibility: (alias: Prisma.Sql) => Promise<Prisma.Sql>;
  blockers?: (items: TrashItem[]) => Promise<TrashRestoreBlocker[]>;
};

export class EntityTrashHandler implements TrashKindHandler {
  readonly kinds: readonly TrashKind[];
  readonly restoreOrder: number;

  constructor(
    private definition: EntityTrashKind,
    private repo: TrashableEntityRepo,
    private trash: TrashRepo,
  ) {
    this.kinds = [definition.kind];
    this.restoreOrder = definition.restoreOrder;
  }

  visibility(alias: Prisma.Sql): Promise<Prisma.Sql> {
    return this.definition.visibility(alias);
  }

  async restore(items: TrashItem[]): Promise<TrashKindRestore> {
    const blocked = (await this.definition.blockers?.(items)) ?? [];
    const blockedIds = new Set(blocked.map((blocker) => blocker.itemId));
    const candidates = items.filter((item) => !blockedIds.has(item.id));
    const restored = new Set(await this.repo.restoreTrashed(candidates.map((item) => item.targetId)));
    const missing = candidates.filter((item) => !restored.has(item.targetId));
    const restoredItemIds = candidates.filter((item) => restored.has(item.targetId)).map((item) => item.id);
    await this.trash.remove([...restoredItemIds, ...missing.map((item) => item.id)]);
    return {
      restoredItemIds,
      blocked: [
        ...blocked,
        ...missing.map((item) => ({ itemId: item.id, reason: "notFound" as const, typeId: item.typeId })),
      ],
      restoredRecords: 0,
      droppedLinks: 0,
    };
  }

  impact(): Promise<TrashKindImpact> {
    return Promise.resolve({ removedRecords: [], removedLinks: 0 });
  }

  async purge(items: TrashItem[]): Promise<void> {
    await this.repo.purgeTrashed(items.map((item) => item.targetId));
    await this.trash.remove(items.map((item) => item.id));
  }
}

const kindSql = (kind: TrashKind) => Prisma.raw(`'${kind}'`);

export class EntityTrashVisibility extends UserAccessor {
  owned(kind: TrashKind) {
    return (alias: Prisma.Sql) =>
      Promise.resolve(Prisma.sql`(${alias}.kind = ${kindSql(kind)} AND ${alias}."ownerUserId" = ${this.userId})`);
  }

  permitted(kind: TrashKind, resource: Resource) {
    return (alias: Prisma.Sql) =>
      Promise.resolve(
        rolePermits(this.user.role, resource, Action.delete) ? Prisma.sql`${alias}.kind = ${kindSql(kind)}` : Prisma.sql`FALSE`,
      );
  }

  administered(kind: TrashKind) {
    return (alias: Prisma.Sql) =>
      Promise.resolve(this.user.role?.isSystemRole ? Prisma.sql`${alias}.kind = ${kindSql(kind)}` : Prisma.sql`FALSE`);
  }
}
