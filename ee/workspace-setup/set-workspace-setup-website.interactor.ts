import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupCrawlStarter } from "./workspace-setup-crawl-starter";
import type { SetWorkspaceSetupWebsiteData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { parsePublicWikiHomepage } from "@/features/wiki/wiki-homepage";

import { SetWorkspaceSetupWebsiteSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class SetWorkspaceSetupWebsiteInteractor extends AuthenticatedInteractor<
  SetWorkspaceSetupWebsiteData,
  { websiteUrl: string }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private crawls: Pick<WorkspaceSetupCrawlStarter, "start">,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  @Write({ input: SetWorkspaceSetupWebsiteSchema, tx: false })
  async invoke(data: SetWorkspaceSetupWebsiteData): Validated<{ websiteUrl: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const homepage = parsePublicWikiHomepage(data.websiteUrl);
    if (!homepage) return fail(CustomErrorCode.invalidUrl, ["websiteUrl"]);

    const setup = await this.repo.get(data.setupId);
    if (!setup || setup.status !== "interview") return failConflict(CustomErrorCode.workspaceSetupConflict);
    if (setup.websiteUrl === homepage.url && setup.interview.prefill !== "failed")
      return { ok: true, data: { websiteUrl: homepage.url } };

    if (setup.crawlId) await this.repo.stopCrawl(setup.crawlId);
    const crawl = await this.crawls.start({
      setupId: setup.id,
      attempt: Date.now(),
      homepage: homepage.url,
      locale: data.locale ?? "en",
    });
    const saved = await this.repo.mutate(setup.id, (current) => {
      if (current.status !== "interview") return null;
      return {
        websiteUrl: homepage.url,
        crawlId: crawl.status === "started" ? crawl.crawlId : null,
        answers: Object.fromEntries(
          Object.entries(current.answers).filter(([, answer]) => answer?.source !== "website"),
        ),
        interview: {
          ...current.interview,
          prefill: "idle",
          prefillClaimedAt: null,
          prefillError: null,
          prefillDraft: null,
        },
      };
    });
    if (!saved?.changed) return failConflict(CustomErrorCode.workspaceSetupConflict);
    await this.background.dispatch("prepare-workspace-setup", { setupId: setup.id, userId: this.userId });
    return { ok: true, data: { websiteUrl: homepage.url } };
  }
}
