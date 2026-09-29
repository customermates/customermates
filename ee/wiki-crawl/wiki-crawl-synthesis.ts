import type { SendAgentMessageInteractor, SendAgentMessageResult } from "@/ee/agent-chat/send-agent-message.interactor";
import type { WikiCrawlRecord } from "./wiki-website-crawl.service";

import { AgentAppLocaleSchema } from "@/ee/agent-chat/agent-chat.schema";
import { serializeInteractorFailure } from "@/core/validation/validation.utils";
import { getTranslator } from "@/i18n/get-translator";

const STARTED = new Set<SendAgentMessageResult["disposition"]>(["run", "running", "completedReplay"]);

export type WikiCrawlSynthesisResult =
  | { conversationId: string; failureReason: null }
  | { conversationId: null; failureReason: string };

export function wikiCrawlSynthesisStarter(agent: Pick<SendAgentMessageInteractor, "invoke">) {
  return async (crawl: WikiCrawlRecord): Promise<WikiCrawlSynthesisResult> => {
    const locale = AgentAppLocaleSchema.parse(crawl.locale);
    const t = await getTranslator(locale, "WikiSetup");
    const result = await agent.invoke({
      clientRequestId: crawl.clientRequestId,
      text: t("agentPrompt", { homepage: crawl.homepageUrl }),
      locale,
      retry: false,
      wikiHomepageSetupUrl: crawl.homepageUrl,
    });
    if (!result.ok) {
      const failure = serializeInteractorFailure(result.error);
      const code = failure.issues.find((issue) => issue.customCode)?.customCode ?? failure.kind;
      return { conversationId: null, failureReason: `synthesisAdmission:${code}` };
    }
    if (!STARTED.has(result.data.disposition))
      return { conversationId: null, failureReason: `synthesisDisposition:${result.data.disposition}` };
    if (!result.data.conversationId) return { conversationId: null, failureReason: "synthesisMissingConversation" };
    return { conversationId: result.data.conversationId, failureReason: null };
  };
}
