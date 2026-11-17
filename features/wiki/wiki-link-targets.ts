import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { isWorkspaceSlugSegment } from "@/core/navigation/workspace-paths";
import { routingLocaleFromUrlSegment } from "@/i18n/locale-registry";

import { isWikiTargetInWorkspace, parseWikiPageHref } from "./wiki-links";

const UUID_SOURCE =
  "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)";
const RECORD_PATH_PATTERN = new RegExp(
  `^/(?:([a-z]{2})/)?(?:w/([^/?#]+)/)?records/(${UUID_SOURCE})/(${UUID_SOURCE})(?:[?#].*)?$`,
  "iu",
);

export type WikiRecordTarget = { typeId: string; recordId: string; slug: string | null };

export type WikiLinkTargets = {
  pages: string[];
  records: Array<{ typeId: string; recordId: string }>;
};

type MarkdownNode = {
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: MarkdownNode[];
};

function visit(node: MarkdownNode, callback: (node: MarkdownNode) => void) {
  callback(node);
  for (const child of node.content ?? []) visit(child, callback);
}

export function parseRecordHref(value: string, baseUrl?: string): WikiRecordTarget | null {
  if (!value || /[\u0000- \\]/u.test(value) || value.startsWith("//")) return null;
  let path = value;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    if (!baseUrl) return null;
    try {
      const parsed = new URL(value);
      const base = new URL(baseUrl);
      if (!["http:", "https:"].includes(base.protocol) || parsed.origin !== base.origin) return null;
      if (parsed.username || parsed.password) return null;
      path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }
  if (!path.startsWith("/")) return null;
  const match = RECORD_PATH_PATTERN.exec(path);
  if (!match?.[3] || !match[4]) return null;
  if (match[1] && !routingLocaleFromUrlSegment(match[1])) return null;
  if (match[2] !== undefined && !isWorkspaceSlugSegment(match[2])) return null;
  return { typeId: match[3].toLowerCase(), recordId: match[4].toLowerCase(), slug: match[2] ?? null };
}

export function extractWikiLinkTargets(
  markdown: string,
  options: { baseUrl: string; workspaceSlug: string | null; pageId?: string },
): WikiLinkTargets {
  const document = parseMarkdownToJSON(markdown) as MarkdownNode;
  const pages = new Set<string>();
  const records = new Map<string, { typeId: string; recordId: string }>();
  visit(document, (node) => {
    for (const mark of node.marks ?? []) {
      const href = mark.type === "link" ? mark.attrs?.href : null;
      if (typeof href !== "string") continue;
      const page = parseWikiPageHref(href.split("#", 1)[0] ?? href, options.baseUrl);
      if (page) {
        if (isWikiTargetInWorkspace(page, options.workspaceSlug) && page.id !== options.pageId) pages.add(page.id);
        continue;
      }
      const record = parseRecordHref(href, options.baseUrl);
      if (record && isWikiTargetInWorkspace(record, options.workspaceSlug))
        records.set(`${record.typeId}/${record.recordId}`, { typeId: record.typeId, recordId: record.recordId });
    }
  });
  return { pages: [...pages], records: [...records.values()] };
}
