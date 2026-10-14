import { HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER } from "@/core/commercial/plan-catalog";

export const DEFAULT_ROUTINE_MAX_RUNS_PER_HOUR = 4;

export const DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN = 10;

export const ROUTINE_RUN_STARTER_ALLOWANCE_SHARE =
  DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN / HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER;

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
