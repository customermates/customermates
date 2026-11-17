import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set(["claimed", "running"]);

export function jobNotFound() {
  return failNotFound(CustomErrorCode.agentJobNotFound, ["jobId"]);
}

export function jobClosed() {
  return failConflict(CustomErrorCode.agentJobClosed, ["jobId"]);
}
