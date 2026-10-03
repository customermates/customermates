import { z } from "zod";
import {
  RecordActivityQuerySchema,
  RecordActivitiesResultSchema,
} from "@/ee/messaging/activities/record-activities.schema";
import { WidgetLayoutSchema } from "./widget-display.schema";

export const RecordActivityWidgetInputSchema = z
  .object({
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(200),
    name: z.string().trim().min(1).max(255),
    activityQuery: RecordActivityQuerySchema,
    displayOptions: z.object({ showFilters: z.boolean() }).strict(),
    isTemplate: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.id) !== Boolean(value.expectedVersion)) {
      context.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "Updates require the saved widget version",
      });
    }
  });

export const RecordActivityWidgetDtoSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal("activityTimeline"),
    contractVersion: z.literal(2),
    version: z.number().int().positive(),
    userId: z.string(),
    companyId: z.string(),
    name: z.string(),
    activityQuery: RecordActivityQuerySchema,
    displayOptions: z.object({ showFilters: z.boolean() }).strict(),
    layout: WidgetLayoutSchema.nullable(),
    isTemplate: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    schemaRevision: z.number().int().nonnegative(),
    data: RecordActivitiesResultSchema.nullable(),
    status: z.enum(["ready", "unavailable"]),
  })
  .strict();

export type RecordActivityWidgetInput = z.infer<typeof RecordActivityWidgetInputSchema>;
export type RecordActivityWidgetDto = z.infer<typeof RecordActivityWidgetDtoSchema>;
export type StoredRecordActivityWidget = Omit<RecordActivityWidgetDto, "schemaRevision" | "data" | "status">;

export interface RecordActivityWidgetRepo {
  findReadable(id: string): Promise<StoredRecordActivityWidget | null>;
  listOwned(): Promise<StoredRecordActivityWidget[]>;
  findOwned(id: string): Promise<StoredRecordActivityWidget | null>;
  save(input: RecordActivityWidgetInput, id: string): Promise<StoredRecordActivityWidget>;
}
