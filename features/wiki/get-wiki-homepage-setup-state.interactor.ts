import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import type { Data, Validated } from "@/core/validation/validation.utils";
import { AGENT_RUN_LEASE_MS } from "@/ee/agent-chat/agent-turn-request";

import { WikiPageSummarySchema, type WikiPageSummary } from "./wiki.schema";

const WikiHomepageSetupStatusSchema = z.enum(["idle", "working", "completed", "noContent", "failed"]);
export const WikiHomepageSetupStateSchema = z.object({
  status: WikiHomepageSetupStatusSchema,
  homepage: z.string().nullable(),
  domain: z.string().nullable(),
  conversationId: z.string().nullable(),
  pages: z.array(WikiPageSummarySchema).max(5),
});
export type WikiHomepageSetupState = Data<typeof WikiHomepageSetupStateSchema>;

type StoredHomepageSetup = {
  status: "running" | "waitingBudget" | "needsAttention" | "completed" | "failed" | "uncertain";
  terminalCode: "completed" | "partial" | "error" | "cancelled" | "policyBreach" | null;
  homepage: string;
  domain: string;
  conversationId: string | null;
  affectedResources: unknown;
  activityAt: Date;
};

export abstract class GetWikiHomepageSetupStateRepo {
  abstract getHomepageSetupProjection(): Promise<{
    setup: StoredHomepageSetup | null;
    pages: WikiPageSummary[];
  }>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.wiki, action: Action.readAll })
export class GetWikiHomepageSetupStateInteractor extends AuthenticatedInteractor<undefined, WikiHomepageSetupState> {
  constructor(private repo: GetWikiHomepageSetupStateRepo) {
    super();
  }

  @ValidateOutput(WikiHomepageSetupStateSchema)
  async invoke(): Validated<WikiHomepageSetupState> {
    const { setup, pages } = await this.repo.getHomepageSetupProjection();
    const setupIsActive =
      setup !== null &&
      ["running", "waitingBudget"].includes(setup.status) &&
      setup.activityAt.getTime() > Date.now() - AGENT_RUN_LEASE_MS;
    if (setupIsActive) {
      return {
        ok: true,
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
        ok: true,
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
        ok: true,
        data: { status: "idle", homepage: null, domain: null, conversationId: null, pages: [] },
      };
    }

    const affectedResources = Array.isArray(setup.affectedResources) ? setup.affectedResources : [];
    const successfulButDeleted =
      setup.status === "completed" && setup.terminalCode === "completed" && affectedResources.includes("wiki");
    if (successfulButDeleted) {
      return {
        ok: true,
        data: { status: "idle", homepage: null, domain: null, conversationId: null, pages: [] },
      };
    }
    const status = setup.status === "completed" && setup.terminalCode === "completed" ? "noContent" : "failed";
    return {
      ok: true,
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
