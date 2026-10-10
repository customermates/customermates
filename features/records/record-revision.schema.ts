import { z } from "zod";
import {
  ConfigurationChangeSchema,
  ConfigurationPreviewSchema,
  ConfigurationTargetSchema,
} from "./configuration.schema";
import { RecordGrantSchema } from "./record-model.schema";

export const RecordRevisionChangeSchema = z
  .object({
    version: z.literal(1),
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("configuration") }).strict(),
      z.object({ kind: z.literal("role"), roleId: z.uuid(), action: z.enum(["create", "update", "delete"]) }).strict(),
      z.object({ kind: z.literal("initialization") }).strict(),
    ]),
    causeId: z.string().min(1).max(200),
    expectedRevision: z.number().int().nonnegative(),
    configuration: ConfigurationChangeSchema.optional(),
    deletions: z
      .array(
        z
          .object({
            target: ConfigurationTargetSchema,
            cascade: z.array(ConfigurationTargetSchema),
            nameField: z.object({ typeId: z.uuid(), replacementId: z.uuid().nullable() }).strict().optional(),
          })
          .strict(),
      )
      .optional(),
    references: ConfigurationPreviewSchema.shape.references,
    grants: z.array(
      z
        .object({
          typeId: z.uuid(),
          before: z.array(RecordGrantSchema),
          after: z.array(RecordGrantSchema),
        })
        .strict(),
    ),
  })
  .strict();

export type RecordRevisionChange = z.infer<typeof RecordRevisionChangeSchema>;
