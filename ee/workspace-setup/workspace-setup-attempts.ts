import type { WorkspaceSetupFailure, WorkspaceSetupPhase } from "./workspace-setup.schema";

export const SETUP_PLAN_ATTEMPTS = 2;
export const SETUP_PLAN_PART_ATTEMPTS = 2;
export const SETUP_BUILD_PHASE_ATTEMPTS = 3;
export const SETUP_KNOWLEDGE_BASE_ATTEMPTS = 2;

const AUTOMATIC_RETRY_FAILURES: ReadonlySet<WorkspaceSetupFailure> = new Set([
  "aiUnavailable",
  "generation",
  "schemaChanged",
  "error",
]);
const KNOWLEDGE_BASE_RETRY_FAILURES: ReadonlySet<WorkspaceSetupFailure> = new Set(["aiUnavailable", "generation"]);

export function retriesAutomatically(
  phase: WorkspaceSetupPhase,
  failure: WorkspaceSetupFailure,
  state: { attempts: number; retryFrom: number },
): boolean {
  const attempts = state.attempts - state.retryFrom;
  if (phase === "knowledgeBase")
    return KNOWLEDGE_BASE_RETRY_FAILURES.has(failure) && attempts < SETUP_KNOWLEDGE_BASE_ATTEMPTS;
  return AUTOMATIC_RETRY_FAILURES.has(failure) && attempts < SETUP_BUILD_PHASE_ATTEMPTS;
}
