import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { RecordMemberSchema, RecordRefSchema } from "@/features/records/record-model.schema";

export const TRASH_KINDS = [
  "record",
  "list",
  "field",
  "relationship",
  "view",
  "widget",
  "routine",
  "wikiPage",
] as const;
export const TrashKindSchema = z.enum(TRASH_KINDS);
export type TrashKind = z.infer<typeof TrashKindSchema>;

export const TrashItemDtoSchema = z
  .object({
    id: z.uuid(),
    kind: TrashKindSchema,
    targetId: z.string(),
    typeId: z.uuid().nullable(),
    surfaceKey: z.string().nullable(),
    label: z.string(),
    listLabel: z.string().nullable(),
    icon: z.string().nullable(),
    color: z.enum(CHIP_COLORS).nullable(),
    deletedBy: RecordMemberSchema.nullable(),
    deletedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    daysLeft: z.number().int().nonnegative(),
    batchId: z.uuid(),
  })
  .strict();
export type TrashItemDto = z.infer<typeof TrashItemDtoSchema>;

export const QueryTrashSchema = z
  .object({
    kinds: z.array(TrashKindSchema).max(TRASH_KINDS.length).optional(),
    typeIds: z.array(z.uuid()).max(200).optional(),
    search: z.string().trim().max(200).optional(),
    sortDescriptor: z
      .object({ field: z.literal("deletedAt"), direction: z.enum(["asc", "desc"]) })
      .strict()
      .optional()
      .describe("Order by deletion time; newest first when omitted."),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .strict();
export type QueryTrashData = z.infer<typeof QueryTrashSchema>;
export const TrashPageSchema = z.object({ items: z.array(TrashItemDtoSchema), total: z.number().int() }).strict();
export type TrashPage = z.infer<typeof TrashPageSchema>;

const TrashSelectionSchema = z.union([
  z.object({ itemIds: z.array(z.uuid()).min(1).max(500) }).strict(),
  z.object({ batchId: z.uuid() }).strict(),
]);
export const RestoreTrashSchema = z
  .object({
    itemIds: z.array(z.uuid()).min(1).max(500).optional(),
    batchId: z.uuid().optional(),
  })
  .strict()
  .describe("Restore the given Trash items, or every item of one delete (batchId from the delete result).")
  .transform((input, ctx) => {
    const parsed = TrashSelectionSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
      return z.NEVER;
    }
    return parsed.data;
  });
export type RestoreTrashData = z.infer<typeof RestoreTrashSchema>;

export const TrashRestoreBlockerSchema = z
  .object({
    itemId: z.uuid(),
    reason: z.enum(["listDeleted", "parentDeleted", "notFound", "requiresRestore", "nameTaken"]),
    typeId: z.uuid().nullable(),
    parent: RecordRefSchema.optional(),
  })
  .strict();
export type TrashRestoreBlocker = z.infer<typeof TrashRestoreBlockerSchema>;
export const TrashRestoreResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      restoredItemIds: z.array(z.uuid()),
      blocked: z.array(TrashRestoreBlockerSchema),
      restoredRecords: z.number().int(),
      droppedLinks: z.number().int(),
    })
    .strict(),
  z.object({ status: z.literal("pending"), operationId: z.uuid() }).strict(),
]);
export type TrashRestoreResult = z.infer<typeof TrashRestoreResultSchema>;

export const PreviewTrashDeletionSchema = z.union([
  z.object({ itemIds: z.array(z.uuid()).min(1).max(500) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export type PreviewTrashDeletionData = z.infer<typeof PreviewTrashDeletionSchema>;
export const TrashDeletionPreviewSchema = z
  .object({
    items: z.array(z.object({ itemId: z.uuid(), kind: TrashKindSchema, label: z.string() }).strict()),
    removedRecords: z.array(z.object({ typeId: z.uuid(), label: z.string(), count: z.number().int() }).strict()),
    removedLinks: z.number().int().nullable(),
    impactHash: z.string(),
  })
  .strict();
export type TrashDeletionPreview = z.infer<typeof TrashDeletionPreviewSchema>;

export const DeleteTrashPermanentlySchema = z
  .object({
    itemIds: z.array(z.uuid()).min(1).max(500),
    expectedImpactHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type DeleteTrashPermanentlyData = z.infer<typeof DeleteTrashPermanentlySchema>;
export const TrashDeletionResultSchema = z
  .object({
    deletedItemIds: z.array(z.uuid()).describe("Items deleted permanently."),
    pendingItemIds: z
      .array(z.uuid())
      .describe("Items whose permanent deletion continues in the background; they stay in Trash until it completes."),
    failedItemIds: z
      .array(z.uuid())
      .describe("Items that could not be deleted; they stay in Trash and the rest is unaffected."),
  })
  .strict();
export type TrashDeletionResult = z.infer<typeof TrashDeletionResultSchema>;

export const EmptyTrashSchema = z.object({ expectedImpactHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type EmptyTrashData = z.infer<typeof EmptyTrashSchema>;

export const TrashedRecordInfoSchema = z
  .object({
    itemId: z.uuid(),
    deletedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    daysLeft: z.number().int().nonnegative(),
    deletedBy: RecordMemberSchema.nullable(),
    canRestore: z.boolean(),
  })
  .strict();
export type TrashedRecordInfo = z.infer<typeof TrashedRecordInfoSchema>;
