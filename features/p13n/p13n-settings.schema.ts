import { z } from "zod";

import { SIDEBAR_P13N_ID, SidebarLayoutSchema } from "./sidebar-layout.schema";

export const CONFIGURE_GRAPH_P13N_ID = "configure-graph";
export const CONFIGURE_GRAPH_MAX_POSITIONS = 500;

const GraphCoordinateSchema = z.number().finite().min(-1_000_000).max(1_000_000);

export const ConfigureGraphLayoutSchema = z
  .object({
    positions: z
      .record(z.string().min(1).max(120), z.object({ x: GraphCoordinateSchema, y: GraphCoordinateSchema }).strict())
      .refine((positions) => Object.keys(positions).length <= CONFIGURE_GRAPH_MAX_POSITIONS, {
        message: "Too many saved node positions",
      }),
  })
  .strict();

export type ConfigureGraphLayout = z.infer<typeof ConfigureGraphLayoutSchema>;

export const P13nSettingsSchema = z.union([SidebarLayoutSchema, ConfigureGraphLayoutSchema]);

export type P13nSettings = z.infer<typeof P13nSettingsSchema>;

const settingsSchemas: Record<string, z.ZodType<P13nSettings>> = {
  [SIDEBAR_P13N_ID]: SidebarLayoutSchema,
  [CONFIGURE_GRAPH_P13N_ID]: ConfigureGraphLayoutSchema,
};

export function p13nSettingsSchema(p13nId: string) {
  return Object.hasOwn(settingsSchemas, p13nId) ? settingsSchemas[p13nId] : undefined;
}

export function readP13nSettings(p13nId: string, value: unknown) {
  return p13nSettingsSchema(p13nId)?.safeParse(value).data;
}
