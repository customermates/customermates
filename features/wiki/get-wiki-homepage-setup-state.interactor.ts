import type { Data, Validated } from "@/core/validation/validation.utils";
import type { GetWikiPagesRepo } from "./get-wiki-pages.interactor";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { WikiPageSummarySchema } from "./wiki.schema";

const WikiHomepageSetupStatusSchema = z.enum(["idle", "working", "completed", "noContent", "failed"]);
const WikiCrawlPhaseSchema = z.enum(["queued", "discovering", "fetching", "importing", "synthesizing"]);
export const WikiHomepageSetupStateSchema = z.object({
  status: WikiHomepageSetupStatusSchema,
  homepage: z.string().nullable(),
  domain: z.string().nullable(),
  conversationId: z.string().nullable(),
  pages: z.array(WikiPageSummarySchema).max(5),
  crawlPhase: WikiCrawlPhaseSchema.optional(),
  progress: z
    .object({
      fetched: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .nullable()
    .optional(),
  failureReason: z.enum(["blocked", "unavailable"]).nullable().optional(),
  refreshable: z.boolean().optional(),
});
export type WikiHomepageSetupState = Data<typeof WikiHomepageSetupStateSchema>;

export type WikiHomepageSetupTurn = {
  active: boolean;
  status: "running" | "waitingBudget" | "needsAttention" | "completed" | "failed" | "uncertain";
  terminalCode: "completed" | "partial" | "error" | "cancelled" | "policyBreach" | null;
  homepage: string;
  domain: string;
  conversationId: string | null;
  affectedResources: unknown;
};

export abstract class GetWikiHomepageSetupTurnRepo {
  abstract findWikiHomepageSetupTurn(): Promise<WikiHomepageSetupTurn | null>;
}

export type WikiWebsiteCrawlState = {
  status: "queued" | "discovering" | "fetching" | "importing" | "synthesizing" | "completed" | "failed" | "blocked";
  homepageUrl: string;
  registrableDomain: string;
  conversationId: string | null;
  discovered: number;
  fetched: number;
  failureReason: string | null;
};

export abstract class GetWikiWebsiteCrawlStateRepo {
  abstract findLatestCrawl(): Promise<WikiWebsiteCrawlState | null>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class GetWikiHomepageSetupStateInteractor extends AuthenticatedInteractor<undefined, WikiHomepageSetupState> {
  constructor(
    private pageRepo: GetWikiPagesRepo,
    private setupTurnRepo: GetWikiHomepageSetupTurnRepo,
    private crawlRepo: GetWikiWebsiteCrawlStateRepo,
  ) {
    super();
  }

  @ValidateOutput(WikiHomepageSetupStateSchema)
  async invoke(): Validated<WikiHomepageSetupState> {
    const crawl = await this.crawlRepo.findLatestCrawl();
    const [setup, { items: pages }] = await Promise.all([
      this.setupTurnRepo.findWikiHomepageSetupTurn(),
      this.pageRepo.listPages({ page: 1, pageSize: 5 }),
    ]);
    const matchingSetup =
      setup &&
      crawl &&
      crawl.conversationId !== null &&
      setup.homepage === crawl.homepageUrl &&
      (!setup.conversationId || setup.conversationId === crawl.conversationId)
        ? setup
        : null;
    const phase = WikiCrawlPhaseSchema.safeParse(crawl?.status);
    if (crawl && phase.success) {
      return {
        ok: true as const,
        data: {
          status: "working",
          homepage: crawl.homepageUrl,
          domain: crawl.registrableDomain,
          conversationId: matchingSetup?.conversationId ?? null,
          pages: [],
          crawlPhase: phase.data,
          progress: { fetched: crawl.fetched, total: crawl.discovered },
        },
      };
    }
    if (crawl && (crawl.status === "failed" || crawl.status === "blocked")) {
      return {
        ok: true as const,
        data: {
          status: "failed",
          homepage: crawl.homepageUrl,
          domain: crawl.registrableDomain,
          conversationId: matchingSetup?.conversationId ?? null,
          pages,
          refreshable: pages.length > 0,
          failureReason:
            crawl.status === "blocked" ? "blocked" : crawl.failureReason === "unavailable" ? "unavailable" : null,
        },
      };
    }
    if (setup?.active) {
      return {
        ok: true as const,
        data: {
          status: "working",
          homepage: setup.homepage,
          domain: setup.domain,
          conversationId: setup.conversationId,
          pages: [],
        },
      };
    }
    if (pages.length > 0) {
      const affectedResources = Array.isArray(setup?.affectedResources) ? setup.affectedResources : [];
      const createdBySetup =
        setup?.status === "completed" && setup.terminalCode === "completed" && affectedResources.includes("wiki");
      const completedCrawlSetup = crawl?.status === "completed" ? matchingSetup : null;
      const visibleSetup = completedCrawlSetup ?? (createdBySetup ? setup : null);
      const failedSynthesis =
        completedCrawlSetup &&
        !(completedCrawlSetup.status === "completed" && completedCrawlSetup.terminalCode === "completed");
      return {
        ok: true as const,
        data: {
          status: failedSynthesis ? "failed" : "completed",
          homepage: visibleSetup?.homepage ?? null,
          domain: visibleSetup?.domain ?? null,
          conversationId: visibleSetup?.conversationId ?? null,
          pages,
          refreshable: crawl?.status === "completed",
        },
      };
    }
    if (!setup) {
      return {
        ok: true as const,
        data: {
          status: "idle",
          homepage: null,
          domain: null,
          conversationId: null,
          pages: [],
        },
      };
    }

    const affectedResources = Array.isArray(setup.affectedResources) ? setup.affectedResources : [];
    const successfulButDeleted =
      setup.status === "completed" && setup.terminalCode === "completed" && affectedResources.includes("wiki");
    if (successfulButDeleted) {
      return {
        ok: true as const,
        data: {
          status: "idle",
          homepage: null,
          domain: null,
          conversationId: null,
          pages: [],
        },
      };
    }
    const status = setup.status === "completed" && setup.terminalCode === "completed" ? "noContent" : "failed";
    return {
      ok: true as const,
      data: {
        status,
        homepage: setup.homepage,
        domain: setup.domain,
        conversationId: setup.conversationId,
        pages: [],
      },
    };
  }
}
