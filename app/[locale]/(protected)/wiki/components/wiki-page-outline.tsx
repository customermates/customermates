"use client";

import type { RefObject } from "react";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/core/utils/cn";

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

type Props = {
  containerRef: RefObject<HTMLElement | null>;
  document: object;
};

export function WikiPageOutline({ containerRef, document }: Props) {
  const t = useTranslations();
  const headings = useMemo(() => wikiDocumentHeadings(document), [document]);

  if (headings.length < 2) return null;

  const goToHeading = (index: number) => {
    const heading = containerRef.current?.querySelectorAll<HTMLElement>(".tiptap h1, .tiptap h2, .tiptap h3")[index];
    if (!heading) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <nav
      aria-label={t("Wiki.onThisPage")}
      className="sticky top-8 hidden max-h-[calc(100dvh-4rem)] self-start overflow-y-auto border-l border-border pl-4 2xl:block"
    >
      <p className="mb-2 text-xs font-medium text-foreground">{t("Wiki.onThisPage")}</p>

      <ol className="space-y-1">
        {headings.map((heading) => (
          <li key={`${heading.index}-${heading.text}`}>
            <button
              className={cn(
                "min-w-0 w-full rounded-sm py-1 text-left text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                heading.level === 2 && "pl-3",
                heading.level === 3 && "pl-6",
              )}
              type="button"
              onClick={() => goToHeading(heading.index)}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
