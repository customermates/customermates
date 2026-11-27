import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupPhase } from "./workspace-setup.schema";
import type { RetryWorkspaceSetupPhaseData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WORKSPACE_SETUP_PHASES, WORKSPACE_SETUP_PHASE_DEPENDENCIES } from "./workspace-setup.schema";
import { RetryWorkspaceSetupPhaseSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";
import { abandonedSetupPatch, emptySetupPhase, setupPhaseOpen, setupPhaseRetryable } from "./workspace-setup-phases";

function dependents(phase: WorkspaceSetupPhase): WorkspaceSetupPhase[] {
  return WORKSPACE_SETUP_PHASES.filter((candidate) => WORKSPACE_SETUP_PHASE_DEPENDENCIES[candidate].includes(phase));
}

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class RetryWorkspaceSetupPhaseInteractor extends AuthenticatedInteractor<
  RetryWorkspaceSetupPhaseData,
  { setupId: string }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
    private entitlements: Pick<EntitlementService, "require">,
  ) {
    super();
  }

  @Write({ input: RetryWorkspaceSetupPhaseSchema, tx: false })
  async invoke(data: RetryWorkspaceSetupPhaseData): Validated<{ setupId: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    const setup = await this.repo.get(data.setupId);
    if (!setup) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (!setupPhaseRetryable(setup, data.phase, new Date()))
      return failConflict(CustomErrorCode.workspaceSetupConflict);

    const reset = await this.repo.mutate(data.setupId, (current) => {
      const now = new Date();
      if (!setupPhaseRetryable(current, data.phase, now)) return null;
      const restart = (attempts: number) => ({
        ...emptySetupPhase(),
        attempts,
        retryFrom: attempts,
        claimedAt: now.toISOString(),
      });
      const phases = { ...current.phases, [data.phase]: restart(current.phases[data.phase]?.attempts ?? 0) };
      for (const dependent of dependents(data.phase)) {
        const next = current.phases[dependent];
        if (next && next.status !== "completed") phases[dependent] = restart(next.attempts);
      }
      const reopened = current.status === "building" || !setupPhaseOpen(current.status, data.phase);
      return {
        ...(reopened ? { status: "building" as const, finishedAt: null } : {}),
        phases,
      };
    });
    if (!reset?.changed) return failConflict(CustomErrorCode.workspaceSetupConflict);
    try {
      await this.background.dispatch("build-workspace-setup", { setupId: data.setupId, userId: this.userId });
    } catch (error) {
      const restarted = [data.phase, ...dependents(data.phase)];
      await this.repo.mutate(data.setupId, (current) => abandonedSetupPatch(current, new Date(), restarted));
      throw error;
    }
    return { ok: true, data: { setupId: data.setupId } };
  }
}
