import { z } from "zod";

import { P13nEntry } from "./prisma-p13n.repository";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import {
  FilterSchema,
  SortDescriptorSchema,
  SavedFilterPresetSchema,
  PaginationRequestSchema,
} from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";

const Schema = z.object({
  p13nId: z.string().min(1),
  filters: z.array(FilterSchema).nullable().optional(),
  savedFilterPresets: z.array(SavedFilterPresetSchema).nullable().optional(),
  searchTerm: z.string().nullable().optional(),
  sortDescriptor: SortDescriptorSchema.nullable().optional(),
  pagination: PaginationRequestSchema.nullable().optional(),
  columnOrder: z.array(z.string()).nullable().optional(),
  columnWidths: z.record(z.string(), z.number()).nullable().optional(),
  hiddenColumns: z.array(z.string()).optional(),
  viewMode: z.enum(ViewMode).nullable().optional(),
  groupingColumnId: z.uuid().nullable().optional(),
});
export type UpsertP13nData = Data<typeof Schema>;

export abstract class UpsertP13nRepo {
  abstract upsertP13n(data: UpsertP13nData): Promise<P13nEntry>;
}

@TentantInteractor()
export class UpsertP13nInteractor {
  constructor(private repo: UpsertP13nRepo) {}

  @Enforce(Schema)
  async invoke(data: UpsertP13nData): Validated<P13nEntry> {
    return { ok: true, data: await this.repo.upsertP13n(data) };
  }
}
