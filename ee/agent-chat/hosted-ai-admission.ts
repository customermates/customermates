export type HostedAiAdmissionBlockedReason =
  | "configuration_unavailable"
  | "credits_exhausted"
  | "global_spend_cap"
  | "operator_paused";

const HOSTED_AI_ADMISSION_BLOCKED = "HOSTED_AI_ADMISSION_BLOCKED";

export class HostedAiAdmissionBlockedError extends Error {
  readonly code = HOSTED_AI_ADMISSION_BLOCKED;

  constructor(public readonly reason: HostedAiAdmissionBlockedReason) {
    super(`Hosted AI admission is blocked: ${reason}.`);
    this.name = "HostedAiAdmissionBlockedError";
  }
}

export function isHostedAiAdmissionBlockedError(error: unknown): error is HostedAiAdmissionBlockedError {
  return error instanceof Error && "code" in error && error.code === HOSTED_AI_ADMISSION_BLOCKED;
}
