import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getStartWikiHomepageSetupInteractor, getWikiWebsiteCrawlRepo } from "@/core/di";
import { WIKI_WEBSITE_IMPORT_TOOL_NAME } from "@/ee/agent-chat/tool-identity";
import { mcpValidationFailure, runInteractor, toonResult } from "@/features/mcp-tools/utils";
import { parsePublicPageUrl } from "@/features/wiki/wiki-homepage";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";

const ImportWebsiteSchema = z.object({
  url: z.url().max(2_000).describe("The exact website or help-centre address the user wrote."),
});

export function importWebsiteTool(locale: string | undefined) {
  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    name: WIKI_WEBSITE_IMPORT_TOOL_NAME,
    title: "Import a website into the Workspace Wiki",
    description:
      "Start importing the company website the user named into the Wiki, or a help centre on another site that an earlier import listed. The import runs in the background: it reads the site politely, imports help, pricing and policy pages word for word, then drafts summaries, an Operating Guide and procedures for review.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: ImportWebsiteSchema,
    outputSchema: z.looseObject({}),
    execute: async (params: z.infer<typeof ImportWebsiteSchema>) => {
      const parsed = ImportWebsiteSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      const target = parsePublicPageUrl(parsed.data.url);
      const latest = await getWikiWebsiteCrawlRepo().findLatestCrawl();
      const host = target ? new URL(target.url).hostname : null;
      const extend = Boolean(host && latest?.pendingHosts.includes(host));
      return runInteractor(
        getStartWikiHomepageSetupInteractor().invoke({
          homepage: parsed.data.url,
          clientRequestId: randomUUID(),
          locale: appLocale,
          mode: extend ? "extend" : "initial",
        }),
        (started) =>
          toonResult({
            started: true,
            homepage: started.homepage,
            domain: started.domain,
            next: extend
              ? "The help centre is being imported; its pages appear in the Wiki as they are read."
              : "The website is being read in the background. Its help, pricing and policy pages appear in the Wiki first; Mate then drafts summaries, an Operating Guide and procedures in a separate setup task shown on the Wiki page.",
          }),
      );
    },
  };
}
