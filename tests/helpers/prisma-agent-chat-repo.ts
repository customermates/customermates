import type { GetWikiSuggestionSignalRepo } from "@/features/wiki/get-wiki-suggestion-signal.repo";

import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";

export function prismaAgentChatRepoDependencies(): [GetWikiSuggestionSignalRepo] {
  return [new PrismaWikiPageRepo()];
}
