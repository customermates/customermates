import { z } from "zod";

import { PaginationRequestSchema } from "@/core/base/base-get.schema";

export const EntityDetailOptionsSchema = z.object({
  starredFieldIds: z.array(z.string().min(1)),
  collapsedSectionIds: z.array(z.string().min(1)),
  hiddenFieldIds: z.array(z.string().min(1)).optional(),
});

export type EntityDetailOptions = z.infer<typeof EntityDetailOptionsSchema>;

export const P13nEntrySchema = z.object({
  p13nId: z.string(),
  activeViewKey: z.string().optional(),
  filters: z.array(z.any()).optional(),
  searchTerm: z.string().optional(),
  sortDescriptor: z.any().optional(),
  pagination: PaginationRequestSchema.pick({ pageSize: true }).optional(),
  columnWidths: z.record(z.string(), z.number()).optional(),
  columnOrder: z.array(z.string()).optional(),
  hiddenColumns: z.array(z.string()).optional(),
  viewMode: z.string().optional(),
  grouping: z.any().optional(),
  detailOptions: EntityDetailOptionsSchema.optional(),
});
