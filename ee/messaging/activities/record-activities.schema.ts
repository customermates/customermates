import { z } from "zod";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { ActivityEntryDtoSchema, ACTIVITY_KINDS } from "./activities.schema";
import { MessagingProviderSchema } from "../messaging.schema";

export const RecordActivityCursorSchema = z
  .object({
    at: z.iso.datetime(),
    kind: z.enum(["record", "audit", "message", "activity", "calendar_event"]),
    id: z.string().min(1).max(200),
  })
  .strict();

const SelectionOperatorSchema = z.enum(["in", "notIn"]);
export const RecordActivityFilterSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("source"),
      operator: SelectionOperatorSchema,
      values: z.array(z.enum(ACTIVITY_KINDS)).min(1).max(4),
    })
    .strict(),
  z
    .object({
      kind: z.literal("provider"),
      operator: SelectionOperatorSchema,
      values: z.array(MessagingProviderSchema).min(1).max(7),
    })
    .strict(),
  z
    .object({ kind: z.literal("account"), operator: SelectionOperatorSchema, values: z.array(z.uuid()).min(1).max(50) })
    .strict(),
  z
    .object({ kind: z.literal("thread"), operator: SelectionOperatorSchema, values: z.array(z.uuid()).min(1).max(50) })
    .strict(),
  z
    .object({
      kind: z.literal("record"),
      typeId: z.uuid(),
      operator: z.enum(["in", "notIn", "hasSome", "hasNone"]),
      recordIds: z.array(z.uuid()).max(50),
    })
    .strict()
    .superRefine((filter, context) => {
      if ((filter.operator === "in" || filter.operator === "notIn") !== filter.recordIds.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["recordIds"],
          message: "Select records for in/notIn; presence filters apply to the complete type.",
        });
      }
    }),
]);
export type RecordActivityFilter = z.infer<typeof RecordActivityFilterSchema>;

export const RecordActivitiesInputSchema = z
  .object({
    scope: z
      .object({
        records: z.array(RecordRefSchema).max(50).default([]),
        typeIds: z.array(z.uuid()).max(50).default([]),
      })
      .strict(),
    kinds: z
      .array(z.enum(ACTIVITY_KINDS))
      .min(1)
      .max(4)
      .default([...ACTIVITY_KINDS]),
    providers: z.array(MessagingProviderSchema).max(7).optional(),
    threadIds: z.array(z.uuid()).max(50).optional(),
    after: z.iso.datetime().optional(),
    before: z.iso.datetime().optional(),
    filters: z.array(RecordActivityFilterSchema).max(20).optional(),
    cursor: RecordActivityCursorSchema.nullable().default(null),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export const RecordActivityQuerySchema = RecordActivitiesInputSchema.omit({ cursor: true, limit: true });
export type RecordActivityQuery = z.infer<typeof RecordActivityQuerySchema>;

export const RecordActivitiesResultSchema = z
  .object({
    items: z.array(ActivityEntryDtoSchema),
    nextCursor: RecordActivityCursorSchema.nullable(),
    availableSources: z.array(z.enum(ACTIVITY_KINDS)),
  })
  .strict();

export type RecordActivitiesInput = z.infer<typeof RecordActivitiesInputSchema>;
export type RecordActivitiesResult = z.infer<typeof RecordActivitiesResultSchema>;
