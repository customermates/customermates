import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { Data, Validated } from "@/core/validation/validation.utils";
import { DomainEvent } from "@/features/event/domain-events";
import type { EventService } from "@/features/event/event.service";

import { WikiPageInputSchema, WikiPageSchema, type WikiPageDto } from "./wiki.schema";

export const CreateWikiPagesSchema = z.object({
  pages: z.array(WikiPageInputSchema).min(1).max(5),
  requireEmpty: z.boolean().default(false),
});
export type CreateWikiPagesData = Data<typeof CreateWikiPagesSchema>;

export abstract class CreateWikiPagesRepo {
  abstract createPages(data: CreateWikiPagesData): Promise<WikiPageDto[] | null>;
}

@TenantInteractor({ resource: Resource.wiki, action: Action.create })
export class CreateWikiPagesInteractor extends AuthenticatedInteractor<CreateWikiPagesData, WikiPageDto[]> {
  constructor(
    private repo: CreateWikiPagesRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: CreateWikiPagesSchema, output: WikiPageSchema })
  async invoke(data: CreateWikiPagesData): Validated<WikiPageDto[]> {
    const pages = await this.repo.createPages(data);
    if (!pages) return failConflict(CustomErrorCode.wikiNotEmpty, ["requireEmpty"]);

    await Promise.all(
      pages.map((page) =>
        this.eventService.publish(DomainEvent.WIKI_PAGE_CREATED, {
          entityId: page.id,
          payload: page,
        }),
      ),
    );

    return { ok: true, data: pages };
  }
}
