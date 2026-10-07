import { z } from "zod";

export const RECORD_PRESET_KEYS = ["contact", "organization", "deal", "service", "task"] as const;

export const RecordNavigationSchema = z
  .object({
    companyId: z.uuid(),
    schemaRevision: z.number().int().nonnegative(),
    canManageSchema: z.boolean(),
    types: z.array(
      z
        .object({
          id: z.uuid(),
          label: z.string(),
          pluralLabel: z.string(),
          icon: z.string(),
          canCreate: z.boolean(),
          hasAuthorizationTasks: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export type RecordNavigation = z.infer<typeof RecordNavigationSchema>;

export function recordNavigationKey(pathname: string): string | null {
  const [, section, typeId] = pathname.split("/");
  if (section === "configure") return "configure-records";
  return section === "records" && typeId ? `records:${typeId}` : section || null;
}
