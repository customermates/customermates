import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { RoutineRunStatus } from "@/generated/prisma";
import { RoutineDtoSchema } from "@/ee/routines/routine.schema";

import { AGENT_RUNTIMES, AutomationOwnerDtoSchema, AutomationRuleDtoSchema } from "./automation-rule.schema";

export const AUTOMATION_LIST_KINDS = ["rule", "routine"] as const;
export type AutomationListKind = (typeof AUTOMATION_LIST_KINDS)[number];

export const AUTOMATION_RUNS_ON = ["free", ...AGENT_RUNTIMES] as const;
export type AutomationRunsOn = (typeof AUTOMATION_RUNS_ON)[number];

export const AUTOMATION_LIST_STATUSES = ["active", "paused"] as const;
export type AutomationListStatus = (typeof AUTOMATION_LIST_STATUSES)[number];

export const AUTOMATION_LIST_WINDOW_DAYS = 30;
export const AUTOMATION_LIST_RULE_CAP = 200;
export const AUTOMATION_LIST_ROUTINE_CAP = 100;

export const AutomationListItemDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(AUTOMATION_LIST_KINDS),
  name: z.string(),
  enabled: z.boolean(),
  disabledReason: z.string().nullable(),
  runsOn: z.enum(AUTOMATION_RUNS_ON),
  lastRunAt: z.date().nullable(),
  lastRunStatus: z.enum(RoutineRunStatus).nullable(),
  runs30d: z.number().int().nonnegative(),
  ownerUserId: z.uuid().nullable(),
  owner: AutomationOwnerDtoSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  rule: AutomationRuleDtoSchema.nullable(),
  routine: RoutineDtoSchema.nullable(),
});
export type AutomationListItemDto = Data<typeof AutomationListItemDtoSchema>;

export const AutomationListNotShownSchema = z.object({
  rules: z.number().int().nonnegative(),
  routines: z.number().int().nonnegative(),
});
export type AutomationListNotShown = Data<typeof AutomationListNotShownSchema>;
