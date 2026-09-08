import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { Data, Validated } from "@/core/validation/validation.utils";
import { DomainEvent } from "@/features/event/domain-events";
import type { EventService } from "@/features/event/event.service";

import { WikiPageSchema, type WikiPageDto } from "./wiki.schema";

export const DeleteWikiPageSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});
export type DeleteWikiPageData = Data<typeof DeleteWikiPageSchema>;

export type DeleteWikiPageRepoResult =
  | { status: "deleted"; page: WikiPageDto }
  | { status: "not-found" }
  | { status: "conflict" };

export abstract class DeleteWikiPageRepo {
  abstract deletePage(data: DeleteWikiPageData): Promise<DeleteWikiPageRepoResult>;
}

@TenantInteractor({ resource: Resource.wiki, action: Action.delete })
export class DeleteWikiPageInteractor extends AuthenticatedInteractor<DeleteWikiPageData, WikiPageDto> {
  constructor(
    private repo: DeleteWikiPageRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: DeleteWikiPageSchema, output: WikiPageSchema })
  async invoke(data: DeleteWikiPageData): Validated<WikiPageDto> {
    const result = await this.repo.deletePage(data);
    if (result.status === "not-found") return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    if (result.status === "conflict") return failConflict(CustomErrorCode.wikiPageConflict, ["expectedUpdatedAt"]);

    await this.eventService.publish(DomainEvent.WIKI_PAGE_DELETED, {
      entityId: result.page.id,
      payload: result.page,
    });

    return { ok: true, data: result.page };
  }
}
