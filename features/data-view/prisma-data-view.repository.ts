import type { DataViewChipDto, DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { StoredViewRow } from "./data-view-row-mapping";
import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
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
  return { id: row.id, name: row.name, position: row.position, state: readStoredState(row) };
}

function toDto(row: StoredViewRow): DataViewDto {
  return { ...toChip(row), surfaceKey: row.surfaceKey as DataViewDto["surfaceKey"] };
}

export class PrismaDataViewRepo extends BaseRepository implements DataViewStateRepo {
  async loadSurfaceState(surfaceKey: string): Promise<SurfaceViewState> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const [views, personalization] = await Promise.all([
        this.prisma.dataView.findMany({
          where: { companyId, surfaceKey, userId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: VIEW_SELECT,
        }),
        this.prisma.p13n.findUnique({
          where: { companyId_userId_p13nId: { companyId, userId, p13nId: surfaceKey }, companyId },
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
        where: { companyId, surfaceKey, userId },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: VIEW_SELECT,
      });

      return rows.map((row) => toDto(row as StoredViewRow));
    });
  }

  async findOwnedOrNull(id: string): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const row = await this.prisma.dataView.findFirst({ where: { id, companyId, userId }, select: VIEW_SELECT });

      return row ? toDto(row as StoredViewRow) : null;
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

      const affected = await this.prisma.dataView.updateMany({ where: { id: args.id, companyId, userId }, data });
      if (affected.count === 0) return null;

      const row = await this.prisma.dataView.findFirst({
        where: { id: args.id, companyId, userId },
        select: VIEW_SELECT,
      });

      return row ? toDto(row as StoredViewRow) : null;
    });
  }

  async updateOwnedState({ id, surfaceKey, state }: UpdateOwnedDataViewStateArgs): Promise<boolean> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const affected = await this.prisma.dataView.updateMany({
        where: { id, companyId, userId, surfaceKey },
        data: writePartialStoredState(state),
      });

      return affected.count > 0;
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
