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

import { WIKI_PAGE_EDITS_MAX, WikiPageEditSchema } from "./wiki-page-edits";
import {
  WikiMarkdownSchema,
  WikiOwnerSchema,
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
    edits: z
      .array(WikiPageEditSchema)
      .min(1)
      .max(WIKI_PAGE_EDITS_MAX)
      .optional()
      .describe(
        "Changes to parts of the page instead of a whole new markdown, applied in order and all or none. Each edit is one of: find and replace (the one exact occurrence of a text, within the section named by anchor when given); anchor and markdown (replaces that section, or with placement before or after inserts beside it); markdown alone (adds to the end of the page, or with placement start to its beginning). A section runs from its heading to the next heading of any level.",
      ),
    kind: WikiPageKindSchema.optional(),
    whenToUse: WikiWhenToUseSchema.optional(),
    owner: WikiOwnerSchema.nullable()
      .optional()
      .describe("Who keeps the page current: a person, a team or an agent. null or an empty text clears it."),
    verified: z
      .literal(true)
      .optional()
      .describe(
        "true records that the page was checked and is still correct: verifiedAt becomes now and updatedAt stays as it is unless the content changes in the same call.",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.markdown !== undefined && data.edits !== undefined)
      ctx.addIssue({ code: "custom", path: ["edits"], params: { error: CustomErrorCode.wikiEditInvalid } });
    const changes = [data.title, data.markdown, data.edits, data.kind, data.whenToUse, data.owner, data.verified];
    if (changes.every((value) => value === undefined))
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.wikiPageUpdateEmpty } });
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
  | { status: "invalid"; error: CustomErrorCode }
  | { status: "invalid-edit"; error: CustomErrorCode; index: number };

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
    if (result.status === "invalid-edit") return fail(result.error, ["edits", result.index]);
    if (result.status === "invalid") {
      return fail(result.error, [
        result.error === CustomErrorCode.wikiWhenToUseRequired ? "whenToUse" : data.edits ? "edits" : "markdown",
      ]);
    }
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
