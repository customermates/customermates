import { z } from "zod";

export const CommandCatalogSchema = z
  .object({
    schemaRevision: z.number().int().nonnegative(),
    views: z.array(z.object({ typeId: z.uuid(), id: z.string(), name: z.string() }).strict()),
    fields: z.array(z.object({ typeId: z.uuid(), id: z.string(), label: z.string() }).strict()),
  })
  .strict();

export type CommandCatalog = z.infer<typeof CommandCatalogSchema>;
