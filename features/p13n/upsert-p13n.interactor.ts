import type { P13nEntry } from "./prisma-p13n.repository";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
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

const P13nEntrySchema = z.object({
  p13nId: z.string(),
  filters: z.array(z.any()).optional(),
  savedFilterPresets: z.array(z.any()).optional(),
  searchTerm: z.string().optional(),
  sortDescriptor: z.any().optional(),
  pagination: z.any().optional(),
  columnWidths: z.record(z.string(), z.number()).optional(),
  columnOrder: z.array(z.string()).optional(),
  hiddenColumns: z.array(z.string()).optional(),
  viewMode: z.string().optional(),
  groupingColumnId: z.string().optional(),
});

export abstract class UpsertP13nRepo {
  abstract upsertP13n(data: UpsertP13nData): Promise<P13nEntry>;
}

@TenantInteractor()
export class UpsertP13nInteractor extends AuthenticatedInteractor<UpsertP13nData, P13nEntry> {
  constructor(private repo: UpsertP13nRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(P13nEntrySchema)
  async invoke(data: UpsertP13nData): Validated<P13nEntry> {
    return { ok: true as const, data: await this.repo.upsertP13n(data) };
  }
}
