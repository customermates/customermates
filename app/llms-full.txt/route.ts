import { env } from "@/env";
import { DOC_NAV_GROUPS } from "@/features/docs/docs-nav";
import { getDocsPageRaw } from "@/features/mcp-tools/docs.mcp-tools";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export function GET() {
  const sections: string[] = [
    "# Customermates documentation (full text)",
    "",
    `> Customermates is an open-source, AI-native CRM. This file concatenates every English docs page in reading order. Per-page markdown: ${env.BASE_URL}/${DEFAULT_LOCALE}/raw/docs/<slug>.md - index: ${env.BASE_URL}/llms.txt`,
  ];

  for (const group of DOC_NAV_GROUPS) {
    for (const item of group.items) {
      const page = getDocsPageRaw(item.slug || "intro-page", DEFAULT_LOCALE, "docs");
      if (!page) continue;
      sections.push("", "---", "", `# ${page.title}`, "", `Source: ${page.url}`, "", page.markdown);
    }
  }

  return new Response(sections.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 200,
  });
}
