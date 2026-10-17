import type { WorkspaceSetupFailure, WorkspaceSetupPhase } from "./workspace-setup.schema";

export const SETUP_PLAN_ATTEMPTS = 2;
export const SETUP_BUILD_PHASE_ATTEMPTS = 3;

const AUTOMATIC_RETRY_FAILURES: ReadonlySet<WorkspaceSetupFailure> = new Set([
  "aiUnavailable",
  "generation",
  "schemaChanged",
  "error",
  "spreadsheet",
]);

export function retriesAutomatically(
  phase: WorkspaceSetupPhase,
  failure: WorkspaceSetupFailure,
  state: { attempts: number; retryFrom: number },
): boolean {
  return (
    phase !== "knowledgeBase" &&
    AUTOMATIC_RETRY_FAILURES.has(failure) &&
    state.attempts - state.retryFrom < SETUP_BUILD_PHASE_ATTEMPTS
  );
}
