import { z } from "zod";

import { ALL_VIEW_KEY, DATA_VIEW_SURFACE_KEYS } from "./data-view-keys";

export const ViewKeySchema = z.union([z.literal(ALL_VIEW_KEY), z.uuid()]);
export type ViewKey = z.infer<typeof ViewKeySchema>;

export const SurfaceKeySchema = z.enum(DATA_VIEW_SURFACE_KEYS);
