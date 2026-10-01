import { z } from "zod";

import { getCreateWikiPagesFromCrawlInteractor, getReadWikiWebsiteSourcesInteractor } from "@/core/di";
import { formatDatesInResponse, mcpValidationFailure, runInteractor, toonResult } from "@/features/mcp-tools/utils";
import { ManageWikiPagesOutputSchema, wikiPageSummary } from "@/features/mcp-tools/wiki.mcp-tools";
import { WIKI_READ_SOURCE_TOOL_NAME } from "@/ee/agent-chat/tool-identity";
import { getZodParseContext } from "@/core/validation/zod-error-map-server";

import { ReadWebsiteSourceSchema, WikiCrawlSynthesisCreateSchema } from "./wiki-crawl-synthesis.schema";

export { WIKI_READ_SOURCE_TOOL_NAME };
export { WIKI_SYNTHESIS_MAX_PAGES, WikiCrawlSynthesisCreateSchema } from "./wiki-crawl-synthesis.schema";

export function readWebsiteSourceTool(crawlId: string) {
  return {
    name: WIKI_READ_SOURCE_TOOL_NAME,
    title: "Read stored website pages",
    description:
      "Read all stored evidence before creating pages. list inventories sources; next returns bounded sequential chunks from up to eight unread sources. Repeat next until remainingSources is zero without re-listing. Then plan accounts for every source in topics or exclusions with a required basis, never both; sources can support several distinct topics. already_imported is checked against saved content; exact_duplicate requires an identical-content source anchor retained in a topic or imported; overlap names an exact retained offering title and offering role, never a foundation; not_substantive cites exact source evidence. Plan exact titles and roles for offerings, four foundations, supported procedures and the guide; omit an unsupported foundation with a reason. Extensions use offering roles only. Combine translations and ignore routing category when selecting topics. A plan has at most sixteen pages and cannot be replaced after acceptance. get rereads cited evidence immediately before creation; follow nextOffset. Cursors persist across retries.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: ReadWebsiteSourceSchema,
    outputSchema: z.looseObject({}),
    execute: async (params: z.infer<typeof ReadWebsiteSourceSchema>) => {
      const parsed = ReadWebsiteSourceSchema.safeParse(params, await getZodParseContext());
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getReadWikiWebsiteSourcesInteractor().invoke({ ...parsed.data, crawlId }), toonResult);
    },
  };
}

export function createWikiFromCrawlTool(_locale: string | undefined, crawlId: string) {
  return {
    name: "manage_wiki_pages",
    title: "Create Knowledge Base pages from the website",
    description:
      "Create one to five Knowledge Base pages per call from stored website pages. kind knowledge summarises facts; guide is the one Operating Guide; procedure has whenToUse and numbered steps. Cite only the sources that support the facts on each page, including cross-offering use cases. Preserve actual FAQ questions, answers and limitations rather than a list of FAQ topics. Review and supply gaps for every page; the guide records unconfirmed internal qualification, follow-up, approval and handover questions. The server adds the Sources list with fetch dates and the gaps list. Pages are immediately available to Mate and connected AI tools.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: WikiCrawlSynthesisCreateSchema,
    outputSchema: ManageWikiPagesOutputSchema,
    execute: async (params: z.infer<typeof WikiCrawlSynthesisCreateSchema>) => {
      const parsed = WikiCrawlSynthesisCreateSchema.safeParse(params, await getZodParseContext());
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getCreateWikiPagesFromCrawlInteractor().invoke({ pages: parsed.data.pages, crawlId }),
        (result) =>
          toonResult({
            ...result,
            items: formatDatesInResponse(result.items.map(wikiPageSummary)),
          }),
      );
    },
  };
}
