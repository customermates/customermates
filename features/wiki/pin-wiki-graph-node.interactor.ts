import type { Validated } from "@/core/validation/validation.utils";
import type { WikiGraphRepo } from "./wiki-graph.repo";
import type { PinWikiGraphNodeData, PinWikiGraphNodeResult } from "./wiki-graph.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { pinWikiGraphPosition } from "./wiki-graph-layout";
import { PinWikiGraphNodeResultSchema, PinWikiGraphNodeSchema } from "./wiki-graph.schema";

@TenantInteractor({ resource: Resource.wiki, manage: "update" })
export class PinWikiGraphNodeInteractor extends AuthenticatedInteractor<PinWikiGraphNodeData, PinWikiGraphNodeResult> {
  constructor(private repo: WikiGraphRepo) {
    super();
  }

  @Write({ input: PinWikiGraphNodeSchema, output: PinWikiGraphNodeResultSchema })
  async invoke(data: PinWikiGraphNodeData): Validated<PinWikiGraphNodeResult> {
    const [page] = await this.repo.loadPagesByIds([data.id]);
    if (!page) return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    const pinned = "pinned" in data ? null : { x: data.x, y: data.y };
    const positions = await this.repo.updateLayoutPositions((current) =>
      pinWikiGraphPosition(current, data.id, pinned),
    );
    return { ok: true as const, data: { id: data.id, pinned: positions?.[data.id]?.pinned === true } };
  }
}
