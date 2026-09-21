import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { Data, Validated } from "@/core/validation/validation.utils";
import { DomainEvent } from "@/features/event/domain-events";
import type { EventService } from "@/features/event/event.service";

import {
  WIKI_MARKDOWN_MAX_LENGTH,
  WikiPageInputSchema,
  WikiPageSchema,
  type WikiPageDto,
  type WikiPageInput,
} from "./wiki.schema";

export const CreateWikiPagesSchema = z.object({
  pages: z.array(WikiPageInputSchema).min(1).max(5),
  requireEmpty: z.boolean().default(false),
});
export type CreateWikiPagesData = Data<typeof CreateWikiPagesSchema>;

export type CreateWikiPagesRepoData = Omit<CreateWikiPagesData, "pages"> & {
  pages: Array<WikiPageInput & { id: string }>;
};

export type CreateWikiPagesRepoResult = { status: "created"; pages: WikiPageDto[] } | { status: "wiki-not-empty" };

export abstract class CreateWikiPagesRepo {
  abstract createPages(data: CreateWikiPagesRepoData): Promise<CreateWikiPagesRepoResult>;
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
    const preparedPages = data.pages.map((page) => ({
      ...page,
      id: randomUUID(),
    }));
    if (preparedPages.some((page) => page.markdown.length > WIKI_MARKDOWN_MAX_LENGTH))
      return fail(CustomErrorCode.notesExceedsMaxLength, ["pages", 0, "markdown"]);

    const result = await this.repo.createPages({
      ...data,
      pages: preparedPages,
    });
    if (result.status === "wiki-not-empty") return failConflict(CustomErrorCode.wikiNotEmpty, ["requireEmpty"]);

    const pages = result.pages;

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
