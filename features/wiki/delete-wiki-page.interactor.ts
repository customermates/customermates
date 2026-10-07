import type { DeleteWikiPageRepo } from "./delete-wiki-page.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { WikiPageDto } from "./wiki.schema";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DomainEvent } from "@/features/event/domain-events";

import { WikiPageDtoSchema } from "./wiki.schema";

export const DeleteWikiPageSchema = z.object({
  id: z.uuid(),
  expectedUpdatedAt: z.coerce.date(),
});
export type DeleteWikiPageData = Data<typeof DeleteWikiPageSchema>;

export type DeleteWikiPageRepoResult =
  | { status: "deleted"; page: WikiPageDto }
  | { status: "not-found" }
  | { status: "conflict" };

@TenantInteractor({ resource: Resource.wiki, manage: "delete" })
export class DeleteWikiPageInteractor extends AuthenticatedInteractor<DeleteWikiPageData, WikiPageDto> {
  constructor(
    private repo: DeleteWikiPageRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: DeleteWikiPageSchema, output: WikiPageDtoSchema })
  async invoke(data: DeleteWikiPageData): Validated<WikiPageDto> {
    const result = await this.repo.deletePage(data);
    if (result.status === "not-found") return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    if (result.status === "conflict") return failConflict(CustomErrorCode.wikiPageConflict, ["expectedUpdatedAt"]);

    await this.eventService.publish(DomainEvent.WIKI_PAGE_DELETED, {
      entityId: result.page.id,
      payload: result.page,
    });

    return { ok: true as const, data: result.page };
  }
}
