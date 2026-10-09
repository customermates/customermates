import { z } from "zod";
import { CalculatedValueSchema, RecordDateTimeSchema, RecordRefSchema } from "./record-model.schema";

export const RecordSearchCursorSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    createdAt: RecordDateTimeSchema,
    ref: RecordRefSchema,
  })
  .strict();

export const RecordSearchSchema = z
  .object({
    searchTerm: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        "Text to find in titles and searchable fields; a record id finds that record. Wrap a phrase in double quotes to match it exactly. Otherwise, when nothing matches, records with a similarly spelled title are returned, best first and without nextCursor.",
      ),
    typeIds: z.array(z.uuid()).min(1).max(100).optional(),
    includeEmbedded: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(40),
    cursor: RecordSearchCursorSchema.nullable().default(null),
  })
  .strict();
export type RecordSearch = z.infer<typeof RecordSearchSchema>;

export const RecordSearchHitSchema = z
  .object({
    ref: RecordRefSchema,
    title: CalculatedValueSchema,
    typeLabel: z.string(),
    typePluralLabel: z.string(),
    icon: z.string(),
    pictureUrl: z.string().nullable(),
    canEdit: z.boolean().optional(),
  })
  .strict();
export type RecordSearchHit = z.infer<typeof RecordSearchHitSchema>;

export const RecordSearchResultSchema = z
  .object({
    results: z.array(RecordSearchHitSchema),
    schemaRevision: z.number().int().nonnegative(),
    nextCursor: RecordSearchCursorSchema.nullable(),
  })
  .strict();
export type RecordSearchResult = z.infer<typeof RecordSearchResultSchema>;

export function recordSearchKey(item: Pick<RecordSearchHit, "ref">) {
  return `${item.ref.typeId}:${item.ref.recordId}`;
}

export function recordSearchLabel(item: RecordSearchHit, translate: (key: string) => string) {
  if (item.title.state === "value" && item.title.value.kind === "text") return item.title.value.value || item.typeLabel;
  if (item.title.state === "restricted") return translate("RecordModel.restricted");
  if (item.title.state === "error") return translate("RecordModel.calculationError");
  return item.typeLabel;
}

export const StoredSearchReferenceSchema = RecordRefSchema;
export type StoredSearchReference = z.infer<typeof StoredSearchReferenceSchema>;
export const ResolveRecordSearchSchema = z.object({ refs: z.array(StoredSearchReferenceSchema).max(50) }).strict();
export type ResolveRecordSearchInput = z.infer<typeof ResolveRecordSearchSchema>;
