import type { WorkspaceSetupFailure } from "./workspace-setup.schema";

export class PhaseFailure extends Error {
  constructor(
    readonly failure: WorkspaceSetupFailure,
    readonly stop = false,
  ) {
    super(failure);
  }
}
