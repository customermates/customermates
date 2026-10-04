import { HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER, type PlanId } from "@/core/commercial/plan-catalog";

export const DEFAULT_ROUTINE_MAX_RUNS_PER_HOUR = 4;

export const ROUTINE_RUN_CREDIT_CEILING_PERCENT_OF_BASE = 5;

export const DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN =
  (HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER * ROUTINE_RUN_CREDIT_CEILING_PERCENT_OF_BASE) / 100;

export const ROUTINE_RUN_CREDIT_CEILING_MULTIPLIER = {
  starter: 1,
  pro: 1,
  business: 1,
  max: 2,
  enterprise: 1,
} as const satisfies Record<PlanId, number>;

export function routineMaxCreditsPerRun(plan: PlanId | null): number {
  return DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN * (plan ? ROUTINE_RUN_CREDIT_CEILING_MULTIPLIER[plan] : 1);
}

export const ROUTINE_CONSECUTIVE_FAILURE_LIMIT = 3;

export const ROUTINE_DISABLED_REASON_REPEATED_FAILURES = "repeatedFailures";

export const ROUTINE_RUN_RETENTION_DAYS = 90;

export const ROUTINE_RUN_PRUNE_BATCH_LIMIT = 500;

export type RoutineCountLimit = number | "unlimited";

export class RoutineLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Routine limit of ${limit} reached`);
    this.name = "RoutineLimitExceededError";
  }
}
