import { z as schema } from "zod";
import type { z } from "zod";
import { PlannerConfigSchema, PlannerQuerySchema } from "./planner.schema";

export const CALENDAR_SUBSCRIPTION_LIMIT = 10;
export const ManageCalendarSubscriptionsSchema = schema.discriminatedUnion("action", [
  schema.object({ action: schema.literal("list") }).strict(),
  schema
    .object({
      action: schema.literal("create"),
      config: PlannerConfigSchema,
      includePersonalEvents: schema.boolean().default(false),
    })
    .strict(),
  schema.object({ action: schema.literal("revoke"), id: schema.uuid() }).strict(),
]);
export type ManageCalendarSubscriptionsInput = z.infer<typeof ManageCalendarSubscriptionsSchema>;
export type SubscriptionList = {
  subscriptions: Array<{ id: string; createdAt: string }>;
  created?: { id: string; url: string };
};

export const ExportPlannerSchema = PlannerQuerySchema.extend({
  includePersonalEvents: schema.boolean().default(false),
});

export const ReadCalendarSubscriptionSchema = schema.object({ token: schema.string().regex(/^[\w-]{43}$/u) }).strict();
export type ReadCalendarSubscription = z.infer<typeof ReadCalendarSubscriptionSchema>;
