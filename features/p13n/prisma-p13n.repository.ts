import type { RepoArgs } from "@/core/utils/types";
import { CONFIGURATION_CONSUMER_PAGE } from "@/features/records/record.repo";
import type { Filter, SortDescriptor, PaginationRequest } from "@/core/base/base-get.schema";
import type { ViewMode } from "@/core/base/base-query-builder";
import type { Grouping } from "@/core/base/grouping/grouping.schema";
import type { UpsertP13nRepo } from "./upsert-p13n.repo";
import type { GetP13nRepo } from "./get-p13n.interactor";
import type { RecordPersonalizationRepo } from "./record-personalization.repo";
import type { SurfaceStateResetRepo } from "./surface-state-reset.repo";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordDetailLayout } from "@/features/records/record-detail-layout.schema";

import { DATA_VIEW_STATE_FIELDS } from "@/core/data-view/data-view-state.schema";
import { readStoredPersonalizationState, writePersonalizationState } from "@/features/data-view/data-view-row-mapping";
import { Prisma } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { groupingShadowColumnId, readStoredGrouping } from "@/core/base/grouping/stored-grouping";
import { normalizeFilterInput } from "@/core/base/filter-value";
import { EntityDetailOptionsSchema, type EntityDetailOptions } from "./p13n.schema";
import { readP13nSettings, type P13nSettings } from "./p13n-settings.schema";

