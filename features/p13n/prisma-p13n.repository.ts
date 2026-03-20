import type { RepoArgs } from "@/core/utils/types";
import type { Filter, SortDescriptor, PaginationRequest } from "@/core/base/base-get.schema";
import type { ViewMode } from "@/core/base/base-query-builder";

import { Prisma } from "@/generated/prisma";

import { UpsertP13nRepo } from "./upsert-p13n.interactor";
import { UpsertFilterPresetRepo } from "./upsert-filter-preset.interactor";
import { DeleteFilterPresetRepo } from "./delete-filter-preset.interactor";

import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { P13nRepo } from "@/core/base/base-get.interactor";

export type SavedFilterPreset = {
  id: string;
  name: string;
  filters: Filter[];
};

export interface P13nEntry {
  p13nId: string;
  filters?: Filter[];
  savedFilterPresets?: SavedFilterPreset[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor;
  pagination?: PaginationRequest;
  columnWidths?: Record<string, number>;
  columnOrder?: string[];
  hiddenColumns?: string[];
  viewMode?: ViewMode;
  groupingColumnId?: string;
}

@Repository
export class PrismaP13nRepo
  extends BaseRepository
  implements P13nRepo, UpsertP13nRepo, UpsertFilterPresetRepo, DeleteFilterPresetRepo
{
  async getP13n(p13nId: string): Promise<P13nEntry | undefined> {
    const { companyId, id: userId } = this.user;

    const res = await this.prisma.p13n.findUnique({
      where: { companyId_userId_p13nId: { companyId, userId, p13nId }, companyId },
    });

    if (!res) return undefined;

    const {
      filters,
      savedFilterPresets,
      searchTerm,
      sortDescriptor,
      pagination,
      columnOrder,
      columnWidths,
      hiddenColumns,
      viewMode,
      groupingColumnId,
    } = res;

    return {
      p13nId,
      filters: (filters as Filter[] | null) ?? undefined,
      savedFilterPresets: Array.isArray(savedFilterPresets)
        ? (savedFilterPresets as unknown as SavedFilterPreset[])
        : undefined,
      searchTerm: searchTerm ?? undefined,
      sortDescriptor: (sortDescriptor as SortDescriptor | null) ?? undefined,
      pagination: (pagination as PaginationRequest | null) ?? undefined,
      columnWidths: (columnWidths as Record<string, number> | null) ?? undefined,
      columnOrder,
      hiddenColumns,
      viewMode: (viewMode as ViewMode | null) ?? undefined,
      groupingColumnId: groupingColumnId ?? undefined,
    };
  }

  async upsertP13n({ p13nId, ...data }: RepoArgs<UpsertP13nRepo, "upsertP13n">) {
    const { companyId, id: userId } = this.user;

    const createData = {
      companyId,
      userId,
      p13nId,
      filters: data.filters ?? Prisma.JsonNull,
      savedFilterPresets: data.savedFilterPresets ?? Prisma.JsonNull,
      searchTerm: data.searchTerm ?? null,
      sortDescriptor: data.sortDescriptor ?? Prisma.JsonNull,
      pagination: data.pagination ?? Prisma.JsonNull,
      columnWidths: data.columnWidths ?? Prisma.JsonNull,
      columnOrder: data.columnOrder ?? [],
      hiddenColumns: data.hiddenColumns ?? [],
      viewMode: data.viewMode ?? null,
      groupingColumnId: data.groupingColumnId ?? null,
    };

    const updateData = {
      companyId,
      userId,
      p13nId,
    } as Prisma.P13nUpdateInput;

    if (data.filters !== undefined) updateData.filters = data.filters ?? Prisma.JsonNull;
    if (data.savedFilterPresets !== undefined)
      updateData.savedFilterPresets = data.savedFilterPresets ?? Prisma.JsonNull;
    if (data.searchTerm !== undefined) updateData.searchTerm = data.searchTerm;
    if (data.sortDescriptor !== undefined) updateData.sortDescriptor = data.sortDescriptor ?? Prisma.JsonNull;
    if (data.pagination !== undefined) updateData.pagination = data.pagination ?? Prisma.JsonNull;
    if (data.columnWidths !== undefined) updateData.columnWidths = data.columnWidths ?? Prisma.JsonNull;
    if (data.columnOrder !== undefined) updateData.columnOrder = data.columnOrder ?? [];
    if (data.hiddenColumns !== undefined) updateData.hiddenColumns = data.hiddenColumns ?? [];
    if (data.viewMode !== undefined) updateData.viewMode = data.viewMode ?? null;
    if (data.groupingColumnId !== undefined) updateData.groupingColumnId = data.groupingColumnId ?? null;

    const row = await this.prisma.p13n.upsert({
      where: { companyId_userId_p13nId: { companyId, userId, p13nId }, companyId },
      create: createData,
      update: updateData,
    });

    return {
      p13nId,
      filters: (row.filters as Filter[] | null) ?? undefined,
      savedFilterPresets: Array.isArray(row.savedFilterPresets)
        ? (row.savedFilterPresets as unknown as SavedFilterPreset[])
        : undefined,
      searchTerm: row.searchTerm ?? undefined,
      sortDescriptor: (row.sortDescriptor as SortDescriptor | null) ?? undefined,
      pagination: (row.pagination as PaginationRequest | null) ?? undefined,
      columnWidths: (row.columnWidths as Record<string, number> | null) ?? undefined,
      columnOrder: row.columnOrder,
      hiddenColumns: row.hiddenColumns,
      viewMode: (row.viewMode as ViewMode | null) ?? undefined,
      groupingColumnId: row.groupingColumnId ?? undefined,
    };
  }
}
