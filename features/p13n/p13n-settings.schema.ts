import { z } from "zod";

import { KEYBOARD_P13N_ID, KeyboardPreferencesSchema } from "./keyboard-preferences.schema";
import { SIDEBAR_P13N_ID, SidebarLayoutSchema } from "./sidebar-layout.schema";
import { SublistColumnsSchema, isSublistColumnsP13nId } from "./sublist-columns.schema";

export const CONFIGURE_GRAPH_P13N_ID = "configure-graph";
const CONFIGURE_GRAPH_MAX_POSITIONS = 500;

const GraphCoordinateSchema = z.number().finite().min(-1_000_000).max(1_000_000);

const ConfigureGraphLayoutSchema = z
  .object({
    positions: z
      .record(z.string().min(1).max(120), z.object({ x: GraphCoordinateSchema, y: GraphCoordinateSchema }).strict())
      .refine((positions) => Object.keys(positions).length <= CONFIGURE_GRAPH_MAX_POSITIONS, {
        message: "Too many saved node positions",
      }),
    expanded: z.array(z.string().min(1).max(120)).max(CONFIGURE_GRAPH_MAX_POSITIONS).optional(),
  })
  .strict();

export type ConfigureGraphLayout = z.infer<typeof ConfigureGraphLayoutSchema>;

const P13N_SETTINGS_SCHEMAS = {
  [SIDEBAR_P13N_ID]: SidebarLayoutSchema,
  [CONFIGURE_GRAPH_P13N_ID]: ConfigureGraphLayoutSchema,
  [KEYBOARD_P13N_ID]: KeyboardPreferencesSchema,
} as const;

type P13nSettingsId = keyof typeof P13N_SETTINGS_SCHEMAS;

type P13nSettingsOf<Id extends P13nSettingsId> = z.infer<(typeof P13N_SETTINGS_SCHEMAS)[Id]>;

export const P13nSettingsSchema = z.union([
  SidebarLayoutSchema,
  ConfigureGraphLayoutSchema,
  KeyboardPreferencesSchema,
  SublistColumnsSchema,
]);

export type P13nSettings = z.infer<typeof P13nSettingsSchema>;

function isP13nSettingsId(p13nId: string): p13nId is P13nSettingsId {
  return Object.hasOwn(P13N_SETTINGS_SCHEMAS, p13nId);
}

export function p13nSettingsSchema(p13nId: string) {
  if (isSublistColumnsP13nId(p13nId)) return SublistColumnsSchema;
  return isP13nSettingsId(p13nId) ? P13N_SETTINGS_SCHEMAS[p13nId] : undefined;
}

export function readP13nSettings<Id extends P13nSettingsId>(p13nId: Id, value: unknown): P13nSettingsOf<Id> | null;
export function readP13nSettings(p13nId: string, value: unknown): P13nSettings | null;
export function readP13nSettings(p13nId: string, value: unknown): P13nSettings | null {
  const result = p13nSettingsSchema(p13nId)?.safeParse(value);
  return result?.success ? result.data : null;
}