export interface P13nEntry {
  p13nId: string;
  activeViewKey?: string;
  filters?: Filter[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor | null;
  pagination?: Pick<PaginationRequest, "pageSize">;
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
  hiddenColumns?: string[];
  viewMode?: ViewMode;
  grouping?: Grouping | null;
  detailOptions?: EntityDetailOptions;
  settings?: P13nSettings;
}

function normalizeStoredFilters(value: unknown): Filter[] | undefined {
  return Array.isArray(value) ? (value.map(normalizeFilterInput) as Filter[]) : undefined;
}

function normalizeStoredPagination(value: unknown): Pick<PaginationRequest, "pageSize"> | undefined {
  const pageSize = typeof value === "object" && value !== null ? (value as { pageSize?: unknown }).pageSize : undefined;

  return typeof pageSize === "number" ? { pageSize: pageSize as PaginationRequest["pageSize"] } : undefined;
}

function normalizeDetailOptions(value: unknown): EntityDetailOptions | undefined {
  const parsed = EntityDetailOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

type StateField = (typeof DATA_VIEW_STATE_FIELDS)[number];

function resetPersonalizationColumns(fields: StateField[]): Prisma.P13nUpdateManyMutationInput {
  const data: Prisma.P13nUpdateManyMutationInput = {};
  for (const field of fields) {
    if (field === "pageSize") data.pagination = Prisma.DbNull;
    else if (field === "columnOrder" || field === "hiddenColumns") data[field] = [];
    else if (field === "searchTerm" || field === "viewMode") data[field] = null;
    else data[field] = Prisma.DbNull;
    if (field === "grouping") data.groupingColumnId = null;
  }
  return data;
}

export class PrismaP13nRepo
  extends TenantRepository
  implements GetP13nRepo, UpsertP13nRepo, RecordPersonalizationRepo, SurfaceStateResetRepo
{
  async getP13n(p13nId: string): Promise<P13nEntry | undefined> {
    const { companyId, id: userId } = this.user;

    const res = await this.prisma.p13n.findUnique({
      where: {
        companyId_userId_p13nId: { companyId, userId, p13nId },
        companyId,
      },
    });

    if (!res) return undefined;

    const {
      activeViewKey,
      filters,
      searchTerm,
      sortDescriptor,
      pagination,
      columnOrder,
      columnWidths,
      hiddenColumns,
      viewMode,
      grouping,
      detailOptions,
      settings,
    } = res;

    return {
      p13nId,
      activeViewKey: activeViewKey ?? undefined,
      filters: normalizeStoredFilters(filters),
      searchTerm: searchTerm ?? undefined,
      sortDescriptor: (sortDescriptor as SortDescriptor | null) ?? undefined,
      pagination: normalizeStoredPagination(pagination),
      columnWidths: (columnWidths as Record<string, number> | null) ?? undefined,
      columnOrder,
      hiddenColumns,
      viewMode: (viewMode as ViewMode | null) ?? undefined,
      grouping: readStoredGrouping(grouping),
      detailOptions: normalizeDetailOptions(detailOptions),
      settings: readP13nSettings(p13nId, settings) ?? undefined,
      ...(Array.isArray(res.viewStateKeys) ? this.explicitViewState(res) : {}),
    };
  }

  async clearActiveViewKeyIfMatches({
    p13nId,
    expectedActiveViewKey,
  }: {
    p13nId: string;
    expectedActiveViewKey: string;
  }): Promise<boolean> {
    const { companyId, id: userId } = this.user;
    const affected = await this.prisma.p13n.updateMany({
      where: { companyId, userId, p13nId, activeViewKey: expectedActiveViewKey },
      data: { activeViewKey: null },
    });

    return affected.count > 0;
  }

  async upsertP13n({ p13nId, ...data }: RepoArgs<UpsertP13nRepo, "upsertP13n">) {
    const { companyId, id: userId } = this.user;

    const current = p13nId.startsWith("records:")
      ? await this.prisma.p13n.findUnique({
          where: { companyId, companyId_userId_p13nId: { companyId, userId, p13nId } },
        })
      : null;
    const currentKeys = current
      ? Array.isArray(current.viewStateKeys)
        ? current.viewStateKeys
        : Object.keys(readStoredPersonalizationState(current))
      : [];
    const suppliedKeys = DATA_VIEW_STATE_FIELDS.filter((key) =>
      key === "pageSize" ? data.pagination !== undefined : data[key] !== undefined,
    );
    const viewStateKeys = p13nId.startsWith("records:")
      ? ([...new Set([...currentKeys, ...suppliedKeys])] as string[])
      : undefined;
    const createData = {
      companyId,
      userId,
      p13nId,
      activeViewKey: data.activeViewKey ?? null,
      viewStateKeys,
      filters: data.filters ?? Prisma.JsonNull,
      searchTerm: data.searchTerm ?? null,
      sortDescriptor: data.sortDescriptor ?? Prisma.JsonNull,
      pagination: data.pagination ?? Prisma.JsonNull,
      columnWidths: data.columnWidths ?? Prisma.JsonNull,
      columnOrder: data.columnOrder ?? [],
      hiddenColumns: data.hiddenColumns ?? [],
      viewMode: data.viewMode ?? null,
      groupingColumnId: groupingShadowColumnId(data.grouping),
      grouping: data.grouping ?? Prisma.DbNull,
      detailOptions: data.detailOptions ?? Prisma.JsonNull,
      settings: data.settings ?? Prisma.JsonNull,
    };

    const updateData = {
      companyId,
      userId,
      p13nId,
    } as Prisma.P13nUpdateInput;

    if (viewStateKeys) updateData.viewStateKeys = viewStateKeys;
    if (data.activeViewKey !== undefined) updateData.activeViewKey = data.activeViewKey ?? null;
    if (data.filters !== undefined) updateData.filters = data.filters ?? Prisma.JsonNull;
    if (data.searchTerm !== undefined) updateData.searchTerm = data.searchTerm;
    if (data.sortDescriptor !== undefined) updateData.sortDescriptor = data.sortDescriptor ?? Prisma.JsonNull;
    if (data.pagination !== undefined) updateData.pagination = data.pagination ?? Prisma.JsonNull;
    if (data.columnWidths !== undefined) updateData.columnWidths = data.columnWidths ?? Prisma.JsonNull;
    if (data.columnOrder !== undefined) updateData.columnOrder = data.columnOrder ?? [];
    if (data.hiddenColumns !== undefined) updateData.hiddenColumns = data.hiddenColumns ?? [];
    if (data.viewMode !== undefined) updateData.viewMode = data.viewMode ?? null;
    if (data.grouping !== undefined) {
      updateData.groupingColumnId = groupingShadowColumnId(data.grouping);
      updateData.grouping = data.grouping ?? Prisma.DbNull;
    }
    if (data.detailOptions !== undefined) updateData.detailOptions = data.detailOptions ?? Prisma.JsonNull;
    if (data.settings !== undefined) updateData.settings = data.settings ?? Prisma.JsonNull;

    const row = await this.prisma.p13n.upsert({
      where: {
        companyId_userId_p13nId: { companyId, userId, p13nId },
        companyId,
      },
      create: createData,
      update: updateData,
    });

    return {
      p13nId,
      activeViewKey: row.activeViewKey ?? undefined,
      filters: normalizeStoredFilters(row.filters),
      searchTerm: row.searchTerm ?? undefined,
      sortDescriptor: (row.sortDescriptor as SortDescriptor | null) ?? undefined,
      pagination: normalizeStoredPagination(row.pagination),
      columnWidths: (row.columnWidths as Record<string, number> | null) ?? undefined,
      columnOrder: row.columnOrder,
      hiddenColumns: row.hiddenColumns,
      viewMode: (row.viewMode as ViewMode | null) ?? undefined,
      grouping: readStoredGrouping(row.grouping),
      detailOptions: normalizeDetailOptions(row.detailOptions),
      settings: readP13nSettings(p13nId, row.settings) ?? undefined,
      ...(Array.isArray(row.viewStateKeys) ? this.explicitViewState(row) : {}),
    };
  }
  private explicitViewState(row: Parameters<typeof readStoredPersonalizationState>[0]) {
    const cleared = Object.fromEntries(
      DATA_VIEW_STATE_FIELDS.map((key) => [key === "pageSize" ? "pagination" : key, undefined]),
    );
    return { ...cleared, ...writePersonalizationState(readStoredPersonalizationState(row)) };
  }

  async resetSurfaceState(companyId: string, userId: string, surfaceKey: string, fields: StateField[]) {
    const current = await this.prisma.p13n.findUnique({
      where: { companyId, companyId_userId_p13nId: { companyId, userId, p13nId: surfaceKey } },
    });
    if (!current) return;
    const keys = Array.isArray(current.viewStateKeys)
      ? current.viewStateKeys
      : Object.keys(readStoredPersonalizationState(current));
    const remaining = keys.filter((key) => typeof key === "string" && !fields.includes(key as StateField));
    await this.prisma.p13n.updateMany({
      where: { companyId, userId, p13nId: surfaceKey },
      data: { ...resetPersonalizationColumns(fields), viewStateKeys: remaining as Prisma.InputJsonValue },
    });
  }

  async getDetailOptionsCompanyWide(companyId: string, p13nIds: string[], afterId?: string) {
    return this.prisma.p13n.findMany({
      where: {
        companyId,
        p13nId: { in: p13nIds },
        detailOptions: { not: Prisma.AnyNull },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: { id: true, p13nId: true, detailOptions: true, columnOrder: true },
      orderBy: { id: "asc" },
      take: CONFIGURATION_CONSUMER_PAGE,
    });
  }

  async getPersonalizationsCompanyWide(companyId: string, p13nIds: string[], afterId: string, take: number) {
    return this.prisma.p13n.findMany({
      where: { companyId, p13nId: { in: p13nIds }, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: "asc" },
      take,
    });
  }

  async countPersonalizationsCompanyWide(companyId: string, p13nIds: string[]) {
    return this.prisma.p13n.count({ where: { companyId, p13nId: { in: p13nIds } } });
  }

  async deletePersonalizationsCompanyWide(companyId: string, p13nIds: string[]): Promise<void> {
    await this.prisma.p13n.deleteMany({ where: { companyId, p13nId: { in: p13nIds } } });
  }

  async rewritePersonalizationStateCompanyWide(companyId: string, id: string, state: DataViewState): Promise<void> {
    const write = writePersonalizationState(state);
    await this.prisma.p13n.updateMany({
      where: { companyId, id },
      data: {
        ...(write.filters !== undefined ? { filters: write.filters as Prisma.InputJsonValue } : {}),
        ...(write.sortDescriptor !== undefined
          ? { sortDescriptor: (write.sortDescriptor ?? {}) as Prisma.InputJsonValue }
          : {}),
        ...(write.grouping !== undefined
          ? {
              grouping: write.grouping === null ? Prisma.DbNull : (write.grouping as Prisma.InputJsonValue),
              groupingColumnId: write.grouping === null ? null : groupingShadowColumnId(write.grouping),
            }
          : {}),
        ...(write.columnOrder !== undefined ? { columnOrder: write.columnOrder } : {}),
        ...(write.columnWidths !== undefined ? { columnWidths: write.columnWidths } : {}),
        ...(write.hiddenColumns !== undefined ? { hiddenColumns: write.hiddenColumns } : {}),
      },
    });
  }

  async rewriteDetailLayoutCompanyWide(companyId: string, id: string, layout: RecordDetailLayout): Promise<void> {
    const row = await this.prisma.p13n.findFirst({ where: { companyId, id } });
    if (!row) return;
    const options = EntityDetailOptionsSchema.parse(row.detailOptions);
    await this.prisma.p13n.updateMany({
      where: { companyId, id },
      data: {
        detailOptions: {
          ...options,
          starredFieldIds: layout.pinnedFields,
          hiddenFieldIds: layout.hiddenFields,
          fieldOrder: layout.fieldOrder,
        },
      },
    });
  }
}
