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
  WIKI_AGENTS_PAGE_TITLE,
  WIKI_MARKDOWN_MAX_LENGTH,
  WikiMarkdownSchema,
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

export type CreateWikiPagesRepoResult =
  | { status: "created"; pages: WikiPageDto[] }
  | { status: "wiki-not-empty" }
  | { status: "agents-exists" };

export abstract class CreateWikiPagesRepo {
  abstract createPages(data: CreateWikiPagesRepoData): Promise<CreateWikiPagesRepoResult>;
}

function markdownLinkLabel(title: string): string {
  return title.replace(/\s+/gu, " ").replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

const generatedWikiLinkPattern = /\[((?:\\.|[^\]\\\r\n])*)\]\(\s*\/(?:[a-z]{2}\/)?wiki\?page=[^)\r\n]*\)/giu;

function removeGeneratedWikiLinks(markdown: string): string {
  return markdown.replace(generatedWikiLinkPattern, "$1");
}

type PreparedPages =
  | { ok: true; pages: CreateWikiPagesRepoData["pages"] }
  | { ok: false; error: CustomErrorCode.notesExceedsMaxLength | CustomErrorCode.notesInvalidFormat };

function preparePages(data: CreateWikiPagesData): PreparedPages {
  const pages = data.pages.map((page) => ({ ...page, id: randomUUID() }));
  if (!data.requireEmpty || pages[0]?.title !== WIKI_AGENTS_PAGE_TITLE) return { ok: true, pages };

  const linkedPages = pages
    .slice(1)
    .map((page) => `- [${markdownLinkLabel(page.title)}](/wiki?page=${page.id})`)
    .join("\n");
  const entryMarkdown = removeGeneratedWikiLinks(pages[0].markdown);
  const markdown = WikiMarkdownSchema.safeParse(
    linkedPages.length > 0 ? `${entryMarkdown.trimEnd()}\n\n## Wiki\n\n${linkedPages}\n` : entryMarkdown,
  );
  if (!markdown.success) {
    const exceedsLimit = markdown.error.issues.some(
      (issue) => issue.code === "custom" && issue.params?.error === CustomErrorCode.notesExceedsMaxLength,
    );
    return {
      ok: false,
      error: exceedsLimit ? CustomErrorCode.notesExceedsMaxLength : CustomErrorCode.notesInvalidFormat,
    };
  }

  pages[0] = {
    ...pages[0],
    markdown: markdown.data,
  };
  return { ok: true, pages };
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
    const prepared = preparePages(data);
    if (!prepared.ok) return fail(prepared.error, ["pages", 0, "markdown"]);
    const preparedPages = prepared.pages;
    if (preparedPages.some((page) => page.markdown.length > WIKI_MARKDOWN_MAX_LENGTH))
      return fail(CustomErrorCode.notesExceedsMaxLength, ["pages", 0, "markdown"]);

    const result = await this.repo.createPages({ ...data, pages: preparedPages });
    if (result.status === "wiki-not-empty") return failConflict(CustomErrorCode.wikiNotEmpty, ["requireEmpty"]);
    if (result.status === "agents-exists") return failConflict(CustomErrorCode.wikiAgentsPageExists, ["pages"]);

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
