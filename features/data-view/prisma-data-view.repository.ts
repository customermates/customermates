import type { DataViewChipDto, DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { StoredViewRow } from "./data-view-row-mapping";
import { Prisma } from "@/generated/prisma";
import type { ResetDataViewStateInput } from "./reset-data-view-state.schema";
import type { CommandCatalogRepo, RecordViewName } from "@/features/command-palette/command-catalog.repo";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import { TenantRepository } from "@/core/base/tenant-repository";
import { runAsViewOwner } from "@/core/data-view/view-owner-context";
import {
  readStoredPersonalizationState,
  readStoredState,
  writePartialStoredState,
  writeStoredState,
} from "./data-view-row-mapping";

export type CreateDataViewArgs = {
  surfaceKey: string;
  name: string;
  position: number;
  state: DataViewState;
};

export type UpdateOwnedDataViewArgs = {
  id: string;
  name?: string;
  position?: number;
  state?: DataViewState;
};

export type UpdateOwnedDataViewStateArgs = {
  id: string;
  surfaceKey: string;
  state: DataViewState;
};

const VIEW_SELECT = {
  id: true,
  surfaceKey: true,
  name: true,
  position: true,
  filters: true,
  searchTerm: true,
  sortDescriptor: true,
  viewMode: true,
  groupingColumnId: true,
  grouping: true,
  columnOrder: true,
  columnWidths: true,
  hiddenColumns: true,
  pageSize: true,
} satisfies Prisma.DataViewSelect;

const PERSONALIZATION_SELECT = {
  viewStateKeys: true,
  activeViewKey: true,
  filters: true,
  searchTerm: true,
  sortDescriptor: true,
  pagination: true,
  viewMode: true,
  groupingColumnId: true,
  grouping: true,
  columnOrder: true,
  columnWidths: true,
  hiddenColumns: true,
} satisfies Prisma.P13nSelect;

function toChip(row: StoredViewRow): DataViewChipDto {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    state: readStoredState(row),
  };
}

function toDto(row: StoredViewRow): DataViewDto {
  return {
    ...toChip(row),
    surfaceKey: row.surfaceKey as DataViewDto["surfaceKey"],
  };
}

