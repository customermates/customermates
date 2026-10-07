"use client";

import { diffLines } from "diff";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";

const CONTEXT_LINES = 2;

type Props = {
  previous: unknown;
  current: unknown;
};

function toMarkdown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return serializeJSONToMarkdown(value as object);
  } catch {
    return "";
  }
}

type Segment = { kind: "added" | "removed" | "context"; lines: string[] } | { kind: "collapsed"; count: number };

function buildSegments(before: string, after: string): Segment[] {
  const parts = diffLines(before, after, { newlineIsToken: false });
  const segments: Segment[] = [];

  parts.forEach((part, index) => {
    const lines = part.value.replace(/\n$/, "").split("\n");

    if (part.added) {
      segments.push({ kind: "added", lines });
      return;
    }

    if (part.removed) {
      segments.push({ kind: "removed", lines });
      return;
    }

    const isFirst = index === 0;
    const isLast = index === parts.length - 1;

    if (
      lines.length <= CONTEXT_LINES * 2 ||
      (isFirst && lines.length <= CONTEXT_LINES) ||
      (isLast && lines.length <= CONTEXT_LINES)
    ) {
      segments.push({ kind: "context", lines });
      return;
    }

    if (isFirst) {
      segments.push({ kind: "collapsed", count: lines.length - CONTEXT_LINES });
      segments.push({ kind: "context", lines: lines.slice(-CONTEXT_LINES) });
      return;
    }

    if (isLast) {
      segments.push({ kind: "context", lines: lines.slice(0, CONTEXT_LINES) });
      segments.push({ kind: "collapsed", count: lines.length - CONTEXT_LINES });
      return;
    }

    segments.push({ kind: "context", lines: lines.slice(0, CONTEXT_LINES) });
    segments.push({
      kind: "collapsed",
      count: lines.length - CONTEXT_LINES * 2,
    });
    segments.push({ kind: "context", lines: lines.slice(-CONTEXT_LINES) });
  });

  return segments;
}

function visibleSegments(before: string, after: string): Segment[] {
  return buildSegments(before, after).filter(
    (segment) => segment.kind === "collapsed" || segment.lines.some((line) => line.trim().length > 0),
  );
}

export function hasNotesDiff(previous: unknown, current: unknown): boolean {
  return visibleSegments(toMarkdown(previous), toMarkdown(current)).some(
    (segment) => segment.kind === "added" || segment.kind === "removed",
  );
}

export function NotesDiff({ previous, current }: Props) {
  const t = useTranslations();

  const segments = useMemo(() => visibleSegments(toMarkdown(previous), toMarkdown(current)), [previous, current]);

  if (segments.length === 0) return null;

  const hasChanges = segments.some((segment) => segment.kind === "added" || segment.kind === "removed");
  if (!hasChanges) return null;

  return (
    <div className="overflow-hidden rounded-md border border-border text-sm">
      {segments.map((segment, index) => {
        const key = `${index}-${segment.kind}`;

        if (segment.kind === "collapsed") {
          return (
            <div key={key} className="bg-muted p-2 text-center text-xs text-subdued">
              {t("AuditLogModal.unchangedLines", { count: segment.count })}
            </div>
          );
        }

        const rowClass =
          segment.kind === "added"
            ? "bg-success/10 text-foreground"
            : segment.kind === "removed"
              ? "bg-destructive/10 text-foreground"
              : "text-subdued";

        const gutterColor =
          segment.kind === "added" ? "text-success" : segment.kind === "removed" ? "text-destructive" : "opacity-40";

        const gutter = segment.kind === "added" ? "+" : segment.kind === "removed" ? "−" : " ";

        return (
          <div key={key} className={`p-2 leading-6 ${rowClass}`}>
            {segment.lines.map((line, lineIndex) => (
              <div key={`${key}-${lineIndex}`} className="flex gap-1.5">
                <span aria-hidden className={`w-2 shrink-0 select-none text-center ${gutterColor}`}>
                  {gutter}
                </span>

                <div className="min-w-0 flex-1">
                  {line.trim() ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none *:my-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{line}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="block">&nbsp;</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
