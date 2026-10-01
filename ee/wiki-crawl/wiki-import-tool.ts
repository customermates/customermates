import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getStartWikiHomepageSetupInteractor } from "@/core/di";
import { WIKI_WEBSITE_IMPORT_TOOL_NAME } from "@/ee/agent-chat/tool-identity";
import { mcpValidationFailure, runInteractor, toonResult } from "@/features/mcp-tools/utils";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

const ImportWebsiteSchema = z.object({
  url: z.url().max(2_000).describe("The exact website or help-centre address the user wrote."),
});

export function importWebsiteTool(locale: string | undefined) {
  const appLocale = appLocaleOrDefault(locale);
  return {
    name: WIKI_WEBSITE_IMPORT_TOOL_NAME,
    title: "Import a website into the Knowledge Base",
    description:
      "Start importing the company website the user named into the Knowledge Base, or a help centre on another site that an earlier import listed. The import runs in the background: it reads the site politely, uses the existing Knowledge Base’s dominant language or the conversation language for an empty Knowledge Base, imports matching help, pricing and policy pages word for word, and translates or summarizes other sources into that same language. Initial setup creates an Operating Guide and procedures that are immediately available to Mate and connected AI tools; help-centre additions create knowledge pages only.",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    inputSchema: ImportWebsiteSchema,
    outputSchema: z.looseObject({}),
    execute: async (params: z.infer<typeof ImportWebsiteSchema>) => {
      const parsed = ImportWebsiteSchema.safeParse(params);
      if (!parsed.success) return mcpValidationFailure(parsed.error);
      return runInteractor(
        getStartWikiHomepageSetupInteractor().invoke({
          homepage: parsed.data.url,
          clientRequestId: randomUUID(),
          locale: appLocale,
        }),
        (started) =>
          toonResult({
            started: true,
            homepage: started.homepage,
            domain: started.domain,
            next:
              started.mode === "extend"
                ? "The help centre is being imported into the Knowledge Base’s language. Matching source pages appear first; Mate then writes any translated knowledge pages."
                : "The website is being read in the background. Matching-language help, pricing and policy pages appear first; Mate then writes translated or summarized knowledge, an Operating Guide and procedures in a separate setup task.",
          }),
      );
    },
  };
}
