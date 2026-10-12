import type {
  TrashDeletedBy,
  TrashItem,
  TrashItemInput,
  TrashListQuery,
  TrashRepo,
  TrashExpiryCursor,
  TrashSelection,
} from "./trash.repo";
import type { ExpiredTrashRepo } from "./expired-trash.repo";

import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { deleteTrashItems, insertTrashItems } from "./trash-item-store";
import { TRASH_ITEM_ALIAS } from "./trash-item-alias";

type TrashItemRow = Omit<TrashItem, "payload"> & { payload: Prisma.JsonValue };

const TRASH_ITEM_SELECT = {
  id: true,
  kind: true,
  targetId: true,
  typeId: true,
  surfaceKey: true,
  ownerUserId: true,
  label: true,
  deletedById: true,
  deletedAt: true,
  expiresAt: true,
  batchId: true,
  payload: true,
} satisfies Prisma.TrashItemSelect;

export class PrismaTrashRepo extends TenantRepository implements TrashRepo, ExpiredTrashRepo {
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

  async find(selection: TrashSelection, visibility: Prisma.Sql) {
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

  async findExpired(now: Date, take: number, after?: TrashExpiryCursor): Promise<TrashItem[]> {
    const cursor = after
      ? {
          OR: [
            { expiresAt: { gt: new Date(after.expiresAt) } },
            { expiresAt: new Date(after.expiresAt), id: { gt: after.id } },
          ],
        }
      : {};
    return this.prisma.trashItem.findMany({
      where: { companyId: this.companyId, expiresAt: { lte: now }, ...cursor },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take,
      select: TRASH_ITEM_SELECT,
    });
  }

  @BypassTenantGuard
  async findExpiredTrashCompaniesUnscoped(now: Date, after: string | null, limit: number): Promise<string[]> {
    const due = await this.prisma.trashItem.findMany({
      where: { expiresAt: { lte: now }, ...(after ? { companyId: { gt: after } } : {}) },
      distinct: ["companyId"],
      orderBy: { companyId: "asc" },
      take: limit,
      select: { companyId: true },
    });
    return due.map((row) => row.companyId);
  }

  async markPurgePending(id: string, operationId: string): Promise<void> {
    const item = await this.prisma.trashItem.findFirst({
      where: { companyId: this.companyId, id },
      select: { payload: true },
    });
    if (!item) return;
    const payload =
      item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {};
    await this.prisma.trashItem.updateMany({
      where: { companyId: this.companyId, id },
      data: { payload: { ...payload, purgeOperationId: operationId } },
    });
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
