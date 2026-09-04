import type { RepoArgs } from "@/core/utils/types";
import type { Filter, SortDescriptor, PaginationRequest } from "@/core/base/base-get.schema";
import type { ViewMode } from "@/core/base/base-query-builder";
import type { Grouping } from "@/core/base/grouping/grouping.schema";
import type { UpsertP13nRepo } from "./upsert-p13n.interactor";
import type { GetP13nRepo } from "./get-p13n.interactor";

import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { CLEARED_GROUPING, groupingShadowColumnId, readStoredGrouping } from "@/core/base/grouping/stored-grouping";
import { normalizeFilters } from "@/core/base/filter-compat";
import { EntityDetailOptionsSchema, type EntityDetailOptions } from "./p13n.schema";

export interface P13nEntry {
  p13nId: string;
  activeViewKey?: string;
  filters?: Filter[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor;
  pagination?: PaginationRequest;
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
  hiddenColumns?: string[];
  viewMode?: ViewMode;
  groupingColumnId?: string;
  grouping?: Grouping;
  detailOptions?: EntityDetailOptions;
}

function normalizeStoredFilters(value: unknown): Filter[] | undefined {
  return Array.isArray(value) ? normalizeFilters(value as unknown as Filter[]) : undefined;
}

function normalizeDetailOptions(value: unknown): EntityDetailOptions | undefined {
  const parsed = EntityDetailOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export class PrismaP13nRepo extends BaseRepository implements GetP13nRepo, UpsertP13nRepo {
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
      groupingColumnId,
      grouping,
      detailOptions,
    } = res;

    return {
      p13nId,
      activeViewKey: activeViewKey ?? undefined,
      filters: normalizeStoredFilters(filters),
      searchTerm: searchTerm ?? undefined,
      sortDescriptor: (sortDescriptor as SortDescriptor | null) ?? undefined,
      pagination: (pagination as PaginationRequest | null) ?? undefined,
      columnWidths: (columnWidths as Record<string, number> | null) ?? undefined,
      columnOrder,
      hiddenColumns,
      viewMode: (viewMode as ViewMode | null) ?? undefined,
      groupingColumnId: groupingColumnId ?? undefined,
      grouping: readStoredGrouping(grouping, groupingColumnId, viewMode) ?? undefined,
      detailOptions: normalizeDetailOptions(detailOptions),
    };
  }

  async upsertP13n({ p13nId, ...data }: RepoArgs<UpsertP13nRepo, "upsertP13n">) {
    const { companyId, id: userId } = this.user;

    const createData = {
      companyId,
      userId,
      p13nId,
      activeViewKey: data.activeViewKey ?? null,
      filters: data.filters ?? Prisma.JsonNull,
      searchTerm: data.searchTerm ?? null,
      sortDescriptor: data.sortDescriptor ?? Prisma.JsonNull,
      pagination: data.pagination ?? Prisma.JsonNull,
      columnWidths: data.columnWidths ?? Prisma.JsonNull,
      columnOrder: data.columnOrder ?? [],
      hiddenColumns: data.hiddenColumns ?? [],
      viewMode: data.viewMode ?? null,
      groupingColumnId: groupingShadowColumnId(data.grouping),
      grouping: data.grouping ?? Prisma.JsonNull,
      detailOptions: data.detailOptions ?? Prisma.JsonNull,
    };

    const updateData = {
      companyId,
      userId,
      p13nId,
    } as Prisma.P13nUpdateInput;

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
      updateData.grouping = data.grouping ?? CLEARED_GROUPING;
    }
    if (data.detailOptions !== undefined) updateData.detailOptions = data.detailOptions ?? Prisma.JsonNull;

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
      pagination: (row.pagination as PaginationRequest | null) ?? undefined,
      columnWidths: (row.columnWidths as Record<string, number> | null) ?? undefined,
      columnOrder: row.columnOrder,
      hiddenColumns: row.hiddenColumns,
      viewMode: (row.viewMode as ViewMode | null) ?? undefined,
      groupingColumnId: row.groupingColumnId ?? undefined,
      grouping: readStoredGrouping(row.grouping, row.groupingColumnId, row.viewMode) ?? undefined,
      detailOptions: normalizeDetailOptions(row.detailOptions),
    };
  }
}
