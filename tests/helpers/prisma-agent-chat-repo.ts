import type { GetWikiSuggestionSignalRepo } from "@/features/wiki/get-wiki-suggestion-signal.repo";
import type { WikiCrawlAdmissionRepo } from "@/ee/wiki-crawl/wiki-crawl-admission.repo";

import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { PrismaWikiWebsiteCrawlRepo } from "@/ee/wiki-crawl/prisma-wiki-website-crawl.repository";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";

export function prismaAgentChatRepoDependencies(): [GetWikiSuggestionSignalRepo, () => WikiCrawlAdmissionRepo] {
  return [
    new PrismaWikiPageRepo(),
    () => new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo(), new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies())),
  ];
}
