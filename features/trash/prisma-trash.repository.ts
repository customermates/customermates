import type {
  TrashItem,
  TrashItemInput,
  TrashListQuery,
  TrashRepo,
  TrashExpiryCursor,
  TrashSelection,
} from "./trash.repo";
import type { ExpiredTrashRepo } from "./expired-trash.repo";
import type { RecordTrashItemRepo, TrashItemFilter } from "./record-trash-item.repo";

import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { TRASH_RETENTION_DAYS } from "./trash-retention";
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

export class PrismaTrashRepo extends TenantRepository implements TrashRepo, ExpiredTrashRepo, RecordTrashItemRepo {
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
    await this.addItemsCompanyWide(this.companyId, items);
  }

  async remove(ids: string[]): Promise<void> {
    await this.removeItemsCompanyWide(this.companyId, ids);
  }

  async addItemsCompanyWide(companyId: string, items: TrashItemInput[]): Promise<void> {
    if (!items.length) return;
    const deletedAt = new Date();
    const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.trashItem.createMany({
      data: items.map((item) => ({ ...item, companyId, deletedAt, expiresAt })),
    });
  }

  async removeItemsCompanyWide(companyId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.prisma.trashItem.deleteMany({ where: { companyId, id: { in: ids } } });
  }

  async findItemsCompanyWide(companyId: string, filter: TrashItemFilter) {
    return this.prisma.trashItem.findMany({
      where: {
        companyId,
        kind: { in: filter.kinds },
        ...(filter.ids ? { id: { in: filter.ids } } : {}),
        ...(filter.typeIds ? { typeId: { in: filter.typeIds } } : {}),
        ...(filter.surfaceKeys ? { surfaceKey: { in: filter.surfaceKeys } } : {}),
        ...(filter.batchId === undefined ? {} : { batchId: filter.batchId }),
      },
      orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
    });
  }

  async publishStagedRecordItemsCompanyWide(companyId: string, operationId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "TrashItem" ("companyId", id, kind, "targetId", "typeId", label, "deletedById", "deletedAt", "expiresAt", "batchId")
      SELECT ${companyId}, stage.payload->>'id', 'record', stage.payload->>'targetId', stage.payload->>'typeId', stage.payload->>'label',
        stage.payload->>'deletedById', NOW(), NOW() + make_interval(days => ${TRASH_RETENTION_DAYS}), stage.payload->>'batchId'
      FROM "RecordStageRow" stage WHERE stage."companyId" = ${companyId} AND stage."operationId" = ${operationId} AND stage.kind = 'trash-item'
      ON CONFLICT DO NOTHING`);
  }

  private conditions(visibility: Prisma.Sql, query: Partial<TrashListQuery> = {}): Prisma.Sql {
    const item = TRASH_ITEM_ALIAS;
    const conditions = [Prisma.sql`${item}."companyId" = ${this.companyId}`, Prisma.sql`(${visibility})`];
    if (query.kinds?.length) conditions.push(Prisma.sql`${item}.kind::text IN (${Prisma.join(query.kinds)})`);
    if (query.itemIds?.length) conditions.push(Prisma.sql`${item}.id IN (${Prisma.join(query.itemIds)})`);
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
}
