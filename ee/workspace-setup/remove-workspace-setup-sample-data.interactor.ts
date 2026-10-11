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

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class RemoveWorkspaceSetupSampleDataInteractor extends AuthenticatedInteractor<
  WorkspaceSetupIdData,
  { removed: number }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private cleanup: Pick<WorkspaceSetupCleanupService, "removeRecords">,
  ) {
    super();
  }

  @Write({ input: WorkspaceSetupIdSchema, tx: false })
  async invoke(data: WorkspaceSetupIdData): Validated<{ removed: number }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const setup = await this.repo.get(data.setupId);
    if (!setup) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (Object.values(setup.phases).some((phase) => phase?.status === "running"))
      return failConflict(CustomErrorCode.workspaceSetupConflict);
    const removed = await this.cleanup.removeRecords(setup, setup.created.sampleRecords, "remove-samples");
    if (!removed.ok) return { ok: false, error: removed.error };
    const kept = new Set(setup.created.sampleRecords.map((ref) => ref.recordId));
    await this.repo.mutate(data.setupId, (current) => ({
      created: {
        ...current.created,
        sampleRecords: current.created.sampleRecords.filter((ref) => !kept.has(ref.recordId)),
      },
      results: { ...current.results, records: current.results.records.filter((entry) => entry.kind !== "sample") },
    }));
    return { ok: true, data: { removed: removed.removed } };
  }
}
