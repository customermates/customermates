import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { StoredSetupPhase, WorkspaceSetupPhase } from "./workspace-setup.schema";
import type { WorkspaceSetupCrawlStarter } from "./workspace-setup-crawl-starter";
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
import { abandonedSetupPatch, emptySetupPhase, setupPhaseStalled } from "./workspace-setup-build.service";
import { setupLanguage } from "./workspace-setup-inputs";

const RETRYABLE = new Set(["failed", "stopped"]);

function retryable(state: StoredSetupPhase | undefined, now: Date): state is StoredSetupPhase {
  return Boolean(state && (RETRYABLE.has(state.status) || setupPhaseStalled(state, now)));
}

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
    private crawls: Pick<WorkspaceSetupCrawlStarter, "start">,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  @Write({ input: RetryWorkspaceSetupPhaseSchema, tx: false })
  async invoke(data: RetryWorkspaceSetupPhaseData): Validated<{ setupId: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const setup = await this.repo.get(data.setupId);
    if (!setup) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    const state = setup.phases[data.phase];
    if ((setup.status !== "failed" && setup.status !== "building") || !retryable(state, new Date()))
      return failConflict(CustomErrorCode.workspaceSetupConflict);

    const withoutWebsite = data.withoutWebsite === true;
    let crawlId = setup.crawlId;
    if (withoutWebsite) {
      if (crawlId) await this.repo.stopCrawl(crawlId);
      crawlId = null;
    } else if (data.phase === "knowledgeBase" && crawlId && (await this.repo.reopenCrawlSynthesis(crawlId)))
      await this.background.dispatch("crawl-wiki-website", { crawlId, userId: this.userId });
    else if (data.phase === "knowledgeBase" && setup.websiteUrl) {
      const crawl = crawlId ? await this.repo.crawlState(crawlId) : null;
      if (!crawl || crawl.status === "failed" || crawl.status === "blocked") {
        const started = await this.crawls.start({
          setupId: setup.id,
          attempt: setup.startedAt.getTime() + state.attempts,
          homepage: setup.websiteUrl,
          locale: setupLanguage(setup.answers),
        });
        if (started.status === "started") crawlId = started.crawlId;
      }
    }

    const reset = await this.repo.mutate(data.setupId, (current) => {
      const phase = current.phases[data.phase];
      if (!retryable(phase, new Date())) return null;
      const restart = (attempts: number) => ({ ...emptySetupPhase(), attempts, retryFrom: attempts });
      const phases = { ...current.phases, [data.phase]: restart(phase.attempts) };
      for (const dependent of dependents(data.phase)) {
        const next = current.phases[dependent];
        if (next && next.status !== "completed") phases[dependent] = restart(next.attempts);
      }
      return { status: "building", finishedAt: null, phases, crawlId, ...(withoutWebsite ? { websiteUrl: null } : {}) };
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
