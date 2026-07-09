import rawManifest from "@/generated/raw-docs-manifest.json";

import { env } from "@/env";
import { DOC_NAV_GROUPS } from "@/features/docs/docs-nav";

export const dynamic = "force-static";

type ManifestPage = { title: string; description: string; content: string };
type Manifest = Record<string, Record<string, Record<string, ManifestPage>>>;

const manifest = rawManifest as Manifest;

export function GET() {
  const pages = manifest.docs.en;
  const lines: string[] = [
    "# Customermates",
    "",
    `> Customermates is an open-source, AI-native CRM: contacts, organizations, deals, services, and tasks, kept fresh by the AI you already use. Native MCP endpoint: ${env.BASE_URL}/api/v1/mcp (44 tools). Every link below is the raw-markdown twin of an HTML page at ${env.BASE_URL}/en/docs/<slug>; German versions live under /de/.`,
    "",
  ];

  for (const group of DOC_NAV_GROUPS) {
    const items = group.items
      .map((item) => {
        const slug = item.slug || "intro-page";
        const page = pages[slug];
        if (!page) return null;
        return `- [${page.title}](${env.BASE_URL}/en/raw/docs/${slug}.md): ${page.description}`;
      })
      .filter((line): line is string => line !== null);
    if (items.length === 0) continue;
    lines.push(`## ${group.labelEn}`, ...items, "");
  }

  lines.push(
    "## Optional",
    `- [OpenAPI 3.1 spec](${env.BASE_URL}/api/v1/openapi): the full REST schema as JSON`,
    `- REST operation docs: one markdown file per endpoint at ${env.BASE_URL}/en/raw/openapi/<operation>.md`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 200,
  });
}
