import type { Validated } from "@/core/validation/validation.utils";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { StoredSetupPhase, StoredSetupPhases, WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { WorkspaceSetupIdData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WorkspaceSetupIdSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";
import { canUseStandardSetup } from "./workspace-setup-status";

const OPEN_PHASES: ReadonlySet<StoredSetupPhase["status"]> = new Set(["pending", "running"]);
const OPEN_GENERATIONS = new Set(["queued", "running"]);

function standard(setup: WorkspaceSetupRecord) {
  return setup.status === "completed" && setup.results.standard;
}

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class UseStandardWorkspaceSetupInteractor extends AuthenticatedInteractor<
  WorkspaceSetupIdData,
  { setupId: string }
> {
  constructor(private repo: WorkspaceSetupRepo) {
    super();
  }

  @Write({ input: WorkspaceSetupIdSchema, tx: false })
  async invoke(data: WorkspaceSetupIdData): Validated<{ setupId: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const setup = await this.repo.get(data.setupId);
    if (!setup) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (standard(setup)) return { ok: true, data: { setupId: data.setupId } };
    if (!canUseStandardSetup(setup)) return failConflict(CustomErrorCode.workspaceSetupConflict);
    const now = new Date();
    const stopped = await this.repo.mutate(data.setupId, (current) => {
      if (standard(current) || !canUseStandardSetup(current)) return null;
      const phases: StoredSetupPhases = Object.fromEntries(
        Object.entries(current.phases).map(([key, phase]) => [
          key,
          phase && OPEN_PHASES.has(phase.status)
            ? { ...phase, status: "stopped", error: null, claimedAt: null, finishedAt: now.toISOString() }
            : phase,
        ]),
      );
      return {
        status: "completed",
        finishedAt: now,
        phases,
        interview: {
          ...current.interview,
          ...(OPEN_GENERATIONS.has(current.interview.plan) ? { plan: "idle" as const, planClaimedAt: null } : {}),
        },
        results: { ...current.results, standard: true },
      };
    });
    if (!stopped) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (!stopped.changed) {
      if (standard(stopped.setup)) return { ok: true, data: { setupId: data.setupId } };
      return failConflict(CustomErrorCode.workspaceSetupConflict);
    }
    const crawlId = stopped.setup.crawlId;
    if (crawlId) {
      await this.repo.stopCrawl(crawlId);
      const pages = await this.repo.knowledgeBasePages(crawlId);
      await this.repo.mutate(data.setupId, (current) => ({
        created: { ...current.created, pages: pages.map((page) => page.id) },
        results: { ...current.results, pages: pages.map((page) => ({ id: page.id, title: page.title })) },
      }));
    }
    return { ok: true, data: { setupId: data.setupId } };
  }
}
