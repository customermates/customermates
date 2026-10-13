import { PermissionService } from "@/core/base/permission.service";
import type { GetWikiSuggestionSignalRepo } from "@/features/wiki/get-wiki-suggestion-signal.repo";
import type { RoutineRunLinkRepo } from "@/ee/agent-chat/routine-run-link.repo";

import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { createTestRoutineRepo } from "./record-delivery";

export function prismaAgentChatRepoDependencies(): [GetWikiSuggestionSignalRepo, PermissionService, RoutineRunLinkRepo] {
  return [new PrismaWikiPageRepo(new PermissionService()), new PermissionService(), createTestRoutineRepo()];
}
