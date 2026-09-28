import type { SendAgentMessageInteractor, SendAgentMessageResult } from "@/ee/agent-chat/send-agent-message.interactor";
import type { WikiCrawlRecord } from "./wiki-website-crawl.service";

import { AgentAppLocaleSchema } from "@/ee/agent-chat/agent-chat.schema";
import { getTranslator } from "@/i18n/get-translator";

const STARTED = new Set<SendAgentMessageResult["disposition"]>(["run", "running", "completedReplay"]);

export function wikiCrawlSynthesisStarter(agent: Pick<SendAgentMessageInteractor, "invoke">) {
  return async (crawl: WikiCrawlRecord): Promise<string | null> => {
    const locale = AgentAppLocaleSchema.parse(crawl.locale);
    const t = await getTranslator(locale, "WikiSetup");
    const result = await agent.invoke({
      clientRequestId: crawl.clientRequestId,
      text: t("agentPrompt", { homepage: crawl.homepageUrl }),
      locale,
      retry: false,
      wikiHomepageSetupUrl: crawl.homepageUrl,
    });
    if (!result.ok || !STARTED.has(result.data.disposition)) return null;
    return result.data.conversationId ?? null;
  };
}