export class PrismaDataViewRepo extends TenantRepository implements DataViewStateRepo, CommandCatalogRepo {
  constructor(private readonly scopedCompanyId?: string) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  async listRecordViewNames(): Promise<RecordViewName[]> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;
      const rows = await this.prisma.dataView.findMany({
        where: { companyId, userId, deletedAt: null, surfaceKey: { startsWith: "records:" } },
        orderBy: [{ surfaceKey: "asc" }, { position: "asc" }, { name: "asc" }],
        select: { id: true, surfaceKey: true, name: true },
      });
      return rows.map((row) => ({ typeId: row.surfaceKey.slice("records:".length), id: row.id, name: row.name }));
    });
  }

  async listWorkspaceRecordViewNames(): Promise<RecordViewName[]> {
    const rows = await this.prisma.dataView.findMany({
      where: { companyId: this.companyId, surfaceKey: { startsWith: "records:" }, deletedAt: null },
      orderBy: [{ surfaceKey: "asc" }, { position: "asc" }, { id: "asc" }],
      select: { id: true, surfaceKey: true, name: true },
    });
    return rows.map((row) => ({ typeId: row.surfaceKey.slice("records:".length), id: row.id, name: row.name }));
  }

  async resetOwnedViewState({ surfaceKey, viewKey, fields }: ResetDataViewStateInput): Promise<boolean> {
    const { companyId, id: userId } = this.user;
    const all = viewKey === ALL_VIEW_KEY;
    const column = (field: string) => (field === "pageSize" && all ? "pagination" : field);
    const changes = fields
      .flatMap((field) => [field, ...(field === "grouping" ? ["groupingColumnId"] : [])])
      .map((field) =>
        Prisma.raw(
          `"${column(field)}" = ${all && ["columnOrder", "hiddenColumns"].includes(field) ? "ARRAY[]::text[]" : "NULL"}`,
        ),
      );
    if (!all) {
      const count = await this.prisma.$executeRaw(
        Prisma.sql`UPDATE "DataView" SET ${Prisma.join(changes)}, "updatedAt" = CURRENT_TIMESTAMP WHERE "companyId" = ${companyId} AND "userId" = ${userId} AND "surfaceKey" = ${surfaceKey} AND id = ${viewKey} AND "deletedAt" IS NULL`,
      );
      return count === 1;
    }
    const current = await this.prisma.p13n.findUnique({
      where: { companyId, companyId_userId_p13nId: { companyId, userId, p13nId: surfaceKey } },
    });
    if (!current) return true;
    const keys = Array.isArray(current.viewStateKeys)
      ? current.viewStateKeys
      : Object.keys(readStoredPersonalizationState(current));
    const remaining = keys.filter((key) => typeof key === "string" && !fields.includes(key as (typeof fields)[number]));
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "P13n" SET ${Prisma.join(changes)}, "viewStateKeys" = ${JSON.stringify(remaining)}::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "companyId" = ${companyId} AND "userId" = ${userId} AND "p13nId" = ${surfaceKey}`,
    );
    return true;
  }

  async loadSurfaceState(surfaceKey: string): Promise<SurfaceViewState> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const [views, personalization] = await Promise.all([
        this.prisma.dataView.findMany({
          where: { companyId, surfaceKey, userId, deletedAt: null },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: VIEW_SELECT,
        }),
        this.prisma.p13n.findUnique({
          where: {
            companyId_userId_p13nId: { companyId, userId, p13nId: surfaceKey },
            companyId,
          },
          select: PERSONALIZATION_SELECT,
        }),
      ]);

      return {
        activeViewKey: personalization?.activeViewKey ?? null,
        views: views.map((row) => toChip(row as StoredViewRow)),
        allState: personalization ? readStoredPersonalizationState(personalization) : {},
      };
    });
  }

  async listDataViews(surfaceKey: string): Promise<DataViewDto[]> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const rows = await this.prisma.dataView.findMany({
        where: { companyId, surfaceKey, userId, deletedAt: null },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: VIEW_SELECT,
      });

      return rows.map((row) => toDto(row as StoredViewRow));
    });
  }

  async findOwnedOrNull(id: string): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const row = await this.prisma.dataView.findFirst({
        where: { id, companyId, userId, deletedAt: null },
        select: VIEW_SELECT,
      });

      return row ? toDto(row as StoredViewRow) : null;
    });
  }

  async nextPosition(surfaceKey: string): Promise<number> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const aggregate = await this.prisma.dataView.aggregate({
        where: { companyId, userId, surfaceKey, deletedAt: null },
        _max: { position: true },
      });

      return (aggregate._max.position ?? -1) + 1;
    });
  }

  async createView(args: CreateDataViewArgs): Promise<DataViewDto> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const row = await this.prisma.dataView.create({
        data: {
          companyId,
          userId,
          surfaceKey: args.surfaceKey,
          name: args.name,
          position: args.position,
          ...writeStoredState(args.state),
        },
        select: VIEW_SELECT,
      });

      return toDto(row as StoredViewRow);
    });
  }

  async updateOwned(args: UpdateOwnedDataViewArgs): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const data: Prisma.DataViewUpdateManyMutationInput = {};
      if (args.name !== undefined) data.name = args.name;
      if (args.position !== undefined) data.position = args.position;
      if (args.state !== undefined) Object.assign(data, writePartialStoredState(args.state));

      const affected = await this.prisma.dataView.updateMany({
        where: { id: args.id, companyId, userId, deletedAt: null },
        data,
      });
      if (affected.count === 0) return null;

      const row = await this.prisma.dataView.findFirst({
        where: { id: args.id, companyId, userId, deletedAt: null },
        select: VIEW_SELECT,
      });

      return row ? toDto(row as StoredViewRow) : null;
    });
  }

  async updateOwnedState({ id, surfaceKey, state }: UpdateOwnedDataViewStateArgs): Promise<boolean> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const affected = await this.prisma.dataView.updateMany({
        where: { id, companyId, userId, surfaceKey, deletedAt: null },
        data: writePartialStoredState(state),
      });

      return affected.count > 0;
    });
  }

  async trashOwned(id: string): Promise<boolean> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const affected = await this.prisma.dataView.updateMany({
        where: { id, companyId, userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      return affected.count > 0;
    });
  }

  async restoreTrashed(ids: string[]): Promise<string[]> {
    const rows = await this.prisma.dataView.findMany({
      where: { id: { in: ids }, companyId: this.companyId, deletedAt: { not: null } },
      select: { id: true },
    });
    const restored = rows.map((row) => row.id);
    await this.prisma.dataView.updateMany({
      where: { id: { in: restored }, companyId: this.companyId },
      data: { deletedAt: null },
    });
    return restored;
  }

  async purgeTrashed(ids: string[]): Promise<void> {
    await this.prisma.widget.deleteMany({
      where: { companyId: this.companyId, viewId: { in: ids }, view: { is: { deletedAt: { not: null } } } },
    });
    await this.prisma.dataView.deleteMany({
      where: { id: { in: ids }, companyId: this.companyId, deletedAt: { not: null } },
    });
  }
}
