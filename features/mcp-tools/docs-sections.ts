import { slugifyHeading } from "@/core/utils/search-text";

export type DocsSection = {
  slug: string;
  source: string;
  pageTitle: string;
  anchor: string;
  headingPath: string[];
  text: string;
  order: number;
};

const ROLLUP_OWN_TEXT_CHARS = 200;

const PAIRED_COMPONENTS = /<\/?(Steps|Faq|Tabs|Tab|Callout|Note|Warning|Tip)(\s[^>]*)?>[ \t]*/g;

export function unwrapDocsComponents(markdown: string, expandSnippet: (tool: string) => string): string {
  return markdown
    .replace(/<Step\s+title="([^"]*)"\s*>/g, (_, title: string) => `\n**${title}**\n`)
    .replace(/<FaqItem\s+question="([^"]*)"\s*>/g, (_, question: string) => `\n### ${question}\n`)
    .replace(/<\/(Step|FaqItem)>/g, "\n")
    .replace(
      /<McpInstallSnippet\s+tool="([a-zA-Z]+)"\s*\/>/g,
      (_, tool: string) => `\`\`\`\n${expandSnippet(tool)}\n\`\`\``,
    )
    .replace(/^<[A-Z][A-Za-z]*(\s[^>]*)?\/>[ \t]*$/gm, "")
    .replace(/^\{\/\*[\s\S]*?\*\/\}[ \t]*$/gm, "")
    .replace(PAIRED_COMPONENTS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitSections(args: {
  slug: string;
  source: string;
  pageTitle: string;
  markdown: string;
}): DocsSection[] {
  const lines = args.markdown.split("\n");
  const sections: DocsSection[] = [];
  let path: string[] = [];
  let buffer: string[] = [];
  let anchor = "";
  let inFence = false;
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text.length > 0 || path.length > 0) {
      sections.push({
        slug: args.slug,
        source: args.source,
        pageTitle: args.pageTitle,
        anchor,
        headingPath: [...path],
        text,
        order: sections.length,
      });
    }
    buffer = [];
  };
  for (const line of lines) {
    if (line.startsWith("```")) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      const depth = Math.max(0, heading[1].length - 2);
      const title = heading[2].replace(/\s*(?:\{#[^}]+\}|\[#[^\]]+\])\s*$/, "");
      path = [...path.slice(0, depth), title];
      anchor = /(?:\{#([^}]+)\}|\[#([^\]]+)\])\s*$/.exec(heading[2])?.slice(1).find(Boolean) ?? slugifyHeading(title);
      continue;
    }
    buffer.push(line);
  }
  flush();
  const kept = sections.filter((section) => section.text.length > 0 || section.headingPath.length > 0);
  return kept.map((section) => {
    if (section.headingPath.length !== 1 || section.text.length >= ROLLUP_OWN_TEXT_CHARS) return section;
    const children = kept.filter(
      (candidate) => candidate.headingPath.length > 1 && candidate.headingPath[0] === section.headingPath[0],
    );
    if (children.length === 0) return section;
    const rolled = children.map((child) => `### ${child.headingPath.at(-1)}\n${child.text}`.trim()).join("\n\n");
    return { ...section, text: [section.text, rolled].filter(Boolean).join("\n\n") };
  });
}
