import type { Validated } from "@/core/validation/validation.utils";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupCleanupService } from "./workspace-setup-cleanup.service";
import type { WorkspaceSetupIdData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WorkspaceSetupIdSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";

const ROLLBACKABLE = new Set(["completed", "failed"]);

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class RollBackWorkspaceSetupInteractor extends AuthenticatedInteractor<
  WorkspaceSetupIdData,
  { removed: number }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private cleanup: Pick<WorkspaceSetupCleanupService, "rollback">,
  ) {
    super();
  }

  @Write({ input: WorkspaceSetupIdSchema, tx: false })
  async invoke(data: WorkspaceSetupIdData): Validated<{ removed: number }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const setup = await this.repo.get(data.setupId);
    if (!setup) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (!ROLLBACKABLE.has(setup.status) || Object.values(setup.phases).some((phase) => phase?.status === "running"))
      return failConflict(CustomErrorCode.workspaceSetupConflict);
    if (setup.crawlId) await this.repo.stopCrawl(setup.crawlId);
    const removed = await this.cleanup.rollback(setup);
    if (!removed.ok) return { ok: false, error: removed.error };
    await this.repo.mutate(data.setupId, () => ({
      status: "rolledBack",
      finishedAt: new Date(),
      created: {
        references: [],
        lists: [],
        fields: [],
        relationships: [],
        views: [],
        widgets: [],
        pages: [],
        sampleRecords: [],
        importedRecords: [],
      },
    }));
    return { ok: true, data: { removed: removed.removed } };
  }
}
