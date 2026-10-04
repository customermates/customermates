import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WikiCrawlCategorySchema } from "./website-discovery";

const WikiSourceQaSchema = z.object({ question: z.string(), answer: z.string() }).strict();
const StoredWikiSourceMetadataSchema = z.object({
  category: WikiCrawlCategorySchema,
  qaPairs: z
    .array(WikiSourceQaSchema)
    .nullable()
    .transform((pairs) => pairs ?? []),
});
export type StoredWikiSourceMetadata = Data<typeof StoredWikiSourceMetadataSchema>;

export function parseStoredWikiSourceMetadata(value: unknown): StoredWikiSourceMetadata {
  const parsed = StoredWikiSourceMetadataSchema.safeParse(value);
  if (!parsed.success) throw new Error("Knowledge Base source metadata is invalid.", { cause: parsed.error });

  return parsed.data;
}
