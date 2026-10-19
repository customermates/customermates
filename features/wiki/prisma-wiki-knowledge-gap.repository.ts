import type { GetWikiKnowledgeGapsRepo } from "./get-wiki-knowledge-gaps.repo";
import type { PruneWikiKnowledgeGapsRepo } from "./prune-wiki-knowledge-gaps.repo";
import type { WikiKnowledgeGapRecorder } from "./wiki-knowledge-gap-recorder";

import * as Sentry from "@sentry/node";

import { Prisma } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

import { wikiKnowledgeGapQuery } from "./wiki-knowledge-gaps";

export class PrismaWikiKnowledgeGapRepo
  extends TenantRepository
  implements WikiKnowledgeGapRecorder, GetWikiKnowledgeGapsRepo, PruneWikiKnowledgeGapsRepo
{
  async record(query: string): Promise<void> {
    const shape = wikiKnowledgeGapQuery(query);
    if (!shape) return;
    try {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "WikiKnowledgeGap" ("id", "companyId", "query")
        VALUES (gen_random_uuid()::text, ${this.companyId}, ${shape})
        ON CONFLICT ("companyId", "query") DO UPDATE
        SET "count" = "WikiKnowledgeGap"."count" + 1, "lastSeenAt" = CURRENT_TIMESTAMP
      `);
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  async listKnowledgeGaps(limit: number) {
    return this.prisma.wikiKnowledgeGap.findMany({
      where: { companyId: this.companyId },
      select: { query: true, count: true, firstSeenAt: true, lastSeenAt: true },
      orderBy: [{ count: "desc" }, { lastSeenAt: "desc" }, { query: "asc" }],
      take: limit,
    });
  }

  @BypassTenantGuard
  async deleteKnowledgeGapsUnscoped(lastSeenBefore: Date): Promise<number> {
    const { count } = await this.prisma.wikiKnowledgeGap.deleteMany({
      where: { lastSeenAt: { lt: lastSeenBefore } },
    });
    return count;
  }
}
