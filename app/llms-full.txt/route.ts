import rawManifest from "@/generated/raw-docs-manifest.json";

import { env } from "@/env";
import { DOC_NAV_GROUPS } from "@/features/docs/docs-nav";

export const dynamic = "force-static";

type ManifestPage = { title: string; description: string; content: string };
type Manifest = Record<string, Record<string, Record<string, ManifestPage>>>;

const manifest = rawManifest as Manifest;

export function GET() {
  const pages = manifest.docs.en;
  const sections: string[] = [
    "# Customermates documentation (full text)",
    "",
    `> Customermates is an open-source, AI-native CRM. This file concatenates every English docs page in reading order. Per-page markdown: ${env.BASE_URL}/en/raw/docs/<slug>.md - index: ${env.BASE_URL}/llms.txt`,
  ];

  for (const group of DOC_NAV_GROUPS) {
    for (const item of group.items) {
      const slug = item.slug || "intro-page";
      const page = pages[slug];
      if (!page) continue;
      const body = page.content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
      sections.push("", "---", "", `# ${page.title}`, "", `Source: ${env.BASE_URL}/en/docs/${slug}`, "", body);
    }
  }

  return new Response(sections.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 200,
  });
}
