import { z } from "zod";

export const RecordSystemColumnSchema = z.enum(["system:createdAt", "system:updatedAt", "system:assignedTo"]);
export const RecordFieldKeySchema = z.union([z.uuid(), RecordSystemColumnSchema]);
export const RecordColumnKeySchema = z.union([
  RecordFieldKeySchema,
  z.string().regex(/^path:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),
  z
    .string()
    .regex(
      /^relationship:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:(outgoing|incoming)$/,
    ),
]);

export function relationshipPathColumnKey(pathId: string): string {
  return `path:${pathId}`;
}

export function parseRelationshipPathColumnKey(key: string): string | null {
  return key.startsWith("path:") && z.uuid().safeParse(key.slice(5)).success ? key.slice(5) : null;
}
export const RecordRelationshipSelectionSchema = z
  .object({
    relationId: z.uuid(),
    direction: z.enum(["outgoing", "incoming"]),
    limit: z.number().int().min(1).max(25).default(3),
  })
  .strict();
export type RecordRelationshipSelection = z.infer<typeof RecordRelationshipSelectionSchema>;

export function relationshipColumnKey(relationId: string, direction: "outgoing" | "incoming"): string {
  return `relationship:${relationId}:${direction}`;
}

export function parseRelationshipColumnKey(key: string): RecordRelationshipSelection | null {
  const [kind, relationId, direction, extra] = key.split(":");
  if (kind !== "relationship" || extra !== undefined) return null;
  const parsed = RecordRelationshipSelectionSchema.safeParse({ relationId, direction });
  return parsed.success ? parsed.data : null;
}
