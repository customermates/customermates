import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
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
import { setupPrefillStalled } from "./workspace-setup-interview.service";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class SetWorkspaceSetupWebsiteInteractor extends AuthenticatedInteractor<
  SetWorkspaceSetupWebsiteData,
  { websiteUrl: string }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private crawls: Pick<WorkspaceSetupCrawlStarter, "start">,
    private background: Pick<BackgroundTaskService, "dispatch">,
    private entitlements: Pick<EntitlementService, "require">,
  ) {
    super();
  }

  @Write({ input: SetWorkspaceSetupWebsiteSchema, tx: false })
  async invoke(data: SetWorkspaceSetupWebsiteData): Validated<{ websiteUrl: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;
    const homepage = parsePublicWikiHomepage(data.websiteUrl);
    if (!homepage) return fail(CustomErrorCode.invalidUrl, ["websiteUrl"]);

    const setup = await this.repo.get(data.setupId);
    if (!setup || setup.status !== "interview") return failConflict(CustomErrorCode.workspaceSetupConflict);
    const prefillSettled = setup.interview.prefill !== "failed" && !setupPrefillStalled(setup, new Date());
    if (setup.websiteUrl === homepage.url && prefillSettled) return { ok: true, data: { websiteUrl: homepage.url } };

    if (setup.crawlId) await this.repo.stopCrawl(setup.crawlId);
    const crawl = await this.crawls.start({
      setupId: setup.id,
      attempt: Date.now(),
      homepage: homepage.url,
      locale: data.locale ?? "en",
    });
    const saved = await this.repo.mutate(setup.id, (current) => {
      if (current.status !== "interview" || current.crawlId !== setup.crawlId) return null;
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
    if (!saved?.changed) {
      if (crawl.status === "started" && crawl.crawlId !== saved?.setup.crawlId)
        await this.repo.stopCrawl(crawl.crawlId);
      if (saved?.setup.status === "interview" && saved.setup.websiteUrl === homepage.url)
        return { ok: true, data: { websiteUrl: homepage.url } };
      return failConflict(CustomErrorCode.workspaceSetupConflict);
    }
    await this.background.dispatch("prepare-workspace-setup", { setupId: setup.id, userId: this.userId });
    return { ok: true, data: { websiteUrl: homepage.url } };
  }
}
