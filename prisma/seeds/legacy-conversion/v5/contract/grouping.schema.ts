import { z } from "zod";
export const DATE_BUCKETS = ["day", "week", "month"] as const;
export const DEFAULT_DATE_BUCKET = "month";
export const GroupingSchema = z.object({ field: z.string().min(1).max(200), bucket: z.enum(DATE_BUCKETS).optional() });
export type Grouping = z.infer<typeof GroupingSchema>;
export const GroupPageRequestSchema = z.object({
  perGroup: z.number().int().min(1).max(500).optional(),
  overrides: z.record(z.string(), z.number().int().min(1).max(500)).optional(),
  collapsed: z.array(z.string().max(256)).max(50).optional(),
  only: z.string().max(256).optional(),
  includeValueSums: z.boolean().optional(),
});
