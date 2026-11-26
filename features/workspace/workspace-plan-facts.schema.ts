import { z } from "zod";

import { PLAN_IDS, PURCHASABLE_PLAN_IDS } from "@/core/commercial/plan-catalog";

export const FREE_LOSS_KINDS = [
  "accounts",
  "drafts",
  "routines",
  "rules",
  "members",
  "forms",
  "webhooks",
  "mate",
] as const;

export const WorkspacePlanFactsSchema = z.object({
  plan: z.enum(PLAN_IDS),
  onFreePlan: z.boolean(),
  trialDaysLeft: z.number().int().nonnegative().nullable(),
  lostOnFree: z.array(z.object({ kind: z.enum(FREE_LOSS_KINDS), count: z.number().int().positive() })),
  keepsItRunning: z.enum(PURCHASABLE_PLAN_IDS).nullable(),
  choosePlanUrl: z.url(),
});
