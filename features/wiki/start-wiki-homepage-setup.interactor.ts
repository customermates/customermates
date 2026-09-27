import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { APP_LOCALES } from "@/i18n/locale-registry";
import { getTranslator } from "@/i18n/get-translator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { SendAgentMessageInteractor, SendAgentMessageResult } from "@/ee/agent-chat/send-agent-message.interactor";

import { parsePublicWikiHomepage } from "./wiki-homepage";

const [firstAppLocale, ...otherAppLocales] = APP_LOCALES;

export const StartWikiHomepageSetupSchema = z.object({
  homepage: z.string().trim().min(1).max(2_000),
  clientRequestId: z.uuid(),
  locale: z.enum([firstAppLocale, ...otherAppLocales]),
});
export type StartWikiHomepageSetupData = Data<typeof StartWikiHomepageSetupSchema>;

export type StartedWikiHomepageSetup = {
  conversationId: string;
  homepage: string;
  domain: string;
};

const ACCEPTED_DISPOSITIONS = new Set<SendAgentMessageResult["disposition"]>(["run", "running", "completedReplay"]);

export abstract class StartWikiHomepageSetupRepo {
  abstract wikiIsEmpty(): Promise<boolean>;
}

export abstract class StartWikiHomepageSetupTurnRepo {
  abstract findReusableWikiHomepageSetupTurn(data: {
    clientRequestId: string;
    homepageUrl: string;
  }): Promise<{ disposition: "reuse"; clientRequestId: string; text: string } | { disposition: "blocked" } | null>;
}

@TenantInteractor({ resource: Resource.wiki, action: Action.create })
export class StartWikiHomepageSetupInteractor extends AuthenticatedInteractor<
  StartWikiHomepageSetupData,
  StartedWikiHomepageSetup
> {
  constructor(
    private repo: StartWikiHomepageSetupRepo,
    private setupTurnRepo: StartWikiHomepageSetupTurnRepo,
    private agent: Pick<SendAgentMessageInteractor, "invoke">,
  ) {
    super();
  }

  @Write({ input: StartWikiHomepageSetupSchema, tx: false })
  async invoke(data: StartWikiHomepageSetupData): Validated<StartedWikiHomepageSetup> {
    const homepage = parsePublicWikiHomepage(data.homepage);
    if (!homepage) return fail(CustomErrorCode.invalidUrl, ["homepage"]);
    const reusable = await this.setupTurnRepo.findReusableWikiHomepageSetupTurn({
      clientRequestId: data.clientRequestId,
      homepageUrl: homepage.url,
    });
    if (reusable?.disposition === "blocked") return failConflict(CustomErrorCode.agentTurnAlreadyRunning, ["homepage"]);
    if (!reusable && !(await this.repo.wikiIsEmpty())) return failConflict(CustomErrorCode.wikiNotEmpty, ["homepage"]);
    let text: string;
    if (reusable) text = reusable.text;
    else {
      const t = await getTranslator(data.locale, "WikiSetup");
      text = t("agentPrompt", { homepage: homepage.url });
    }

    const start = (retry: boolean) =>
      this.agent.invoke({
        clientRequestId: reusable?.clientRequestId ?? data.clientRequestId,
        text,
        locale: data.locale,
        retry,
        wikiHomepageSetupUrl: homepage.url,
      });

    let result = await start(false);
    if (result.ok && result.data.disposition === "failed" && result.data.retryAllowed) result = await start(true);
    if (!result.ok) return result;
    if (!ACCEPTED_DISPOSITIONS.has(result.data.disposition) || !result.data.conversationId)
      return fail(CustomErrorCode.wikiHomepageSetupStartFailed, ["homepage"]);

    return {
      ok: true,
      data: {
        conversationId: result.data.conversationId,
        homepage: homepage.url,
        domain: homepage.registrableDomain,
      },
    };
  }
}
