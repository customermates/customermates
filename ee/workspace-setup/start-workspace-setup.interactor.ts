import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupCrawlStarter } from "./workspace-setup-crawl-starter";
import type { StartWorkspaceSetupData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { parsePublicWikiHomepage } from "@/features/wiki/wiki-homepage";

import { StartWorkspaceSetupSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";

const RESTARTABLE = new Set(["failed"]);
const REUSABLE = new Set(["interview", "planning", "planned"]);

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class StartWorkspaceSetupInteractor extends AuthenticatedInteractor<
  StartWorkspaceSetupData,
  { setupId: string }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private crawls: Pick<WorkspaceSetupCrawlStarter, "start">,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  @Write({ input: StartWorkspaceSetupSchema, tx: false })
  async invoke(data: StartWorkspaceSetupData): Validated<{ setupId: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const homepage = data.websiteUrl ? parsePublicWikiHomepage(data.websiteUrl) : null;
    if (data.websiteUrl && !homepage) return fail(CustomErrorCode.invalidUrl, ["websiteUrl"]);
    const websiteUrl = homepage?.url ?? null;

    const existing = await this.repo.findCurrent();
    if (existing && REUSABLE.has(existing.status) && existing.websiteUrl === websiteUrl)
      return { ok: true, data: { setupId: existing.id } };
    if (existing && !RESTARTABLE.has(existing.status) && existing.status !== "interview")
      return failConflict(CustomErrorCode.workspaceSetupConflict);

    let setupId: string;
    if (existing) {
      if (!(await this.repo.restart(existing.id, { websiteUrl, answers: {} })))
        return failConflict(CustomErrorCode.workspaceSetupConflict);
      if (existing.crawlId) await this.repo.stopCrawl(existing.crawlId);
      setupId = existing.id;
    } else {
      const created = await this.repo.create({ websiteUrl, answers: {} });
      if (!created) return failConflict(CustomErrorCode.workspaceSetupConflict);
      setupId = created.id;
    }
    const setup = await this.repo.get(setupId);
    if (!setup) return failConflict(CustomErrorCode.workspaceSetupConflict);

    if (websiteUrl) {
      const crawl = await this.crawls.start({
        setupId,
        attempt: setup.startedAt.getTime(),
        homepage: websiteUrl,
        locale: data.locale ?? "en",
      });
      if (crawl.status === "started") await this.repo.mutate(setupId, () => ({ crawlId: crawl.crawlId }));
    }
    await this.background.dispatch("prepare-workspace-setup", { setupId, userId: this.userId });
    return { ok: true, data: { setupId } };
  }
}
