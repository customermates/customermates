import { z } from "zod";

import { ALL_VIEW_KEY, DATA_VIEW_SURFACE_KEYS } from "./data-view-keys";

export const ViewKeySchema = z.union([z.literal(ALL_VIEW_KEY), z.uuid()]);
export type ViewKey = z.infer<typeof ViewKeySchema>;

export const RecordSurfaceKeySchema = z
  .string()
  .regex(
    /^records:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ) as z.ZodType<`records:${string}`>;
export const SurfaceKeySchema = z.union([z.enum(DATA_VIEW_SURFACE_KEYS), RecordSurfaceKeySchema]);
