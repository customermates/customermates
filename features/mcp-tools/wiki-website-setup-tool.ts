import type { z } from "zod";
import type { AppLocale } from "@/i18n/locale-registry";

import { getCreateWikiPagesInteractor } from "@/core/di";
import { WIKI_WEBSITE_CREATE_TOOL_NAME } from "@/ee/agent-chat/tool-identity";
import { getTranslator } from "@/i18n/get-translator";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";

import { formatDatesInResponse, mcpValidationFailure, runInteractor, toonResult } from "./utils";
import { ManageWikiPagesOutputSchema, WikiHomepageSetupCreateSchema, wikiPageSummary } from "./wiki.mcp-tools";

async function setupPages(input: z.infer<typeof WikiHomepageSetupCreateSchema>, locale: AppLocale) {
  const t = await getTranslator(locale, "WikiSetup.generated");
  return input.pages.map(({ title, sections, sources, gaps }) => ({
    title,
    markdown: [
      ...sections.map(({ heading, content }) => `## ${heading}\n\n${content}`),
      `## ${t("sourcesHeading")}\n\n${[...new Set(sources)].map((source) => `- <${source}>`).join("\n")}`,
      ...(gaps?.length ? [`## ${t("gapsHeading")}\n\n${gaps.map((gap) => `- ${gap}`).join("\n")}`] : []),
    ].join("\n\n"),
  }));
}

export function createWikiFromWebsiteTool(locale: string | undefined) {
  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    name: WIKI_WEBSITE_CREATE_TOOL_NAME,
    title: "Create Workspace Wiki from website",
    description:
      "Create one to five evidence-backed Wiki pages in one atomic call that succeeds only while the Wiki is empty. Create a page only for a knowledge area the read pages support; merge thin areas and skip unsupported ones. Each page needs a localized title, one to five structured sections, one to four exact successfully read source URLs, and optional page-specific gaps. The server adds the H2 headings, the localized Sources list, and a gaps list only when gaps are provided.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: WikiHomepageSetupCreateSchema,
    outputSchema: ManageWikiPagesOutputSchema,
    execute: async (params: z.infer<typeof WikiHomepageSetupCreateSchema>) => {
      const parsed = WikiHomepageSetupCreateSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getCreateWikiPagesInteractor().invoke({
          requireEmpty: true,
          pages: await setupPages(parsed.data, appLocale),
        }),
        (pages) => toonResult({ items: formatDatesInResponse(pages.map(wikiPageSummary)) }),
      );
    },
  };
}
