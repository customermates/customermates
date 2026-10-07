import type { UpdateWikiPageRepo } from "./update-wiki-page.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { WikiPageDto } from "./wiki.schema";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { DomainEvent } from "@/features/event/domain-events";

import {
  WikiMarkdownSchema,
  WikiPageDtoSchema,
  WikiPageKindSchema,
  WikiTitleSchema,
  WikiWhenToUseSchema,
} from "./wiki.schema";

export const UpdateWikiPageSchema = z
  .object({
    id: z.uuid(),
    expectedUpdatedAt: z.coerce.date(),
    title: WikiTitleSchema.optional(),
    markdown: WikiMarkdownSchema.optional(),
    kind: WikiPageKindSchema.optional(),
    whenToUse: WikiWhenToUseSchema.optional(),
  })
  .refine((data) => [data.title, data.markdown, data.kind, data.whenToUse].some((value) => value !== undefined), {
    params: { error: CustomErrorCode.wikiPageUpdateEmpty },
  });
export type UpdateWikiPageData = Data<typeof UpdateWikiPageSchema>;

export type UpdateWikiPageRepoResult =
  | {
      status: "updated" | "unchanged";
      previous: WikiPageDto;
      page: WikiPageDto;
    }
  | { status: "not-found" }
  | { status: "conflict" }
  | { status: "guide-exists" }
  | { status: "invalid"; error: CustomErrorCode };

@TenantInteractor({ resource: Resource.wiki, manage: "update" })
export class UpdateWikiPageInteractor extends AuthenticatedInteractor<UpdateWikiPageData, WikiPageDto> {
  constructor(
    private repo: UpdateWikiPageRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: UpdateWikiPageSchema, output: WikiPageDtoSchema })
  async invoke(data: UpdateWikiPageData): Validated<WikiPageDto> {
    const result = await this.repo.updatePage(data);
    if (result.status === "not-found") return failNotFound(CustomErrorCode.wikiPageNotFound, ["id"]);
    if (result.status === "conflict") return failConflict(CustomErrorCode.wikiPageConflict, ["expectedUpdatedAt"]);
    if (result.status === "guide-exists") return failConflict(CustomErrorCode.wikiGuideExists, ["kind"]);
    if (result.status === "invalid")
      return fail(result.error, [result.error === CustomErrorCode.wikiWhenToUseRequired ? "whenToUse" : "markdown"]);
    if (result.status === "updated") {
      await this.eventService.publish(DomainEvent.WIKI_PAGE_UPDATED, {
        entityId: result.page.id,
        payload: {
          wikiPage: result.page,
          changes: calculateChanges(result.previous, result.page),
        },
      });
    }

    return { ok: true as const, data: result.page };
  }
}
