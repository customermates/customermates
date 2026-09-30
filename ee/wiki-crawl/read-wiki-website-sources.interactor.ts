import type { Data, Validated } from "@/core/validation/validation.utils";
import type { z } from "zod";
import type { WikiWebsiteCrawlRepo } from "./wiki-website-crawl.service";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { sourceFullyRead, wikiSourceCoverage, wikiSourcePayloadFits } from "./wiki-source-coverage";
import { ReadWikiWebsiteSourcesSchema, ReadWikiWebsiteSourcesResultSchema } from "./wiki-crawl-synthesis.schema";

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
    const coverage = await wikiSourceCoverage(this.repo, data.crawlId);
    if (data.action === "list") {
      const start = Math.min(data.offset ?? 0, coverage.sources.length);
      const items = coverage.sources.slice(start, start + 40).map((source) => ({
        id: source.id,
        url: source.url,
        category: source.category,
        title: source.title,
        headings: [...source.text.matchAll(/^#{1,4}\s+(.+)$/gm)].slice(0, 12).map((match) => match[1].slice(0, 120)),
        chars: source.text.length,
        imported: coverage.imported.has(source.id),
        read: coverage.readHashes.has(source.contentHash),
        nextOffset: sourceFullyRead(source) ? null : source.readOffset,
      }));
      while (items.length > 1 && !wikiSourcePayloadFits({ items })) items.pop();
      return {
        ok: true as const,
        data: {
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
    while (!wikiSourcePayloadFits({ items: chunks })) {
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
        remainingSources: after.pending.length,
        importedSources: after.imported.size,
        nextAction: after.pending.length ? "next" : "get cited sources, then create",
        items: chunks,
      },
    };
  }
}
