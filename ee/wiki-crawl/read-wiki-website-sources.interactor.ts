import type { Data, Validated } from "@/core/validation/validation.utils";
import type { z } from "zod";
import type { WikiWebsiteCrawlRepo } from "@/ee/wiki-crawl/wiki-website-crawl.repo";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { wikiPagePath } from "@/features/wiki/wiki-links";

import { sourceFullyRead, wikiSourceCoverage, wikiSourcePayloadFits } from "./wiki-source-coverage";
import { wikiSourceHeadings } from "./wiki-source-inventory";
import {
  ReadWikiWebsiteSourcesSchema,
  ReadWikiWebsiteSourcesResultSchema,
  WIKI_SYNTHESIS_MAX_PAGES,
  WIKI_SYNTHESIS_FOUNDATION_ROLES,
} from "./wiki-crawl-synthesis.schema";

const SOURCE_CHUNK_CHARACTERS = 12_000;
type ReadSourcesData = Data<typeof ReadWikiWebsiteSourcesSchema>;
type ReadSourcesResult = z.infer<typeof ReadWikiWebsiteSourcesResultSchema>;

@TenantInteractor({ resource: Resource.wiki, action: Action.create })
export class ReadWikiWebsiteSourcesInteractor extends AuthenticatedInteractor<ReadSourcesData, ReadSourcesResult> {
  constructor(private repo: WikiWebsiteCrawlRepo) {
    super();
  }

