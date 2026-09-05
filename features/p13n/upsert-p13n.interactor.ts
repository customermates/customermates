import type { P13nEntry } from "./prisma-p13n.repository";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { FilterSchema, SortDescriptorSchema, PaginationRequestSchema } from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { EntityDetailOptionsSchema, P13nEntrySchema } from "./p13n.schema";

const Schema = z.object({
  p13nId: z.string().min(1),
  activeViewKey: z.string().nullish(),
  filters: z.array(FilterSchema).nullish(),
  searchTerm: z.string().nullish(),
  sortDescriptor: SortDescriptorSchema.nullish(),
  pagination: PaginationRequestSchema.partial({ page: true }).nullish(),
  columnOrder: z.array(z.string()).nullish(),
  columnWidths: z.record(z.string(), z.number()).nullish(),
  hiddenColumns: z.array(z.string()).optional(),
  viewMode: z.enum(ViewMode).nullish(),
  groupingColumnId: z.uuid().nullish(),
  grouping: GroupingSchema.nullish(),
  detailOptions: EntityDetailOptionsSchema.nullish(),
});
export type UpsertP13nData = Data<typeof Schema>;

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
  async invoke(data: UpsertP13nData): Promise<{ ok: true; data: P13nEntry }> {
    return { ok: true as const, data: await this.repo.upsertP13n(data) };
  }
}
