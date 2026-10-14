import type { GetWikiWebsiteCrawlStateRepo } from "./get-wiki-website-crawl-state.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { GetWikiPagesRepo } from "@/features/wiki/get-wiki-pages.repo";
import type { WikiCrawlTargetProgress, WikiSynthesisTopicProgress } from "./wiki-crawl-progress.schema";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { WikiPageSummarySchema } from "./wiki.schema";
import { WikiCrawlTargetProgressSchema, WikiSynthesisTopicProgressSchema } from "./wiki-crawl-progress.schema";

const WikiCrawlPhaseSchema = z.enum(["queued", "discovering", "fetching", "importing", "synthesizing"]);
const WikiSetupFailureReasonSchema = z.enum(["blocked", "unavailable", "credits", "synthesis"]);
export type WikiSetupFailureReason = Data<typeof WikiSetupFailureReasonSchema>;

export const WikiHomepageSetupStateSchema = z.object({
  status: z.enum(["idle", "working", "completed", "noContent", "failed"]),
  homepage: z.string().nullable(),
  domain: z.string().nullable(),
  pages: z.array(WikiPageSummarySchema).max(5),
  pageCount: z.number().int().min(0).optional(),
  crawlPhase: WikiCrawlPhaseSchema.optional(),
  progress: z
    .object({
      fetched: z.number().int().min(0),
      total: z.number().int().min(0),
      failed: z.number().int().min(0).optional(),
      currentUrl: z.string().nullable().optional(),
      pages: z.array(WikiCrawlTargetProgressSchema).optional(),
      topics: z.array(WikiSynthesisTopicProgressSchema).optional(),
    })
    .nullable()
    .optional(),
  failureReason: WikiSetupFailureReasonSchema.nullable().optional(),
  pendingHosts: z.array(z.string()).optional(),
  refreshable: z.boolean().optional(),
});
export type WikiHomepageSetupState = Data<typeof WikiHomepageSetupStateSchema>;

export type WikiWebsiteCrawlState = {
  status: "queued" | "discovering" | "fetching" | "importing" | "synthesizing" | "completed" | "failed" | "blocked";
  homepageUrl: string;
  registrableDomain: string;
  pendingHosts: string[];
  discovered: number;
  fetched: number;
  failed: number;
  targets: WikiCrawlTargetProgress[] | null;
  topics: WikiSynthesisTopicProgress[] | null;
  failureReason: string | null;
};

function failureReason(crawl: WikiWebsiteCrawlState) {
  if (crawl.status === "blocked") return "blocked";
  const parsed = WikiSetupFailureReasonSchema.safeParse(crawl.failureReason);
  return parsed.success ? parsed.data : null;
}

function progressOf(crawl: WikiWebsiteCrawlState) {
  const pages = crawl.targets?.map(({ url, status }) => ({ url, status }));
  return {
    fetched: crawl.fetched,
    total: crawl.discovered,
    failed: crawl.failed,
    ...(pages
      ? {
          pages,
          currentUrl:
            crawl.status === "fetching" ? (pages.find((page) => page.status === "reading")?.url ?? null) : null,
        }
      : {}),
    ...(crawl.topics
      ? { topics: crawl.topics.map(({ title, status, skipReason }) => ({ title, status, skipReason })) }
      : {}),
  };
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, read: "all" })
export class GetWikiHomepageSetupStateInteractor extends AuthenticatedInteractor<undefined, WikiHomepageSetupState> {
  constructor(
    private pageRepo: GetWikiPagesRepo,
    private crawlRepo: GetWikiWebsiteCrawlStateRepo,
  ) {
    super();
  }

  @ValidateOutput(WikiHomepageSetupStateSchema)
  async invoke(): Validated<WikiHomepageSetupState> {
    const [crawl, { items: pages, total: pageCount }] = await Promise.all([
      this.crawlRepo.findLatestCrawl(),
      this.pageRepo.listPages({ page: 1, pageSize: 5 }),
    ]);
    if (!crawl) {
      return {
        ok: true as const,
        data: { status: pages.length > 0 ? "completed" : "idle", homepage: null, domain: null, pages },
      };
    }

    const base = {
      homepage: crawl.homepageUrl,
      domain: crawl.registrableDomain,
      pages,
      pageCount,
      progress: progressOf(crawl),
    };
    const phase = WikiCrawlPhaseSchema.safeParse(crawl.status);
    if (phase.success) return { ok: true as const, data: { ...base, status: "working", crawlPhase: phase.data } };
    if (crawl.status === "completed") {
      return {
        ok: true as const,
        data: {
          ...base,
          status: pages.length > 0 ? "completed" : "noContent",
          pendingHosts: crawl.pendingHosts,
          refreshable: true,
        },
      };
    }
    return {
      ok: true as const,
      data: { ...base, status: "failed", failureReason: failureReason(crawl), refreshable: pages.length > 0 },
    };
  }
}
