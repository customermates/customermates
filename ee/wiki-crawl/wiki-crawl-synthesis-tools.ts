import { z } from "zod";

import { getCreateWikiPagesFromCrawlInteractor, getReadWikiWebsiteSourcesInteractor } from "@/core/di";
import { formatDatesInResponse, mcpValidationFailure, runInteractor, toonResult } from "@/features/mcp-tools/utils";
import { ManageWikiPagesOutputSchema, wikiPageSummary } from "@/features/mcp-tools/wiki.mcp-tools";
import { WIKI_READ_SOURCE_TOOL_NAME } from "@/ee/agent-chat/tool-identity";
import { getZodParseContext } from "@/core/validation/zod-error-map-server";

import {
  InitialWikiCrawlSynthesisCreateSchema,
  ReadWebsiteSourceSchema,
  WikiCrawlSynthesisCreateSchema,
} from "./wiki-crawl-synthesis.schema";
import { WIKI_SYNTHESIS_GROUNDING_INSTRUCTION } from "./wiki-synthesis-grounding";
import { wikiSourceResultText } from "./wiki-source-result";

export { WIKI_READ_SOURCE_TOOL_NAME };
export { WIKI_SYNTHESIS_MAX_PAGES, WikiCrawlSynthesisCreateSchema } from "./wiki-crawl-synthesis.schema";

export function readWebsiteSourceTool(crawlId: string) {
  return {
    name: WIKI_READ_SOURCE_TOOL_NAME,
    title: "Read stored website pages",
    description:
      "Read all stored evidence before creating pages. list inventories sources; next returns bounded sequential chunks from up to eight unread sources. Repeat next until remainingSources is zero without re-listing. Then plan accounts for every source in topics or exclusions with a required basis, never both; sources can support several distinct topics. already_imported is checked against saved content; exact_duplicate requires an identical-content source anchor retained in a topic or imported; overlap names an exact retained offering title and offering role, never a foundation. A shared service family or technology label alone does not justify overlap. If an article adds a distinctive customer case, architecture, steps or limiting conditions, retain its source in the offering topic instead of excluding it, and cover that substance when creating the page. Retain a separate topic if the four-source budget prevents faithful coverage. Use overlap only for redundant content fully represented by the retained offering's cited sources; a source belongs in topics or exclusions, never both. Retain substantial technical articles as separate knowledge topics when their unique capabilities, constraints or steps cannot fit faithfully in that offering's four cited sources; a generic offering description does not cover technical depth. not_substantive cites exact source evidence. For exclusion and repair evidence, copy a single contiguous sentence or line directly from the returned text. Preserve spelling, punctuation and whitespace exactly; do not insert literal backslash-n characters, ellipses, translated wording or Markdown headings from the inventory. Reread with get and offset=0 when the exact text is no longer visible. For a rejected plan, repair one affected source or a small group and immediately resubmit the full retained draft, even if other reported issues remain. Keep corrected entries in every resubmission. The plan remains rejected until every validation issue is resolved; do not create pages during partial repair. Plan exact titles and roles for offerings, four foundations, supported procedures and the guide; omit an unsupported foundation with a reason. Extensions use offering roles only. Combine translations and ignore routing category when selecting topics. A plan has at most sixteen pages and cannot be replaced after acceptance. get with explicit offset=0 rereads cited evidence before creation in the next provider round; follow nextOffset. Successful creation consumes fresh reads. Offering and procedure pages must cite every planned source; aggregate foundations and the guide may cite other fully read sources in the same crawl. Cursors persist across retries. Each offering or procedure plans one to four supporting sources, and its create must cite every planned source. Retain distinctive customer cases, architecture, steps and limitations in those sources and in the authored page; if four sources cannot cover them faithfully, split the topic before accepting the plan. An overlap exclusion requires evidenceQuote copied exactly from the excluded source and counterpartSourceId plus counterpartQuote copied exactly from one source retained by the named offering topic. Compare the substantive case, architecture, steps and limits; a service-family name or shared technology alone is not redundancy. If a distinct fact is missing from the retained evidence, retain the article in the topic instead of excluding it. For translated company or foundation pages, retain both source IDs as foundation reading leads and select appropriate actual citations later. Do not invent an offering coverage anchor for a foundation translation.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: ReadWebsiteSourceSchema,
    outputSchema: z.looseObject({}),
    execute: async (params: z.infer<typeof ReadWebsiteSourceSchema>) => {
      const parsed = ReadWebsiteSourceSchema.safeParse(params, await getZodParseContext());
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(getReadWikiWebsiteSourcesInteractor().invoke({ ...parsed.data, crawlId }), (payload) => ({
        text: wikiSourceResultText(payload),
        structuredContent: payload,
      }));
    },
  };
}

export function createWikiFromCrawlTool(_locale: string | undefined, crawlId: string, initialSynthesis = false) {
  const inputSchema = initialSynthesis ? InitialWikiCrawlSynthesisCreateSchema : WikiCrawlSynthesisCreateSchema;
  return {
    name: "manage_wiki_pages",
    title: "Create Knowledge Base pages from the website",
    description: [
      `Create ${initialSynthesis ? "one Knowledge Base page" : "one to five Knowledge Base pages"} per call from stored website pages. kind knowledge summarises facts; guide is the one Operating Guide; procedure has whenToUse and numbered steps. Cite only the sources that support the facts on each page, including cross-offering use cases. Preserve actual FAQ questions, answers and limitations rather than a list of FAQ topics. Review and supply gaps for every page; the guide records unconfirmed internal qualification, follow-up, approval and handover questions. The server adds the Sources list with fetch dates and the gaps list. Pages are immediately available to Mate and connected AI tools. ${initialSynthesis ? "Create each page in its own call so a rejected page cannot discard another page that passes review." : "Create multiple pages together only when their citation-source sets are identical. Use separate create calls for different source sets."} Fix every reported evidence issue together; reread every source needed by the entire submitted batch before retrying, then create only after those results are visible in a later provider round.`,
      ...(initialSynthesis
        ? [
            "For Voice and Tone, use one to three short supported sections about observed customer-facing wording. Label observations and suggestions; translate examples into the selected language and label them as translations without retaining source-language phrases in parentheses. Do not infer a corpus-wide rule such as avoiding superlatives or add technical capability claims to a style page.",
          ]
        : []),
      WIKI_SYNTHESIS_GROUNDING_INSTRUCTION,
    ].join(" "),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema,
    outputSchema: ManageWikiPagesOutputSchema,
    execute: async (params: z.infer<typeof WikiCrawlSynthesisCreateSchema>) => {
      const parsed = inputSchema.safeParse(params, await getZodParseContext());
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
