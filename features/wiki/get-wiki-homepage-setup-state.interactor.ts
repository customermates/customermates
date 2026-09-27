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
export const WikiHomepageSetupStateSchema = z.object({
  status: WikiHomepageSetupStatusSchema,
  homepage: z.string().nullable(),
  domain: z.string().nullable(),
  conversationId: z.string().nullable(),
  pages: z.array(WikiPageSummarySchema).max(5),
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

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class GetWikiHomepageSetupStateInteractor extends AuthenticatedInteractor<undefined, WikiHomepageSetupState> {
  constructor(
    private pageRepo: GetWikiPagesRepo,
    private setupTurnRepo: GetWikiHomepageSetupTurnRepo,
  ) {
    super();
  }

  @ValidateOutput(WikiHomepageSetupStateSchema)
  async invoke(): Validated<WikiHomepageSetupState> {
    const [setup, { items: pages }] = await Promise.all([
      this.setupTurnRepo.findWikiHomepageSetupTurn(),
      this.pageRepo.listPages({ page: 1, pageSize: 5 }),
    ]);
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
      return {
        ok: true as const,
        data: {
          status: "completed",
          homepage: createdBySetup ? setup.homepage : null,
          domain: createdBySetup ? setup.domain : null,
          conversationId: createdBySetup ? setup.conversationId : null,
          pages,
        },
      };
    }
    if (!setup) {
      return {
        ok: true as const,
        data: { status: "idle", homepage: null, domain: null, conversationId: null, pages: [] },
      };
    }

    const affectedResources = Array.isArray(setup.affectedResources) ? setup.affectedResources : [];
    const successfulButDeleted =
      setup.status === "completed" && setup.terminalCode === "completed" && affectedResources.includes("wiki");
    if (successfulButDeleted) {
      return {
        ok: true as const,
        data: { status: "idle", homepage: null, domain: null, conversationId: null, pages: [] },
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
