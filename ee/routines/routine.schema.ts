import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  AgentTurnStopReason,
  AgentTurnTerminalCode,
  EntityType,
  RoutineRunStatus,
  RoutineTriggerKind,
  Status,
} from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx } from "@/core/validation/validation.utils";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { FilterSchema } from "@/core/base/base-get.schema";
import { ROUTINE_TRIGGER_EVENTS, RoutineTriggerEventSchema } from "./routine-trigger-events";
import { ROUTINE_TRIGGER_FIELD_LIMIT } from "./routine-run-trigger-context";
import {
  DEFAULT_ROUTINE_TIMEZONE,
  MIN_ROUTINE_INTERVAL_MINUTES,
  isSupportedTimeZone,
  parseCronExpression,
  smallestIntervalMinutes,
} from "./routine-schedule";

export const ROUTINE_PROMPT_MAX_CHARS = 5000;
export const ROUTINE_NAME_MAX_CHARS = 120;

export const RoutineTriggerKindSchema = z.enum(RoutineTriggerKind);
export const RoutineRunStatusSchema = z.enum(RoutineRunStatus);

export { ROUTINE_TRIGGER_EVENTS, RoutineTriggerEventSchema };

export const RoutineOwnerDtoSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.enum(Status),
});

export type RoutineOwnerDto = Data<typeof RoutineOwnerDtoSchema>;

export const RoutineDtoSchema = z.object({
  id: z.uuid(),
  ownerUserId: z.uuid().nullable(),
  owner: RoutineOwnerDtoSchema.nullable(),
  name: z.string(),
  prompt: z.string(),
  enabled: z.boolean(),
  triggerKind: RoutineTriggerKindSchema,
  cronExpression: z.string().nullable(),
  timezone: z.string().nullable(),
  triggerEvents: z.array(WebhookEventSchema),
  changedFields: z.array(z.string()),
  triggerFilters: z.array(FilterSchema),
  debounceSeconds: z.number().int(),
  nextRunAt: z.date().nullable(),
  lastRunAt: z.date().nullable(),
  lastRunStatus: RoutineRunStatusSchema.nullable(),
  disabledReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RoutineDto = Data<typeof RoutineDtoSchema>;

export const RoutineRunTriggerContextSchema = z.object({
  entityType: z.enum(EntityType).nullable(),
  threadId: z.string().nullable(),
  changedFields: z.array(z.string()).max(ROUTINE_TRIGGER_FIELD_LIMIT),
  changedFieldsTruncated: z.boolean(),
});

export const RoutineRunDtoSchema = z.object({
  id: z.uuid(),
  routineId: z.uuid(),
  executedByUserId: z.string().min(1),
  executedByName: z.string(),
  conversationId: z.uuid().nullable(),
  turnRequestId: z.uuid().nullable(),
  status: RoutineRunStatusSchema,
  triggerKind: RoutineTriggerKindSchema,
  triggerEvent: RoutineTriggerEventSchema.nullable(),
  triggerEntityId: z.string().nullable(),
  triggerContext: RoutineRunTriggerContextSchema.nullable(),
  scheduledFor: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  terminalCode: z.enum(AgentTurnTerminalCode).nullable(),
  stopReason: z.enum(AgentTurnStopReason).nullable(),
  chargedCredits: z.number().int(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RoutineRunDto = Data<typeof RoutineRunDtoSchema>;

const UpsertRoutineFieldsSchema = z.object({
  id: z.uuid().optional(),
  name: zx.nonBlankText(ROUTINE_NAME_MAX_CHARS).optional(),
  prompt: zx.nonBlankText(ROUTINE_PROMPT_MAX_CHARS).optional(),
  enabled: z.boolean().optional(),
  triggerKind: RoutineTriggerKindSchema.optional(),
  cronExpression: z.string().min(1).max(120).nullable().optional(),
  timezone: z.string().min(1).max(64).nullable().optional(),
  triggerEvents: z.array(RoutineTriggerEventSchema).optional(),
  changedFields: z.array(z.string()).optional(),
  triggerFilters: z.array(FilterSchema).optional(),
  debounceSeconds: z.number().int().min(0).max(86_400).optional(),
});

export type RoutineValidationData = z.output<typeof UpsertRoutineFieldsSchema>;

export function validateRoutineFinalState(data: RoutineValidationData, ctx: z.RefinementCtx) {
  const creating = !data.id;

  if (creating && data.name === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["name"],
      params: { error: CustomErrorCode.mustNotBeBlank },
    });
  }
  if (creating && data.prompt === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["prompt"],
      params: { error: CustomErrorCode.mustNotBeBlank },
    });
  }
  if (creating && data.triggerKind === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["triggerKind"],
      params: { error: CustomErrorCode.mustNotBeBlank },
    });
  }

  if (data.triggerKind === RoutineTriggerKind.event && creating && (data.triggerEvents?.length ?? 0) === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["triggerEvents"],
      params: { error: CustomErrorCode.routineTriggerEventsRequired },
    });
  }

  if (data.triggerKind === RoutineTriggerKind.schedule && creating && !data.cronExpression) {
    ctx.addIssue({
      code: "custom",
      path: ["cronExpression"],
      params: { error: CustomErrorCode.routineScheduleRequired },
    });
  }

  if (data.timezone && !isSupportedTimeZone(data.timezone)) {
    ctx.addIssue({
      code: "custom",
      path: ["timezone"],
      params: { error: CustomErrorCode.routineTimeZoneInvalid },
    });
  }

  if (!data.cronExpression) return;

  const parsed = parseCronExpression(data.cronExpression);
  if (!parsed.ok) {
    ctx.addIssue({
      code: "custom",
      path: ["cronExpression"],
      params: { error: CustomErrorCode.routineScheduleInvalid },
    });
    return;
  }

  const timezone = data.timezone && isSupportedTimeZone(data.timezone) ? data.timezone : DEFAULT_ROUTINE_TIMEZONE;
  const smallest = smallestIntervalMinutes(parsed.cron, new Date(), timezone);

  if (smallest === null) {
    ctx.addIssue({
      code: "custom",
      path: ["cronExpression"],
      params: { error: CustomErrorCode.routineScheduleInvalid },
    });
    return;
  }

  if (smallest < MIN_ROUTINE_INTERVAL_MINUTES) {
    ctx.addIssue({
      code: "custom",
      path: ["cronExpression"],
      params: { error: CustomErrorCode.routineScheduleTooFrequent },
    });
  }
}

export const UpsertRoutineSchema = UpsertRoutineFieldsSchema.superRefine(validateRoutineFinalState);

export type UpsertRoutineData = Data<typeof UpsertRoutineSchema>;
