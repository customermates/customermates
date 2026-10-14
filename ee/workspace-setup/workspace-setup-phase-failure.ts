import type { WorkspaceSetupFailure } from "./workspace-setup.schema";

import { WORKSPACE_SETUP_FAILURES } from "./workspace-setup.schema";

type PhaseFailureCause = { failure: WorkspaceSetupFailure; stop: boolean };

export function phaseFailure(failure: WorkspaceSetupFailure, stop = false): Error {
  return new Error(failure, { cause: { failure, stop } satisfies PhaseFailureCause });
}

export function phaseFailureOf(error: unknown): PhaseFailureCause | null {
  if (!(error instanceof Error) || typeof error.cause !== "object" || error.cause === null) return null;
  const cause = error.cause as Partial<PhaseFailureCause>;
  const failure = WORKSPACE_SETUP_FAILURES.find((candidate) => candidate === cause.failure);
  return failure ? { failure, stop: cause.stop === true } : null;
}
