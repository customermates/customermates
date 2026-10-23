"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { headingAnchorId } from "@/components/editor/heading-anchor-extension";
import { TocItems } from "@/components/shared/toc";

type WikiDocumentNode = {
  attrs?: {
    level?: unknown;
  };
  content?: WikiDocumentNode[];
  text?: string;
  type?: string;
};

export type WikiDocumentHeading = {
  index: number;
  level: 1 | 2 | 3;
  text: string;
};

function nodeText(node: WikiDocumentNode): string {
  if (typeof node.text === "string") return node.text;

  return node.content?.map(nodeText).join("") ?? "";
}

export function wikiDocumentHeadings(document: object): WikiDocumentHeading[] {
  const headings: WikiDocumentHeading[] = [];
  let renderedHeadingIndex = 0;

  function visit(node: WikiDocumentNode) {
    const level = node.attrs?.level;
    if (node.type === "heading" && (level === 1 || level === 2 || level === 3)) {
      const text = nodeText(node).replace(/\s+/g, " ").trim();
      if (text) headings.push({ index: renderedHeadingIndex, level, text });
      renderedHeadingIndex += 1;
    }

    node.content?.forEach(visit);
  }

  visit(document);
  return headings;
}

export const WIKI_HEADING_ID_PREFIX = "wiki-heading";

export function WikiPageOutline({ document }: { document: object }) {
  const t = useTranslations();
  const items = useMemo(
    () =>
      wikiDocumentHeadings(document).map((heading) => ({
        title: heading.text,
        url: `#${headingAnchorId(WIKI_HEADING_ID_PREFIX, heading.index)}`,
        depth: heading.level + 1,
      })),
    [document],
  );
  const firstAnchor = items[0]?.url.slice(1);
  const [renderedAnchor, setRenderedAnchor] = useState<string | null>(null);

  useEffect(() => {
    if (!firstAnchor || renderedAnchor === firstAnchor) return;
    let frame = 0;
    const waitForHeadings = () => {
      if (window.document.getElementById(firstAnchor)) setRenderedAnchor(firstAnchor);
      else frame = window.requestAnimationFrame(waitForHeadings);
    };
    waitForHeadings();
    return () => window.cancelAnimationFrame(frame);
  }, [firstAnchor, renderedAnchor]);

  if (items.length < 2 || renderedAnchor !== firstAnchor) return null;

  return (
    <nav
      aria-label={t("Wiki.onThisPage")}
      className="sticky top-8 hidden max-h-[calc(100dvh-4rem)] flex-col self-start @min-[58rem]/wiki:flex"
    >
      <TocItems items={items} />
    </nav>
  );
}
