import type { StartWikiHomepageSetupRepo } from "./start-wiki-homepage-setup.repo";
import type { StartWikiWebsiteCrawlRepo } from "./start-wiki-website-crawl.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WikiWebsiteCrawlMode } from "./wiki-crawl-mode.schema";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { APP_LOCALES, appLocaleOrDefault } from "@/i18n/locale-registry";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { parsePublicPageUrl, parsePublicWikiHomepage } from "./wiki-homepage";
import { WikiCrawlModeSchema } from "./wiki-crawl-mode.schema";

const [firstAppLocale, ...otherAppLocales] = APP_LOCALES;

export const StartWikiHomepageSetupSchema = z.object({
  homepage: z.string().trim().min(1).max(2_000),
  clientRequestId: z.uuid(),
  locale: z.enum([firstAppLocale, ...otherAppLocales]).optional(),
  mode: WikiCrawlModeSchema.optional(),
});
export type StartWikiHomepageSetupData = Data<typeof StartWikiHomepageSetupSchema>;

export type StartedWikiHomepageSetup = {
  homepage: string;
  domain: string;
  mode: WikiWebsiteCrawlMode;
};

export type { WikiWebsiteCrawlMode } from "./wiki-crawl-mode.schema";

export type WikiWebsiteCrawlStart = {
  id: string;
  userId: string;
  status: string;
  failureReason: string | null;
  mode: WikiWebsiteCrawlMode;
  homepageUrl: string;
  registrableDomain: string;
  pendingHosts: string[];
  extraHosts: string[];
};

@TenantInteractor({ resource: Resource.wiki, action: Action.create })
export class StartWikiHomepageSetupInteractor extends AuthenticatedInteractor<
  StartWikiHomepageSetupData,
  StartedWikiHomepageSetup
> {
  constructor(
    private repo: StartWikiHomepageSetupRepo,
    private crawlRepo: StartWikiWebsiteCrawlRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Write({ input: StartWikiHomepageSetupSchema, tx: false })
  async invoke(data: StartWikiHomepageSetupData): Validated<StartedWikiHomepageSetup> {
    const reusable = await this.crawlRepo.findCrawlByClientRequest(data.clientRequestId);
    if (reusable) return this.dispatchQueued(reusable);

    const mode = data.mode ?? (await this.modeForHomepage(data.homepage));
    const target = await this.target({ ...data, mode });
    if (!target) return fail(CustomErrorCode.invalidUrl, ["homepage"]);
    if (mode === "initial" && !(await this.repo.wikiIsEmpty()))
      return failConflict(CustomErrorCode.wikiNotEmpty, ["homepage"]);

    const created = await this.crawlRepo.createCrawl({
      clientRequestId: data.clientRequestId,
      homepageUrl: target.homepageUrl,
      registrableDomain: target.registrableDomain,
      locale: (await this.repo.dominantWikiLanguage()) ?? appLocaleOrDefault(data.locale),
      mode,
      extraHosts: target.extraHosts,
    });
    if (created.status === "active") {
      const replay = await this.crawlRepo.findCrawlByClientRequest(data.clientRequestId);
      if (replay) return this.dispatchQueued(replay);
      const active = await this.crawlRepo.findLatestCrawl();
      if (
        active?.status === "queued" &&
        active.mode === mode &&
        active.homepageUrl === target.homepageUrl &&
        active.registrableDomain === target.registrableDomain &&
        active.extraHosts.length === target.extraHosts.length &&
        active.extraHosts.every((host) => target.extraHosts.includes(host))
      )
        return this.dispatchQueued(active);
      return failConflict(CustomErrorCode.agentTurnAlreadyRunning, ["homepage"]);
    }
    return this.dispatchQueued(created.crawl);
  }

  private async dispatchQueued(crawl: WikiWebsiteCrawlStart) {
    if (crawl.status === "failed" && crawl.failureReason === "dispatch") {
      const retried = await this.crawlRepo.retryFailedDispatch(crawl.id);
      if (!retried) return failConflict(CustomErrorCode.agentTurnAlreadyRunning, ["homepage"]);
      crawl = retried;
    }
    if (crawl.status === "queued") {
      try {
        await this.backgroundTaskService.dispatch("crawl-wiki-website", {
          crawlId: crawl.id,
          userId: crawl.userId,
        });
      } catch (error) {
        await this.crawlRepo.failDispatch(crawl.id);
        throw error;
      }
    }
    return this.started(crawl);
  }

  private async target(data: StartWikiHomepageSetupData) {
    if ((data.mode ?? "initial") === "initial") {
      const homepage = parsePublicWikiHomepage(data.homepage);
      return homepage
        ? {
            homepageUrl: homepage.url,
            registrableDomain: homepage.registrableDomain,
            extraHosts: [],
          }
        : null;
    }
    const latest = await this.crawlRepo.findLatestCrawl();
    if (!latest) return null;
    if (data.mode === "refresh") {
      return {
        homepageUrl: (await this.crawlRepo.findRefreshHomepage(latest.registrableDomain)) ?? latest.homepageUrl,
        registrableDomain: latest.registrableDomain,
        extraHosts: latest.extraHosts,
      };
    }
    const external = parsePublicPageUrl(data.homepage);
    const host = external ? new URL(external.url).hostname : null;
    if (!external || !host || external.registrableDomain === latest.registrableDomain) return null;
    return {
      homepageUrl: external.url,
      registrableDomain: latest.registrableDomain,
      extraHosts: [...new Set([...latest.extraHosts, host])],
    };
  }

  private async modeForHomepage(homepage: string): Promise<WikiWebsiteCrawlMode> {
    const target = parsePublicPageUrl(homepage);
    if (!target) return "initial";
    const latest = await this.crawlRepo.findLatestCrawl();
    return latest?.pendingHosts.includes(new URL(target.url).hostname) ? "extend" : "initial";
  }

  private started(crawl: WikiWebsiteCrawlStart) {
    return {
      ok: true as const,
      data: {
        homepage: crawl.homepageUrl,
        domain: crawl.registrableDomain,
        mode: crawl.mode,
      },
    };
  }
}
