import type {
  DataViewChipDto,
  DataViewDto,
  DataViewState,
  DataViewVisibility,
} from "@/core/data-view/data-view-state.schema";
import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { StoredViewRow } from "./data-view-row-mapping";
import { Prisma } from "@/generated/prisma";
import type { ResetDataViewStateInput } from "./reset-data-view-state.schema";
import type { CommandCatalogRepo, RecordViewName } from "@/features/command-palette/command-catalog.repo";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import { TenantRepository } from "@/core/base/tenant-repository";
import { runAsViewOwner } from "@/core/data-view/view-owner-context";
import { activePublicLinkWhere } from "@/features/public-link/active-public-link";

import { sharedWithViewerWhere } from "./shared-view-where";
import {
  readStoredPersonalizationState,
  readStoredState,
  writePartialStoredState,
  writeStoredState,
} from "./data-view-row-mapping";
import type { RecordViewConfigurationRepo } from "./record-view-configuration.repo";
import type { ShareableRole } from "./get-data-view-share-options.repo";
import type { ViewWidgetPurgeRepo } from "@/features/widget/view-widget-purge.repo";
import type { SurfaceStateResetRepo } from "@/features/p13n/surface-state-reset.repo";

type DataViewRepoOwners = {
  widgets: ViewWidgetPurgeRepo;
  personalizations: SurfaceStateResetRepo;
};

type CreateDataViewArgs = {
  surfaceKey: string;
  name: string;
  position: number;
  state: DataViewState;
};

type UpdateOwnedDataViewArgs = {
  id: string;
  name?: string;
  position?: number;
  state?: DataViewState;
};

type UpdateOwnedDataViewStateArgs = {
  id: string;
  surfaceKey: string;
  state: DataViewState;
};

type ResetField = ResetDataViewStateInput["fields"][number];

function resetViewColumns(fields: ResetField[]): Prisma.DataViewUpdateManyMutationInput {
  const data: Prisma.DataViewUpdateManyMutationInput = {};
  for (const field of fields) {
    if (field === "searchTerm" || field === "viewMode" || field === "pageSize") data[field] = null;
    else data[field] = Prisma.DbNull;
    if (field === "grouping") data.groupingColumnId = null;
  }
  return data;
}

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
  calendar: true,
  pageSize: true,
} satisfies Prisma.DataViewSelect;

const SHARED_VIEW_POSITION_OFFSET = 100_000;

function surfaceViewSelect() {
  return {
    ...VIEW_SELECT,
    userId: true,
    visibility: true,
    roleShares: { select: { roleId: true }, orderBy: { roleId: "asc" } },
    user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    publicLinks: { where: activePublicLinkWhere(), select: { createdById: true } },
  } satisfies Prisma.DataViewSelect;
}

type SurfaceViewRow = Prisma.DataViewGetPayload<{ select: ReturnType<typeof surfaceViewSelect> }>;

type ShareOwnedDataViewArgs = {
  id: string;
  visibility: DataViewVisibility;
  roleIds: string[];
};

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
  calendar: true,
} satisfies Prisma.P13nSelect;

function toChip(row: StoredViewRow): DataViewChipDto {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    state: readStoredState(row),
  };
}

function toSurfaceChip(row: SurfaceViewRow, userId: string, sharedIndex: number): DataViewChipDto {
  const chip = toChip(row as StoredViewRow);
  if (row.userId === userId) {
    const isPublic = row.publicLinks.some((link) => link.createdById === userId);
    return {
      ...chip,
      visibility: row.visibility,
      roleIds: row.roleShares.map((share) => share.roleId),
      ...(isPublic ? { isPublic } : {}),
    };
  }

  const name = [row.user.firstName, row.user.lastName].filter(Boolean).join(" ").trim();
  return {
    ...chip,
    position: SHARED_VIEW_POSITION_OFFSET + sharedIndex,
    visibility: row.visibility,
    sharedBy: { id: row.user.id, name, avatarUrl: row.user.avatarUrl ?? null },
  };
}

