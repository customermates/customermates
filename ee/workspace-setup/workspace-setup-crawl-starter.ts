import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { StartWikiHomepageSetupRepo } from "@/features/wiki/start-wiki-homepage-setup.repo";
import type { StartWikiWebsiteCrawlRepo } from "@/features/wiki/start-wiki-website-crawl.repo";

import { createHash } from "node:crypto";

import { parsePublicWikiHomepage } from "@/features/wiki/wiki-homepage";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

function crawlRequestId(setupId: string, attempt: number): string {
  const hash = createHash("sha256").update(`customermates:workspace-setup-crawl:${setupId}:${attempt}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export type SetupCrawlStart = { status: "started"; crawlId: string } | { status: "notEmpty" | "active" | "invalid" };

export class WorkspaceSetupCrawlStarter {
  constructor(
    private wiki: Pick<StartWikiHomepageSetupRepo, "wikiIsEmpty" | "dominantWikiLanguage">,
    private crawls: Pick<StartWikiWebsiteCrawlRepo, "createCrawl" | "findCrawlByClientRequest" | "failDispatch">,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async start(args: { setupId: string; attempt: number; homepage: string; locale: string }): Promise<SetupCrawlStart> {
    const target = parsePublicWikiHomepage(args.homepage);
    if (!target) return { status: "invalid" };
    const clientRequestId = crawlRequestId(args.setupId, args.attempt);
    const existing = await this.crawls.findCrawlByClientRequest(clientRequestId);
    let crawl = existing;
    if (!crawl) {
      if (!(await this.wiki.wikiIsEmpty())) return { status: "notEmpty" };
      const created = await this.crawls.createCrawl({
        clientRequestId,
        homepageUrl: target.url,
        registrableDomain: target.registrableDomain,
        locale: (await this.wiki.dominantWikiLanguage()) ?? appLocaleOrDefault(args.locale),
        mode: "initial",
        extraHosts: [],
        payer: "workspaceSetup",
      });
      if (created.status === "active") return { status: "active" };
      crawl = created.crawl;
    }
    if (crawl.status === "queued") {
      try {
        await this.background.dispatch("crawl-wiki-website", { crawlId: crawl.id, userId: crawl.userId });
      } catch (error) {
        await this.crawls.failDispatch(crawl.id);
        throw error;
      }
    }
    return { status: "started", crawlId: crawl.id };
  }
}
