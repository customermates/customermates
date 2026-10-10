import { PermissionService } from "@/core/base/permission.service";
import type { GetWikiSuggestionSignalRepo } from "@/features/wiki/get-wiki-suggestion-signal.repo";

import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";

export function prismaAgentChatRepoDependencies(): [GetWikiSuggestionSignalRepo, PermissionService] {
  return [new PrismaWikiPageRepo(new PermissionService()), new PermissionService()];
}