function toDto(row: StoredViewRow): DataViewDto {
  return {
    ...toChip(row),
    surfaceKey: row.surfaceKey as DataViewDto["surfaceKey"],
  };
}

export class PrismaDataViewRepo
  extends TenantRepository
  implements DataViewStateRepo, CommandCatalogRepo, RecordViewConfigurationRepo
{
  constructor(
    private readonly owners: DataViewRepoOwners,
    private readonly scopedCompanyId?: string,
  ) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  async listRecordViewNames(): Promise<RecordViewName[]> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;
      const rows = await this.prisma.dataView.findMany({
        where: {
          companyId,
          userId,
          deletedAt: null,
          surfaceKey: { startsWith: "records:" },
        },
        orderBy: [{ surfaceKey: "asc" }, { position: "asc" }, { name: "asc" }],
        select: { id: true, surfaceKey: true, name: true },
      });
      return rows.map((row) => ({
        typeId: row.surfaceKey.slice("records:".length),
        id: row.id,
        name: row.name,
      }));
    });
  }

  async listWorkspaceRecordViewNames(): Promise<RecordViewName[]> {
    const rows = await this.prisma.dataView.findMany({
      where: {
        companyId: this.companyId,
        surfaceKey: { startsWith: "records:" },
        deletedAt: null,
      },
      orderBy: [{ surfaceKey: "asc" }, { position: "asc" }, { id: "asc" }],
      select: { id: true, surfaceKey: true, name: true },
    });
    return rows.map((row) => ({
      typeId: row.surfaceKey.slice("records:".length),
      id: row.id,
      name: row.name,
    }));
  }

  async resetOwnedViewState({ surfaceKey, viewKey, fields }: ResetDataViewStateInput): Promise<boolean> {
    const { companyId, id: userId } = this.user;
    if (viewKey !== ALL_VIEW_KEY) {
      const { count } = await this.prisma.dataView.updateMany({
        where: { companyId, userId, surfaceKey, id: viewKey, deletedAt: null },
        data: resetViewColumns(fields),
      });
      return count === 1;
    }
    await this.owners.personalizations.resetSurfaceState(companyId, userId, surfaceKey, fields);
    return true;
  }

  private readableWhere(): Prisma.DataViewWhereInput {
    const userId = this.user.id;
    return { OR: [{ userId }, { hiddenBy: { none: { userId } }, ...sharedWithViewerWhere(this.user) }] };
  }

  async loadSurfaceState(surfaceKey: string): Promise<SurfaceViewState> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const [views, personalization] = await Promise.all([
        this.prisma.dataView.findMany({
          where: { companyId, surfaceKey, deletedAt: null, ...this.readableWhere() },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: surfaceViewSelect(),
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
        views: this.surfaceChips(views, userId),
        allState: personalization ? readStoredPersonalizationState(personalization) : {},
      };
    });
  }

  private surfaceChips(rows: SurfaceViewRow[], userId: string): DataViewChipDto[] {
    const shared = rows
      .filter((row) => row.userId !== userId)
      .sort((left, right) =>
        left.name === right.name ? (left.id < right.id ? -1 : 1) : left.name < right.name ? -1 : 1,
      );
    const sharedIndex = new Map(shared.map((row, index) => [row.id, index]));

    return rows.map((row) => toSurfaceChip(row, userId, sharedIndex.get(row.id) ?? 0));
  }

  async findReadableOrNull(id: string): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const { companyId } = this.user;

      const row = await this.prisma.dataView.findFirst({
        where: { id, companyId, deletedAt: null, ...this.readableWhere() },
        select: VIEW_SELECT,
      });

      return row ? toDto(row as StoredViewRow) : null;
    });
  }

  async findSharedWithMeOrNull(id: string): Promise<DataViewDto | null> {
    return runAsViewOwner(async () => {
      const row = await this.prisma.dataView.findFirst({
        where: { id, companyId: this.user.companyId, deletedAt: null, ...sharedWithViewerWhere(this.user) },
        select: VIEW_SELECT,
      });

      return row ? toDto(row as StoredViewRow) : null;
    });
  }

  async listShareableRoles(): Promise<ShareableRole[]> {
    return runAsViewOwner(async () => {
      const rows = await this.prisma.userRole.findMany({
        where: { companyId: this.user.companyId },
        orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
        select: { id: true, name: true },
      });

      return rows;
    });
  }

  async shareOwned({ id, visibility, roleIds }: ShareOwnedDataViewArgs): Promise<DataViewChipDto | null> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      const affected = await this.prisma.dataView.updateMany({
        where: { id, companyId, userId, deletedAt: null },
        data: { visibility },
      });
      if (affected.count === 0) return null;

      await this.prisma.dataViewRoleShare.deleteMany({ where: { viewId: id, companyId } });
      if (visibility === "roles" && roleIds.length > 0) {
        await this.prisma.dataViewRoleShare.createMany({
          data: roleIds.map((roleId) => ({ viewId: id, roleId, companyId })),
          skipDuplicates: true,
        });
      }

      const row = await this.prisma.dataView.findFirst({
        where: { id, companyId, userId, deletedAt: null },
        select: surfaceViewSelect(),
      });

      return row ? toSurfaceChip(row, userId, 0) : null;
    });
  }

  async countCompanyRoles(roleIds: string[]): Promise<number> {
    if (roleIds.length === 0) return 0;
    return this.prisma.userRole.count({ where: { companyId: this.companyId, id: { in: roleIds } } });
  }

  async setSharedHidden(id: string, hidden: boolean): Promise<void> {
    return runAsViewOwner(async () => {
      const { companyId, id: userId } = this.user;

      if (!hidden) {
        await this.prisma.dataViewHidden.deleteMany({ where: { viewId: id, userId, companyId } });
        return;
      }

      await this.prisma.dataViewHidden.createMany({
        data: [{ viewId: id, userId, companyId }],
        skipDuplicates: true,
      });
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
      where: {
        id: { in: ids },
        companyId: this.companyId,
        deletedAt: { not: null },
      },
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
    await this.owners.widgets.purgeOnTrashedViewsCompanyWide(this.companyId, ids);
    await this.prisma.dataView.deleteMany({
      where: {
        id: { in: ids },
        companyId: this.companyId,
        deletedAt: { not: null },
      },
    });
  }

  async getViewsCompanyWide(companyId: string, surfaceKeys: string[], afterId: string, take: number) {
    return this.prisma.dataView.findMany({
      where: {
        companyId,
        surfaceKey: { in: surfaceKeys },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take,
    });
  }

  async countViewsCompanyWide(companyId: string, surfaceKeys: string[]) {
    return this.prisma.dataView.count({
      where: { companyId, surfaceKey: { in: surfaceKeys } },
    });
  }

  async deleteViewsCompanyWide(companyId: string, surfaceKeys: string[]): Promise<void> {
    await this.prisma.dataView.deleteMany({
      where: { companyId, surfaceKey: { in: surfaceKeys } },
    });
  }

  async rewriteViewStateCompanyWide(companyId: string, id: string, state: DataViewState): Promise<void> {
    await this.prisma.dataView.updateMany({
      where: { companyId, id },
      data: writePartialStoredState(state),
    });
  }

  async getRecordViewStatesByIds(ids: string[]) {
    const rows = await this.prisma.dataView.findMany({
      where: {
        companyId: this.companyId,
        id: { in: ids },
        surfaceKey: { startsWith: "records:" },
      },
      select: VIEW_SELECT,
    });
    return rows.map((row) => ({
      id: row.id,
      typeId: row.surfaceKey.slice("records:".length),
      state: readStoredState(row),
    }));
  }
}