  @Write({ input: ReadWikiWebsiteSourcesSchema, output: ReadWikiWebsiteSourcesResultSchema })
  async invoke(data: ReadSourcesData): Validated<ReadSourcesResult> {
    const crawl = await this.repo.getCrawl(data.crawlId);
    if (!crawl) return failNotFound(CustomErrorCode.wikiImportNotFound, ["crawlId"]);
    const pages = await this.repo.listSynthesizedPages(crawl.startedAt, WIKI_SYNTHESIS_MAX_PAGES);
    const createdPageLinks = pages.map(({ id, title }) => ({ title, path: wikiPagePath(id) }));
    const coverage = await wikiSourceCoverage(this.repo, data.crawlId);
    if (data.action === "plan") {
      if (coverage.pending.length > 0)
        return fail(CustomErrorCode.wikiSourceCoverageRequired, [], { remainingSources: coverage.pending.length });
      if (
        (data.reclassifiedOfferings ?? []).some(({ sourceId, evidenceQuote }) => {
          const source = coverage.sources.find(({ id }) => id === sourceId);
          return (
            !source?.text.includes(evidenceQuote) || (evidenceQuote.length < 20 && source.text.trim() !== evidenceQuote)
          );
        })
      )
        return fail(CustomErrorCode.wikiSourceCitationInvalid, ["reclassifiedOfferings"]);
      const groups = [...(data.topics ?? []), ...(data.excluded ?? [])];
      const accounted = new Set(groups.flatMap(({ sourceIds }) => sourceIds));
      const sourceIds = new Set(coverage.sources.map(({ id }) => id));
      const topicSources = new Set((data.topics ?? []).flatMap(({ sourceIds }) => sourceIds));
      const excluded = (data.excluded ?? []).flatMap(({ sourceIds }) => sourceIds);
      if (
        [...accounted].some((id) => !sourceIds.has(id)) ||
        groups.some(({ sourceIds }) => new Set(sourceIds).size !== sourceIds.length) ||
        new Set(excluded).size !== excluded.length ||
        excluded.some((id) => topicSources.has(id))
      )
        return fail(CustomErrorCode.wikiSourceCitationInvalid, ["topics"]);
      const missingSourceIds = [...sourceIds].filter((id) => !accounted.has(id));
      if (!data.topics || missingSourceIds.length > 0) {
        return fail(CustomErrorCode.wikiSourcePlanIncomplete, ["topics"], {
          missingSourceIds: missingSourceIds.join(", "),
          missingRoles: "",
        });
      }
      if (
        data.topics.some(
          (topic) => topic.role === "offering" && topic.sourceIds.every((id) => coverage.imported.has(id)),
        )
      )
        return fail(CustomErrorCode.wikiSourceCitationInvalid, ["topics"]);
      const titles = data.topics.map(({ title }) => title.toLowerCase());
      if (new Set(titles).size !== titles.length) return fail(CustomErrorCode.wikiImportTitleInvalid, ["topics"]);
      const sourcesById = new Map(coverage.sources.map((source) => [source.id, source]));
      const topicsByTitle = new Map(data.topics.map((topic) => [topic.title, topic]));
      if (
        (data.excluded ?? []).some((exclusion) => {
          const source = sourcesById.get(exclusion.sourceIds[0]);
          if (!source) return true;
          if (exclusion.basis === "already_imported") return !coverage.imported.has(source.id);
          if (exclusion.basis === "exact_duplicate") {
            const duplicate = sourcesById.get(exclusion.duplicateOfSourceId ?? "");
            return (
              !duplicate ||
              duplicate.id === source.id ||
              duplicate.contentHash !== source.contentHash ||
              (!topicSources.has(duplicate.id) && !coverage.imported.has(duplicate.id))
            );
          }
          if (exclusion.basis === "overlap") {
            const topic = topicsByTitle.get(exclusion.coveredByTitle ?? "");
            return !topic || topic.role !== "offering" || exclusion.coveredByRole !== topic.role;
          }
          const quote = exclusion.evidenceQuote;
          return (
            quote === undefined || !source.text.includes(quote) || (quote.length < 20 && source.text.trim() !== quote)
          );
        })
      )
        return fail(CustomErrorCode.wikiSourceCitationInvalid, ["excluded"]);
      const omitted = data.omittedFoundations ?? [];
      const roles = [...data.topics.map(({ role }) => role), ...omitted.map(({ role }) => role)];
      const invalidRoles =
        crawl.mode === "extend"
          ? [
              ...omitted.map(({ role }) => role),
              ...data.topics.filter(({ role }) => role !== "offering").map(({ role }) => role),
            ]
          : [
              ...WIKI_SYNTHESIS_FOUNDATION_ROLES.filter((role) => roles.filter((value) => value === role).length !== 1),
              ...(roles.filter((role) => role === "operating_guide").length !== (data.topics.length > 0 ? 1 : 0)
                ? ["operating_guide"]
                : []),
            ];
      if (invalidRoles.length > 0) {
        return fail(CustomErrorCode.wikiSourcePlanIncomplete, ["topics"], {
          missingSourceIds: "",
          missingRoles: [...new Set(invalidRoles)].join(", "),
        });
      }
      return {
        ok: true as const,
        data: {
          createdPageLinks,
          remainingSources: 0,
          importedSources: coverage.imported.size,
          nextAction:
            "get cited sources, then create every planned offering and foundation; the guide is last in a separate call",
          items: [],
          topicPlan: data.topics,
        },
      };
    }
    if (data.action === "list") {
      const headings = wikiSourceHeadings(coverage.sources);
      const start = Math.min(data.offset ?? 0, coverage.sources.length);
      const items = coverage.sources.slice(start, start + 40).map((source) => ({
        id: source.id,
        url: source.url,
        category: source.category,
        title: source.title,
        headings: (headings.get(source.id) ?? []).slice(0, 12),
        chars: source.text.length,
        imported: coverage.imported.has(source.id),
        read: coverage.readHashes.has(source.contentHash),
        nextOffset: sourceFullyRead(source) ? null : source.readOffset,
      }));
      while (items.length > 1 && !wikiSourcePayloadFits({ createdPageLinks, items })) items.pop();
      return {
        ok: true as const,
        data: {
          createdPageLinks,
          remainingSources: coverage.pending.length,
          importedSources: coverage.imported.size,
          nextAction: coverage.pending.length ? "next" : "get cited sources, then create",
          items,
          nextOffset: start + items.length < coverage.sources.length ? start + items.length : null,
        },
      };
    }
    const selected =
      data.action === "next" ? coverage.pending.slice(0, 8) : coverage.sources.filter(({ id }) => id === data.id);
    if (data.action === "get" && selected.length === 0) return failNotFound(CustomErrorCode.wikiSourceNotFound, ["id"]);
    const items = selected.map((source) => {
      const offset = data.action === "get" ? (data.offset ?? source.readOffset) : source.readOffset;
      if (offset > source.readOffset || offset > source.text.length) return null;
      const end = Math.min(source.text.length, offset + SOURCE_CHUNK_CHARACTERS);
      return {
        id: source.id,
        title: source.title,
        url: source.url,
        category: source.category,
        offset,
        nextOffset: end < source.text.length ? end : null,
        text: source.text.slice(offset, end),
      };
    });
    if (items.some((item) => item === null)) return fail(CustomErrorCode.wikiSourceReadOrder, ["offset"]);

    if (data.action === "get" && coverage.pending.length > 0)
      return fail(CustomErrorCode.wikiSourceCoverageRequired, [], { remainingSources: coverage.pending.length });

    const chunks = items.filter((item) => item !== null);
    while (!wikiSourcePayloadFits({ createdPageLinks, items: chunks })) {
      const last = chunks.reduce<(typeof chunks)[number] | undefined>(
        (largest, chunk) => (!largest || chunk.text.length > largest.text.length ? chunk : largest),
        undefined,
      );
      if (!last || last.text.length < 2) return fail(CustomErrorCode.wikiSourceChunkTooLarge);
      last.text = last.text.slice(0, Math.floor(last.text.length / 2));
      last.nextOffset = last.offset + last.text.length;
    }
    await this.repo.advanceSourceReads(
      data.crawlId,
      chunks
        .filter(({ text }) => text.length > 0)
        .map(({ id, offset, text }) => ({ id, offset, end: offset + text.length })),
    );
    const after = await wikiSourceCoverage(this.repo, data.crawlId);
    return {
      ok: true as const,
      data: {
        createdPageLinks,
        remainingSources: after.pending.length,
        importedSources: after.imported.size,
        nextAction: after.pending.length ? "next" : "get cited sources, then create",
        items: chunks,
      },
    };
  }
}
