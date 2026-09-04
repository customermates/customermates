import type { DataViewChipDto, DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { StoredViewRow } from "./data-view-row-mapping";
import type { DataViewVisibility, Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { runAsViewOwner } from "@/core/data-view/view-owner-context";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { readStoredState, writePartialStoredState, writeStoredState } from "./data-view-row-mapping";

export type CreateDataViewArgs = {
  surfaceKey: string;
  name: string;
  visibility: DataViewVisibility;
  position: number;
  state: DataViewState;
};

export type UpdateOwnedDataViewArgs = {
  id: string;
  name?: string;
  visibility?: DataViewVisibility;
  position?: number;
  state?: DataViewState;
};

const VIEW_SELECT = {
  id: true,
  userId: true,
  surfaceKey: true,
  name: true,
  visibility: true,
  position: true,
  filters: true,
  searchTerm: true,
  sortDescriptor: true,
  viewMode: true,
  groupingColumnId: true,
  columnOrder: true,
  columnWidths: true,
  hiddenColumns: true,
  pageSize: true,
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.DataViewSelect;

function ownerName(user: { firstName: string | null; lastName: string | null } | null | undefined) {
  const parts = [user?.firstName, user?.lastName].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function toChip(row: StoredViewRow, userId: string): DataViewChipDto {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    position: row.position,
    isOwner: row.userId === userId,
    ownerName: ownerName(row.user),
    state: readStoredState(row),
  };
}

function toDto(row: StoredViewRow, userId: string): DataViewDto {
  return { ...toChip(row, userId), surfaceKey: row.surfaceKey as DataViewDto["surfaceKey"] };
}

export class PrismaDataViewRepo extends BaseRepository implements DataViewStateRepo {
  async loadSurfaceState(surfaceKey: string): Promise<SurfaceViewState> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const [views, overrides, personalization] = await Promise.all([
        this.prisma.dataView.findMany({
          where: { companyId, surfaceKey, OR: [{ userId }, { visibility: "workspace" }] },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: VIEW_SELECT,
        }),
        this.prisma.dataViewOverride.findMany({ where: { companyId, userId, surfaceKey } }),
        this.prisma.p13n.findUnique({
          where: { companyId_userId_p13nId: { companyId, userId, p13nId: surfaceKey }, companyId },
          select: { activeViewKey: true },
        }),
      ]);

      const chips = views.map((row) => toChip(row as StoredViewRow, userId));
      const readable = new Set(chips.map((chip) => chip.id));

      const stored = new Map<string, DataViewState>();
      for (const override of overrides) {
        if (override.viewKey !== ALL_VIEW_KEY && !readable.has(override.viewKey)) continue;
        stored.set(override.viewKey, readStoredState(override));
      }

      return { activeViewKey: personalization?.activeViewKey ?? null, views: chips, overrides: stored };
    });
  }

  async listDataViews(surfaceKey: string): Promise<DataViewDto[]> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const rows = await this.prisma.dataView.findMany({
        where: { companyId, surfaceKey, OR: [{ userId }, { visibility: "workspace" }] },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: VIEW_SELECT,
      });

      return rows.map((row) => toDto(row as StoredViewRow, userId));
    });
  }

  async findViewById(id: string): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const row = await this.prisma.dataView.findFirst({
        where: { id, companyId, OR: [{ userId }, { visibility: "workspace" }] },
        select: VIEW_SELECT,
      });

      return row ? toDto(row as StoredViewRow, userId) : null;
    });
  }

  async findOwnedOrNull(id: string): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const row = await this.prisma.dataView.findFirst({ where: { id, companyId, userId }, select: VIEW_SELECT });

      return row ? toDto(row as StoredViewRow, userId) : null;
    });
  }

  async nextPosition(surfaceKey: string): Promise<number> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const aggregate = await this.prisma.dataView.aggregate({
        where: { companyId, userId, surfaceKey },
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
          visibility: args.visibility,
          position: args.position,
          ...writeStoredState(args.state),
        },
        select: VIEW_SELECT,
      });

      return toDto(row as StoredViewRow, userId);
    });
  }

  async updateOwned(args: UpdateOwnedDataViewArgs): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const data: Prisma.DataViewUpdateManyMutationInput = {};
      if (args.name !== undefined) data.name = args.name;
      if (args.visibility !== undefined) data.visibility = args.visibility;
      if (args.position !== undefined) data.position = args.position;
      if (args.state !== undefined) Object.assign(data, writePartialStoredState(args.state));

      const affected = await this.prisma.dataView.updateMany({ where: { id: args.id, companyId, userId }, data });
      if (affected.count === 0) return null;

      const row = await this.prisma.dataView.findFirst({
        where: { id: args.id, companyId, userId },
        select: VIEW_SELECT,
      });

      return row ? toDto(row as StoredViewRow, userId) : null;
    });
  }

  async deleteOwned(id: string): Promise<boolean> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const affected = await this.prisma.dataView.deleteMany({ where: { id, companyId, userId } });

      return affected.count > 0;
    });
  }
}
