import type { TrashDeletedBy, TrashItem, TrashItemInput, TrashListQuery, TrashRepo } from "./trash.repo";

import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { deleteTrashItems, insertTrashItems } from "./trash-item-store";
import { TRASH_ITEM_ALIAS } from "./trash-item-alias";

type TrashItemRow = Omit<TrashItem, "payload"> & { payload: Prisma.JsonValue };

export class PrismaTrashRepo extends TenantRepository implements TrashRepo {
  constructor(private readonly scopedCompanyId?: string) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  getSortableFields() {
    return [{ field: "deletedAt", resolvedFields: ["deletedAt"] }];
  }

  async add(items: TrashItemInput[]): Promise<void> {
    await insertTrashItems(this.prisma, this.companyId, items);
  }

  async remove(ids: string[]): Promise<void> {
    await deleteTrashItems(this.prisma, this.companyId, ids);
  }

  private conditions(visibility: Prisma.Sql, query: Partial<TrashListQuery> = {}): Prisma.Sql {
    const item = TRASH_ITEM_ALIAS;
    const conditions = [Prisma.sql`${item}."companyId" = ${this.companyId}`, Prisma.sql`(${visibility})`];
    if (query.kinds?.length) conditions.push(Prisma.sql`${item}.kind::text IN (${Prisma.join(query.kinds)})`);
    if (query.typeIds?.length) conditions.push(Prisma.sql`${item}."typeId" IN (${Prisma.join(query.typeIds)})`);
    if (query.search)
      conditions.push(Prisma.sql`${item}.label ILIKE ${`%${query.search.replace(/[\\%_]/g, "\\$&")}%`}`);
    return Prisma.join(conditions, " AND ");
  }

  async list(query: TrashListQuery) {
    const item = TRASH_ITEM_ALIAS;
    const where = this.conditions(query.visibility, query);
    const [items, counts] = await Promise.all([
      this.prisma.$queryRaw<TrashItemRow[]>(Prisma.sql`
        SELECT ${item}.id, ${item}.kind::text AS kind, ${item}."targetId", ${item}."typeId", ${item}."surfaceKey",
          ${item}."ownerUserId", ${item}.label, ${item}."deletedById", ${item}."deletedAt", ${item}."expiresAt",
          ${item}."batchId", ${item}.payload
        FROM "TrashItem" ${item} WHERE ${where}
        ORDER BY ${item}."deletedAt" ${Prisma.raw(query.sortDescriptor?.direction === "asc" ? "ASC" : "DESC")}, ${item}.id ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
      this.prisma.$queryRaw<Array<{ count: number }>>(
        Prisma.sql`SELECT COUNT(*)::integer AS count FROM "TrashItem" ${item} WHERE ${where}`,
      ),
    ]);
    return { items, total: counts[0]?.count ?? 0 };
  }

  async find(selection: { ids: string[] } | { batchId: string } | { all: true }, visibility: Prisma.Sql) {
    const item = TRASH_ITEM_ALIAS;
    if ("ids" in selection && !selection.ids.length) return [];
    const selected =
      "ids" in selection
        ? Prisma.sql`${item}.id IN (${Prisma.join(selection.ids)})`
        : "batchId" in selection
          ? Prisma.sql`${item}."batchId" = ${selection.batchId}`
          : Prisma.sql`TRUE`;
    return this.prisma.$queryRaw<TrashItemRow[]>(Prisma.sql`
      SELECT ${item}.id, ${item}.kind::text AS kind, ${item}."targetId", ${item}."typeId", ${item}."surfaceKey",
        ${item}."ownerUserId", ${item}.label, ${item}."deletedById", ${item}."deletedAt", ${item}."expiresAt",
        ${item}."batchId", ${item}.payload
      FROM "TrashItem" ${item} WHERE ${this.conditions(visibility)} AND ${selected}
      ORDER BY ${item}."deletedAt" ASC, ${item}.id ASC`);
  }

  async deletedBy(userIds: string[]): Promise<Map<string, TrashDeletedBy>> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { companyId: this.companyId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
    return new Map(users.map((user) => [user.id, user]));
  }
}
