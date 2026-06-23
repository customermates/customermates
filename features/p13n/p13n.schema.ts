import { z } from "zod";

export const P13nEntrySchema = z.object({
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
