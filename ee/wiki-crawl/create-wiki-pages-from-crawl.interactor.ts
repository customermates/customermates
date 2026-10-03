import type { Data, Validated } from "@/core/validation/validation.utils";
import type { z } from "zod";
import type { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import type { WikiWebsiteCrawlRepo } from "@/ee/wiki-crawl/wiki-website-crawl.repo";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failIssues, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { wikiLanguageConflicts } from "@/features/wiki/wiki-language";
import { hasInvalidWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { env } from "@/env";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

import { wikiSourceCoverage } from "./wiki-source-coverage";
import { wikiSynthesisSectionMarkdown } from "./wiki-synthesis-markdown";
import { invalidWikiSynthesisEvidencePaths } from "./wiki-synthesis-evidence";
import { wikiSynthesisQuotedLanguageConflicts } from "./wiki-synthesis-language";
import {
  CreateWikiPagesFromCrawlSchema,
  CreateWikiPagesFromCrawlResultSchema,
  WIKI_SYNTHESIS_MAX_PAGES,
} from "./wiki-crawl-synthesis.schema";

type CreatePagesData = Data<typeof CreateWikiPagesFromCrawlSchema>;
type CreatePagesResult = z.infer<typeof CreateWikiPagesFromCrawlResultSchema>;

@TenantInteractor({ resource: Resource.wiki, action: Action.create })
export class CreateWikiPagesFromCrawlInteractor extends AuthenticatedInteractor<CreatePagesData, CreatePagesResult> {
  constructor(
    private repo: WikiWebsiteCrawlRepo,
    private createPages: CreateWikiPagesInteractor,
  ) {
    super();
  }

  @Write({ input: CreateWikiPagesFromCrawlSchema, output: CreateWikiPagesFromCrawlResultSchema })
  async invoke(data: CreatePagesData): Validated<CreatePagesResult> {
    const crawl = await this.repo.getCrawl(data.crawlId);
    if (!crawl) return failNotFound(CustomErrorCode.wikiImportNotFound, ["crawlId"]);

    const targetLocale = appLocaleOrDefault(crawl.locale);
    if (crawl.mode === "extend" && data.pages.some((page) => page.kind !== "knowledge"))
      return fail(CustomErrorCode.wikiImportKnowledgeOnly, ["pages"]);

    const wrongLanguage = data.pages.some((page) => {
      const bodies = page.sections.map(({ content }) => content);
      return (
        wikiSynthesisQuotedLanguageConflicts(bodies, targetLocale) ||
        [
          ...bodies,
          page.whenToUse ?? "",
          page.sections.map(({ heading }) => heading).join("\n"),
          [page.title, page.whenToUse, ...bodies].join("\n"),
          page.gaps.join("\n"),
        ].some((body) => wikiLanguageConflicts(body, targetLocale))
      );
    });
    if (wrongLanguage) return fail(CustomErrorCode.wikiImportLanguageRequired, ["pages"], { locale: targetLocale });

    const created = await this.repo.countSynthesizedPages(crawl.startedAt);
    const createdPages = await this.repo.listSynthesizedPages(crawl.startedAt, WIKI_SYNTHESIS_MAX_PAGES);
    const createdPageTitles = createdPages.map(({ title }) => title);
    if (created + data.pages.length > WIKI_SYNTHESIS_MAX_PAGES) {
      return fail(CustomErrorCode.wikiImportPageLimit, ["pages"], {
        maximum: WIKI_SYNTHESIS_MAX_PAGES,
        created,
        titles: createdPageTitles.join(", "),
      });
    }

    const coverage = await wikiSourceCoverage(this.repo, data.crawlId);
    const sources = new Map(coverage.sources.map((source) => [source.id, source]));
    const unknown = data.pages.flatMap(({ sourceIds }) => sourceIds).filter((id) => !sources.has(id));
    if (unknown.length > 0) return fail(CustomErrorCode.wikiSourceCitationInvalid, ["pages"]);

    if (coverage.pending.length > 0)
      return fail(CustomErrorCode.wikiSourceCoverageRequired, [], { remainingSources: coverage.pending.length });

    const unread = [
      ...new Set(
        data.pages
          .flatMap(({ sourceIds }) => sourceIds)
          .filter((id) => !coverage.readHashes.has(sources.get(id)?.contentHash ?? "")),
      ),
    ];
    if (unread.length > 0) return fail(CustomErrorCode.wikiSourceCitationUnread, ["pages"], { ids: unread.join(", ") });

    const invalidEvidence = invalidWikiSynthesisEvidencePaths(data.pages, sources);
    if (invalidEvidence.length)
      return failIssues(invalidEvidence.map((path) => ({ code: CustomErrorCode.wikiSourceEvidenceInvalid, path })));

    const t = await getTranslator(targetLocale, "WikiSetup.generated");
    const pages = data.pages.map((page) => ({
      title: page.title,
      kind: page.kind,
      whenToUse: page.kind === "procedure" ? page.whenToUse : undefined,
      markdown: [
        ...page.sections.map(({ heading, content }) => `## ${heading}\n\n${wikiSynthesisSectionMarkdown(content)}`),
        `## ${t("sourcesHeading")}\n\n${[...new Set(page.sourceIds)]
          .map((id) => {
            const source = sources.get(id);
            return source ? `- <${source.url}> (${source.fetchedAt.toISOString().slice(0, 10)})` : "";
          })
          .join("\n")}`,
        ...(page.gaps.length ? [`## ${t("gapsHeading")}\n\n${page.gaps.map((gap) => `- ${gap}`).join("\n")}`] : []),
      ].join("\n\n"),
    }));
    if (pages.some(({ markdown }) => hasInvalidWikiPageLinks(markdown, env.BASE_URL)))
      return fail(CustomErrorCode.wikiImportLinkInvalid, ["pages"]);

    const result = await this.createPages.invoke({ requireEmpty: false, pages });
    if (!result.ok) return result;
    return {
      ok: true as const,
      data: {
        items: result.data,
        createdPageTitles: [...createdPageTitles, ...result.data.map(({ title }) => title)],
        remainingPageSlots: Math.max(0, WIKI_SYNTHESIS_MAX_PAGES - created - result.data.length),
      },
    };
  }
}
