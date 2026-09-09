import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { zx, type Data, type Validated } from "@/core/validation/validation.utils";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { DomainEvent } from "@/features/event/domain-events";
import type { EventService } from "@/features/event/event.service";

import { WIKI_TITLE_MAX_LENGTH, WikiMarkdownSchema, WikiPageSchema, type WikiPageDto } from "./wiki.schema";

export const UpdateWikiPageSchema = z
  .object({
    id: z.uuid(),
    expectedUpdatedAt: z.coerce.date(),
    title: zx.nonBlankText(WIKI_TITLE_MAX_LENGTH).optional(),
    markdown: WikiMarkdownSchema.optional(),
  })
  .refine((data) => data.title !== undefined || data.markdown !== undefined, {
    message: "At least one field must be provided.",
  });
export type UpdateWikiPageData = Data<typeof UpdateWikiPageSchema>;

export type UpdateWikiPageRepoResult =
  | {
      status: "updated" | "unchanged";
      previous: WikiPageDto;
      page: WikiPageDto;
    }
  | { status: "not-found" }
  | { status: "conflict" };

export abstract class UpdateWikiPageRepo {
  abstract updatePage(data: UpdateWikiPageData): Promise<UpdateWikiPageRepoResult>;
}

@TenantInteractor({ resource: Resource.wiki, action: Action.update })
export class UpdateWikiPageInteractor extends AuthenticatedInteractor<UpdateWikiPageData, WikiPageDto> {
  constructor(
    private repo: UpdateWikiPageRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: UpdateWikiPageSchema, output: WikiPageSchema })
  async invoke(data: UpdateWikiPageData): Validated<WikiPageDto> {
    const result = await this.repo.updatePage(data);
    if (result.status === "not-found") return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    if (result.status === "conflict") return failConflict(CustomErrorCode.wikiPageConflict, ["expectedUpdatedAt"]);

    if (result.status === "updated") {
      await this.eventService.publish(DomainEvent.WIKI_PAGE_UPDATED, {
        entityId: result.page.id,
        payload: {
          wikiPage: result.page,
          changes: calculateChanges(result.previous, result.page),
        },
      });
    }

    return { ok: true, data: result.page };
  }
}
