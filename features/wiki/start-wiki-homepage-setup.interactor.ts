import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { APP_LOCALES } from "@/i18n/locale-registry";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { SendAgentMessageInteractor, SendAgentMessageResult } from "@/ee/agent-chat/send-agent-message.interactor";

import { buildWikiHomepageSetupPrompt, parsePublicWikiHomepage } from "./wiki-homepage";

const [firstAppLocale, ...otherAppLocales] = APP_LOCALES;

export const StartWikiHomepageSetupSchema = z.object({
  homepage: z.string().trim().min(1).max(2_000),
  clientRequestId: z.uuid(),
  locale: z.enum([firstAppLocale, ...otherAppLocales]),
  retry: z.boolean().optional(),
});
export type StartWikiHomepageSetupData = Data<typeof StartWikiHomepageSetupSchema>;

export abstract class StartWikiHomepageSetupRepo {
  abstract wikiIsEmpty(): Promise<boolean>;
  abstract findReusableSetupRequestClientId(data: { clientRequestId: string; prompt: string }): Promise<string | null>;
}

@TenantInteractor({ resource: Resource.wiki, action: Action.create })
export class StartWikiHomepageSetupInteractor extends AuthenticatedInteractor<
  StartWikiHomepageSetupData,
  SendAgentMessageResult
> {
  constructor(
    private repo: StartWikiHomepageSetupRepo,
    private agent: Pick<SendAgentMessageInteractor, "invoke">,
  ) {
    super();
  }

  @Write({ input: StartWikiHomepageSetupSchema, tx: false })
  async invoke(data: StartWikiHomepageSetupData): Validated<SendAgentMessageResult> {
    const homepage = parsePublicWikiHomepage(data.homepage);
    if (!homepage) return fail(CustomErrorCode.invalidUrl, ["homepage"]);
    const prompt = buildWikiHomepageSetupPrompt(homepage);
    const reusableClientRequestId = await this.repo.findReusableSetupRequestClientId({
      clientRequestId: data.clientRequestId,
      prompt,
    });
    if (!reusableClientRequestId && !(await this.repo.wikiIsEmpty()))
      return failConflict(CustomErrorCode.wikiNotEmpty, ["homepage"]);

    return this.agent.invoke({
      clientRequestId: reusableClientRequestId ?? data.clientRequestId,
      text: prompt,
      locale: data.locale,
      retry: data.retry === true,
      wikiHomepageSetupDomain: homepage.registrableDomain,
    });
  }
}
