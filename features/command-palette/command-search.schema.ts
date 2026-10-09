import { z } from "zod";

import { APP_LOCALES } from "@/i18n/locale-registry";
import { RecordSearchResultSchema } from "@/features/records/record-search.schema";

export const SEMANTIC_MATCH_MIN_SIMILARITY = 0.63;
export const SEMANTIC_BEST_MATCH_MIN_SIMILARITY = 0.66;
export const SEMANTIC_BEST_MATCH_MARGIN = 0.03;

export const COMMAND_SEARCH_SCOPES = ["lists", "views", "settings", "docs", "records"] as const;
export type CommandSearchScope = (typeof COMMAND_SEARCH_SCOPES)[number];

export const CommandSearchInputSchema = z
  .object({
    searchTerm: z.string().trim().min(1).max(200),
    scope: z.enum(COMMAND_SEARCH_SCOPES).nullable(),
    locale: z.enum(APP_LOCALES),
  })
  .strict();
export type CommandSearchInput = z.infer<typeof CommandSearchInputSchema>;

export const CommandSemanticHitSchema = z.object({ key: z.string(), similarity: z.number() }).strict();

export const CommandDocsHitSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    section: z.string().nullable(),
    href: z.string(),
    similarity: z.number(),
  })
  .strict();
export type CommandDocsHit = z.infer<typeof CommandDocsHitSchema>;

export const CommandCatalogSearchResultSchema = z
  .object({
    semantic: z.array(CommandSemanticHitSchema),
    docs: z.array(CommandDocsHitSchema),
    degraded: z.boolean(),
  })
  .strict();
export type CommandCatalogSearchResult = z.infer<typeof CommandCatalogSearchResultSchema>;

export const CommandSearchResultSchema = CommandCatalogSearchResultSchema.extend({
  records: RecordSearchResultSchema,
}).strict();
export type CommandSearchResult = z.infer<typeof CommandSearchResultSchema>;
