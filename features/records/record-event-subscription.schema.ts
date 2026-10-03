import { z } from "zod";
import { RecordQuerySchema } from "./record-query.schema";

export const RecordTriggerQuerySchema = RecordQuerySchema.pick({
  typeId: true,
  filters: true,
  relationships: true,
  relatedFilters: true,
  search: true,
}).strict();

export const RecordTriggerDefinitionSchema = z
  .object({
    query: RecordTriggerQuerySchema,
    changedFieldIds: z.array(z.uuid()).max(100),
  })
  .strict();

export const RecordTriggerSourceSchema = RecordTriggerDefinitionSchema.extend({
  events: z
    .array(z.enum(["record.created", "record.updated", "record.deleted"]))
    .min(1)
    .max(3),
}).strict();

export const RecordEventSubscriptionSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["routine", "webhook"]),
    ownerUserId: z.uuid(),
    typeId: z.uuid().nullable(),
    events: z
      .array(z.enum(["record.created", "record.updated", "record.deleted"]))
      .min(1)
      .max(3),
    changedFieldIds: z.array(z.uuid()).max(100),
    query: RecordTriggerQuerySchema.nullable(),
    sources: z.array(RecordTriggerSourceSchema).min(1).max(50).nullable().optional(),
    revision: z.number().int().positive(),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.kind === "routine" && !input.typeId && !input.sources?.length)
      ctx.addIssue({ code: "custom", path: ["typeId"], message: "A record routine requires a source type" });
    if (input.query && input.query.typeId !== input.typeId)
      ctx.addIssue({ code: "custom", path: ["query", "typeId"], message: "The query must use the subscription type" });
    if (input.sources?.length && (input.typeId || input.query || input.changedFieldIds.length)) {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Multi-source triggers use source-local definitions",
      });
    }
    if (new Set(input.events).size !== input.events.length)
      ctx.addIssue({ code: "custom", path: ["events"], message: "Event names must be unique" });
    for (const [index, source] of (input.sources ?? []).entries()) {
      if (source.events.some((event) => !input.events.includes(event)))
        ctx.addIssue({ code: "custom", path: ["sources", index, "events"], message: "Source event is not subscribed" });
      if (new Set(source.events).size !== source.events.length)
        ctx.addIssue({ code: "custom", path: ["sources", index, "events"], message: "Event names must be unique" });
    }
    if (input.sources?.length) {
      const sourceEvents = new Set(input.sources.flatMap((source) => source.events));
      if (input.events.some((event) => !sourceEvents.has(event)))
        ctx.addIssue({ code: "custom", path: ["events"], message: "Every subscribed event needs a source" });
    }
  });

export type RecordEventSubscriptionDefinition = z.infer<typeof RecordEventSubscriptionSchema>;
